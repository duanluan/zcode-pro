// 跨平台定位 ZCode 桌面版可执行文件。
// 优先级：--zcode-path 参数 > ZCODEPRO_ZCODE_PATH 环境变量 > 平台默认候选路径 > 注册表（Windows） > PATH 上的 zcode。
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { arch, homedir, platform } from 'node:os';
import { execFileSync } from 'node:child_process';

// Windows 注册表探测（结果缓存）：自定义安装目录的安装器会在 App Paths（可执行
// 文件全路径）或卸载表 DisplayIcon（控制面板-卸载软件里可见）留有登记，固定
// 候选找不到时兜底。reg 输出按行取 REG_SZ 后的值，容忍引号与 ",0" 图标序号后缀。
let winRegistryCandidates;

function windowsRegistryCandidates() {
  if (winRegistryCandidates) return winRegistryCandidates;
  winRegistryCandidates = [];
  const seen = new Set();
  const push = (raw) => {
    const p = String(raw || '').trim().replace(/^"|"$/g, '').replace(/,\d+$/, '');
    if (/\.exe$/i.test(p) && !seen.has(p.toLowerCase())) {
      seen.add(p.toLowerCase());
      winRegistryCandidates.push(p);
    }
  };
  const reg = (args) => {
    try {
      return execFileSync('reg', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch { return ''; }
  };
  const valueAfter = (out) => (out.split(/REG_SZ\s+/)[1] || '').trim();
  // App Paths：安装器注册的可执行文件全路径（ShellExecute 同款查找）
  for (const root of ['HKLM', 'HKCU']) {
    const out = reg(['query', `${root}\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\zcode.exe`, '/ve']);
    if (out) push(valueAfter(out));
  }
  // 卸载表 DisplayIcon：安装目录自定义时通常只有这里能找到
  for (const key of [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ]) {
    const out = reg(['query', key, '/s', '/v', 'DisplayIcon']);
    for (const line of out.split(/\r?\n/)) {
      const seg = (line.split(/REG_SZ\s+/)[1] || '').trim();
      if (seg && /zcode/i.test(seg)) push(seg);
    }
  }
  return winRegistryCandidates;
}

function candidates() {
  const home = homedir();
  if (platform() === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || join(home, 'AppData', 'Local');
    const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
    return [
      join(localAppData, 'Programs', 'ZCode', 'ZCode.exe'),
      join(localAppData, 'Programs', 'zcode', 'zcode.exe'),
      join(programFiles, 'ZCode', 'ZCode.exe'),
      join(programFiles, 'zcode', 'zcode.exe'),
      ...windowsRegistryCandidates(),
    ];
  }
  if (platform() === 'darwin') {
    return [
      '/Applications/ZCode.app/Contents/MacOS/ZCode',
      join(home, 'Applications', 'ZCode.app', 'Contents', 'MacOS', 'ZCode'),
      '/Applications/ZCode Preview.app/Contents/MacOS/ZCode Preview',
    ];
  }
  // linux（含 AUR 包，AUR 版安装到 /opt/ZCode）
  const list = [
    '/opt/ZCode/zcode',
    '/usr/lib/zcode/zcode',
    '/usr/share/zcode/zcode',
    '/usr/local/ZCode/zcode',
    join(home, '.local', 'share', 'zcode', 'zcode'),
  ];
  if (arch() === 'arm64') list.unshift('/opt/ZCode/zcode'); // AUR aarch64 同路径
  return list;
}

export function resolveZcodeExecutable(explicit) {
  const tried = [];
  const check = (p) => {
    if (!p) return null;
    tried.push(p);
    try {
      if (existsSync(p)) return p;
    } catch { /* ignore */ }
    return null;
  };
  const fromFlag = check(explicit);
  if (fromFlag) return fromFlag;
  const fromEnv = check(process.env.ZCODEPRO_ZCODE_PATH);
  if (fromEnv) return fromEnv;
  for (const p of candidates()) {
    const hit = check(p);
    if (hit) return hit;
  }
  // 最后退回 PATH（仅类 Unix；Windows 上 PATH 查找由 shell 负责）
  if (platform() !== 'win32') {
    const hit = check('/usr/sbin/zcode') || check('/usr/bin/zcode');
    if (hit) return hit;
  }
  const err = new Error(
    '未找到 ZCode 可执行文件。请通过 --zcode-path <路径> 或环境变量 ZCODEPRO_ZCODE_PATH 指定。\n已尝试:\n' +
      tried.map((p) => '  - ' + p).join('\n')
  );
  err.code = 'ZCODE_NOT_FOUND';
  throw err;
}

// ZCode 数据根目录，与主进程逻辑保持一致：ZCODE_DATA_BASE_DIR || $HOME，再拼 .zcode
export function resolveDataRootDir() {
  const base = (process.env.ZCODE_DATA_BASE_DIR || '').trim() || homedir();
  return join(base, '.zcode');
}
