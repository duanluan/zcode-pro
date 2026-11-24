// 端到端验证：起一个假上游，让 ProviderProxyManager 转发过去，确认
// 1) 开了注入：上游收到的 system 里带注入正文；2) 关掉注入：上游收到原样内容；
// 3) 子代理（system 无 # Harness）默认不带。
import http from 'node:http';
import { ProviderProxyManager } from '../src/host/provider-proxy.mjs';
import { rewriteRequest } from '../src/host/prompt-inject.mjs';

let failed = 0;
const assert = (cond, msg) => {
  if (!cond) { console.error('FAIL: ' + msg); failed = 1; }
  else console.log('ok: ' + msg);
};

const received = [];
const upstream = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    received.push({ url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
});
await new Promise((r) => upstream.listen(0, '127.0.0.1', r));
const upstreamPort = upstream.address().port;

const mgr = new ProviderProxyManager();
const PROXY_PORT = 18799;
let inject = true;
await mgr.ensure({ upstream: `http://127.0.0.1:${upstreamPort}`, port: PROXY_PORT });
// 转发器建立后再挂钩子（模拟 helper 在 ensure 后 setInjector）
const hook = ({ url, headers, rawBody }) => {
  if (!inject) return { buffer: rawBody, changed: false };
  return rewriteRequest({ url, headers, rawBody, text: '# 项目规则\n先跑测试。' });
};
mgr.setInjector(hook);
// 回归：ensure 被重复调用（配置变化/启动兜底/文件监听都会触发）且没传 injector 时，
// 不能把已挂的钩子清掉。历史上这里清成 null，导致注入静默失效。
await mgr.ensure({ upstream: `http://127.0.0.1:${upstreamPort}`, port: PROXY_PORT });

const HARNESS = '# Harness\n - tools...';
const post = (payload) => new Promise((resolve, reject) => {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const req = http.request({
    host: '127.0.0.1', port: PROXY_PORT, path: '/v1/messages', method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': String(body.length) },
  }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
  req.on('error', reject);
  req.end(body);
});

// 1) 注入开：主对话带正文
await post({ system: HARNESS, messages: [{ role: 'user', content: 'hi' }] });
{
  const got = JSON.parse(received.at(-1).body);
  assert(got.system.includes('# 项目规则'), '开启注入：上游收到的 system 带注入正文');
  assert(got.system.startsWith(HARNESS), '开启注入：原有 system 内容仍在开头');
  assert(received.at(-1).headers['content-length'] === String(Buffer.byteLength(received.at(-1).body)), 'content-length 与实际字节一致');
}

// 2) 注入开：子代理默认不带
await post({ system: 'You are ZCode, an interactive agent\n\n# Subagent Notes\n - x', messages: [{ role: 'user', content: 'hi' }] });
assert(!JSON.parse(received.at(-1).body).system.includes('# 项目规则'), '开启注入：子代理默认不带');

// 3) 注入关：原样
inject = false;
await post({ system: HARNESS, messages: [{ role: 'user', content: 'hi' }] });
assert(JSON.parse(received.at(-1).body).system === HARNESS, '关闭注入：请求体原样到达上游');

// 4) 注入关：SSE 等 GET 请求不受影响
await new Promise((resolve) => {
  http.get({ host: '127.0.0.1', port: PROXY_PORT, path: '/v1/models' }, (res) => { res.resume(); res.on('end', resolve); });
});
assert(received.at(-1).url === '/v1/models', 'GET 请求正常转发');

await mgr.stopAll();
upstream.close();

if (failed) { console.error('\n端到端验证有失败项'); process.exit(1); }
console.log('\n端到端验证全部通过');
