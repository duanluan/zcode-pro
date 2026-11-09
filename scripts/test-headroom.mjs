// headroom 配置链路回归测试：headroomUsageScan / setHeadroomUsage / parseHeadroomStatus /
// serenaScan / setSerenaEnabled。
// 零依赖，node scripts/test-headroom.mjs（或 npm test）直接跑，全绿退出码 0。
// HOME 指进沙箱：任何漏到真实目录的写（含钩子执行）都会落进沙箱。
// 覆盖：走本地代理条目的统计、启停在 直连/代理 间切换且记忆原地址、
// 非本代理地址与保留键（原型污染）不碰、备份落盘、status 输出解析、
// 用户手动改过直连地址不被切回、两个供应商配置文件都缺失时报错。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { headroomUsageScan, setHeadroomUsage, parseHeadroomStatus, serenaScan, setSerenaEnabled } from '../src/host/helper.mjs';

const root = mkdtempSync(join(tmpdir(), 'zcodepro-headroom-test-'));
process.env.HOME = join(root, 'fake-home');
mkdirSync(process.env.HOME, { recursive: true });
mkdirSync(join(root, 'v2'), { recursive: true });

let failed = 0;
const assert = (cond, msg) => {
  if (!cond) { console.error('FAIL: ' + msg); failed = 1; }
  else console.log('ok: ' + msg);
};

const PROXY = 'http://127.0.0.1:8787/';
const DIRECT = 'https://open.bigmodel.cn/api/anthropic';
writeFileSync(join(root, 'v2', 'config.json'), JSON.stringify({
  provider: {
    p1: { options: { baseURL: PROXY } },
    p2: { options: { baseURL: 'https://api.other/' } },
    pbad: 'not-an-object',
    ['__proto__']: { options: { baseURL: PROXY } }, // 计算属性名才是自有键（字面量 __proto__: 是设原型）
  },
}));
writeFileSync(join(root, 'v2', 'provider_config.json'), JSON.stringify({
  config: { providerConfigRules: { providerRules: [
    { providerId: 'r1', config: { api: { baseUrl: PROXY } } },
    { providerId: 'r2', config: { api: { baseUrl: 'https://api.x/' } } },
  ] } },
}));
const configFile = join(root, 'zcodepro.json');
writeFileSync(configFile, JSON.stringify({ version: 'test' }));
const readV2 = () => JSON.parse(readFileSync(join(root, 'v2', 'config.json'), 'utf8'));
const readPc = () => JSON.parse(readFileSync(join(root, 'v2', 'provider_config.json'), 'utf8'));
const readCfg = () => JSON.parse(readFileSync(configFile, 'utf8'));

// —— 统计：只数 127.0.0.1 代理地址 ——
assert(headroomUsageScan(root).entries === 3, `三个条目走本地代理含保留键（实际 ${headroomUsageScan(root).entries}）`);

// —— 关闭：代理 → 直连，原地址进 headroomRoutes ——
const off = setHeadroomUsage(root, configFile, false);
assert(off && off.ok && off.changed === 2, `关闭切换两个条目（实际 ${JSON.stringify(off)}）`);
assert(readV2().provider.p1.options.baseURL === DIRECT, '供应商 baseURL 切到直连');
assert(readV2().provider.p2.options.baseURL === 'https://api.other/', '非代理地址不碰');
assert(readPc().config.providerConfigRules.providerRules[0].config.api.baseUrl === DIRECT, 'providerConfig 规则跟着切');
assert(readPc().config.providerConfigRules.providerRules[1].config.api.baseUrl === 'https://api.x/', '非代理规则不碰');
const routes = readCfg().headroomRoutes || {};
assert(routes.p1 && routes.p1.proxy === PROXY && routes.p1.direct === DIRECT, '原代理地址与直连地址都记下来');
assert(!Object.keys(routes).includes('__proto__'), '保留键不进路由记录（防原型污染）');
assert(readV2().provider['__proto__'].options.baseURL === PROXY, '保留键条目不被切换（防原型污染）');
assert(headroomUsageScan(root).entries === 1, '关闭后仅剩保留键条目（切换不动它、扫描照样计数）');
assert(existsSync(join(root, 'v2', 'config.json.zcodepro-backup')), '切换前留备份');

// —— 幂等：再关一次不重复动 ——
const off2 = setHeadroomUsage(root, configFile, false);
assert(off2 && off2.ok && off2.changed === 0, `重复关闭无变化（实际 ${JSON.stringify(off2)}）`);

// —— 开启：按记录切回原代理地址 ——
const on = setHeadroomUsage(root, configFile, true);
assert(on && on.ok && on.changed === 2, `开启切回两个条目（实际 ${JSON.stringify(on)}）`);
assert(readV2().provider.p1.options.baseURL === PROXY, '供应商 baseURL 切回原代理地址');
assert(readPc().config.providerConfigRules.providerRules[0].config.api.baseUrl === PROXY, '规则也切回');
assert(headroomUsageScan(root).entries === 3, '开启后统计恢复');

