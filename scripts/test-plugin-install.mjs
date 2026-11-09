// 插件安装相关纯逻辑的守护测试：
// 1) Windows 系统代理值解析：支持 host:port 与按协议分段两种写法，取 https、
//    没有则取 http，其余协议（socks 等）不当作 HTTP 代理，坏值不通过。
// 2) 市场添加失败分类：没装 Git、连不上 GitHub 各自给出可操作的提示和错误码。
// 零依赖，node scripts/test-plugin-install.mjs（或 npm test）直接跑，全绿退出码 0。
import { parseWindowsProxyServer, marketplaceAddFailure } from '../src/host/helper.mjs';

let failed = 0;
const check = (cond, msg) => {
  if (!cond) { console.error('FAIL: ' + msg); failed = 1; }
};

const proxyCases = [
  ['127.0.0.1:7890', 'http://127.0.0.1:7890'],
  ['http://127.0.0.1:7890', 'http://127.0.0.1:7890'],
  ['"127.0.0.1:7890"', 'http://127.0.0.1:7890'],
  ['http="127.0.0.1:7890";https="127.0.0.1:7891"', 'http://127.0.0.1:7891'],
  ['http=127.0.0.1:7890;https=127.0.0.1:7891', 'http://127.0.0.1:7891'],
  ['https=127.0.0.1:7891;http=127.0.0.1:7890', 'http://127.0.0.1:7891'],
  ['http=127.0.0.1:7890;socks=127.0.0.1:1080', 'http://127.0.0.1:7890'],
  ['socks=127.0.0.1:1080', ''],
  ['//127.0.0.1:7890', ''],
  ['127.0.0.1', ''],
  ['', ''],
  [null, ''],
];
for (const [input, want] of proxyCases) {
  const got = parseWindowsProxyServer(input);
  check(got === want, `${JSON.stringify(input)} => ${JSON.stringify(got)}，期望 ${JSON.stringify(want)}`);
}

const failureCases = [
  ['spawn git ENOENT', 'plugins-market-git', '安装 Git'],
  ["fatal: unable to access 'https://github.com/x': Failed to connect to github.com port 443: Could not connect to server", 'plugins-market-network', '代理'],
  ['Command failed: node zcode.cjs plugins marketplace add ... git: fetch failed', 'plugins-market-network', '代理'],
  ['Failed to materialize public GitHub plugin source archive', 'plugins-market-network', '代理'],
  ['marketplace add 未生效：登记表里没有该市场', '', ''],
  ['', '', ''],
];
for (const [raw, wantCode, wantHint] of failureCases) {
  const got = marketplaceAddFailure(raw);
  check(got.code === wantCode, `失败分类 ${JSON.stringify(raw)} => code=${JSON.stringify(got.code)}，期望 ${JSON.stringify(wantCode)}`);
  check(wantHint ? got.hint.includes(wantHint) : got.hint === '', `失败提示 ${JSON.stringify(raw)} 应${wantHint ? '包含' : '为空'} ${JSON.stringify(wantHint)}`);
}

if (!failed) console.log(`ok: ${proxyCases.length} 个系统代理值、${failureCases.length} 个失败分类正确`);
process.exit(failed);
