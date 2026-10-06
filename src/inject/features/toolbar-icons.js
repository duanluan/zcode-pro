// 侧栏菜单并入顶栏：侧边栏顶部的「新建任务 / 搜索 / 自动化 / 插件市场」四项
// 收成顶部导航栏（后退/前进旁）的四个图标按钮，原菜单区域整体隐藏。
// 悬停显示名称（带快捷键的项照带快捷键），按钮点亮表示对应界面正打开：
// 自动化/插件市场跟随原按钮的 aria-pressed，搜索跟随命令面板是否在场，
// 新建任务跟随「当前无选中会话」（即处于新建任务视图）。状态都从应用现状推导，
// 键盘快捷键或其他入口触发同样能点亮。点击转发合成 click 给隐藏的原按钮
//（display:none 不影响事件派发，已实测），原生行为全部保留。
// 不移动应用的任何节点（避免与界面框架自身的增删冲突），自有按钮行追加在
// 导航按钮容器末尾——框架不排斥外来子节点；界面重渲染换新节点后由观察器重建。
import { h, t, getConfig } from '../core.js';
import { ensureStyle } from '../ui.js';

const HIDE_CLASS = 'zcodepro-tb-hidden';
const SYNC_DEBOUNCE_MS = 150;   // 相关 DOM 变动后的去抖
const SCAN_FALLBACK_MS = 5000;  // 兜底轮询周期：仅补观察器覆盖不到的路径

// 会话行（识别当前有无选中会话 → 新建任务态）
const ROW_SEL = '[data-task-item-key]';
// 与本功能相关的新增/删除节点：菜单四项、命令面板、顶栏导航按钮
const MENU_SEL = '[data-testid="task-new-button"], [data-testid="automations-open"],'
  + ' [data-testid="plugin-store-sidebar-open"], [data-slot="command"],'
  + ' [data-testid="desktop-top-nav-back"]';

let enabled = true;   // 配置开关（features.toolbarIcons !== false）
let rowEl = null;     // 顶栏自有按钮行
let origs = null;     // { menu, newTask, search, auto, plugin } 原元素引用
let syncTimer = 0;
let widthObserver = null;     // 监听侧栏宽度变化（拖分隔条/缩放窗口）
let widthObserved = null;

function findMenu() {
  const nt = document.querySelector('[data-testid="task-new-button"]');
  const menu = nt?.parentElement;
  return menu && menu.querySelector('[data-testid="automations-open"]') ? menu : null;
}

function originalsOf(menu) {
  const newTask = menu.querySelector('[data-testid="task-new-button"]');
  // 搜索按钮没有 testid，按 lucide-search 图标识别（快捷键文案随平台/语言变，不作依据）
  const search = newTask && menu.querySelector('button [class*="lucide-search"]')?.closest('button');
  const auto = menu.querySelector('[data-testid="automations-open"]');
  const plugin = menu.querySelector('[data-testid="plugin-store-sidebar-open"]');
  return newTask && search && auto && plugin ? { menu, newTask, search, auto, plugin } : null;
}

// 名称从原按钮提取（跟随界面语言）；提取不到再回退词典
function nameOf(orig, nameSel, fallback) {
  let name = nameSel && (orig.querySelector(nameSel)?.textContent || '').trim();
  if (!name) name = (orig.textContent || '').trim().split(/\s+/)[0]?.slice(0, 20) || '';
  return name || fallback;
}

// 悬停提示 = 名称 + 快捷键（快捷键 span 带 ml-auto，自动化/插件市场没有）
function tipOf(orig, nameSel, fallback) {
  const name = nameOf(orig, nameSel, fallback);
  const kbd = (orig.querySelector('span.ml-auto')?.textContent || '').trim();
  return kbd ? `${name} · ${kbd}` : name;
}

function iconOf(orig) {
  const svg = orig.querySelector('svg');
  if (!svg) return null;
  const clone = svg.cloneNode(true);
  clone.setAttribute('class', 'zcodepro-tb-icon');
  return clone;
}

