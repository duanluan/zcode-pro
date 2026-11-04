// 配置加载回归测试：mergeThemeConfig/loadConfig 的取值钳位与协议校验。
// 零依赖，node scripts/test-config.mjs（或 npm test）直接跑，全绿退出码 0。
// 覆盖：数值钳位（越界收敛到边界/默认）、网页壁纸 URL 只收 http(s)、
// 枚举字段非法值回默认、null/undefined 显式区分（0 是合法值）。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, mergeThemeConfig } from '../src/host/helper.mjs';
import { remapSettingsPaths } from '../src/host/settings.mjs';

const root = mkdtempSync(join(tmpdir(), 'zcodepro-config-test-'));
const configFile = join(root, 'zcodepro.json');

let failed = 0;
const assert = (cond, msg) => {
  if (!cond) { console.error('FAIL: ' + msg); failed = 1; }
  else console.log('ok: ' + msg);
};

// 数值钳位：越界收敛、负值回默认、0 合法保留
const cfg = mergeThemeConfig({
  bg: {
    maskOpacity: 5, blurPx: 100, panelOpacity: -1, intervalMin: 99999,
    videoVolume: 3, playbackRate: 10, fpsCap: 7,
  },
});
assert(cfg.bg.maskOpacity === 0.99, `maskOpacity 越界钳到 0.99（实际 ${cfg.bg.maskOpacity}）`);
assert(cfg.bg.blurPx === 24, `blurPx 越界钳到 24（实际 ${cfg.bg.blurPx}）`);
assert(cfg.bg.panelOpacity === 0, `panelOpacity 负值钳到下边界 0（实际 ${cfg.bg.panelOpacity}）`);
assert(mergeThemeConfig({ bg: {} }).bg.panelOpacity === 0.3, 'panelOpacity 缺省默认 0.3');
assert(cfg.bg.intervalMin === 1440, `intervalMin 越界钳到 1440（实际 ${cfg.bg.intervalMin}）`);
assert(cfg.bg.videoVolume === 1, `videoVolume 越界钳到 1（实际 ${cfg.bg.videoVolume}）`);
assert(cfg.bg.playbackRate === 2, `playbackRate 越界钳到 2（实际 ${cfg.bg.playbackRate}）`);
assert(cfg.bg.fpsCap === 0, `fpsCap 非法枚举回默认 0（实际 ${cfg.bg.fpsCap}）`);
const zero = mergeThemeConfig({ bg: { maskOpacity: 0, videoVolume: 0, intervalMin: 0 } });
assert(zero.bg.maskOpacity === 0 && zero.bg.videoVolume === 0 && zero.bg.intervalMin === 0, '0 是合法值，不被默认值顶掉');

// 网页壁纸 URL 只收 http(s)：javascript:/data: 等一律清空
assert(mergeThemeConfig({ bg: { url: 'https://example.com/a.jpg' } }).bg.url === 'https://example.com/a.jpg', 'http(s) URL 保留');
assert(mergeThemeConfig({ bg: { url: 'javascript:alert(1)' } }).bg.url === '', 'javascript: URL 清空');
assert(mergeThemeConfig({ bg: { url: 'data:text/html,x' } }).bg.url === '', 'data: URL 清空');

// loadConfig 对残缺配置补默认：缺字段不炸、坏类型回默认
writeFileSync(configFile, JSON.stringify({ features: { projectMenu: true }, theme: { bg: { maskOpacity: 5 } } }));
const loaded = loadConfig(configFile);
assert(loaded.features.projectMenu === true && loaded.features.taskOrder === true, '缺字段补默认、已有值保留');
assert(loaded.theme.bg.maskOpacity === 0.99, 'loadConfig 同样钳位');
assert(typeof loaded.sync === 'object' && loaded.sync.type === 'webdav', 'sync 组补默认');

// 路径改写（切换文件夹）：只改三个引用字段、保留尾分隔符风格、子路径跟着改
const remapped = remapSettingsPaths({
  recentProjects: ['/old/proj', '/old/proj/', '/old/proj/sub', '/other'],
  lastWorkspaceSession: [{ workspacePath: '/old/proj/' }, { workspacePath: '/elsewhere' }],
  webRemoteControlLastEnabledContext: { workspacePath: '/old/proj' },
  untouched: '/old/proj',
}, '/old/proj', '/new/proj');
// 只映射精确匹配（尾分隔符可有可无）：嵌套子路径是另一个项目根，保守不动
assert(remapped.recentProjects.join(',') === '/new/proj,/new/proj/,/old/proj/sub,/other',
  `recentProjects 精确映射且保留尾分隔符、子路径不动（实际 ${remapped.recentProjects.join(',')}）`);
assert(remapped.lastWorkspaceSession[0].workspacePath === '/new/proj/' && remapped.lastWorkspaceSession[1].workspacePath === '/elsewhere',
  'lastWorkspaceSession 只改命中项');
assert(remapped.webRemoteControlLastEnabledContext.workspacePath === '/new/proj', 'webRemoteControlLastEnabledContext 跟着改');
assert(remapped.untouched === '/old/proj', '三个字段之外的引用不改');
const win = remapSettingsPaths({ recentProjects: ['C:\\old\\proj\\'] }, 'C:\\old\\proj', 'D:\\new\\proj');
assert(win.recentProjects[0] === 'D:\\new\\proj\\', `Windows 反斜杠尾分隔符保留（实际 ${win.recentProjects[0]}）`);

rmSync(root, { recursive: true, force: true });
console.log(failed ? 'FAILED' : 'all ok');
process.exit(failed);
