// WebDAV 传输（设置同步用，rtk 升级的 GitHub 请求也复用）：优先用 curl 子进程完成
// GET / PUT / MKCOL / DELETE / PROPFIND。Basic 凭据经 stdin 的 --config 文件传入，
// 不进命令行参数；代理由调用方以 proxyUrl 注入（与 helper 其他网络访问一致，空 = 不用代理）。
// 环境里没有 curl 时（常见于老 Windows / 精简系统虚拟机）自动回退到 Node 自带
// fetch 直连：凭据改走 Authorization 头，代理在该路径不生效；设
// ZCODEPRO_SYNC_FORCE_FETCH=1 可强制走 fetch（排障/测试用）。
import { spawn, spawnSync } from 'node:child_process';
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

// HTTP 状态 → 同步场景的人话（404 不算失败，由调用方按“云端没有数据”处理）
export function webdavHttpText(code) {
  if (code === 404) return '文件或目录不存在（HTTP 404，可能已被删除）';
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

// curl 解析（进程内只探测一次）：先按 PATH 探测；Windows 上再补测 System32 下的
// curl.exe（Win10 1803+ 自带，但精简环境的 PATH 可能不含）。都不存在返回 null，
// 后续请求全部走 fetch 兜底。ZCODEPRO_SYNC_FORCE_FETCH=1 强制跳过 curl（排障/测试）。
// 导出供 /proxy/test（代理连通性检测也依赖 curl，同样受精简 PATH 影响）复用。
let curlResolved;
export function findCurl() {
  if (curlResolved !== undefined) return curlResolved;
  if (process.env.ZCODEPRO_SYNC_FORCE_FETCH === '1') {
    curlResolved = null;
    return null;
  }
  const candidates = ['curl'];
  if (process.platform === 'win32') {
    const sysRoot = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
    candidates.push(join(sysRoot, 'System32', 'curl.exe'));
  }
  for (const c of candidates) {
    const r = spawnSync(c, ['--version'], { windowsHide: true, encoding: 'utf8' });
    if (!r.error && r.status === 0) {
      curlResolved = c;
      return c;
    }
  }
  curlResolved = null;
  return null;
}

// fetch 网络异常 → 与 curl 版一致的人话（具体错误码在 err.cause 里）
function fetchErrText(err) {
  const cause = err?.cause || err;
  const code = cause?.code || '';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return '无法解析服务器地址';
  if (code === 'ECONNREFUSED') return '无法连接服务器';
  if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'UND_ERR_HEADERS_TIMEOUT'
    || err?.name === 'TimeoutError' || err?.name === 'AbortError') return '超时';
  if (code === 'CERT_HAS_EXPIRED' || code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
    || code === 'SELF_SIGNED_CERT_IN_CHAIN') return 'SSL 证书无效';
  if (code === 'EPROTO') return 'SSL 握手失败';
  return `网络请求失败：${cause?.message || String(err)}`;
}

// curl 不可用时的兜底实现：返回值约定与 curl 版一致（{ ok, httpCode, body, error,
// redirectUrl }，HTTP 4xx/5xx 也算 ok）。凭据走 Authorization 头；proxyUrl 在这条
// 路径不生效（fetch 不读代理环境变量，调用方仍照传以免改签名）；redirect 不跟随
// （对齐 curl 不带 -L），302 的目标地址放 redirectUrl
async function fetchWebdavRequest({ method, url, login = '', password = '', uploadFile = null, timeoutMs = 45000, headers = [] }) {
  // curl 路径的 headers 是 ["Depth: 1"] 字符串数组，fetch 要对象：按第一个冒号拆开
  const hdrs = {};
  for (const h of headers) {
    const i = h.indexOf(':');
    if (i > 0) hdrs[h.slice(0, i).trim()] = h.slice(i + 1).trim();
  }
  if (method === 'PUT') hdrs['Content-Type'] = 'application/json';
  if (login || password) hdrs['Authorization'] = 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
  try {
    const res = await fetch(url, {
      method,
      headers: hdrs,
      redirect: 'manual',
      signal: AbortSignal.timeout(Math.max(10000, timeoutMs)),
      body: method === 'PUT' && uploadFile ? readFileSync(uploadFile) : undefined,
    });
    const body = await res.text().catch(() => '');
    return { ok: true, httpCode: res.status, body, error: '', redirectUrl: res.headers.get('location') || '' };
  } catch (err) {
    return { ok: false, httpCode: null, body: '', error: fetchErrText(err), redirectUrl: '' };
  }
}

