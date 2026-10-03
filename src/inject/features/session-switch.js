// 会话快捷切换：alt+z 立即切到上次使用的会话（再按切回）；按住 alt 按 x/c 打开
// MRU 弹窗前后移动高亮（x 更早 / c 更新，两端循环），松开 alt 切换，Esc / 点弹窗外
// 取消，点行即切。MRU（最近使用序）从注入起记录（不回填历史库，上限 50 条），
// 与侧栏展示顺序无关；当前会话靠侧栏条目的 bg-selected 类识别（实测标记），
// 轮询扫描记录——点击、新建任务自动跳转等任何方式的切换都能捕捉。
// 目标条目在折叠项目下时先展开项目行再点击（展开先例见 pinned-expand.js）。
import { h, t, getConfig } from '../core.js';
import { ensureStyle, showToast } from '../ui.js';

const MRU_LIMIT = 50;
const SCAN_MS = 800;

let mru = [];          // 会话键（data-task-item-key），最近使用的在最前
let current = null;    // 当前会话键
let titles = new Map(); // 键 → 会话标题（展示缓存；条目在 DOM 时实时读取）
let popupEl = null;    // 打开的切换弹窗（null = 未开）
let aliasesCache = {}; // 项目路径 → 别名（打开弹窗时预取，renderPopup 同步使用）
let highlight = 0;
let scanTimer = null;

function firstLineOf(item) {
  // 条目文本含相对时间等杂项，取首个截断类标题元素，兜底 innerText 首行
  const tEl = item.querySelector('[class*="truncate"]');
  return (tEl ? tEl.textContent : (item.innerText || '').split('\n')[0])?.trim() || '';
}

function workspaceOf(key) {
  // 键格式 <workspace_path>:<sess_id>；sess 段固定以 "sess_" 开头，按其定位分隔符
  // （Windows 盘符路径里也有冒号，不能按第一个 ':' 切）
  const i = key.indexOf(':sess_');
  return i > 0 ? key.slice(0, i) : key;
}

function findCurrent() {
  for (const el of document.querySelectorAll('[data-task-item-key]')) {
    if ((el.className + '').includes('bg-selected')) return el;
  }
  return null;
}

// 记录一次「切到 key」；顺带刷新在场条目的标题缓存
function record(key) {
  if (key && key !== current) {
    current = key;
    mru = mru.filter((k) => k !== key);
    mru.unshift(key);
    if (mru.length > MRU_LIMIT) mru.length = MRU_LIMIT;
  }
}

// 轮询扫描：bg-selected 标记识别当前会话（新建任务自动跳转等非点击切换也能捕捉）；
// 标记缺失时由点击兜底记录。顺带刷新在场条目的标题缓存
function scan() {
  const cur = findCurrent();
  if (cur) record(cur.getAttribute('data-task-item-key'));
  for (const el of document.querySelectorAll('[data-task-item-key]')) {
    titles.set(el.getAttribute('data-task-item-key'), firstLineOf(el));
  }
}

