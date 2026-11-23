// 供应商代理转发器：为单个供应商在本机开一个 127.0.0.1 监听端口，
// 请求先到这里，转发器再连上真实上游（例如 https://api.meta.ai/v1），
// 经由调用方指定的上游 HTTP 代理发出（或直连转发）。中间不做任何改写——
// 请求行、请求头、请求体都原样转发；SSE 等长时间响应也不截断。

import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { URL } from 'node:url';

// hop 头不转发（与本地转发器同款约定）
const HOP_HEADERS = new Set(['connection', 'keep-alive', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'proxy-authenticate', 'proxy-authorization']);

function stripHopHeaders(headers) {
  const o = {};
  for (const [k, v] of Object.entries(headers || {})) {
    if (!HOP_HEADERS.has(k.toLowerCase())) o[k] = v;
  }
  return o;
}

function parseProxyUrl(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    const u = new URL(text);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname || !u.port) return null;
    return {
      protocol: u.protocol,
      hostname: u.hostname.replace(/^\[|\]$/g, ''),
      port: Number(u.port),
      username: u.username ? decodeURIComponent(u.username) : '',
      password: u.password ? decodeURIComponent(u.password) : '',
    };
  } catch {
    return null;
  }
}

function proxyAuthHeaders(proxy) {
  if (!proxy.username) return {};
  const basic = Buffer.from(`${proxy.username}:${proxy.password || ''}`).toString('base64');
  return { 'Proxy-Authorization': `Basic ${basic}` };
}

// 经上游代理建 CONNECT 隧道；secure=true 时隧道 ESTABLISHED 后再把同一
// socket 包装成 TLS（SNI 为上游主机名）。
function proxyConnect(proxy, host, port, { secure = false } = {}) {
  return new Promise((resolve, reject) => {
    const useTls = proxy.protocol === 'https:';
    const connectOpts = { host: proxy.hostname, port: proxy.port, timeout: 15000 };
    const socket = useTls
      ? tls.connect({ ...connectOpts, servername: proxy.hostname, rejectUnauthorized: false })
      : net.connect(connectOpts);
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      try { socket.removeListener('data', onData); } catch { /* ignore */ }
      try { socket.destroy(); } catch { /* ignore */ }
      reject(err);
    };
    const succeed = () => {
      if (settled) return;
      settled = true;
      if (secure) {
        const secureSocket = tls.connect({ socket, servername: host, rejectUnauthorized: false });
        secureSocket.once('secureConnect', () => resolve(secureSocket));
        secureSocket.once('error', (err) => {
          try { socket.destroy(); } catch { /* ignore */ }
          reject(err);
        });
      } else {
        resolve(socket);
      }
    };
    const sendConnect = () => {
      socket.write([
        `CONNECT ${host}:${port} HTTP/1.1`,
        `Host: ${host}:${port}`,
        'User-Agent: zcode-pro-provider-proxy',
        ...Object.entries(proxyAuthHeaders(proxy)).map(([k, v]) => `${k}: ${v}`),
        '',
        '',
      ].join('\r\n'));
    };
    if (useTls) socket.once('secureConnect', sendConnect);
    else socket.once('connect', sendConnect);
    socket.once('error', fail);
    let buf = Buffer.alloc(0);
    const onData = (chunk) => {
      try {
        buf = Buffer.concat([buf, chunk]);
        const idx = buf.indexOf('\r\n\r\n');
        if (idx === -1) return;
        const head = buf.slice(0, idx + 4).toString('latin1');
        const rest = buf.slice(idx + 4);
        const m = /^HTTP\/\d+\.?\d*\s+(\d+)/.exec(head);
        const code = m ? Number(m[1]) : 0;
        if (code < 200 || code >= 300) {
          fail(new Error(`代理 CONNECT 返回 ${code || '空'}`));
          return;
        }
        try { socket.removeListener('data', onData); } catch { /* ignore */ }
        if (rest && rest.length) {
          queueMicrotask(() => socket.unshift(rest));
        }
        succeed();
      } catch (err) {
        fail(err);
      }
    };
    socket.on('data', onData);
  });
}

function pipePair(a, b) {
  a.pipe(b);
  b.pipe(a);
  const kill = () => {
    try { a.destroy(); } catch { /* ignore */ }
    try { b.destroy(); } catch { /* ignore */ }
  };
  a.once('error', kill);
  b.once('error', kill);
  a.once('close', () => { try { b.destroy(); } catch { /* ignore */ } });
  b.once('close', () => { try { a.destroy(); } catch { /* ignore */ } });
}

// 单个供应商的转发器：一个监听端口；入口请求按上游转。
class ProviderForwarder {
  constructor({ upstream, proxyUrl }) {
    this.upstream = String(upstream || '').trim();
    this.proxyUrl = String(proxyUrl || '').trim();
    this.server = null;
    this.conns = new Set();
  }

  setUpstream(url) { this.upstream = String(url || '').trim(); }
  setProxyUrl(v) { this.proxyUrl = String(v || '').trim(); }

