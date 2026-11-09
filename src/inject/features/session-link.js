// 会话 ID 显示为任务名链接：把提问与回答文本里的 sess_xxx / session_xxx 渲染成
// 任务名链接，点击切到对应会话。任务名优先取侧栏行标题，行不在场（项目折叠等）
// 时按 id 批量查任务索引（/task-statuses）；查不到名字就保留原 ID 文本，仍然可点。
// 只改纯文本节点：代码块/链接/按钮/输入框/自家已处理节点不动；流式输出中的行
// 先跳过（文本还在变，等渲染完成后整行补处理），避免与应用重绘互相干扰。
import { rpc, t, getConfig } from '../core.js';
import { ensureStyle, showToast } from '../ui.js';

const CONV = '[class*="@md/conversation"]';
// contenteditable 也要跳过：行内编辑用的是 Lexical 托管 DOM，改它里面的文本节点会被
// Lexical 删掉再插回，两边来回触发会让页面卡死（消息里带会话 ID 时必现）
const SKIP_SEL = 'pre, code, a, button, input, textarea, select, [contenteditable], [data-zcodepro-sess]';
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
const TITLE_CACHE_MAX = 500;
const pendingIds = new Set(); // 扫到但还没查过名字的 id
let fetchTimer = 0;
// 处理过的文本节点记下来（确认没有会话 id 或在跳过区的）：流式输出期间反复
// 重扫时跳过它们，不再逐个跑正则。文本改动会让标记作废（观察器里删标记）
const doneNodes = new WeakSet();
const streamingRows = new Set(); // 流式输出中跳过的回答行：渲染完成后整行补处理

function makeLink(id) {
  const span = document.createElement('span');
  span.className = 'zcodepro-sess-link';
  span.dataset.zcodeproSess = id;
  span.title = id; // 悬停看原始 ID
  span.textContent = titleCache.get(id) || id;
  return span;
}

function processTextNode(node) {
  if (!node || doneNodes.has(node)) return;
  const text = node.textContent || '';
  if (!text.includes('sess')) { doneNodes.add(node); return; }
  const el = node.parentElement;
  if (!el || el.closest(SKIP_SEL)) { doneNodes.add(node); return; }
  // 流式输出中的行文本还在变，等渲染完成再处理（不记已处理，行收尾时补）
  const row = el.closest('[class*="-row"]');
  if (row && row.querySelector('[data-is-streaming]')) { streamingRows.add(row); return; }
  const ms = matchIds(text);
  if (!ms.length) { doneNodes.add(node); return; }
  doneNodes.add(node);
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

// 收集子树里的文本节点（先收集再处理：边走边替换会漏掉刚换出来的节点）
function walkTexts(root, out) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) out.push(n);
}

// 流式结束的行补处理：结束信号（[data-is-streaming] 摘除）本身是一次 DOM 变动，
// 观察器回调里调到这里检查；行已经不在 DOM 就出队
function flushStreamingRows() {
  if (!streamingRows.size) return;
  const nodes = [];
  for (const row of [...streamingRows]) {
    if (!row.isConnected) { streamingRows.delete(row); continue; }
    if (row.querySelector('[data-is-streaming]')) continue;
    streamingRows.delete(row);
    walkTexts(row, nodes);
  }
  for (const n of nodes) processTextNode(n);
}

function scan() {
  const nodes = [];
  for (const conv of document.querySelectorAll(CONV)) walkTexts(conv, nodes);
  for (const n of nodes) processTextNode(n);
  flushStreamingRows();
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
      // 标题缓存只增不减会慢慢攒内存（session-switch.js 的 titles 同款问题）：
      // 超上限删最旧的（Map 迭代序即插入序），删掉的 id 之后再扫到会重新查名
      while (titleCache.size > TITLE_CACHE_MAX) titleCache.delete(titleCache.keys().next().value);
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
  // 刚打开开关时会话区没有变动，补一次扫描才能立刻出链接（此时全量扫正是必要时机）
  if (next) scan();
}

// 只有会话容器内的变动才值得处理：侧栏/弹窗等高频变动在此滤掉
const inConv = (el) => !!(el && el.closest && el.closest(CONV));

export function startSessionLink() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  ensureStyle();
  void getConfig().then(setEnabled).catch(() => {});
  window.addEventListener('zcodepro:config-changed', () => {
    void getConfig(true).then(setEnabled).catch(() => {});
  });
  scan();
  // 观察器优先做定向处理：只跑变动涉及的文本节点（新增子树、改动的文本），
  // 不再每 300ms 全量重扫整个会话容器；只有会话容器整块换新（首次、切视图）
  // 才全量扫一次。流式输出期间的高频变动在这里被压成逐节点的轻检查
  new MutationObserver((muts) => {
    const texts = [];
    let structural = false;
    for (const m of muts) {
      if (m.type === 'characterData') {
        // 文本改过：已处理标记作废。开关关着也做，重新打开时标记不失真
        doneNodes.delete(m.target);
        if (enabled && inConv(m.target.parentElement)) texts.push(m.target);
        continue;
      }
      for (const n of m.addedNodes) {
        if (!enabled) continue;
        if (n.nodeType === Node.TEXT_NODE) {
          if (inConv(n.parentElement)) texts.push(n);
          continue;
        }
        if (!(n instanceof Element) || !n.closest) continue;
        if (n.matches(CONV) || n.querySelector(CONV)) { structural = true; continue; }
        if (inConv(n) && !n.closest(SKIP_SEL)) walkTexts(n, texts);
      }
    }
    if (!enabled) return;
    if (structural) { scan(); return; }
    for (const t of texts) processTextNode(t);
    flushStreamingRows();
    queueTitleFetch();
  }).observe(document.body, { childList: true, subtree: true, characterData: true });

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
