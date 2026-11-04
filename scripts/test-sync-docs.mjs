// 同步导入回归测试：用临时数据目录跑真实的 applySyncDocs。
// 零依赖，node scripts/test-sync-docs.mjs（或 npm test）直接跑，全绿退出码 0。
// 覆盖：zcodepro 组只局部合并（features/styles/proxy）、别名与本机 sync 凭据不被
// 云端覆盖、model 组只并 provider 键且 headroom 保留本机 instances/router 与设置键、
// 残缺注册不覆盖本机映射、headroom 写入不穿出 dataRoot、
// 配置损坏时明确报错不写盘、导入前自动留备份、
// 同步信封校验（坏 JSON / 假 app / 假 kind / 假 format / 超 4MB 全部拒绝）。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applySyncDocs, loadConfig, saveConfig, defaultConfig, parseSyncEnvelope } from '../src/host/helper.mjs';

const root = mkdtempSync(join(tmpdir(), 'zcodepro-sync-test-'));
const dataRoot = root;
const configFile = join(dataRoot, 'zcodepro.json');
mkdirSync(join(dataRoot, 'v2'), { recursive: true });

// HOME 也指进沙箱：漏到 homedir() 的写（如 headroom 曾按 HOME 定位）会现形，
// 不会写坏跑测试这台机器的真实路由表
const fakeHome = join(root, 'fake-home');
mkdirSync(fakeHome, { recursive: true });
process.env.HOME = fakeHome;

// 完整注册条目（路由必需 id/upstream/format/keyHash；与 /hr-join 落盘结构一致）
const reg = (id) => ({
  id, name: id, upstream: `https://up.example/${id}`, format: 'anthropic',
  keyHash: `hash-${id}`, origBaseURL: `https://up.example/${id}`,
});

let failed = 0;
const assert = (cond, msg) => {
  if (!cond) { console.error('FAIL: ' + msg); failed = 1; }
  else console.log('ok: ' + msg);
};

// 本机配置：别名、sync 凭据、titleGen 密钥、features 开关
const local = defaultConfig();
local.features = { ...(local.features || {}), projectMenu: false, taskOrder: true };
local.aliases = { '/local/proj': '本机别名' };
local.sync = { ...local.sync, login: 'me', password: 'local-secret' };
local.titleGen = { ...local.titleGen, apiKey: 'local-key' };
saveConfig(configFile, local);

// 云端 zcodepro 文档：带 features/styles/proxy，还夹带 sync 凭据、别名、titleGen 密钥
const r = applySyncDocs({
  docs: {
    zcodepro: {
      features: { projectMenu: true, wallpaper: false, titleLock: 'yes' },
      styles: { rowGap: 8 },
      proxy: 'http://127.0.0.1:7890',
      sync: { login: 'evil', password: 'cloud-secret' },
      aliases: { '/cloud/proj': '云端别名' },
      titleGen: { apiKey: 'cloud-key' },
    },
  },
  dataRoot, configFile, config: local, sync: { ...local.sync, lastPullAt: 12345 },
});
assert(r && !r.error && r.applied && r.applied.includes('zcodepro'), 'zcodepro 组导入成功');
const after = loadConfig(configFile);
assert(after.features.projectMenu === true && after.features.wallpaper === false, 'features 局部合并（云端值生效）');
assert(typeof after.features.titleLock === 'boolean', '垃圾类型不进 features（titleLock: "yes" 被拒）');
assert(after.styles.rowGap === 8, 'styles 应用云端值');
assert(after.proxy === 'http://127.0.0.1:7890', 'proxy 应用云端值');
assert(after.aliases && after.aliases['/local/proj'] === '本机别名' && !after.aliases['/cloud/proj'], '别名保持本机、不导入云端');
assert(after.sync.login === 'me' && after.sync.password === 'local-secret', 'sync 凭据保持本机');
assert(after.sync.lastPullAt === 12345, '只写入本次拉取时间');
assert(!after.titleGen || after.titleGen.apiKey === 'local-key', 'titleGen 密钥不被云端覆盖');
assert(existsSync(configFile + '.zcodepro-backup'), '覆盖前留了备份');

