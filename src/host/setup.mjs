// zcode-pro setup：本机集成设置入口（npm / pip 等包管理器安装不写系统目录，
// 需要菜单入口等集成时显式运行本子命令）。按「设置项」组织（id / 标题 /
// install / uninstall），以后新增设置项往 items 里加即可。
// setup 不依赖 ZCode 运行，在 main.run 里先于 ZCode 定位处理。
//
// 快捷方式各平台形态（与 install.sh / install.ps1 的条目内容保持一致）：
// - Linux：应用菜单 .desktop（Exec 指向 PATH 中的 zcode-pro，Icon=zcode 复用 ZCode 图标）
// - Windows：开始菜单 .lnk → wscript 运行生成的 vbs（静默启动、无控制台窗口），
//   图标取 ZCode.exe；包管理器安装不带 vbs，这里按 PATH 命令现生成
// - macOS：~/Applications 下的“ZCode Pro.app”包（图标复制 ZCode 的 app.icns，无则省略）
//
// Windows 中文编码注意（vbs / PowerShell 均受代码页影响）：
// - vbs 由 wscript 按 ANSI 代码页解析，不支持 UTF-8——生成内容只用 ASCII；
// - PowerShell 脚本一律经 -EncodedCommand 传 Base64(UTF-16LE)，中文不经命令行与
//   文件编码，避开代码页问题；
// - 仓库内 PowerShell 脚本（install.ps1 等）必须保存为带 BOM 的 UTF-8。
import { execFileSync } from 'node:child_process';
import { accessSync, chmodSync, constants as fsConstants, copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, sep } from 'node:path';
import { homedir, platform } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolveZcodeExecutable } from './paths.mjs';

const here = dirname(fileURLToPath(import.meta.url)); // …/src/host（随包安装后为包内对应目录）
const pkgRoot = dirname(dirname(here));               // 安装根目录（含 cli.mjs 与 bin/）

const SUPPORTED = ['linux', 'win32', 'darwin'];

// —— PATH 中的 zcode-pro 命令 ——

function commandInPath(plat) {
  const pathSep = plat === 'win32' ? ';' : ':';
  // Windows 上 npm 会生成 zcode-pro.cmd / zcode-pro.ps1，pip 生成 zcode-pro.exe，
  // 只有 .cmd / .exe 能被 wscript 的 sh.Run 直接运行
  const names = plat === 'win32' ? ['zcode-pro.cmd', 'zcode-pro.exe'] : ['zcode-pro'];
  for (const dir of (process.env.PATH || '').split(pathSep)) {
    if (!dir) continue;
    for (const name of names) {
      const p = join(dir, name);
      try {
        if (plat === 'win32') {
          if (existsSync(p)) return p;
        } else {
          accessSync(p, fsConstants.X_OK); // 可执行
          return p;
        }
      } catch { /* 继续找 */ }
    }
  }
  return null;
}

