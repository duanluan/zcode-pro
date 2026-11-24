// 提示词注入改写逻辑回归：三种协议的追加位置、主对话判定、跳过条件、压缩与非 JSON
// 原样转发。零依赖，node scripts/test-prompt-inject.mjs 直接跑。
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { rewriteRequest, detectProtocol, shouldInject, MAX_BODY_BYTES } from '../src/host/prompt-inject.mjs';

let failed = 0;
const assert = (cond, msg) => {
  if (!cond) { console.error('FAIL: ' + msg); failed = 1; }
  else console.log('ok: ' + msg);
};

const RULES = '# 项目规则\n所有改动先跑测试。';
const HARNESS = '# Harness\n - Tools run behind a permission mode.';

const j = (o) => Buffer.from(JSON.stringify(o), 'utf8');
const parse = (buf) => JSON.parse(buf.toString('utf8'));
const run = (body, opts = {}) => rewriteRequest({
  url: opts.url || '/v1/messages',
  headers: opts.headers || {},
  rawBody: Buffer.isBuffer(body) ? body : j(body),
  text: opts.text === undefined ? RULES : opts.text,
  includeSubagents: opts.includeSubagents === true,
});

// —— 协议识别 ——
assert(detectProtocol({ system: 'x', messages: [{ role: 'user', content: 'hi' }] }) === 'anthropic', '顶层 system + messages 判为 anthropic');
assert(detectProtocol({ messages: [{ role: 'system', content: 'x' }, { role: 'user', content: 'hi' }] }) === 'openai-chat', 'messages 里有 system 判为 openai-chat');
assert(detectProtocol({ input: [{ role: 'user', content: 'hi' }] }) === 'openai-responses', 'input 数组判为 openai-responses');
assert(detectProtocol({ instructions: 'x', input: [] }) === 'openai-responses', '只有 instructions 也判为 responses');
assert(detectProtocol({ messages: [{ role: 'user', content: 'hi' }] }) === null, '没有 system 的纯对话不认作可注入');

// —— 主对话判定（# Harness）——
const mainAnthropic = { system: HARNESS, messages: [{ role: 'user', content: 'hi' }] };
const subAnthropic = { system: 'You are ZCode, an interactive agent\n\n# Subagent Notes\n- ...', messages: [{ role: 'user', content: 'hi' }] };
assert(shouldInject({ body: mainAnthropic, text: RULES }) === 'anthropic', '主对话（含 # Harness）可注入');
assert(shouldInject({ body: subAnthropic, text: RULES }) === null, '子代理默认不注入');
assert(shouldInject({ body: subAnthropic, text: RULES, includeSubagents: true }) === 'anthropic', '开了也注入子代理后可注入');
assert(shouldInject({ body: mainAnthropic, text: '   ' }) === null, '正文空白不注入');
assert(shouldInject({ body: mainAnthropic, text: RULES, url: '/v1/messages/count_tokens' }) === null, 'count_tokens 不注入');

// —— Anthropic：system 是字符串 ——
{
  const r = run(mainAnthropic);
  const out = parse(r.buffer);
  assert(r.changed === true, 'anthropic 字符串 system 有改动');
  assert(out.system === `${HARNESS}\n\n${RULES}`, '追加在已有 system 末尾');
  assert(out.messages.length === 1 && out.messages[0].content === 'hi', 'messages 不动');
}

// —— Anthropic：system 是内容块数组，cache_control 必须保留 ——
{
  const body = {
    system: [
      { type: 'text', text: HARNESS, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: 'hi' }],
  };
  const r = run(body);
  const out = parse(r.buffer);
  assert(r.changed === true, 'anthropic 块数组 system 有改动');
  assert(out.system.length === 2, '追加了一个新块');
  assert(JSON.stringify(out.system[0].cache_control) === '{"type":"ephemeral"}', '原块的 cache_control 原样保留');
  assert(out.system[0].text === HARNESS, '原块文字没被改写');
  assert(out.system[1].type === 'text' && out.system[1].text.includes(RULES), '新块带注入正文');
  assert(out.system[1].cache_control === undefined, '新块不挂缓存标记');
}