// 切到指定会话：条目不在 DOM（项目折叠）时先展开项目行，等条目出现再点击
async function switchTo(key) {
  const find = () => document.querySelector(`[data-task-item-key="${CSS.escape(key)}"]`);
  let item = find();
  if (!item) {
    const ws = workspaceOf(key);
    const header = document.querySelector(`[data-testid="workspace-item-${CSS.escape(ws)}"]`);
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

function closePopup(commit) {
  if (!popupEl) return;
  const idx = highlight;
  popupEl.remove();
  popupEl = null;
  if (commit && idx > 0 && mru[idx] && mru[idx] !== current) {
    void switchTo(mru[idx]).then((ok) => { if (!ok) showToast(t().switcherFailed, 'error'); });
  }
}

function findTitle(key) {
  const item = document.querySelector(`[data-task-item-key="${CSS.escape(key)}"]`);
  if (item) titles.set(key, firstLineOf(item));
  const id = key.slice(key.indexOf(':sess_') + 1);
  return titles.get(key) || `sess ${id.slice(0, 8)}`;
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
  list.replaceChildren(...mru.map((key, i) => {
    const proj = projLabelOf(key, aliasesCache);
    return h('div', {
      class: 'zcodepro-switcher-row',
      'data-active': i === highlight ? '' : undefined,
      onClick: () => { highlight = i; closePopup(true); },
    },
      // 标题文本包 span：截断省略作用在文本节点上（flex 容器自身 ellipsis 无效）
      h('div', { class: 'zcodepro-switcher-title' },
        i === 0 ? h('span', { class: 'zcodepro-switcher-tag' }, L.switcherCurrent) : null,
        h('span', null, findTitle(key))),
      // 无项目归属（如置顶）时不渲染空行
      proj ? h('div', { class: 'zcodepro-switcher-ws' }, proj) : null);
  }));
}

async function openPopup() {
  if (popupEl) return;
  const cfg = await getConfig().catch(() => null);
  aliasesCache = (cfg && cfg.aliases && typeof cfg.aliases === 'object') ? cfg.aliases : {};
  ensureStyle();
  const L = t();
  highlight = 0;
  popupEl = h('div', {
    class: 'zcodepro-switcher-overlay',
    // 点弹窗外 = 取消（不切）
    onMousedown: (e) => { if (e.target === popupEl) closePopup(false); },
  },
    h('div', { class: 'zcodepro-switcher' },
      h('div', { class: 'zcodepro-switcher-hint' }, L.switcherHint),
      h('div', { 'data-zcodepro-switcher-list': '1', class: 'zcodepro-switcher-list' })));
  document.body.append(popupEl);
  renderPopup();
}

function moveHighlight(delta) {
  if (!popupEl || mru.length < 2) return;
  highlight = (highlight + delta + mru.length) % mru.length;
  renderPopup();
  const row = popupEl.querySelector('[data-active]');
  if (row) row.scrollIntoView({ block: 'nearest' });
}

export function startSessionSwitch() {
  scan();
  scanTimer = setInterval(scan, SCAN_MS);

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
    if (!e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
    // 我们的设置弹窗开着时不抢键（它有自己的 Esc/焦点逻辑）
    if (document.querySelector('.zcodepro-overlay')) return;
    const k = e.key.toLowerCase();
    if (k !== 'z' && k !== 'x' && k !== 'c') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    void (async () => {
    const cfg = await getConfig(); // 带 3s 缓存
    if (cfg.features && cfg.features.sessionSwitch === false) return;
    if (k === 'z') {
      if (e.repeat) return;
      // 即时切换：关掉可能开着的弹窗，切到 MRU 第二位（上次使用的会话）
      closePopup(false);
      if (mru.length < 2 || mru[0] !== current) {
        // 记录头不是当前会话（刚注入/扫描间隙）：直接取头一条非当前项
        const target = mru.find((mk) => mk !== current);
        if (!target) { showToast(t().switcherEmpty); return; }
        void switchTo(target).then((ok) => { if (!ok) showToast(t().switcherFailed, 'error'); });
        return;
      }
      if (!mru[1]) { showToast(t().switcherEmpty); return; }
      void switchTo(mru[1]).then((ok) => { if (!ok) showToast(t().switcherFailed, 'error'); });
      return;
    }
    // x/c：弹窗导航（无可导航会话时与 z 一致轻提示）
    if (mru.length < 2) { showToast(t().switcherEmpty); return; }
    if (!popupEl) await openPopup();
    moveHighlight(k === 'x' ? 1 : -1);
    })();
  }, true);

  document.addEventListener('keyup', (e) => {
    if (e.key === 'Alt' && popupEl) closePopup(true); // 松开 alt：提交高亮项
  }, true);

  // 窗口失焦（alt+tab 到别的应用等）视同取消
  window.addEventListener('blur', () => closePopup(false));
}