// PATH 命令是否属于当前运行的这份安装：
// - POSIX npm / AUR / install.sh：命令（经符号链接）最终指向本包目录内的启动器；
// - Windows npm：全局命令是普通 .cmd（非符号链接），按 npm 目录布局认定——
//   命令旁的 node_modules\zcode-pro 是否即当前包；
// - pip：命令是 Python 控制台脚本，位于解释器目录而非包目录——POSIX 为文本脚本，
//   校验其 shebang 解释器所属环境是否包含当前包；Windows 为 exe 启动器，读不出
//   内容，只能按文件名认定（同机多 Python 环境时以 PATH 靠前者为准，属已知局限）。
function sameInstall(cmdPath, plat) {
  let real = cmdPath;
  try { real = realpathSync(cmdPath); } catch { /* 保持原路径 */ }
  if (real === pkgRoot || real.startsWith(pkgRoot + sep)) return true;
  if (plat === 'win32') {
    try {
      if (realpathSync(join(dirname(real), 'node_modules', 'zcode-pro')) === pkgRoot) return true;
    } catch { /* 布局不符则继续 */ }
    return pkgRoot.split(/[\\/]/).includes('zcode_pro')
      && basename(real).toLowerCase().startsWith('zcode-pro');
  }
  if (pkgRoot.split(sep).includes('zcode_pro')) {
    try {
      const shebang = readFileSync(real, 'utf-8').match(/^#!\s*(\S+)/);
      if (shebang && pkgRoot.startsWith(dirname(dirname(shebang[1])) + sep)) return true;
    } catch { /* 读不到内容则不认定 */ }
  }
  return false;
}

// —— Windows 快捷方式（路径 / 脚本生成） ——

// 本功能创建的 .lnk 归属标记（PowerShell -like 通配）：vbs 方案的 Arguments 指向
// 我们的 vbs；WSH 异常降级方案的 start 窗口标题用固定名。卸载据此只删自己的
const OWN_LNK_MARKERS = ['*zcode-pro-setup.vbs*', '*ZCodePro-Setup*'];

// 归属判断的 PowerShell 表达式：每个 -like 都必须带完整变量前缀（写成共享的
// “-like a -or -like b” 是语法错误）
const ownsExpr = (v) => OWN_LNK_MARKERS.map((m) => `${v}.Arguments -like '${m}'`).join(' -or ');

function windowsPaths() {
  const appData = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
  const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
  return {
    appData,
    localAppData,
    lnkPath: join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'ZCode Pro.lnk'),
    vbsDir: join(localAppData, 'ZCodePro', 'setup'),
    vbsPath: join(localAppData, 'ZCodePro', 'setup', 'zcode-pro-setup.vbs'),
  };
}

