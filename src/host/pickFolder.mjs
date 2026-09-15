// 系统原生目录选择器（Linux：xdg-desktop-portal FileChooser，经 gdbus 调用，
// KDE/GNOME 弹出各自的原生对话框），支持指定起始目录。
// 返回 { path: string | null }（用户取消为 null）或 { unavailable: true }（环境无可用选择器）。

import { spawn, spawnSync } from 'node:child_process';

function gdbusAvailable() {
  const r = spawnSync('gdbus', ['--version'], { encoding: 'utf8' });
  return !r.error && r.status === 0;
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

export async function pickFolderSystem(startDir, title, timeoutMs = 180000) {
  if (process.platform !== 'linux' || !gdbusAvailable()) return { unavailable: true };
  const r = await portalPickFolder(startDir || '/', title || '选择文件夹', timeoutMs);
  if (r === undefined) return { unavailable: true };
  return { path: r };
}