  async start(port) {
    if (this.server) await this.stop();
    this.port = port;
    this.server = http.createServer((req, res) => {
      void this.handle(req, res).catch((err) => {
        if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(`转发失败：${err.message}`);
      });
    });
    this.server.requestTimeout = 0;
    this.server.headersTimeout = 60000;
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, '127.0.0.1', () => resolve());
    });
    this.server.on('connection', (sock) => {
      this.conns.add(sock);
      sock.once('close', () => this.conns.delete(sock));
    });
    return port;
  }

  async stop() {
    if (!this.server) return;
    const srv = this.server;
    this.server = null;
    for (const sock of this.conns) {
      try { sock.destroy(); } catch { /* ignore */ }
    }
    this.conns.clear();
    await new Promise((resolve) => {
      try {
        srv.close(() => resolve());
        srv.closeAllConnections?.();
      } catch { resolve(); }
    });
  }

  alive() {
    return !!this.server && this.server.listening;
  }

  async openUpstream(host, port, secureFirst) {
    // 本机回环不上代理：供应商走 headroom（8787）又开供应商代理时，
    // 转发器连 headroom 是本机流量，经 clash 发反而到不了。
    const loopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
    const proxy = loopback ? null : parseProxyUrl(this.proxyUrl);
    if (proxy) {
      // 有代理统一走 CONNECT 隧道建连
      return proxyConnect(proxy, host, port, { secure: secureFirst });
    }
    if (secureFirst) {
      return new Promise((resolve, reject) => {
        const sock = tls.connect({ host, port, servername: host, rejectUnauthorized: false, timeout: 15000 });
        sock.once('secureConnect', () => resolve(sock));
        sock.once('error', reject);
      });
    }
    return new Promise((resolve, reject) => {
      const sock = net.connect({ host, port, timeout: 15000 });
      sock.once('connect', () => resolve(sock));
      sock.once('error', reject);
    });
  }

  async handle(req, res) {
    const upstreamRaw = String(this.upstream || '').trim();
    if (!upstreamRaw) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('未配置上游地址');
      return;
    }
    let parsed;
    try {
      parsed = new URL(upstreamRaw);
    } catch {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('上游地址不合法');
      return;
    }
    const secureFirst = /^https:/i.test(upstreamRaw);
    const targetHost = parsed.hostname.replace(/^\[|\]$/g, '');
    const targetPort = Number(parsed.port) || (secureFirst ? 443 : 80);
    // 上游带路径前缀（如 https://host/v1）时拼到每个请求前面：
    // 转发地址本身不带路径，客户端发的是裸路径。
    const upstreamPrefix = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname.replace(/\/+$/, '') : '';

    let tunnel;
    try {
      tunnel = await this.openUpstream(targetHost, targetPort, secureFirst);
    } catch (err) {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`无法连接上游：${err.message}`);
      return;
    }
    this.conns.add(tunnel);
    tunnel.once('close', () => this.conns.delete(tunnel));

    // 用 http/https 客户端发请求：它负责拼请求字节、解析响应状态行与响应头、
    // 处理分块编码；SSE 等流式响应照样逐块透出。
    const headers = stripHopHeaders(req.headers);
    delete headers.host;
    const path = upstreamPrefix + (req.url || '/');
    const client = secureFirst ? https : http;
    const agent = new client.Agent({ keepAlive: false });
    agent.createConnection = () => tunnel;
    const upReq = client.request(
      {
        method: req.method,
        path,
        headers: { ...headers, Host: parsed.host },
        agent,
      },
      (upRes) => {
        const out = stripHopHeaders(upRes.headers);
        if (!res.headersSent) res.writeHead(upRes.statusCode || 502, out);
        upRes.pipe(res, { end: true });
      },
    );
    upReq.once('error', (err) => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`转发失败：${err.message}`);
    });
    req.once('aborted', () => { try { upReq.destroy(); } catch { /* ignore */ } });
    res.once('close', () => { try { upReq.destroy(); } catch { /* ignore */ } });
    req.pipe(upReq, { end: true });
  }
}

// 统一多路复用：每个上游（供应商）各开一台转发器，端口独立。
export class ProviderProxyManager {
  constructor() {
    this.forwarders = new Map(); // port → ProviderForwarder
  }

  async ensure({ upstream, port, proxyUrl = '' }) {
    upstream = String(upstream || '').trim();
    proxyUrl = String(proxyUrl || '').trim();
    if (!upstream) throw new Error('未配置上游地址');
    // 按端口复用：同端口的上游/代理都没变就直接用；变了原地重启（不留双实例）。
    // 不按上游找——两个供应商可能共用一个上游地址，按上游找会互抢。
    const existing = this.forwarders.get(port);
    if (existing) {
      if (existing.upstream === upstream && existing.proxyUrl === proxyUrl && existing.alive()) return port;
      existing.setUpstream(upstream);
      existing.setProxyUrl(proxyUrl);
      await existing.stop();
      await existing.start(port);
      return port;
    }
    const fw = new ProviderForwarder({ upstream, proxyUrl });
    await fw.start(port);
    this.forwarders.set(port, fw);
    return port;
  }

  async stopPort(port) {
    const fw = this.forwarders.get(port);
    if (!fw) return false;
    await fw.stop();
    this.forwarders.delete(port);
    return true;
  }

  async freePort(preferred) {
    for (let p = preferred; p <= 65535; p++) {
      if (this.forwarders.has(p)) continue;
      const busy = await new Promise((resolve) => {
        const srv = net.createServer();
        srv.once('error', () => resolve(true));
        srv.once('listening', () => srv.close(() => resolve(false)));
        srv.listen(p, '127.0.0.1');
      });
      if (!busy) return p;
    }
    return null;
  }

  async stopAll() {
    for (const fw of this.forwarders.values()) {
      await fw.stop();
    }
    this.forwarders.clear();
  }

  status() {
    return [...this.forwarders.entries()].map(([port, fw]) => ({
      port, upstream: fw.upstream, proxyUrl: fw.proxyUrl, listening: fw.alive(),
    }));
  }
}

export default { ProviderProxyManager, ProviderForwarder };
