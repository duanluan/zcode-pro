// wallpaper CLI 与 setup 快捷方式生成回归测试。零依赖，
// node scripts/test-wallpaper-setup.mjs（或 npm test）直接跑，全绿退出码 0。
// HOME 指进沙箱：任何漏到真实目录的写都会现形。
// 覆盖：rotate/params/set 的参数校验与取值钳位、壁纸命令/技能文档装卸、
// 快捷方式计划的 vbs 纯 ASCII、PowerShell 路径转义、WSH 降级分支的起始位置、
// 桌面快捷方式近似路径。
import { mkdirSync, mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runWallpaperCli, installWallpaperDocs, removeWallpaperDocs } from '../src/host/wallpaper.mjs';
import { windowsShortcutPlan, desktopLnkPathApprox } from '../src/host/setup.mjs';

const root = mkdtempSync(join(tmpdir(), 'zcodepro-wpsetup-test-'));
process.env.HOME = join(root, 'fake-home');
mkdirSync(process.env.HOME, { recursive: true });

let failed = 0;
const assert = (cond, msg) => {
  if (!cond) { console.error('FAIL: ' + msg); failed = 1; }
  else console.log('ok: ' + msg);
};
const readCfg = () => JSON.parse(readFileSync(join(root, 'zcodepro.json'), 'utf8'));

// —— wallpaper rotate：用法校验与钳位 ——
assert(await runWallpaperCli(['rotate', 'abc'], root) !== 0, 'rotate 非数字报错');
assert(await runWallpaperCli(['rotate', '99999'], root) === 0 && readCfg().theme.bg.intervalMin === 1440,
  `rotate 越界钳到 1440（实际 ${readCfg().theme.bg.intervalMin}）`);
assert(await runWallpaperCli(['rotate', '0', '--random'], root) === 0
  && readCfg().theme.bg.intervalMin === 0 && readCfg().theme.bg.folderRandom === true,
  'rotate 0 不轮换、--random 生效');

// —— wallpaper params：校验与钳位 ——
assert(await runWallpaperCli(['params', 'maskOpacity=5'], root) === 0 && readCfg().theme.bg.maskOpacity === 0.99,
  'params 越界钳位（maskOpacity=5 → 0.99）');
assert(await runWallpaperCli(['params', 'badkey=1'], root) !== 0, 'params 未知键报错');
assert(await runWallpaperCli(['params', 'maskOpacity=abc'], root) !== 0, 'params 非数值报错');

// —— wallpaper set url：协议校验 ——
assert(await runWallpaperCli(['set', 'url', 'javascript:alert(1)'], root) !== 0, 'set url 非 http(s) 报错');
assert(await runWallpaperCli(['set', 'url', 'https://x.example/a.jpg'], root) === 0
  && readCfg().theme.bg.mode === 'url' && readCfg().theme.bg.url === 'https://x.example/a.jpg',
  'set url 合法值落库');

// —— 壁纸命令/技能文档装卸 ——
installWallpaperDocs(root);
assert(existsSync(join(root, 'commands', 'wallpaper.md')) && existsSync(join(root, 'skills', 'wallpaper')),
  'installWallpaperDocs 装上命令与技能');
removeWallpaperDocs(root);
assert(!existsSync(join(root, 'commands', 'wallpaper.md')) && !existsSync(join(root, 'skills', 'wallpaper')),
  'removeWallpaperDocs 卸干净');

// —— 快捷方式计划 ——
const cmd = "C:\\Program Files\\ZCode Pro\\zcode-pro.cmd";
const plan = windowsShortcutPlan(cmd, true, true, true);
assert(/^[\x00-\x7F]*$/.test(plan.vbsContent), 'vbs 内容纯 ASCII（ANSI 代码页安全）');
assert(plan.vbsContent.includes('zcode-pro.cmd'), 'vbs 转发到启动命令');
const tricky = windowsShortcutPlan("C:\\o'brien\\zcode-pro.cmd", false, false, true);
assert(tricky.psScript.includes("o''brien"), "PowerShell 单引号转义（o''brien）");
assert(tricky.psScript.includes("WorkingDirectory = 'C:\\o''brien'"), "WSH 降级分支起始位置取命令所在目录（不是不存在的 vbs 目录）");
assert(typeof desktopLnkPathApprox() === 'string' && desktopLnkPathApprox().endsWith('ZCode Pro.lnk'), '桌面快捷方式近似路径以 ZCode Pro.lnk 结尾');
assert(!existsSync(join(process.env.HOME, '.zcode', 'headroom.json')), '不写真实 HOME');

rmSync(root, { recursive: true, force: true });
console.log(failed ? 'FAILED' : 'all ok');
process.exit(failed);