// —— 用户手动改过直连地址：enable 不把自选地址切回代理 ——
const v2Now = readV2();
v2Now.provider.p1.options.baseURL = 'https://my.custom/api';
writeFileSync(join(root, 'v2', 'config.json'), JSON.stringify(v2Now));
const on2 = setHeadroomUsage(root, configFile, true);
assert(on2 && on2.ok && on2.changed === 0, `自选直连地址不被切回（实际 ${JSON.stringify(on2)}）`);
assert(readV2().provider.p1.options.baseURL === 'https://my.custom/api', '用户手动改的地址保持不动');

// —— 两个供应商配置文件都缺失：报 headroom-provider-config ——
const emptyRoot = join(root, 'no-config');
mkdirSync(emptyRoot, { recursive: true });
const rMissing = setHeadroomUsage(emptyRoot, join(emptyRoot, 'zcodepro.json'), false);
assert(rMissing && rMissing.ok === false && rMissing.code === 'headroom-provider-config',
  `两个配置文件都缺失报 headroom-provider-config（实际 ${JSON.stringify(rMissing)}）`);

// —— status 输出解析（多实例形态）——
const st = parseHeadroomStatus([
  'proxy: up (127.0.0.1:8787)',
  'managed-by-plugin: yes',
  'current-backend: cpu',
  'desired-backend: auto',
  'instances: 2',
  'instance: 8787 anthropic https://a.up/ up p1,p2',
  'instance: 8788 openai https://b.up/ down p3',
  'watcher: running',
  'power-save-auto-cpu: battery (interval 60s)',
  '注意：xxx',
].join('\n'));
assert(st.up === true && st.port === 8787 && st.multi === true, `up/端口/多实例判定（${JSON.stringify({ up: st.up, port: st.port, multi: st.multi })}）`);
assert(st.instances.length === 2 && st.instances[0].up === true && st.instances[1].up === false && st.instances[0].providers === 'p1,p2', '实例行解析');
assert(st.watcherRunning === true && st.powerSaveMode === 'battery' && st.watchInterval === 60 && st.saverHint.startsWith('注意'), 'watcher/省电/提示解析');
// —— Serena 开关：读写 cli/config.json 的 mcp.servers.serena，只动这一个键 ——
// cli/config.json 固定按 HOME 定位（zcodeDataRoot），测试写进沙箱 HOME
const cliCfgFile = join(process.env.HOME, '.zcode', 'cli', 'config.json');
mkdirSync(join(process.env.HOME, '.zcode', 'cli'), { recursive: true });
writeFileSync(cliCfgFile, JSON.stringify({ model: { main: 'x/y' }, mcp: { servers: { 'other-mcp': { type: 'stdio', command: 'x' } } } }));
assert(serenaScan().enabled === false, '默认关闭（无 serena 条目）');
const serenaOn = setSerenaEnabled(true);
assert(serenaOn && serenaOn.ok && serenaOn.serena.enabled === true, `开启后 serena 条目写入（实际 ${JSON.stringify(serenaOn)}）`);
const cliOn = JSON.parse(readFileSync(cliCfgFile, 'utf8'));
assert(!!cliOn.mcp?.servers?.serena?.args?.includes('start-mcp-server'), 'serena 服务器条目带 start-mcp-server');
assert(cliOn.mcp.servers['other-mcp']?.command === 'x', '其它 MCP 条目原样保留');
assert(cliOn.model?.main === 'x/y', 'config.json 其它键原样保留');
const serenaOff = setSerenaEnabled(false);
assert(serenaOff && serenaOff.ok && serenaOff.serena.enabled === false, '关闭后 serena 条目删除');
assert(!JSON.parse(readFileSync(cliCfgFile, 'utf8')).mcp?.servers?.serena, 'serena 键确实删掉');
assert(JSON.parse(readFileSync(cliCfgFile, 'utf8')).mcp?.servers?.['other-mcp']?.command === 'x', '关闭后其它 MCP 仍在');

// —— cli/config.json 存在但损坏：拒绝写入，不按空对象重写 ——
writeFileSync(cliCfgFile, '{ not valid json');
const serenaBad = setSerenaEnabled(true);
assert(serenaBad && serenaBad.ok === false && serenaBad.code === 'serena-config-unreadable',
  `损坏配置报 serena-config-unreadable（实际 ${JSON.stringify(serenaBad)}）`);
assert(readFileSync(cliCfgFile, 'utf8') === '{ not valid json', '损坏配置不被改写');

assert(!existsSync(join(process.env.HOME, '.zcode', 'headroom.json')), '不写真实 HOME');

rmSync(root, { recursive: true, force: true });
console.log(failed ? 'FAILED' : 'all ok');
process.exit(failed);
