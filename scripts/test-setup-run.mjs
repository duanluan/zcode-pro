// setup 安装/卸载干跑回归测试：沙箱 HOME 下真实跑 runSetup 两遍装两遍卸。
// 零依赖，node scripts/test-setup-run.mjs（或 npm test）直接跑，全绿退出码 0。
// 覆盖：Linux 菜单/桌面条目与壁纸文档的安装落盘、卸载清干净、重复装卸幂等、
// 外来同名条目（不带归属标记）不覆盖不删除、macOS 应用包的生成与移除
//（Windows 计划另有 test-wallpaper-setup 覆盖）。
import { mkdirSync, mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSetup } from '../src/host/setup.mjs';
import { installWallpaperDocs, removeWallpaperDocs } from '../src/host/wallpaper.mjs';

const root = mkdtempSync(join(tmpdir(), 'zcodepro-setuprun-test-'));
process.env.HOME = join(root, 'fake-home');
process.env.XDG_DATA_HOME = join(root, 'xdg-data');
mkdirSync(process.env.HOME, { recursive: true });
mkdirSync(process.env.XDG_DATA_HOME, { recursive: true });

let failed = 0;
const assert = (cond, msg) => {
  if (!cond) { console.error('FAIL: ' + msg); failed = 1; }
  else console.log('ok: ' + msg);
};
// runSetup 失败会把 process.exitCode 置 1：收集起来统一断言，别在清零时把失败信号丢了
const setupFailed = [];
const run = async (opts) => {
  process.exitCode = 0;
  await runSetup(opts);
  if (process.exitCode) setupFailed.push(`${JSON.stringify(opts)} → exitCode ${process.exitCode}`);
  process.exitCode = 0; // 清零避免污染测试进程的最终退出码
};

const menuEntry = join(process.env.XDG_DATA_HOME, 'applications', 'zcode-pro.desktop');
const desktopEntry = join(process.env.HOME, 'Desktop', 'zcode-pro.desktop');
const cmdDoc = join(process.env.HOME, '.zcode', 'commands', 'wallpaper.md');
const skillDir = join(process.env.HOME, '.zcode', 'skills', 'wallpaper');

// —— Linux 安装（含桌面）——
await run({ platform: 'linux', desktop: true });
installWallpaperDocs(join(process.env.HOME, '.zcode')); // 启动流程同款：main.mjs 启动时装壁纸文档
assert(existsSync(menuEntry) && readFileSync(menuEntry, 'utf8').includes('X-ZCodePro-Setup=true'), '菜单条目落盘且带归属标记');
assert(existsSync(desktopEntry), '桌面条目落盘');
assert(existsSync(cmdDoc) && existsSync(skillDir), '壁纸命令与技能文档装上');

// —— 卸载清干净 ——
await run({ platform: 'linux', uninstall: true, desktop: true });
removeWallpaperDocs(join(process.env.HOME, '.zcode')); // setup --uninstall 同款：main.mjs 卸载时清壁纸文档
assert(!existsSync(menuEntry) && !existsSync(desktopEntry), '菜单与桌面条目卸干净');
assert(!existsSync(cmdDoc) && !existsSync(skillDir), '壁纸文档卸干净');

// —— 重复装两遍卸两遍：幂等不报错 ——
await run({ platform: 'linux', desktop: true });
await run({ platform: 'linux', desktop: true });
assert(existsSync(menuEntry), '重复安装仍落盘（幂等）');
await run({ platform: 'linux', uninstall: true });
await run({ platform: 'linux', uninstall: true });
assert(!existsSync(menuEntry), '重复卸载不报错且干净（幂等）');

// —— 归属保护：外来同名条目（不带 SETUP_MARK）不覆盖、不删除 ——
await run({ platform: 'linux', desktop: true });
const foreignMenu = '[Desktop Entry]\nType=Application\nName=Foreign Installer\n';
writeFileSync(menuEntry, foreignMenu); // 模拟 install.sh / AUR 等放的同名条目
await run({ platform: 'linux', desktop: true });
assert(readFileSync(menuEntry, 'utf8') === foreignMenu, '重复安装不覆盖外来条目（内容原样）');
await run({ platform: 'linux', uninstall: true, desktop: true });
assert(existsSync(menuEntry) && readFileSync(menuEntry, 'utf8') === foreignMenu, '卸载不删外来条目');
assert(!existsSync(desktopEntry), '带归属标记的桌面条目照常被删');

// —— macOS 应用包 ——
await run({ platform: 'darwin' });
const appDir = join(process.env.HOME, 'Applications', 'ZCode Pro.app');
assert(existsSync(join(appDir, 'Contents', 'MacOS', 'zcode-pro')) && existsSync(join(appDir, 'Contents', 'Info.plist')), 'macOS 应用包生成');
assert(readFileSync(join(appDir, 'Contents', 'MacOS', 'zcode-pro'), 'utf8').startsWith('#!/bin/sh'), '启动器是 shell 脚本');
await run({ platform: 'darwin', uninstall: true });
assert(!existsSync(appDir), 'macOS 应用包卸干净');
assert(!existsSync(join(process.env.HOME, '.zcode', 'headroom.json')), '不写真实 HOME');

rmSync(root, { recursive: true, force: true });
assert(setupFailed.length === 0, `runSetup 全程无失败退出码（实际 ${setupFailed.join('; ') || '无'}）`);
console.log(failed ? 'FAILED' : 'all ok');
process.exit(failed);
