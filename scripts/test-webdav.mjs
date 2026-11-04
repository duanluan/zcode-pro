// WebDAV 传输回归测试：本地假 WebDAV 服务器上跑真实的 webdavRequest /
// webdavPutWithMkcol / parseWebdavListing。零依赖，node scripts/test-webdav.mjs
// （或 npm test）直接跑，全绿退出码 0。当前进程先跑一遍（有 curl 走 curl 主
// 路径，没有就走 fetch 兜底），末尾再以 ZCODEPRO_SYNC_FORCE_FETCH=1 spawn
// 子进程跑 fetch 兜底路径第二遍；两遍都过才退出 0。
// 覆盖：GET 下载（含落盘）、PUT 上传（鉴权头/内容类型/正文）、curl 配置文件
// 转义与退出码翻译、409 后逐级 MKCOL 再重试、PROPFIND 解析（命名空间前缀/
// URL 编码/目录跳过）、4xx/5xx 语义（传输成功即 ok，状态码给调用方分支）、
// webdavHttpText 状态文案。
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// 自重跑：当前进程先跑一遍（测试体在下面直接执行），末尾再 spawn fetch 模式
// 子进程跑第二遍。fetch 子进程由 ZCODEPRO_SYNC_FORCE_FETCH=1 标识
const FETCH_CHILD = process.env.ZCODEPRO_SYNC_FORCE_FETCH === '1';

const { webdavRequest, webdavPutWithMkcol, parseWebdavListing, webdavHttpText, findCurl } = await import('../src/host/webdav.mjs');
// 标签按真实执行路径打：有 curl 走 curl 主路径，没有（或子进程强制）走 fetch 兜底
const MODE = findCurl() ? 'curl' : 'fetch';
console.log(`第一遍模式: ${MODE}`);

const root = mkdtempSync(join(tmpdir(), 'zcodepro-webdav-test-'));
let failed = 0;
const assert = (cond, msg) => {
  if (!cond) { console.error(`FAIL[${MODE}]: ` + msg); failed = 1; }
  else console.log(`ok[${MODE}]: ` + msg);
};

