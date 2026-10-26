// 会话快捷切换：alt+z 立即切到上次使用的会话（再按切回）；按住 alt 按 x/c 打开
// MRU 弹窗前后移动高亮（x 更早 / c 更新，c 到底且还有更多时加载 5 条并选中新
// 加载的第一条），alt+e 直接打开同一弹窗（初始显示最近 10 条），alt+r 打开
// “运行中 / 运行完未查看”任务弹窗，松开 alt 切换，Esc / 点弹窗外取消，点行即切。
// MRU（最近使用序）从注入起记录（不回填历史库，上限 50 条），
// 与侧栏展示顺序无关；当前会话靠侧栏条目的 bg-selected 类识别（实测标记），
// 事件驱动扫描（会话行增删/选中标记移动才触发）+ 低频兜底轮询——
// 点击、新建任务自动跳转等任何方式的切换都能捕捉，聊天区流式输出不产生扫描。
// 目标条目在折叠项目下时先展开项目行再点击（展开先例见 pinned-expand.js）。
import { h, t, rpc, getConfig, DEFAULT_SHORTCUTS } from '../core.js';
import { ensureStyle, showToast } from '../ui.js';
import { findProjectRow } from './ws-rows.js';
import { wsRunningKeys } from './ws-running.js';

const MRU_LIMIT = 50;
const SCAN_DEBOUNCE_MS = 150;   // 相关 DOM 变动后的去抖，合并连续变动
const SCAN_FALLBACK_MS = 5000;  // 兜底轮询周期：仅补观察器覆盖不到的路径
const INITIAL_COUNT = 10;       // 弹窗初始渲染条数（alt+e“最近 10 条”同此）
const PAGE_SIZE = 5;            // c 到底再按时加载的条数
const UNSEEN_LIMIT = 50;

let mru = [];          // 会话键（data-task-item-key），最近使用的在最前
let current = null;    // 当前会话键
let titles = new Map(); // 键 → 会话标题（展示缓存；条目在 DOM 时实时读取）
let popupEl = null;    // 打开的切换弹窗（null = 未打开）
let aliasesCache = {}; // 项目路径 → 别名（打开弹窗时预取，renderPopup 同步使用）
let highlight = 0;
let scanDebounce = 0;
let popupMode = 'mru';   // 'mru'：最近使用（x/c/e）；'attention'：运行中 + 未查看（r）
let visibleCount = INITIAL_COUNT;
let unseen = new Set();  // 运行结束以来未再切入查看的会话键
let lastRunKeys = null;  // 上次采样的运行键集合（用于识别“运行→结束”的转变）
let movedSinceOpen = false; // 打开弹窗后是否移动过高亮（决定松开 alt 是提交还是保持）
// 键位（alt+字母/数字）：默认见 core.js，可在设置 → 快捷键修改；
// 设置保存时会派发 zcodepro:config-changed，这里刷新缓存
let hotkeys = { ...DEFAULT_SHORTCUTS };
function loadHotkeys() {
  return getConfig(true).then((cfg) => {
    const sc = cfg && cfg.shortcuts;
    if (sc && typeof sc === 'object') {
      for (const k of Object.keys(DEFAULT_SHORTCUTS)) {
        if (typeof sc[k] === 'string' && /^[a-z0-9]$/.test(sc[k])) hotkeys[k] = sc[k];
      }
    }
  }).catch(() => {});
}

function firstLineOf(item) {
  // 条目文本含相对时间等杂项，取首个截断类标题元素，兜底 innerText 首行
  const tEl = item.querySelector('[class*="truncate"]');
  return (tEl ? tEl.textContent : (item.innerText || '').split('\n')[0])?.trim() || '';
}

function workspaceOf(key) {
  // 键格式 <workspace_path>:<task_id>；task_id 有 sess_ 与 session_ 两种前缀
  // （新版应用为 session_），按最后一个 ':' 切（ws-running.js 同款）
  const i = key.lastIndexOf(':');
  return i > 0 ? key.slice(0, i) : key;
}

function findCurrent() {
  for (const el of document.querySelectorAll('[data-task-item-key]')) {
    if ((el.className + '').includes('bg-selected')) return el;
  }
  return null;
}