// 经 Base64(UTF-16LE) 的 -EncodedCommand 执行 PowerShell：中文不经过命令行与
// 文件编码，任何系统代码页下都安全。返回 stdout；非零退出码抛错
function runPowerShell(script) {
  const b64 = Buffer.from(script, 'utf16le').toString('base64');
  return execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', b64],
    { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' });
}

// WSH 是否可用：复现 vbs 的启动调用（WScript.Shell.Run 隐藏窗口执行）。
// 部分机器（精简系统/安全软件/组件禁用）上该调用报 0x800A01AD，需降级 cmd 启动。
// ZCODEPRO_FORCE_NO_WSH=1 供测试强制走降级路径。
let wshOkCache;

function windowsWshOk() {
  if (process.env.ZCODEPRO_FORCE_NO_WSH === '1') return false;
  if (wshOkCache !== undefined) return wshOkCache;
  try {
    runPowerShell([
      "$ErrorActionPreference = 'Stop'",
      '$sh = New-Object -ComObject WScript.Shell',
      "$sh.Run('cmd /c exit 0', 0, $true) | Out-Null",
    ].join('\r\n'));
    wshOkCache = true;
  } catch {
    wshOkCache = false;
  }
  return wshOkCache;
}

// .lnk 是否本功能创建（按 Arguments 里的归属标记判断；读不到按外来处理，不覆盖）
function lnkIsOurs(lnkPath) {
  try {
    const out = runPowerShell([
      "$ErrorActionPreference = 'Stop'",
      `$l = (New-Object -ComObject WScript.Shell).CreateShortcut('${psQuote(lnkPath)}')`,
      `Write-Output (${OWN_LNK_MARKERS.map((m) => `$l.Arguments -like '${m}'`).join(' -or ')})`,
    ].join('\r\n'));
    return /True/.test(out);
  } catch {
    return false;
  }
}

const psQuote = (s) => String(s).replace(/'/g, "''"); // PowerShell 单引号字面量转义

// 快捷方式计划（导出仅供测试审查，不执行）。desktop 为真时同时创建桌面快捷方式，
// 桌面目录由 PowerShell 的 GetFolderPath 解析（正确跟随 OneDrive 重定向等）。
// wshOk 为假（WSH 异常的机器）时降级：.lnk 直接经 cmd 最小化启动，不再依赖
// wscript+vbs，代价是启动瞬间任务栏短暂闪一个最小化控制台
export function windowsShortcutPlan(cmd, desktop = false, wshOk = true) {
  const paths = windowsPaths();
  // vbs 由 wscript 按 ANSI 代码页解析（不支持 UTF-8），内容只用 ASCII
  const vbsContent = [
    `' Generated by zcode-pro setup: run zcode-pro silently (no console window); forwards all arguments`,
    'Set sh = CreateObject("WScript.Shell")',
    `cmd = """${cmd.replace(/"/g, '""')}"""`,
    'If WScript.Arguments.Count > 0 Then',
    '  Dim parts()',
    '  ReDim parts(WScript.Arguments.Count - 1)',
    '  For i = 0 To WScript.Arguments.Count - 1',
    '    parts(i) = """" & WScript.Arguments(i) & """"',
    '  Next',
    '  cmd = cmd & " " & Join(parts, " ")',
    'End If',
    'sh.Run cmd, 0, False',
    '',
  ].join('\r\n');
  // 图标复用已安装的 ZCode：探测走 paths.mjs 同一条优先级（含注册表，覆盖自定义
  // 安装目录）；未安装 ZCode 时留空，快捷方式回落系统默认图标
  let icon = '';
  try { icon = resolveZcodeExecutable(''); } catch { /* 未安装 ZCode，省略图标 */ }
  const iconLine = icon ? `  $l.IconLocation = '${psQuote(`${icon},0`)}'` : '';
  const setProps = wshOk ? [
    'function setProps($l) {',
    '  $l.TargetPath = "$env:SystemRoot\\System32\\wscript.exe"',
    `  $l.Arguments = '${psQuote(`"${paths.vbsPath}"`)}'`,
    `  $l.WorkingDirectory = '${psQuote(paths.vbsDir)}'`,
    "  $l.Description = 'ZCode 桌面版增强启动器（自定义别名等，不修改客户端文件）'",
    iconLine,
    '}',
  ] : [
    'function setProps($l) {',
    '  $l.TargetPath = "$env:SystemRoot\\System32\\cmd.exe"',
    `  $l.Arguments = '/c start "ZCodePro-Setup" /min "${psQuote(cmd)}"'`,
    `  $l.WorkingDirectory = '${psQuote(paths.vbsDir)}'`,
    "  $l.Description = 'ZCode 桌面版增强启动器（自定义别名等，不修改客户端文件）'",
    iconLine,
    '  $l.WindowStyle = 7',
    '}',
  ];
  const psScript = [
    "$ErrorActionPreference = 'Stop'",
    '$wsh = New-Object -ComObject WScript.Shell',
    ...setProps,
    `$lnk = $wsh.CreateShortcut('${psQuote(paths.lnkPath)}')`,
    'setProps $lnk',
    '$lnk.Save()',
    ...(desktop ? [
      "$desk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'ZCode Pro.lnk'",
      '$dl = $wsh.CreateShortcut($desk)',
      '# 已存在且非本功能创建（Arguments 无归属标记）时不覆盖',
      `if (-not (Test-Path $desk) -or (${ownsExpr('$dl')})) {`,
      '  setProps $dl',
      '  $dl.Save()',
      '}',
    ] : []),
  ].filter(Boolean).join('\r\n');
  return { ...paths, vbsContent, psScript, icon, wshOk };
}

// —— 快捷方式设置项 ——

const DESKTOP_FILE = 'zcode-pro.desktop';
// setup 创建的条目带标记：卸载只动自己的，不误删 install.sh / AUR / install.ps1 的同名条目
const SETUP_MARK = 'X-ZCodePro-Setup=true';

function desktopEntry(execCmd) {
  const exec = /\s/.test(execCmd) ? `"${execCmd}"` : execCmd;
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=ZCode Pro',
    'Comment=ZCode 桌面版增强启动器（自定义别名等，不修改客户端文件）',
    `Exec=${exec}`,
    'Icon=zcode',
    'Terminal=false',
    'Categories=Development;IDE;',
    'Keywords=zcode;pro;enhance;',
    SETUP_MARK,
    '',
  ].join('\n');
}

function applicationsDir() {
  return join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'applications');
}

