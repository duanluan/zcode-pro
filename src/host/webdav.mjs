// WebDAV 传输（设置同步用）：用 curl 子进程完成 GET / PUT / MKCOL。
// Basic 凭据经 stdin 的 --config 文件传入，不进命令行参数；代理由调用方以
// proxyUrl 注入（与 helper 其他网络访问一致，空 = 不用代理）。
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises'; // fs 的 mkdtemp 是回调版，await 它会把 undefined 当回调
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// curl 退出码 → 人话（err.message 是整条命令行，对用户没有信息量）
const CURL_EXIT = {
  3: 'URL 格式错误',
  6: '无法解析服务器地址',
  7: '无法连接服务器',
  28: '超时',
  35: 'SSL 握手失败',
  47: '重定向过多',
  60: 'SSL 证书无效',
};

// HTTP 状态 → 同步场景的人话（404 不算失败，由调用方按「云端没有数据」处理）
export function webdavHttpText(code) {
  if (code === 401 || code === 403) return `登录或密码被拒绝（HTTP ${code}；坚果云等网盘需使用应用密码，不是登录密码）`;
  if (code === 405) return '服务器不允许该操作（HTTP 405）';
  if (code === 409) return '目标目录不存在（HTTP 409）';
  if (code === 507) return '网盘空间不足（HTTP 507）';
  return `HTTP ${code}`;
}

// curl 配置文件语法：双引号包裹，\ 与 " 需转义；换行无法出现在单行值里，替换为空格
function curlQuote(v) {
  return '"' + String(v).replace(/([\\"])/g, '\\$1').replace(/[\r\n]+/g, ' ') + '"';
}

function proxyEnvVars(proxyUrl) {
  if (!proxyUrl) return {};
  return {
    HTTP_PROXY: proxyUrl, HTTPS_PROXY: proxyUrl,
    http_proxy: proxyUrl, https_proxy: proxyUrl,
  };
}

// 执行一次 WebDAV 请求。method 为 GET / PUT / MKCOL；PUT 用 uploadFile 上传
// （-T 隐含 PUT）。返回 { ok, httpCode, body, error }：ok 表示 curl 本身执行
// 成功（HTTP 4xx/5xx 也算 ok，由调用方看 httpCode 分支）；error 为中文原因。
export async function webdavRequest({ method, url, login = '', password = '', uploadFile = null, proxyUrl = '', timeoutMs = 45000 }) {
  const dir = await mkdtemp(join(tmpdir(), 'zcodepro-webdav-'));
  const bodyFile = join(dir, 'body');
  try {
    const args = ['-sS', '--connect-timeout', '10', '--max-time', String(Math.max(10, Math.ceil(timeoutMs / 1000))),
      '-w', '%{http_code}', '-o', bodyFile, '--config', '-'];
    if (method === 'PUT' && uploadFile) {
      args.push('-H', 'Content-Type: application/json', '-T', uploadFile);
    } else {
      args.push('-X', method);
    }
    args.push(url);
    const cfg = login || password ? `user = ${curlQuote(`${login}:${password}`)}\n` : '';
    const r = await new Promise((resolveRun) => {
      const child = spawn('curl', args, { env: { ...process.env, ...proxyEnvVars(proxyUrl) }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      child.on('error', (err) => {
        if (err.code === 'ENOENT') resolveRun({ code: -1, stdout: '', stderr: '' });
        else resolveRun({ code: -2, stdout: '', stderr: String(err.message || err) });
      });
      child.on('close', (code) => resolveRun({ code: code == null ? -2 : code, stdout, stderr }));
      child.stdin.write(cfg);
      child.stdin.end();
    });
    if (r.code === -1) return { ok: false, httpCode: null, body: '', error: '未找到 curl 命令（WebDAV 同步依赖 curl）' };
    if (r.code !== 0) {
      const why = CURL_EXIT[r.code] || `curl 退出码 ${r.code}`;
      const hint = (r.stderr.split('\n').find((l) => l.trim()) || '').trim();
      return { ok: false, httpCode: null, body: '', error: hint ? `${why}（${hint}）` : why };
    }
    let body = '';
    try { body = readFileSync(bodyFile, 'utf8'); } catch { /* 无响应体 */ }
    const httpCode = Number(parseInt(r.stdout.trim(), 10)) || 0;
    return { ok: true, httpCode, body, error: '' };
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

// PUT 前确保云端目录存在：409（父目录缺失）时逐段 MKCOL 再重试一次。
// 已存在的目录 MKCOL 多半回 405，忽略即可——这里是尽力而为，最终成败仍看 PUT。
export async function webdavPutWithMkcol({ url, login, password, uploadFile, proxyUrl, timeoutMs }) {
  const auth = { login, password, proxyUrl };
  const first = await webdavRequest({ method: 'PUT', url, uploadFile, ...auth, timeoutMs });
  if (!first.ok || (first.httpCode >= 200 && first.httpCode < 300) || first.httpCode !== 409) return first;
  try {
    const u = new URL(url);
    const segs = u.pathname.split('/').filter(Boolean);
    segs.pop(); // 最后一段是文件名
    let cur = u.origin;
    for (const s of segs) {
      cur += '/' + s;
      await webdavRequest({ method: 'MKCOL', url: cur, ...auth, timeoutMs: 15000 });
    }
  } catch { /* URL 解析失败：直接重试原 PUT */ }
  return webdavRequest({ method: 'PUT', url, uploadFile, ...auth, timeoutMs });
}