function setActive(kind, on) {
  const btn = rowEl?.querySelector(`[data-kind="${kind}"]`);
  if (!btn) return;
  if (on) btn.setAttribute('data-active', '1');
  else btn.removeAttribute('data-active');
  // 自动化/插件市场是开关型按钮，同步按压语义
  if (kind === 'auto' || kind === 'plugin') btn.setAttribute('aria-pressed', on ? 'true' : 'false');
}

function syncActive() {
  if (!origs || !rowEl) return;
  const auto = origs.auto.getAttribute('aria-pressed') === 'true';
  const plugin = origs.plugin.getAttribute('aria-pressed') === 'true';
  const palette = !!document.querySelector('[data-slot="command"]');
  // 当前会话的识别方式与「会话快捷切换」一致（侧栏条目的 bg-selected 标记）
  let selected = false;
  for (const el of document.querySelectorAll(ROW_SEL)) {
    if ((el.className + '').includes('bg-selected')) { selected = true; break; }
  }
  // 新建任务态 = 无选中会话且无面板打开（自动化/插件市场面板会清掉会话选中，
  // 不排除的话那些面板打开时本按钮会跟着误亮；命令面板是浮层不遮挡底层视图，不排除）
  setActive('newTask', !selected && !auto && !plugin);
  setActive('search', palette);
  setActive('auto', auto);
  setActive('plugin', plugin);
}

function rebuild() {
  const menu = findMenu();
  if (!menu) return false;
  const next = originalsOf(menu);
  const navRow = document.querySelector('[data-testid="desktop-top-nav-back"]')?.parentElement;
  if (!next || !navRow) return false;
  // 界面重渲染换了新节点：给旧菜单摘掉隐藏类，新菜单藏起来
  if (origs && origs.menu !== menu) origs.menu.classList.remove(HIDE_CLASS);
  menu.classList.add(HIDE_CLASS);
  origs = next;
  rowEl?.remove();
  const L = t();
  const mk = (kind, orig, nameSel, fallback) => h('button', {
    type: 'button',
    class: 'zcodepro-tb-btn',
    'data-kind': kind,
    'aria-label': nameOf(orig, nameSel, fallback),
    'data-zcodepro-tip': tipOf(orig, nameSel, fallback),
    onClick: () => {
      orig.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      // 状态变化由观察器捕捉；这里补一次延时同步，点击后点亮更即时
      setTimeout(syncActive, 150);
    },
  });
  const newBtn = mk('newTask', next.newTask, 'span.truncate', L.tbNewTask);
  const icon = iconOf(next.newTask);
  if (icon) newBtn.append(icon);
  const searchBtn = mk('search', next.search, 'span.truncate', L.tbSearch);
  const sIcon = iconOf(next.search);
  if (sIcon) searchBtn.append(sIcon);
  const autoBtn = mk('auto', next.auto, null, L.tbAutomations);
  const aIcon = iconOf(next.auto);
  if (aIcon) autoBtn.append(aIcon);
  const pluginBtn = mk('plugin', next.plugin, null, L.tbPluginStore);
  const pIcon = iconOf(next.plugin);
  if (pIcon) pluginBtn.append(pIcon);
  rowEl = h('div', { class: 'zcodepro-tb-row' }, newBtn, searchBtn, autoBtn, pluginBtn);
  navRow.append(rowEl);
  return true;
}

// 侧栏收起判定：收起后顶栏「切换侧边栏」按钮的图标换成 panel-left-open
// （展开时是 panel-left-close）。图标类名不含本地化文案，比 aria-label 稳；
// 识别不出时按展开处理。收起时应用会让自带的顶栏新建任务按钮展开顶上，
// 我们的按钮行要藏起来避免出现两个相同入口
function sidebarCollapsed() {
  const navRow = document.querySelector('[data-testid="desktop-top-nav-back"]')?.parentElement;
  const svg = navRow?.querySelector('button svg[class*="panel-left-"]');
  return !!svg && (svg.getAttribute('class') || '').includes('panel-left-open');
}