// 记录一次“切到 key”；顺带刷新在场条目的标题缓存。切入即视为已查看
function record(key) {
  if (key) unseen.delete(key);
  if (key && key !== current) {
    current = key;
    mru = mru.filter((k) => k !== key);
    mru.unshift(key);
    if (mru.length > MRU_LIMIT) mru.length = MRU_LIMIT;
  }
}

// 扫描：bg-selected 标记识别当前会话（新建任务自动跳转等非点击切换也能捕捉）；
// 标记缺失时由点击兜底记录。顺带刷新在场条目的标题缓存
function scan() {
  const cur = findCurrent();
  if (cur) record(cur.getAttribute('data-task-item-key'));
  for (const el of document.querySelectorAll('[data-task-item-key]')) {
    titles.set(el.getAttribute('data-task-item-key'), firstLineOf(el));
  }
}

// 只有任务条目相关变动才值得重扫：会话行新增（项目展开/新任务）、行内 class 变化
// （bg-selected 选中标记移动）。聊天区流式输出等全页高频变动在此滤掉——
// 这是本功能从 800ms 固定轮询改为事件驱动的关键。
const rowSel = '[data-task-item-key]';
const inTaskRow = (node) => node instanceof Element && !!node.closest && !!node.closest(rowSel);
function taskRowMutations(muts) {
  for (const m of muts) {
    if (m.type === 'attributes') {
      if (inTaskRow(m.target)) return true;
    } else if (m.type === 'characterData') {
      if (m.target.parentElement && inTaskRow(m.target.parentElement)) return true;
    } else if (inTaskRow(m.target)) {
      return true;
    } else {
      for (const n of m.addedNodes) {
        if (n instanceof Element && (n.matches(rowSel) || !!n.querySelector(rowSel))) return true;
      }
    }
  }
  return false;
}

function scheduleScan() {
  if (scanDebounce) return;
  scanDebounce = setTimeout(() => { scanDebounce = 0; scan(); }, SCAN_DEBOUNCE_MS);
}

// 切到指定会话：条目不在 DOM（项目折叠）时先展开项目行，等条目出现再点击
async function switchTo(key) {
  // 权威扫描拼出的键（工作区前缀无尾斜杠）可能与行键（可能带尾斜杠）不同形，
  // 精确匹配落空时按会话 id 后缀兜底（会话 id 全局唯一，不会命中别的会话）
  const id = key.slice(key.lastIndexOf(':') + 1);
  const find = () => document.querySelector(`[data-task-item-key="${CSS.escape(key)}"]`)
    || (id ? document.querySelector(`[data-task-item-key$=":${CSS.escape(id)}"]`) : null);
  let item = find();
  if (!item) {
    const ws = workspaceOf(key);
    // 项目行按路径定位：旧结构查 testid，新结构（3.16.1 起）按 data-project-id
    // 分区匹配（分区与路径的关联需该项目本次会话展开过一次，见 ws-rows.js）
    const header = findProjectRow(ws);
    const expander = header && header.querySelector('[aria-expanded]');
    if (expander && expander.getAttribute('aria-expanded') === 'false') {
      expander.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      for (let i = 0; i < 20 && !(item = find()); i++) await new Promise((r) => setTimeout(r, 100));
    }
  }
  if (!item) return false;
  item.scrollIntoView({ block: 'nearest' });
  item.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  return true;
}

// —— 切换弹窗（类 alt+tab）：居中列表卡，x/c 移动高亮，松开 alt / 点击提交 ——