// —— OpenAI chat completions ——
{
  const body = { messages: [{ role: 'system', content: HARNESS }, { role: 'user', content: 'hi' }] };
  const r = run(body, { url: '/v1/chat/completions' });
  const out = parse(r.buffer);
  assert(r.changed === true, 'chat completions 有改动');
  assert(out.messages[0].content === `${HARNESS}\n\n${RULES}`, '拼到 system 消息末尾');
  assert(out.messages[1].content === 'hi', '用户消息不动');
}

// —— OpenAI responses：instructions ——
{
  const body = { instructions: HARNESS, input: [{ role: 'user', content: 'hi' }] };
  const r = run(body, { url: '/v1/responses' });
  const out = parse(r.buffer);
  assert(r.changed === true, 'responses instructions 有改动');
  assert(out.instructions === `${HARNESS}\n\n${RULES}`, '拼到 instructions 末尾');
  assert(out.input.length === 1, 'input 不动');
}

// —— OpenAI responses：input 里的 system 项 ——
{
  const body = { input: [{ role: 'system', content: HARNESS }, { role: 'user', content: 'hi' }] };
  const r = run(body, { url: '/v1/responses' });
  const out = parse(r.buffer);
  assert(r.changed === true, 'responses input system 项有改动');
  assert(out.input[0].content.includes(RULES), '写进 input 的 system 项');
}

// —— 不该动的请求 ——
{
  const r = run({ model: 'x', input: 'hello' }, { url: '/v1/responses' });
  assert(r.changed === false, '没有对话结构的不动');
  const r2 = run(Buffer.from('not json'), {});
  assert(r2.changed === false && r2.buffer.toString() === 'not json', '非 JSON 原样返回');
  const r3 = run({ system: HARNESS, messages: [] });
  assert(r3.changed === false, 'messages 为空不动');
  const r4 = run({ system: HARNESS, messages: [{ role: 'user', content: 'hi' }] }, { text: '' });
  assert(r4.changed === false, '正文为空不动');
  const r5 = run({ model: 'x' }, { url: '/v1/models' });
  assert(r5.changed === false, '列模型请求不动');
}

// —— gzip 请求体：能解压并改写，发出去的是未压缩字节 ——
{
  const gz = gzipSync(j(mainAnthropic));
  const r = rewriteRequest({ url: '/v1/messages', headers: { 'content-encoding': 'gzip' }, rawBody: gz, text: RULES });
  assert(r.changed === true, 'gzip 请求体可以改写');
  const out = parse(r.buffer);
  assert(out.system.includes(RULES), 'gzip 解压后追加成功');
}

// —— brotli ——
{
  const br = brotliCompressSync(j(mainAnthropic));
  const r = rewriteRequest({ url: '/v1/messages', headers: { 'content-encoding': 'br' }, rawBody: br, text: RULES });
  assert(r.changed === true && parse(r.buffer).system.includes(RULES), 'brotli 请求体可以改写');
}

// —— 不认识的编码：原样放过 ——
{
  const r = rewriteRequest({ url: '/v1/messages', headers: { 'content-encoding': 'zstd' }, rawBody: j(mainAnthropic), text: RULES });
  assert(r.changed === false, '不认识的编码不碰');
}

// —— 超大请求体：原样放过 ——
{
  const big = Buffer.alloc(MAX_BODY_BYTES + 10, 0x20);
  const r = rewriteRequest({ url: '/v1/messages', headers: {}, rawBody: big, text: RULES });
  assert(r.changed === false, '超过上限的请求体原样转发');
}

// —— 空请求体 ——
{
  const r = rewriteRequest({ url: '/v1/messages', headers: {}, rawBody: Buffer.alloc(0), text: RULES });
  assert(r.changed === false && r.buffer.length === 0, '空请求体原样返回');
}

if (failed) {
  console.error('\n提示词注入测试有失败项');
  process.exit(1);
}
console.log('\n提示词注入测试全部通过');