// model 组：provider/provider_config/headroom（headroom 仅有效注册才覆盖、保留本机端口表）
writeFileSync(join(dataRoot, 'v2', 'config.json'), JSON.stringify({ provider: { old: null }, keep: 'x' }));
const hrFile = join(dataRoot, 'headroom.json');
writeFileSync(hrFile, JSON.stringify({
  providers: [reg('p1')], instances: { p1: 8787 }, router: 8788, kompressBackend: 'auto',
}));
const r2 = applySyncDocs({
  docs: {
    model: {
      provider: { glm: { name: 'GLM' } },
      providerConfig: { config: { providerConfigRules: { providerRules: [] } } },
      headroom: { providers: [reg('cloud')], instances: { cloud: 9999 }, router: 9998 },
    },
  },
  dataRoot, configFile, config: loadConfig(configFile), sync: local.sync,
});
assert(r2 && !r2.error && r2.applied.includes('model'), 'model 组导入成功');
const v2 = JSON.parse(readFileSync(join(dataRoot, 'v2', 'config.json'), 'utf8'));
assert(v2.keep === 'x' && v2.provider.glm && !v2.provider.old, 'provider 整键替换、其余键保留');
const hr = JSON.parse(readFileSync(hrFile, 'utf8'));
assert(hr.providers.length === 1 && hr.providers[0].id === 'cloud', 'headroom providers 覆盖');
assert(hr.instances.p1 === 8787 && hr.router === 8788, 'headroom 本机 instances/router 保留');
assert(hr.kompressBackend === 'auto', 'headroom 本机设置键（kompressBackend 等）保留');
assert(!existsSync(join(fakeHome, '.zcode', 'headroom.json')), 'headroom 写入跟随 dataRoot，不穿出到 HOME');

// 残缺注册不覆盖：只写个 id 的垃圾条目不得清掉本机映射（曾把整机请求打成 502）
const r2b = applySyncDocs({
  docs: { model: { headroom: { providers: [{ id: 'junk' }] } } },
  dataRoot, configFile, config: loadConfig(configFile), sync: local.sync,
});
const hr2 = JSON.parse(readFileSync(hrFile, 'utf8'));
assert(r2b && !r2b.error, '残缺 headroom 不阻塞其余导入');
assert(hr2.providers.length === 1 && hr2.providers[0].id === 'cloud', 'providers 残缺时 headroom 不覆盖');

// 配置损坏：明确报错，且不写任何东西
writeFileSync(configFile, '{ broken json');
loadConfig(configFile); // 置损坏标记
const beforeBytes = readFileSync(configFile, 'utf8');
const r3 = applySyncDocs({
  docs: { zcodepro: { features: { projectMenu: true } } },
  dataRoot, configFile, config: defaultConfig(), sync: local.sync,
});
assert(r3 && r3.error && r3.code === 'config-unreadable', '配置损坏时返回 config-unreadable');
assert(readFileSync(configFile, 'utf8') === beforeBytes, '配置损坏时一个字节不写');

// —— 同步信封校验（parseSyncEnvelope）：坏信封全部拒绝并报明确错误 ——
const goodEnv = JSON.stringify({ app: 'zcode-pro', kind: 'zcodepro', format: 1, data: { features: {} } });
assert(parseSyncEnvelope(goodEnv, 'zcodepro', 'test').doc, '合法信封返回 doc');
const badEnvelopes = [
  ['app 不是 zcode-pro', JSON.stringify({ app: 'other-app', kind: 'zcodepro', format: 1, data: {} }), 409],
  ['坏 JSON', '{ broken json', 409],
  ['kind 不认识（与文件名前缀不符）', JSON.stringify({ app: 'zcode-pro', kind: 'mystery', format: 1, data: {} }), 409],
  ['format 不认识', JSON.stringify({ app: 'zcode-pro', kind: 'zcodepro', format: 2, data: {} }), 400],
  ['超 4MB', 'x'.repeat(4 * 1024 * 1024 + 1), 400],
];
for (const [name, body, status] of badEnvelopes) {
  const r = parseSyncEnvelope(body, 'zcodepro', 'test');
  assert(r && r.error && !r.doc && r.code === 'sync-remote-invalid' && r.status === status,
    `${name} 被拒且报明确错误（实际 ${JSON.stringify({ code: r && r.code, status: r && r.status, error: r && r.error })}）`);
}

rmSync(root, { recursive: true, force: true });
console.log(failed ? 'FAILED' : 'all ok');
process.exit(failed);