// attention 弹窗的列表：正在运行或运行完未查看的任务。MRU 只记录切入过的
// 会话，而“未查看”的任务可能从未切入，不在 MRU 里——这部分（先运行中、
// 再未查看，各按发现序）追加在 MRU 命中项之后。
// 同一会话有两种键形（行在场与否决定：DOM 行键可能带尾斜杠、权威拼的键
// 不带），按会话 id 去重——同一会话只出一行，运行中的键形优先（标签按它
// 判定才是“运行中”，点击也命中在场行）
function attentionList() {
  const run = wsRunningKeys();
  const idOf = (k) => k.slice(k.lastIndexOf(':') + 1);
  const runKeyById = new Map([...run].map((k) => [idOf(k), k]));
  const listed = new Set();
  const head = [];
  for (const k of mru) {
    const id = idOf(k);
    if (listed.has(id)) continue;
    const runForm = runKeyById.get(id);
    if (run.has(k) || unseen.has(k) || runForm) { head.push(runForm || k); listed.add(id); }
  }
  const tail = [];
  const push = (k) => { const id = idOf(k); if (listed.has(id)) return; listed.add(id); tail.push(k); };
  for (const k of run) push(k);
  for (const k of unseen) push(k);
  return [...head, ...tail];
}

// 弹窗当前列表：普通模式为 MRU 全量；attention 模式为运行中 + 未查看
function activeList() {
  return popupMode === 'attention' ? attentionList() : mru;
}

function closePopup(commit) {
  if (!popupEl) return;
  const idx = highlight;
  const list = activeList();
  popupEl.remove();
  popupEl = null;
  if (commit && list[idx] && list[idx] !== current) {
    void switchTo(list[idx]).then((ok) => { if (!ok) showToast(t().switcherFailed, 'error'); });
  }
}

function findTitle(key) {
  const item = document.querySelector(`[data-task-item-key="${CSS.escape(key)}"]`);
  if (item) titles.set(key, firstLineOf(item));
  const id = key.slice(key.lastIndexOf(':') + 1);
  return titles.get(key) || `sess ${id.slice(0, 8)}`;
}

// 折叠项目的会话行不在场，标题缓存里没有：打开 attention 弹窗时按会话 id 批量
// 查任务索引（helper /task-statuses 附带 title）；查不到保持 "sess xxx" 兜底
async function fetchMissingTitles(keys) {
  const sessIdOf = (k) => k.slice(k.lastIndexOf(':') + 1);
  const missing = keys.filter((k) => {
    const id = sessIdOf(k);
    return id && !titles.get(k) && !document.querySelector(`[data-task-item-key$=":${CSS.escape(id)}"]`);
  });
  if (!missing.length) return;
  const st = await rpc('/task-statuses?ids=' + encodeURIComponent(missing.map(sessIdOf).join(','))).catch(() => null);
  if (!st || !st.ok || !st.available || !st.statuses) return;
  for (const k of missing) {
    const rec = st.statuses[sessIdOf(k)];
    if (rec && rec.title) titles.set(k, String(rec.title));
  }
}

// 项目显示名：优先自定义别名（与侧栏一致），无别名退回目录名
function projLabelOf(key, aliases) {
  const ws = workspaceOf(key);
  if (!ws) return '';
  return aliases[ws] || ws.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
}

function renderPopup() {
  if (!popupEl) return;
  const L = t();
  const list = popupEl.querySelector('[data-zcodepro-switcher-list]');
  const full = activeList();
  const shown = full.slice(0, visibleCount);
  // attention 模式每行标状态：运行中（绿）/ 未查看（琥珀）；普通模式不加
  const run = popupMode === 'attention' ? wsRunningKeys() : null;
  list.replaceChildren(...shown.map((key) => {
    const proj = projLabelOf(key, aliasesCache);
    return h('div', {
      class: 'zcodepro-switcher-row',
      'data-active': full[highlight] === key ? '' : undefined,
      onClick: () => { highlight = full.indexOf(key); closePopup(true); },
    },
      // 标题文本包 span：截断省略作用在文本节点上（flex 容器自身 ellipsis 无效）
      h('div', { class: 'zcodepro-switcher-title' },
        key === current ? h('span', { class: 'zcodepro-switcher-tag' }, L.switcherCurrent) : null,
        run && run.has(key) ? h('span', { class: 'zcodepro-switcher-tag zcodepro-switcher-tag-run' }, L.switcherRunning) : null,
        run && !run.has(key) ? h('span', { class: 'zcodepro-switcher-tag zcodepro-switcher-tag-new' }, L.switcherUnseen) : null,
        h('span', null, findTitle(key))),
      // 无项目归属（如置顶）时不渲染空行
      proj ? h('div', { class: 'zcodepro-switcher-ws' }, proj) : null);
  }));
  if (full.length > shown.length) {
    list.append(h('div', { class: 'zcodepro-switcher-more' },
      L.switcherMore.replaceAll('{n}', String(full.length - shown.length))));
  }
}