// 侧栏过窄判定：图标行 + 原有导航按钮约需 260px，再窄会伸出侧栏压到主视图。
// 过窄时回退原生菜单布局（隐藏图标行、还原菜单），宽度恢复后自动切回，
// 任何入口都不丢。宽度取侧栏滚动容器（侧栏打开时始终在场）
const NARROW_SIDEBAR_PX = 260;
function sidebarTooNarrow() {
  const scroll = document.querySelector('.flex.flex-1.min-h-0.flex-col.gap-3.overflow-y-auto');
  if (!scroll) return false;
  // 顺带盯住宽度变化（容器重建后换目标重新观察）
  if (!widthObserver) widthObserver = new ResizeObserver(() => scheduleSync());
  if (widthObserved !== scroll) {
    if (widthObserved) widthObserver.unobserve(widthObserved);
    widthObserved = scroll;
    widthObserver.observe(scroll);
  }
  return scroll.getBoundingClientRect().width < NARROW_SIDEBAR_PX;
}

function sync() {
  if (!enabled) return;
  const menu = findMenu();
  // 侧栏收起/未渲染/过窄：藏起图标行。过窄时还原原生菜单（收起时菜单本就不可见）
  if (!menu) {
    if (rowEl) rowEl.style.display = 'none';
    return;
  }
  if (sidebarCollapsed() || sidebarTooNarrow()) {
    if (rowEl) rowEl.style.display = 'none';
    menu.classList.remove(HIDE_CLASS);
    return;
  }
  const alive = origs && origs.menu === menu
    && origs.newTask.isConnected && origs.search.isConnected
    && origs.auto.isConnected && origs.plugin.isConnected
    && rowEl && rowEl.isConnected;
  if (!alive && !rebuild()) return;
  // 界面重渲染可能整体重写容器的 class，隐藏类兜底重加
  menu.classList.add(HIDE_CLASS);
  if (rowEl) rowEl.style.display = '';
  syncActive();
}

function scheduleSync() {
  if (syncTimer) return;
  syncTimer = setTimeout(() => { syncTimer = 0; sync(); }, SYNC_DEBOUNCE_MS);
}

// 只有相关变动才值得重扫：会话行 class 变化（选中标记移动）、开关按钮
// aria-pressed 变化、菜单/命令面板/导航按钮的新增或删除、侧栏收起图标翻转。
// 聊天区流式输出等高频变动在此滤掉。
function relevantMutations(muts) {
  for (const m of muts) {
    if (m.type === 'attributes') {
      const target = m.target;
      if (target instanceof Element
        && (target.matches(ROW_SEL) || target.matches('[data-testid="automations-open"], [data-testid="plugin-store-sidebar-open"]')
          || target.matches('svg[class*="panel-left-"]'))) {
        return true;
      }
      continue;
    }
    for (const list of [m.addedNodes, m.removedNodes]) {
      for (const n of list) {
        if (!(n instanceof Element)) continue;
        if (n.matches(MENU_SEL) || n.matches(ROW_SEL)
          || n.querySelector(MENU_SEL) || n.querySelector(ROW_SEL)) return true;
        // 侧栏收起/展开时切换按钮的图标被整节点替换（panel-left-open/close 互换）
        if (n.matches('svg[class*="panel-left-"]') || n.querySelector?.('svg[class*="panel-left-"]')) return true;
      }
    }
  }
  return false;
}

function teardown() {
  rowEl?.remove();
  rowEl = null;
  if (origs) { origs.menu.classList.remove(HIDE_CLASS); origs = null; }
}

async function refreshConfig() {
  // 强制拉取：配置可能经设置弹窗以外的途径改动（缓存 3 秒内会是旧值）
  const cfg = await getConfig(true).catch(() => null);
  enabled = !cfg || !cfg.features || cfg.features.toolbarIcons !== false;
  if (enabled) sync();
  else teardown();
}

export function startToolbarIcons() {
  ensureStyle();
  // 设置弹窗保存开关后即时生效（settings-dialog 保存成功会派发该事件）
  window.addEventListener('zcodepro:config-changed', () => { void refreshConfig(); });
  void refreshConfig();
  new MutationObserver((muts) => { if (relevantMutations(muts)) scheduleSync(); })
    .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-pressed'] });
  // 低频兜底 + 页面隐藏时不扫、回到前台立即补一次
  setInterval(() => { if (!document.hidden) sync(); }, SCAN_FALLBACK_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
}