// Linux 桌面目录：优先 xdg-user-dir（正确跟随本地化目录名，如 ~/桌面）
function desktopDir() {
  try {
    const dir = execFileSync('xdg-user-dir', ['DESKTOP'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (dir) return dir;
  } catch { /* 无该命令时按常见值回退 */ }
  return existsSync(join(homedir(), 'Desktop')) ? join(homedir(), 'Desktop') : join(homedir(), '桌面');
}

// macOS 应用包目录、桌面入口（指向应用包的符号链接）与图标来源
function macAppBundle() {
  return join(homedir(), 'Applications', 'ZCode Pro.app');
}

function macDesktopLink() {
  return join(homedir(), 'Desktop', 'ZCode Pro.app');
}

function plistContent(hasIcon) {
  const pairs = [
    ['CFBundleName', 'ZCode Pro'],
    ['CFBundleDisplayName', 'ZCode Pro'],
    ['CFBundleIdentifier', 'com.duanluan.zcodepro'],
    ['CFBundleVersion', '1'],
    ['CFBundleShortVersionString', '1'],
    ['CFBundlePackageType', 'APPL'],
    ['CFBundleExecutable', 'zcode-pro'],
  ];
  if (hasIcon) pairs.push(['CFBundleIconFile', 'app']);
  const body = pairs.map(([k, v]) => `  <key>${k}</key>\n  <string>${v}</string>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n${body}\n</dict>\n</plist>\n`;
}

const shortcutItem = {
  id: 'desktop-shortcut',
  title: '快捷方式“ZCode Pro”（应用菜单/开始菜单，图标复用 ZCode）',
  supported: (plat) => SUPPORTED.includes(plat),

  install(plat, opts = {}) {
    const cmd = commandInPath(plat);
    if (!cmd) {
      throw new Error('未在 PATH 中找到 zcode-pro 命令，无法创建快捷方式；请确认安装方式后重试。');
    }
    if (!sameInstall(cmd, plat)) {
      throw new Error(`PATH 中的 zcode-pro（${cmd}）不属于当前运行的这份安装，` +
        '为避免快捷方式指向旧版本已跳过；请用那份安装自己的方式管理快捷方式。');
    }
    if (plat === 'linux') return this.installLinux(cmd, opts);
    if (plat === 'win32') return this.installWindows(cmd, opts);
    return this.installMac(cmd, opts);
  },

  installLinux(cmd, opts = {}) {
    // 系统级（AUR 等）已有同名条目时不再建用户级：desktop 文件 id 相同时用户级
    // 会遮蔽系统级（项目既有约定），残留后表现为菜单一直运行另一份
    if (existsSync('/usr/share/applications/zcode-pro.desktop')) {
      return { skipped: '检测到系统级 ZCode Pro 快捷方式（AUR 等已安装），用户级条目会遮蔽它，已跳过' };
    }
    const appsDir = applicationsDir();
    const target = join(appsDir, DESKTOP_FILE);
    const parts = [];
    if (existsSync(target)) {
      const cur = readFileSync(target, 'utf-8');
      if (!cur.includes(SETUP_MARK)) {
        return { skipped: `${target} 已存在且非 setup 创建（如 install.sh），未覆盖` };
      }
      const exec = (cur.match(/^Exec=(.+)$/m) || [])[1] || '';
      if (exec.includes(cmd)) {
        parts.push('应用菜单条目已存在且指向当前命令，无需重复创建');
      } else {
        writeFileSync(target, desktopEntry(cmd));
        parts.push(`已更新 ${target}（Exec=${cmd}）`);
      }
    } else {
      mkdirSync(appsDir, { recursive: true });
      writeFileSync(target, desktopEntry(cmd));
      parts.push(`已写入 ${target}（Exec=${cmd}）`);
    }
    try { execFileSync('update-desktop-database', [appsDir], { stdio: 'ignore' }); } catch { /* 无该命令时忽略 */ }
    // 桌面条目独立判断（不因菜单条目幂等而短路）
    if (opts.desktop) {
      const dDir = desktopDir();
      const dTarget = join(dDir, DESKTOP_FILE);
      if (!existsSync(dTarget) || readFileSync(dTarget, 'utf-8').includes(SETUP_MARK)) {
        writeFileSync(dTarget, desktopEntry(cmd));
        parts.push(`桌面 ${dTarget}`);
      } else {
        parts.push('桌面已存在非 setup 创建的条目，未覆盖');
      }
    }
    if (parts.length === 1 && parts[0].startsWith('应用菜单条目已存在')) return { skipped: parts[0] };
    return { detail: parts.join('；') };
  },

  installWindows(cmd, opts = {}) {
    const wshOk = windowsWshOk();
    const plan = windowsShortcutPlan(cmd, !!opts.desktop, wshOk);
    // .lnk 已存在且不属于本功能（Arguments 无归属标记）＝ install.ps1 等其他方式创建，不覆盖
    if (existsSync(plan.lnkPath) && !lnkIsOurs(plan.lnkPath)) {
      return { skipped: `已存在其他方式创建的 ${plan.lnkPath}，未覆盖` };
    }
    if (wshOk) {
      mkdirSync(plan.vbsDir, { recursive: true });
      writeFileSync(plan.vbsPath, plan.vbsContent);
    }
    runPowerShell(plan.psScript);
    const how = wshOk
      ? `经 ${plan.vbsPath} 静默启动`
      : '本机 WSH 异常，经 cmd 最小化启动（启动时会短暂闪烁控制台窗口）';
    return { detail: `已创建 ${plan.lnkPath}（${how}${opts.desktop ? '，含桌面' : ''}）` };
  },

  installMac(cmd, opts = {}) {
    const app = macAppBundle();
    const contents = join(app, 'Contents');
    const marker = join(contents, 'zcodepro-setup-marker');
    if (existsSync(app) && !existsSync(marker)) {
      return { skipped: `${app} 已存在且非 setup 创建，未覆盖` };
    }
    let iconCopied = false;
    for (const src of [join('/', 'Applications', 'ZCode.app', 'Contents', 'Resources', 'app.icns'),
                       join(homedir(), 'Applications', 'ZCode.app', 'Contents', 'Resources', 'app.icns')]) {
      if (!existsSync(src)) continue;
      try {
        mkdirSync(join(contents, 'Resources'), { recursive: true });
        copyFileSync(src, join(contents, 'Resources', 'app.icns'));
        iconCopied = true;
        break;
      } catch { /* 复制失败则省略图标 */ }
    }
    mkdirSync(join(contents, 'MacOS'), { recursive: true });
    const launcher = join(contents, 'MacOS', 'zcode-pro');
    writeFileSync(launcher, `#!/bin/sh\nexec "${cmd}" "$@"\n`);
    chmodSync(launcher, 0o755);
    writeFileSync(join(contents, 'Info.plist'), plistContent(iconCopied));
    writeFileSync(marker, '');
    let detail = `已创建 ${app}（启动器指向 ${cmd}${iconCopied ? '，图标已复制' : ''}）`;
    if (opts.desktop) {
      const link = macDesktopLink();
      if (existsSync(link)) {
        detail += '；桌面已存在同名入口，未覆盖';
      } else {
        try {
          symlinkSync(app, link);
          detail += `；桌面 ${link}`;
        } catch { /* 建链接失败仅省略桌面入口 */ }
      }
    }
    return { detail };
  },

  uninstall(plat) {
    if (plat === 'linux') return this.uninstallLinux();
    if (plat === 'win32') return this.uninstallWindows();
    return this.uninstallMac();
  },

  uninstallLinux() {
    const target = join(applicationsDir(), DESKTOP_FILE);
    const dTarget = join(desktopDir(), DESKTOP_FILE);
    const removed = [];
    if (existsSync(target) && readFileSync(target, 'utf-8').includes(SETUP_MARK)) {
      rmSync(target);
      removed.push(target);
    }
    // setup --desktop 建的桌面条目一并清理（同样只动带标记的）
    if (existsSync(dTarget) && readFileSync(dTarget, 'utf-8').includes(SETUP_MARK)) {
      rmSync(dTarget);
      removed.push(dTarget);
    }
    if (!removed.length) return { skipped: '未发现 setup 创建的快捷方式' };
    try { execFileSync('update-desktop-database', [applicationsDir()], { stdio: 'ignore' }); } catch { /* 无该命令时忽略 */ }
    return { detail: `已移除 ${removed.join('、')}` };
  },

  uninstallWindows() {
    const paths = windowsPaths();
    const hadVbs = existsSync(paths.vbsPath);
    const hadLnk = existsSync(paths.lnkPath);
    if (!hadVbs && !hadLnk) return { skipped: '未发现 setup 创建的快捷方式' };
    // .lnk 可能已被 install.ps1 等重建并指向它自己：只有 Arguments 带本功能归属
    // 标记才删；校验失败也保留 .lnk（宁可漏删不误删）
    let lnkRemoved = false;
    let verified = false;
    try {
      runPowerShell([
        "$ErrorActionPreference = 'Stop'",
        '$wsh = New-Object -ComObject WScript.Shell',
        `$lnk = $wsh.CreateShortcut('${psQuote(paths.lnkPath)}')`,
        `if (${ownsExpr('$lnk')}) { Remove-Item -LiteralPath '${psQuote(paths.lnkPath)}' -Force }`,
        // setup --desktop 建的桌面 .lnk 一并清理（归属校验同开始菜单）
        "$desk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'ZCode Pro.lnk'",
        'if (Test-Path $desk) {',
        '  $dl = $wsh.CreateShortcut($desk)',
        `  if (${ownsExpr('$dl')}) { Remove-Item -LiteralPath $desk -Force }`,
        '}',
      ].join('\r\n'));
      verified = true;
      lnkRemoved = !existsSync(paths.lnkPath);
    } catch { /* 校验失败则不动 .lnk */ }
    let vbsCleaned = !hadVbs;
    if (hadVbs) {
      try {
        rmSyncWithRetry(paths.vbsDir);
        vbsCleaned = true;
      } catch (err) {
        // 目录被杀软/索引短暂锁定导致 EPERM：先试原生 rmdir，仍失败但里面的文件
        // 已删干净时按成功处理（残留空目录无害，下次运行会覆盖）
        try {
          execFileSync('cmd', ['/c', 'rmdir', '/s', '/q', paths.vbsDir], { stdio: 'ignore' });
          vbsCleaned = true;
        } catch {
          vbsCleaned = !existsSync(paths.vbsPath);
          if (!vbsCleaned) console.error(`  （${paths.vbsDir} 删除失败，可能被占用，可稍后手动删除）`);
        }
      }
    }
    const parts = [];
    if (hadLnk) {
      parts.push(lnkRemoved ? '开始菜单/桌面快捷方式' : verified ? '快捷方式已非本功能创建，未删除' : '快捷方式归属校验失败，未删除 .lnk');
    }
    if (hadVbs) parts.push(vbsCleaned ? '生成的启动脚本' : '启动脚本（删除失败）');
    return { detail: `已移除：${parts.join('；')}` };
  },

  uninstallMac() {
    const app = macAppBundle();
    const marker = join(app, 'Contents', 'zcodepro-setup-marker');
    if (!existsSync(marker)) return { skipped: '未发现 setup 创建的应用包' };
    // setup --desktop 建的桌面入口一并清理（只删指向本应用包的链接）
    const link = macDesktopLink();
    try {
      if (existsSync(link) && realpathSync(link) === realpathSync(app)) rmSync(link);
    } catch { /* 链接失效则忽略 */ }
    rmSync(app, { recursive: true, force: true });
    return { detail: `已移除 ${app}` };
  },
};

// Windows 上刚写过的目录可能被杀软/索引短暂占用，立即删除偶发 EPERM：短暂等待后重试
function rmSyncWithRetry(target, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      rmSync(target, { recursive: true, force: true });
      return;
    } catch (err) {
      if (i >= tries - 1) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
    }
  }
}

// —— 设置项注册处：以后新增设置项在这里加 ——

const items = [shortcutItem];

export async function runSetup({ uninstall = false, platform: plat = platform(), desktop = false } = {}) {
  console.log(`[zcodepro] setup ${uninstall ? '卸载' : '安装'}本机集成${desktop && !uninstall ? '（含桌面）' : ''}：`);
  let failed = 0;
  for (const item of items) {
    if (!item.supported(plat)) {
      console.log(`  · ${item.title}：当前平台（${plat}）暂不支持，跳过`);
      continue;
    }
    try {
      const res = uninstall ? item.uninstall(plat) : item.install(plat, { desktop });
      if (res && res.skipped) console.log(`  · ${item.title}：${res.skipped}`);
      else console.log(`  ✓ ${item.title}：${res && res.detail ? res.detail : '完成'}`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${item.title}：${err?.message || err}`);
    }
  }
  console.log(uninstall ? '' : '  撤销：zcode-pro setup --uninstall');
  if (failed) process.exitCode = 1;
}