async function openPopup(mode = 'mru') {
  if (popupEl) return;
  popupMode = mode;
  visibleCount = INITIAL_COUNT;
  highlight = 0;
  movedSinceOpen = false;
  const cfg = await getConfig().catch(() => null);
  aliasesCache = (cfg && cfg.aliases && typeof cfg.aliases === 'object') ? cfg.aliases : {};
  // attention 模式的行可能整段来自权威扫描（折叠项目），先补齐它们的标题再渲染
  if (mode === 'attention') await fetchMissingTitles(attentionList()).catch(() => {});
  ensureStyle();
  const L = t();
  popupEl = h('div', {
    class: 'zcodepro-switcher-overlay',
    // 点弹窗外 = 取消（不切）
    onMousedown: (e) => { if (e.target === popupEl) closePopup(false); },
  },
    h('div', { class: 'zcodepro-switcher' },
      // 提示行键位跟随当前配置（改键后新开的弹窗即用新键位）
      h('div', { class: 'zcodepro-switcher-hint' },
        (mode === 'attention' ? L.switcherAttentionHint : L.switcherHint)
          .replaceAll('{prev}', hotkeys.switchPrev)
          .replaceAll('{next}', hotkeys.switchNext)),
      h('div', { 'data-zcodepro-switcher-list': '1', class: 'zcodepro-switcher-list' })));
  document.body.append(popupEl);
  renderPopup();
}

function scrollHighlight() {
  const row = popupEl && popupEl.querySelector('[data-active]');
  if (row) row.scrollIntoView({ block: 'nearest' });
}

function moveUp() {
  const len = Math.min(activeList().length, visibleCount);
  if (len < 2) return;
  highlight = highlight > 0 ? highlight - 1 : len - 1; // 到顶循环回已加载的末尾
  movedSinceOpen = true;
  renderPopup();
  scrollHighlight();
}

function moveDown() {
  const full = activeList();
  const len = Math.min(full.length, visibleCount);
  if (len < 2) return;
  if (highlight < len - 1) {
    highlight += 1;
  } else if (visibleCount < full.length) {
    // 到底且还有更多：加载 5 条，高亮落在新加载的第一条
    visibleCount = Math.min(visibleCount + PAGE_SIZE, full.length);
    highlight = len;
  } else {
    highlight = 0; // 全部加载完后再到底：循环回顶部
  }
  movedSinceOpen = true;
  renderPopup();
  scrollHighlight();
}

