// 极简 CDP（Chrome DevTools Protocol）客户端。
// 仅依赖 Node >= 22 自带的全局 WebSocket 与 fetch，无第三方依赖。
// 连接浏览器级 ws 端点，通过 Target.setAutoAttach(flatten) 管理页面会话。

export class CdpConnection {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map(); // id -> {resolve, reject}
    this.sessionListeners = new Map(); // sessionId -> Set<fn(message)>
    this.attachedTargets = new Map(); // sessionId -> targetId
    this.closed = false;
  }

  async connect() {
    if (typeof WebSocket !== 'function') {
      throw new Error('当前运行时缺少全局 WebSocket（需要 Node >= 22 或 ZCode 内置 Node）');
    }
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      ws.addEventListener('open', () => resolve(), { once: true });
      ws.addEventListener('error', () => reject(new Error('无法连接 CDP: ' + this.wsUrl)), { once: true });
      this.ws = ws;
    });
    this.ws.addEventListener('message', (ev) => this.#onMessage(String(ev.data)));
    this.ws.addEventListener('close', () => {
      this.closed = true;
      for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('CDP 连接已关闭')); }
      this.pending.clear();
    });
  }

  #onMessage(text) {
    let msg;
    try { msg = JSON.parse(text); } catch { return; }
    if (msg.id !== undefined) {
      const p = this.pending.get(msg.id);
      if (p) {
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.error) p.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else p.resolve(msg.result);
      }
      return;
    }
    // 事件
    if (msg.method === 'Target.attachedToTarget') {
      const { sessionId, targetInfo } = msg.params;
      this.attachedTargets.set(sessionId, targetInfo.targetId);
      // attach/detach 属于浏览器级事件，广播给 '' 级监听器
      this.#emit('', { type: 'attached', sessionId, targetInfo });
      return;
    }
    if (msg.method === 'Target.detachedFromTarget') {
      const { sessionId } = msg.params;
      this.attachedTargets.delete(sessionId);
      this.#emit(sessionId, { type: 'detached', sessionId });
      this.#emit('', { type: 'detached', sessionId });
      return;
    }
    this.#emit(msg.sessionId || '', { type: 'event', method: msg.method, params: msg.params, sessionId: msg.sessionId });
  }

  #emit(sessionId, message) {
    const set = this.sessionListeners.get(sessionId);
    if (set) for (const fn of set) { try { fn(message); } catch { /* listener error */ } }
  }

  onSession(sessionId, fn) {
    if (!this.sessionListeners.has(sessionId)) this.sessionListeners.set(sessionId, new Set());
    this.sessionListeners.get(sessionId).add(fn);
    return () => this.sessionListeners.get(sessionId)?.delete(fn);
  }

  send(method, params = {}, sessionId, timeoutMs = 30000) {
    if (this.closed) return Promise.reject(new Error('CDP 连接已关闭'));
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      // 超时兜底：连接假死（未触发 close）时调用方不至于永久挂起
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP 请求超时(${timeoutMs}ms): ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.ws.send(JSON.stringify(payload)); }
      catch (err) { clearTimeout(timer); this.pending.delete(id); reject(err); }
    });
  }

  close() {
    this.closed = true;
    for (const p of this.pending.values()) clearTimeout(p.timer);
    try { this.ws?.close(); } catch { /* ignore */ }
  }
}

// 拉取 http://127.0.0.1:port/json 列表（type=page 的目标）
export async function listPageTargets(port, timeoutMs = 2000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json`, { signal: ac.signal });
    if (!res.ok) throw new Error('/json 状态码 ' + res.status);
    const list = await res.json();
    return Array.isArray(list) ? list.filter((t) => t.type === 'page') : [];
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchBrowserWsUrl(port, timeoutMs = 2000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: ac.signal });
    if (!res.ok) throw new Error('/json/version 状态码 ' + res.status);
    const info = await res.json();
    if (!info.webSocketDebuggerUrl) throw new Error('缺少 webSocketDebuggerUrl');
    return info.webSocketDebuggerUrl;
  } finally {
    clearTimeout(timer);
  }
}
