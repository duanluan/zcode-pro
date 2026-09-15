// 跨平台定位 ZCode 桌面版可执行文件。
// 优先级：--zcode-path 参数 > ZCODEPRO_ZCODE_PATH 环境变量 > 平台默认候选路径 > PATH 上的 zcode。
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { arch, homedir, platform } from 'node:os';

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