export function startSessionSwitch() {
  scan();
  void loadHotkeys();
  window.addEventListener('zcodepro:config-changed', () => { void loadHotkeys(); });
  // 事件驱动为主：任务条目相关变动（去抖 150ms）立即重扫
  new MutationObserver((muts) => { if (taskRowMutations(muts)) scheduleScan(); })
    .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  // 低频兜底轮询 + 页面隐藏时不扫、回到前台立即补一次
  setInterval(() => { if (!document.hidden) scan(); }, SCAN_FALLBACK_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scan(); });

  // “运行完未查看”跟踪：周期采样运行键集合（ws-running 维护的实时状态），
  // 从运行集合消失（转终态）且结束时不是当前会话的记为未查看；
  // 用户切入该会话（record）即清除。注入前已结束的任务无从判定，不追溯
  setInterval(() => {
    if (document.hidden) return;
    const now = wsRunningKeys();
    if (lastRunKeys) {
      // 按会话 id 判“从运行集合消失”：同一会话的键形会随行挂载/卸载在
      // “权威拼的键”与“DOM 行键”之间切换，按整键比较会把键形切换误判成
      // 运行结束，生成一行点不动的“未查看”幽灵行
      const idOf = (k) => k.slice(k.lastIndexOf(':') + 1);
      const nowIds = new Set([...now].map(idOf));
      for (const k of lastRunKeys) {
        if (!nowIds.has(idOf(k)) && k !== current) unseen.add(k);
      }
    }
    lastRunKeys = now;
    if (unseen.size > UNSEEN_LIMIT) unseen = new Set([...unseen].slice(-UNSEEN_LIMIT));
  }, 10_000);

  // 点击兜底：bg-selected 标记不可用/未出现时，点条目（含本功能派发的合成点击）即记录
  document.addEventListener('click', (e) => {
    const item = e.target instanceof Element && e.target.closest('[data-task-item-key]');
    if (item) record(item.getAttribute('data-task-item-key'));
  }, true);

  document.addEventListener('keydown', (e) => {
    // 裸 Esc 也允许取消弹窗（alt 按住期间通常带 alt 修饰，但松开前后瞬间可能没有）
    if (e.key === 'Escape' && popupEl) {
      e.preventDefault();
      e.stopImmediatePropagation();
      closePopup(false);
      return;
    }
    // 弹窗开着时方向键 / Enter 也可操作（此时用户往往已松开 alt）：
    // ↑/↓ 与 x/c 同规则（下到底加载 5 条），Enter 提交高亮项
    if (popupEl && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === 'ArrowUp') moveUp();
      else if (e.key === 'ArrowDown') moveDown();
      else if (!e.repeat) closePopup(true);
      return;
    }
    if (!e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
    // 我们的设置弹窗开着时不抢键（它有自己的 Esc/焦点逻辑）
    if (document.querySelector('.zcodepro-overlay')) return;
    const k = e.key.toLowerCase();
    const isHot = k === hotkeys.switchLast || k === hotkeys.switchPrev || k === hotkeys.switchNext
      || k === hotkeys.switchRecent || k === hotkeys.switchAttention;
    if (!isHot) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    void (async () => {
    const cfg = await getConfig(); // 带 3s 缓存
    if (cfg.features && cfg.features.sessionSwitch === false) return;
    if (k === hotkeys.switchLast) {
      if (e.repeat) return;
      // 即时切换：关掉可能开着的弹窗，切到最近使用的会话（上次使用的会话）
      closePopup(false);
      // 先按侧栏选中标记实时识别当前会话：新建任务视图里没有选中行，
      // 此时“当前”视为空，直接回最近使用的会话（新开应用点开过一个会话、
      // 进了新建任务再按 alt+z 也能切回去）
      const live = findCurrent();
      if (live) record(live.getAttribute('data-task-item-key'));
      const target = live
        ? (mru[0] === current ? mru[1] : mru.find((mk) => mk !== current))
        : mru[0];
      if (!target) { showToast(t().switcherEmpty); return; }
      void switchTo(target).then((ok) => { if (!ok) showToast(t().switcherFailed, 'error'); });
      return;
    }
    // r：运行中 / 运行完未查看的任务（attention 弹窗）
    if (k === hotkeys.switchAttention) {
      if (e.repeat) return;
      closePopup(false);
      if (!attentionList().length) {
        showToast(t().switcherAttentionEmpty);
        return;
      }
      await openPopup('attention');
      return;
    }
    // x/c/e：最近使用弹窗（无可导航会话时与 z 一致轻提示）
    if (mru.length < 2) { showToast(t().switcherEmpty); return; }
    // e 只负责打开（初始显示最近 10 条，c 可继续加载更早的）
    if (k === hotkeys.switchRecent) {
      if (!e.repeat && !popupEl) await openPopup('mru');
      return;
    }
    if (!popupEl) await openPopup('mru');
    // 键位对调：alt+x 上移一位（更靠上/更近的键管向上），alt+c 下移
    if (k === hotkeys.switchPrev) moveUp(); else moveDown();
    })();
  }, true);

  document.addEventListener('keyup', (e) => {
    // 松开 alt：移动过高亮则提交（alt+tab 流）；从未移动则保持弹窗打开，
    // 让用户继续用方向键选择（alt+e / alt+r 打开后松手查看的场景）
    if (e.key === 'Alt' && popupEl && movedSinceOpen) closePopup(true);
  }, true);

  // 窗口失焦（alt+tab 到别的应用等）视同取消
  window.addEventListener('blur', () => closePopup(false));
}
