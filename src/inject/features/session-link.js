// 会话 ID 显示为任务名链接：把提问与回答文本里的 sess_xxx / session_xxx 渲染成
// 任务名链接，点击切到对应会话。任务名优先取侧栏行标题，行不在场（项目折叠等）
// 时按 id 批量查任务索引（/task-statuses）；查不到名字就保留原 ID 文本，仍然可点。
// 只改纯文本节点：代码块/链接/按钮/输入框/自家已处理节点不动；流式输出中的行
// 先跳过（文本还在变，等渲染完成后重新扫描时再处理），避免与应用重绘互相干扰。
import { rpc, t, getConfig } from '../core.js';
import { ensureStyle, showToast } from '../ui.js';

const CONV = '[class*="@md/conversation"]';
const SKIP_SEL = 'pre, code, a, button, input, textarea, select, [data-zcodepro-sess]';
const SCAN_DEBOUNCE_MS = 300;
// 会话 id：sess_ 与 session_ 两种前缀（新版应用为 session_），尾字符必须是
// 字母数字（防止把 "session_xxx-" 里说明文字的连字符吞进来）
const SESS_RE = /(?<![A-Za-z0-9_])(?:session|sess)_[A-Za-z0-9][A-Za-z0-9_-]*[A-Za-z0-9]/g;

// 纯文本里找出会话 ID 的位置（自检脚本直接断言它）；每次重置游标保证重复调用安全
export function matchIds(text) {
  SESS_RE.lastIndex = 0;
  const out = [];
  for (let m; (m = SESS_RE.exec(text));) {
    out.push({ start: m.index, end: m.index + m[0].length, id: m[0] });
  }
  return out;
}

let installed = false;
let enabled = true;
const titleCache = new Map(); // 会话 id → 任务名（查过一次就不再查）
const pendingIds = new Set(); // 扫到但还没查过名字的 id
let fetchTimer = 0;
let scanTimer = 0;

function makeLink(id) {
  const span = document.createElement('span');
  span.className = 'zcodepro-sess-link';
  span.dataset.zcodeproSess = id;
  span.title = id; // 悬停看原始 ID
  span.textContent = titleCache.get(id) || id;
  return span;
}

function linkifyTextNode(node) {
  const text = node.textContent || '';
  if (!text.includes('sess')) return;
  const ms = matchIds(text);
  if (!ms.length) return;
  const el = node.parentElement;
  if (!el || el.closest(SKIP_SEL)) return;
  // 流式输出中的行文本还在变，等渲染完成再处理
  const row = el.closest('[class*="-row"]');
  if (row && row.querySelector('[data-is-streaming]')) return;
  const frag = document.createDocumentFragment();
  let pos = 0;
  for (const m of ms) {
    if (m.start > pos) frag.append(document.createTextNode(text.slice(pos, m.start)));
    if (!titleCache.has(m.id) && !pendingIds.has(m.id)) pendingIds.add(m.id);
    frag.append(makeLink(m.id));
    pos = m.end;
  }
  if (pos < text.length) frag.append(document.createTextNode(text.slice(pos)));
  node.replaceWith(frag);
}

function scan() {
  for (const conv of document.querySelectorAll(CONV)) {
    const walker = document.createTreeWalker(conv, NodeFilter.SHOW_TEXT);
    // 先收集全部文本节点再改：边走边替换会漏掉刚换出来的节点
    const nodes = [];
    for (let n; (n = walker.nextNode());) nodes.push(n);
    for (const n of nodes) linkifyTextNode(n);
  }
  queueTitleFetch();
}

// 名字批量查任务索引（节流合并一次扫描里的多个 id）
function queueTitleFetch() {
  if (fetchTimer || !pendingIds.size) return;
  fetchTimer = setTimeout(() => {
    fetchTimer = 0;
    const ids = [...pendingIds];
    pendingIds.clear();
    void fetchTitles(ids);
  }, 500);
}

// 查不到/查失败都不再重试，等下一次整页重新扫描（如刷新）再查
async function fetchTitles(ids) {
  const st = await rpc('/task-statuses?ids=' + encodeURIComponent(ids.join(','))).catch(() => null);
  if (!st || !st.ok || !st.available || !st.statuses) return;
  for (const id of ids) {
    const rec = st.statuses[id];
    if (rec && rec.title) {
      const title = String(rec.title);
      titleCache.set(id, title);
      for (const span of document.querySelectorAll(`[data-zcodepro-sess="${CSS.escape(id)}"]`)) {
        span.textContent = title;
      }
    }
  }
}

// 关闭功能时把已渲染的链接还原成纯 ID 文本（disable 后不留可点的残留）
function unwrapAll() {
  for (const span of [...document.querySelectorAll('[data-zcodepro-sess]')]) {
    span.replaceWith(document.createTextNode(span.getAttribute('data-zcodepro-sess') || ''));
  }
}

function setEnabled(cfg) {
  const next = cfg.features ? cfg.features.sessionLink !== false : true;
  if (enabled && !next) unwrapAll();
  enabled = next;
  // 刚打开开关时会话区没有变动，补一次扫描才能立刻出链接
  if (next) scheduleScan();
}

function scheduleScan() {
  if (scanTimer) return;
  scanTimer = setTimeout(() => { scanTimer = 0; if (enabled) scan(); }, SCAN_DEBOUNCE_MS);
}

// 只有会话容器内的变动才值得重新扫描：侧栏/弹窗等高频变动在此滤掉
function convMutations(muts) {
  for (const m of muts) {
    const el = m.type === 'characterData' ? m.target.parentElement : m.target;
    if (el instanceof Element && el.closest && el.closest(CONV)) return true;
    for (const n of m.addedNodes) {
      if (n instanceof Element && n.closest && n.closest(CONV)) return true;
    }
  }
  return false;
}

export function startSessionLink() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  ensureStyle();
  void getConfig().then(setEnabled).catch(() => {});
  window.addEventListener('zcodepro:config-changed', () => {
    void getConfig(true).then(setEnabled).catch(() => {});
  });
  scan();
  new MutationObserver((muts) => { if (enabled && convMutations(muts)) scheduleScan(); })
    .observe(document.body, { childList: true, subtree: true, characterData: true });

  // 点击事件委托给 document：应用重绘换掉链接节点也不影响后续点击
  document.addEventListener('click', (e) => {
    const span = e.target instanceof Element && e.target.closest('[data-zcodepro-sess]');
    if (!span || !enabled) return;
    e.preventDefault();
    e.stopPropagation();
    const id = span.getAttribute('data-zcodepro-sess') || '';
    // 行在场就用行的真实键（键形带尾斜杠也能命中）；不在场按 id 兜底找
    const row = document.querySelector(`[data-task-item-key$=":${CSS.escape(id)}"]`);
    const key = row ? row.getAttribute('data-task-item-key') : `:${id}`;
    // switchTo 动态引入：本文件的自检只测纯函数，别把测试牵进会话切换的 DOM 依赖
    void import('./session-switch.js')
      .then((m) => m.switchTo(key))
      .then((ok) => { if (!ok) showToast(t().switcherFailed, 'error'); });
  });
}
