// 系统原生目录选择器（Windows：PowerShell FolderBrowserDialog；Linux：xdg-desktop-portal
// FileChooser，经 gdbus 调用，KDE/GNOME 弹出各自的原生对话框），支持指定起始目录。
// 返回 { path: string | null }（用户取消为 null）或 { unavailable: true }（环境无可用选择器）。

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

// kdialog（KDE 原生）：起始目录参数可靠生效。
// xdg-desktop-portal-kde 不读 current_folder 选项（二进制中无该字符串），
// KFileWidget 转而用“应用上次访问目录”记忆，导致起始目录失效；
// GTK 后端支持 current_folder，无 kdialog 时回退门户。
function kdialogPickFolder(startDir, title) {
  return new Promise((resolve) => {
    const child = spawn('kdialog', ['--getexistingdirectory', startDir, '--title', title], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.on('error', () => resolve(undefined)); // 无 kdialog 或无法启动 → 回退门户
    child.on('close', (code) => {
      if (code === 0) {
        const p = out.trim();
        resolve(p || null);
      } else {
        resolve(null); // 用户取消（Esc/关闭）
      }
    });
  });
}

function kdialogAvailable() {
  const r = spawnSync('kdialog', ['--version'], { encoding: 'utf8' });
  return !r.error && r.status === 0;
}

// zenity（GTK 原生）：--filename 指定起始目录（带尾部 / 让对话框定位到该目录）
function zenityPickFolder(startDir) {
  return new Promise((resolve) => {
    const withSlash = startDir.endsWith('/') ? startDir : startDir + '/';
    const child = spawn('zenity', ['--file-selection', '--directory', '--filename=' + withSlash], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.on('error', () => resolve(undefined)); // 无 zenity 或无法启动 → 回退门户
    child.on('close', (code) => {
      if (code === 0) {
        const p = out.trim();
        resolve(p || null);
      } else {
        resolve(null); // 用户取消（Esc/关闭）
      }
    });
  });
}

function zenityAvailable() {
  const r = spawnSync('zenity', ['--version'], { encoding: 'utf8' });
  return !r.error && r.status === 0;
}

function gdbusAvailable() {
  const r = spawnSync('gdbus', ['--version'], { encoding: 'utf8' });
  return !r.error && r.status === 0;
}

// 起始目录不存在时（切换文件夹的典型场景：原路径已被移走/删除），
// 逐级向上找到第一个真实存在的目录，避免 portal 回退打开 home
function firstExistingDir(p) {
  let cur = p;
  for (let i = 0; cur && i < 128; i++) {
    try {
      if (existsSync(cur) && statSync(cur).isDirectory()) return cur;
    } catch { /* ignore */ }
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return '/';
}

function portalPickFolder(startDir, title, timeoutMs) {
  return new Promise((resolve) => {
    let monitor;
    let timer = null;
    let buf = '';
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      try { monitor && monitor.kill(); } catch { /* ignore */ }
      resolve(v);
    };

    monitor = spawn('gdbus', ['monitor', '--session', '--dest', 'org.freedesktop.portal.Desktop'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    monitor.on('error', () => finish(undefined));
    monitor.stdout.on('data', (d) => {
      buf += d.toString();
      if (done) return;
      // 只认带我们 handle_token 的 Response 块（portal 的请求路径含调用方指定的 token）
      const idx = buf.lastIndexOf('zcodepro_tok');
      if (idx < 0) return;
      const block = buf.slice(idx);
      if (!block.includes('Response')) return;
      const uri = /uris[^']*'([^']+)'/.exec(block) || /uris[^"]*"([^"]+)"/.exec(block);
      if (uri) {
        let p = uri[1];
        if (p.startsWith('file://')) {
          try { p = decodeURIComponent(p.slice(7)); } catch { p = p.slice(7); }
        }
        finish(p);
      } else {
        finish(null); // 用户取消或其他非成功响应
      }
    });

    // 等 monitor 完成订阅（gdbus 就绪即输出首行）再发起对话框调用
    monitor.stdout.once('data', () => {
      if (done) return;
      const bytes = Array.from(Buffer.from(startDir + '\0', 'utf8'));
      const opts = `{"handle_token": <"zcodepro_tok_${Date.now().toString(36)}">, "modal": <true>, "directory": <true>, "multiple": <false>, "current_folder": <[${bytes.join(',')}]>}`;
      const call = spawnSync('gdbus', ['call', '--session', '--dest', 'org.freedesktop.portal.Desktop',
        '--object-path', '/org/freedesktop/portal/desktop',
        '--method', 'org.freedesktop.portal.FileChooser.OpenFile', '', title, opts], { encoding: 'utf8' });
      if (call.status !== 0 || !/object path/i.test((call.stdout || '') + (call.stderr || ''))) finish(undefined);
    });

    timer = setTimeout(() => finish(null), timeoutMs);
  });
}

// Windows：PowerShell 的 FolderBrowserDialog（系统自带 .NET，无需额外安装）。
// -STA 是对话框的线程模型要求；无属主窗口的对话框可能沉到别的窗口后面，
// 用一个 TopMost 空窗当属主强制置前。startDir 经 SelectedPath 预选（路径不存在
// 时对话框自行忽略）；输出编码固定 UTF-8——GUI 启动的进程无控制台，PowerShell
// 重定向输出默认走 OEM 代码页（中文系统是 936），Node 按 UTF-8 解码会乱码。
// 返回路径 / null（取消或超时）/ undefined（起不来）
function powershellPickFolder(startDir, title, timeoutMs = 600000) {
  return new Promise((resolve) => {
    const safeTitle = String(title || '').replace(/'/g, "''");
    const safeStart = String(startDir || '').replace(/'/g, "''");
    const script = [
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
      'Add-Type -AssemblyName System.Windows.Forms | Out-Null',
      "$owner = New-Object System.Windows.Forms.Form",
      '$owner.TopMost = $true',
      '$d = New-Object System.Windows.Forms.FolderBrowserDialog',
      `$d.Description = '${safeTitle}'`,
      ...(safeStart ? [`$d.SelectedPath = '${safeStart}'`] : []),
      "if ($d.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($d.SelectedPath) }",
    ].join('; ');
    let out = '';
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { child.kill(); } catch { /* ignore */ }
      resolve(v);
    };
    const child = spawn('powershell', ['-NoProfile', '-STA', '-Command', script], {
      stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true,
    });
    child.on('error', () => finish(undefined));
    child.stdout.on('data', (d) => { out += d.toString(); });
    // 退出码非 0 = PowerShell 本身出错（视为不可用）；0 且无输出 = 用户取消
    child.on('close', (code) => finish(code === 0 ? (out.trim() || null) : undefined));
    const timer = setTimeout(() => finish(null), timeoutMs);
  });
}

export async function pickFolderSystem(startDir, title, timeoutMs = 180000) {
  const dialogTitle = title || '选择文件夹';
  if (process.platform === 'win32') {
    const r = await powershellPickFolder(String(startDir || ''), dialogTitle, timeoutMs);
    if (r !== undefined) return { path: r };
    return { unavailable: true };
  }
  if (process.platform !== 'linux') return { unavailable: true };
  const start = firstExistingDir(String(startDir || '/'));
  if (kdialogAvailable()) {
    const r = await kdialogPickFolder(start, dialogTitle);
    if (r !== undefined) return { path: r };
  }
  if (zenityAvailable()) {
    const r = await zenityPickFolder(start);
    if (r !== undefined) return { path: r };
  }
  if (!gdbusAvailable()) return { unavailable: true };
  const r = await portalPickFolder(start, dialogTitle, timeoutMs);
  if (r === undefined) return { unavailable: true };
  return { path: r };
}