// —— 假 WebDAV 服务器 ——
const collections = new Set();
const seen = { auth: '', ctype: '', body: '', depth: '', mkcol: [] };
const PROPFIND_BODY = `<?xml version="1.0"?><D:multistatus xmlns:D="DAV:">
  <D:response><D:href>/dav/list/a%20b.txt</D:href><D:propstat><D:prop>
    <D:getcontentlength>12</D:getcontentlength><D:getlastmodified>Mon, 01 Jan 2024 00:00:00 GMT</D:getlastmodified>
  </D:prop></D:propstat></D:response>
  <d:response xmlns:d="DAV:"><d:href>/dav/list/dir1/</d:href><d:propstat><d:prop>
    <d:resourcetype><d:collection/></d:resourcetype>
  </d:prop></d:propstat></d:response>
  <response><href>https://example.com/dav/list/c.bin</href><propstat><prop>
    <getcontentlength>7</getcontentlength>
  </prop></propstat></response>
</D:multistatus>`;
const server = createServer((req, res) => {
  seen.auth = req.headers.authorization || '';
  seen.ctype = req.headers['content-type'] || '';
  seen.depth = req.headers.depth || '';
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    seen.body = body;
    const u = req.url.split('?')[0];
    if (req.method === 'GET' && u === '/dav/ok') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('hello'); return; }
    if (req.method === 'GET' && u === '/dav/download') { res.writeHead(200); res.end('payload'); return; }
    if (req.method === 'GET' && u === '/dav/missing') { res.writeHead(404); res.end(); return; }
    if (req.method === 'GET' && u === '/dav/boom') { res.writeHead(500); res.end('boom'); return; }
    if (req.method === 'GET' && u === '/dav/huge') { res.writeHead(200); res.end('x'.repeat(10 * 1024 * 1024)); return; }
    if (req.method === 'GET' && u === '/dav/huge-dl') { res.writeHead(200); res.end('x'.repeat(13 * 1024 * 1024)); return; }
    if (req.method === 'PROPFIND') { res.writeHead(207, { 'Content-Type': 'application/xml' }); res.end(PROPFIND_BODY); return; }
    if (req.method === 'MKCOL') { seen.mkcol.push(u); collections.add(u); res.writeHead(201); res.end(); return; }
    if (req.method === 'PUT') {
      if (u === '/dav/deep/file.bin' && !collections.has('/dav/deep')) { res.writeHead(409); res.end(); return; }
      res.writeHead(201); res.end(); return;
    }
    res.writeHead(405); res.end();
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const auth = { login: 'me', password: 'pw:1' };

// —— GET ——
const g = await webdavRequest({ method: 'GET', url: origin + '/dav/ok', ...auth });
assert(g.ok && g.httpCode === 200 && g.body === 'hello', `GET 正文与状态（${JSON.stringify({ ok: g.ok, c: g.httpCode })}）`);
assert(seen.auth === 'Basic ' + Buffer.from('me:pw:1').toString('base64'), 'Basic 鉴权头正确');

// —— curl 配置文件转义（仅 curl 路径有 --config - 环节）：凭据带引号、反斜杠、
// 换行也要原样送达（换行按 curlQuote 约定替换为空格）——
if (MODE === 'curl') {
  const gq = await webdavRequest({ method: 'GET', url: origin + '/dav/ok', login: 'm"e', password: 'p\\w:"x\ny' });
  const want = 'Basic ' + Buffer.from('m"e:p\\w:"x y').toString('base64');
  assert(gq.ok && seen.auth === want, `curlQuote 转义后凭据原样送达（实际 ${seen.auth}）`);
}

// —— 下载落盘 ——
const dl = join(root, 'dl.bin');
const gd = await webdavRequest({ method: 'GET', url: origin + '/dav/download', ...auth, downloadFile: dl });
assert(gd.ok && existsSync(dl) && readFileSync(dl, 'utf8') === 'payload', 'downloadFile 落盘内容正确');

// —— PUT 上传（临时文件经 uploadFile）——
const up = join(root, 'up.bin');
writeFileSync(up, 'UPDATA');
const p = await webdavRequest({ method: 'PUT', url: origin + '/dav/f.bin', ...auth, uploadFile: up, contentType: 'application/octet-stream' });
assert(p.ok && p.httpCode === 201 && seen.body === 'UPDATA' && seen.ctype === 'application/octet-stream', 'PUT 正文/内容类型/落库正确');

// —— 409 → 逐级 MKCOL → 重试 PUT ——
const mp = await webdavPutWithMkcol({ url: origin + '/dav/deep/file.bin', ...auth, uploadFile: up, contentType: 'application/octet-stream' });
assert(mp.ok && mp.httpCode === 201, `MKCOL 后重试 PUT 成功（${mp.httpCode}）`);
assert(seen.mkcol.includes('/dav') && seen.mkcol.includes('/dav/deep') && !seen.mkcol.includes('/dav/deep/file.bin'),
  `父目录逐级创建、文件名不建目录（实际 ${seen.mkcol.join(',')}）`);

// —— PROPFIND 解析 ——
const pf = await webdavRequest({ method: 'PROPFIND', url: origin + '/dav/list', ...auth, headers: ['Depth: 1'] });
assert(pf.ok && pf.httpCode === 207 && seen.depth === '1', 'PROPFIND 带 Depth: 1');
const files = parseWebdavListing(pf.body);
assert(files.length === 2 && files[0].name === 'a b.txt' && files[0].size === 12 && typeof files[0].lastModified === 'number'
  && files[1].name === 'c.bin' && files[1].size === 7 && files[1].lastModified === null,
  `解析出两个文件（URL 解码、目录跳过、缺时间给 null）：${JSON.stringify(files.map((f) => f.name))}`);

// —— 4xx/5xx 语义：传输成功即 ok，状态码交调用方 ——
const nf = await webdavRequest({ method: 'GET', url: origin + '/dav/missing', ...auth });
assert(nf.ok === true && nf.httpCode === 404, `404 也算传输成功（ok=${nf.ok} code=${nf.httpCode}）`);
const b5 = await webdavRequest({ method: 'GET', url: origin + '/dav/boom', ...auth });
assert(b5.ok === true && b5.httpCode === 500, `500 同语义（ok=${b5.ok} code=${b5.httpCode}）`);

// —— 响应体超限（10MB 超过 9MB 上限）：直接拒绝，不整包读进内存 ——
const hg = await webdavRequest({ method: 'GET', url: origin + '/dav/huge', ...auth });
assert(hg.ok === false && /上限/.test(hg.error || ''), `超限响应被拒绝（${JSON.stringify(hg).slice(0, 80)}）`);
// —— 超限下载（13MB 超过 12MB 下载上限）：报错并删掉 downloadFile，不把超限文件留在盘上 ——
const hdl = join(root, 'dl-huge.bin');
const hgd = await webdavRequest({ method: 'GET', url: origin + '/dav/huge-dl', ...auth, downloadFile: hdl });
assert(hgd.ok === false && /上限/.test(hgd.error || '') && !existsSync(hdl),
  `超限下载报错且不留下 downloadFile（${JSON.stringify(hgd).slice(0, 80)}）`);
assert(typeof webdavHttpText(404) === 'string' && webdavHttpText(404).length > 0 && typeof webdavHttpText(500) === 'string', '状态码转文案非空');

// —— 故障注入：连接拒绝 / 超时 / 畸形 XML ——
server.close();
// 拒连用一个从未监听过的端口：close 之后 undici 连接池里已建立的 keep-alive 连接
//（前面超限读取取消后排空中的那条）不随 close 断开，请求经它还能拿到 200
const deadSrv = createServer(() => { /* 不会真的收到请求 */ });
await new Promise((r) => deadSrv.listen(0, '127.0.0.1', r));
const deadOrigin = `http://127.0.0.1:${deadSrv.address().port}`;
deadSrv.close();
await new Promise((r) => setTimeout(r, 50));
const dead = await webdavRequest({ method: 'GET', url: deadOrigin + '/dav/ok', ...auth });
// 连接拒绝要翻译成人话（curl 退出码 7 / fetch 的 ECONNREFUSED 同文案）
assert(dead.ok === false && /无法连接服务器/.test(dead.error || ''), `连接拒绝报出明确原因（${JSON.stringify(dead).slice(0, 80)}）`);
const slow = createServer(() => { /* 挂起不响应 */ });
await new Promise((r) => slow.listen(0, '127.0.0.1', r));
const t0 = Date.now();
const hung = await webdavRequest({ method: 'GET', url: `http://127.0.0.1:${slow.address().port}/x`, ...auth, timeoutMs: 400 });
slow.close();
// timeoutMs=400 两条路径都按 10 秒下限（fetch 的 AbortSignal.timeout 与 curl 的
// --max-time 各自钳到 10 秒）：不早于 9 秒返回、不永久挂起、报超时
const elapsed = Date.now() - t0;
assert(hung.ok === false && elapsed >= 9000 && elapsed < 15000 && /超时/.test(hung.error || ''),
  `超时按 10 秒下限返回失败（${elapsed}ms，${hung.error}）`);
assert(parseWebdavListing('<not-xml') .length === 0 && parseWebdavListing('').length === 0, '畸形/空 XML 解析返回空表不崩');

rmSync(root, { recursive: true, force: true });
console.log(failed ? `FAILED[${MODE}]` : `all ok[${MODE}]`);
if (FETCH_CHILD) process.exit(failed);
// 第一遍结束：再 spawn fetch 兜底模式子进程跑第二遍，两遍都过才退出 0
const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
  env: { ...process.env, ZCODEPRO_SYNC_FORCE_FETCH: '1' }, stdio: 'inherit',
});
console.log(`fetch 兜底模式第二遍${(r.status ?? 1) === 0 ? '通过' : '失败'}`);
process.exit(failed || (r.status ?? 1));