// 执行一次 WebDAV 请求。method 为 GET / PUT / MKCOL / DELETE / PROPFIND；PUT 用
// uploadFile 上传（-T 隐含 PUT），PROPFIND 经 headers 附加 Depth 等请求头。
// 返回 { ok, httpCode, body, error, redirectUrl }：ok 表示 curl 本身执行成功
// （HTTP 4xx/5xx 也算 ok，由调用方看 httpCode 分支）；error 为中文原因；
// redirectUrl 为重定向目标（请求不跟随重定向，302 时才有值）。
export async function webdavRequest({ method, url, login = '', password = '', uploadFile = null, proxyUrl = '', timeoutMs = 45000, headers = [] }) {
  const curl = findCurl();
  if (!curl) return fetchWebdavRequest({ method, url, login, password, uploadFile, timeoutMs, headers });
  const dir = await mkdtemp(join(tmpdir(), 'zcodepro-webdav-'));
  const bodyFile = join(dir, 'body');
  try {
    const args = ['-sS', '--connect-timeout', '10', '--max-time', String(Math.max(10, Math.ceil(timeoutMs / 1000))),
      '-w', '%{http_code} %{redirect_url}', '-o', bodyFile, '--config', '-'];
    for (const hd of headers) {
      // 头只能是这里拼好的固定字符串（Depth: 1 等），带换行的一律丢弃
      if (typeof hd === 'string' && hd && !/[\r\n]/.test(hd)) args.push('-H', hd);
    }
    if (method === 'PUT' && uploadFile) {
      args.push('-H', 'Content-Type: application/json', '-T', uploadFile);
    } else {
      args.push('-X', method);
    }
    args.push(url);
    const cfg = login || password ? `user = ${curlQuote(`${login}:${password}`)}\n` : '';
    const r = await new Promise((resolveRun) => {
      const child = spawn(curl, args, { env: { ...process.env, ...proxyEnvVars(proxyUrl) }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
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
    // 探测时还在、用时被删掉的极端情形：同样转 fetch 兜底，不再报“依赖 curl”
    if (r.code === -1) return fetchWebdavRequest({ method, url, login, password, uploadFile, timeoutMs, headers });
    if (r.code !== 0) {
      const why = CURL_EXIT[r.code] || `curl 退出码 ${r.code}`;
      const hint = (r.stderr.split('\n').find((l) => l.trim()) || '').trim();
      return { ok: false, httpCode: null, body: '', error: hint ? `${why}（${hint}）` : why };
    }
    let body = '';
    try { body = readFileSync(bodyFile, 'utf8'); } catch { /* 无响应体 */ }
    // -w 追加了 redirect_url（无重定向时为空），parseInt 只取开头的状态码不受影响
    const httpCode = Number(parseInt(r.stdout.trim(), 10)) || 0;
    const redirectUrl = r.stdout.trim().split(/\s+/)[1] || '';
    return { ok: true, httpCode, body, error: '', redirectUrl };
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

// 解析 PROPFIND（Depth: 1）的 multistatus 响应，只取文件条目：各网盘的命名空间
// 前缀不一（D: / d: / 无前缀），用宽松的标签匹配手写解析（项目零依赖，保持）。
// href 可能是绝对路径也可能是完整 URL，统一取最后一段并解码成文件名。
// 返回 [{ name, size, lastModified }]：size 为字节数，lastModified 为 Date.parse
// 出的毫秒时间戳（缺失为 null）；目录条目与解析不出的条目直接跳过。
export function parseWebdavListing(body) {
  const out = [];
  if (!body || typeof body !== 'string') return out;
  const respRe = /<(?:[A-Za-z0-9_.-]+:)?response(?:\s[^>]*)?>([\s\S]*?)<\/(?:[A-Za-z0-9_.-]+:)?response>/g;
  const tagRe = (name) => new RegExp(`<(?:[A-Za-z0-9_.-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_.-]+:)?${name}>`);
  let m;
  while ((m = respRe.exec(body)) !== null) {
    const block = m[1];
    const tag = (name) => {
      const t = tagRe(name).exec(block);
      return t ? t[1].trim() : '';
    };
    const href = tag('href');
    if (!href) continue;
    // 目录条目（collection 标记或 href 以 / 结尾）不要
    if (/<(?:[A-Za-z0-9_.-]+:)?collection[\s/>]/.test(block)) continue;
    if (href.endsWith('/')) continue;
    const rawName = (href.split('?')[0].split('#')[0].split('/').filter(Boolean).pop()) || '';
    let name = rawName;
    try { name = decodeURIComponent(rawName); } catch { /* 已是普通字符串 */ }
    if (!name) continue;
    const lm = tag('getlastmodified');
    out.push({ name, size: Number(tag('getcontentlength')) || 0, lastModified: lm ? (Date.parse(lm) || null) : null });
  }
  return out;
}
