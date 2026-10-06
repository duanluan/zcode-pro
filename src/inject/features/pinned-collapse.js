// 已置顶分区可折叠：原生侧栏「项目」「分组」的分区头是可折叠按钮（悬停显现
// chevron），「已置顶」只是静态标题。本功能把该标题变成同样的折叠开关：
// 标题内追加自有 chevron 按钮、整行可点，折叠时藏起分区里的任务列表；
// 状态记在 localStorage，界面重渲染后由观察器自动补回。不增删应用节点
// 结构（往标题里插外来子节点与顶栏图标按钮同理，界面框架不排斥）。
import { h, t, getConfig } from '../core.js';
import { ensureStyle } from '../ui.js';

const COLLAPSED_CLASS = 'zcodepro-pin-collapsed';
const HEAD_CLASS = 'zcodepro-pin-head';
const STORE_KEY = 'zcodepro:pinned-collapsed';
const SYNC_DEBOUNCE_MS = 300;   // 相关 DOM 变动后的去抖
const SCAN_FALLBACK_MS = 5000;  // 兜底轮询周期

let enabled = true;   // 配置开关（features.pinnedCollapse !== false）
let syncTimer = 0;

// 已置顶标题的识别不依赖文案（跟随界面语言）：h3 的下一个兄弟是含任务行的列表
function findPinnedHeader() {
  for (const h3 of document.querySelectorAll('h3')) {
    const ul = h3.nextElementSibling;
    if (ul && ul.tagName === 'UL' && ul.querySelector('li[data-task-item-key]')) return h3;
  }
  return null;
}

function chevronSvg() {
  // 优先克隆应用「项目」分区头的 chevron（应用改图标自动跟随），取不到再内建
  const proto = document.querySelector('svg[data-purpose-section-chevron]');
  if (proto) {
    const clone = proto.cloneNode(true);
    clone.removeAttribute('class');
    clone.removeAttribute('data-purpose-section-chevron');
    return clone;
  }
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'm6 9 6 6 6-6');
  svg.append(path);
  return svg;
}

function isCollapsed() {
  try { return localStorage.getItem(STORE_KEY) === '1'; } catch { return false; }
}

function toggle() {
  try { localStorage.setItem(STORE_KEY, isCollapsed() ? '0' : '1'); } catch { /* ignore */ }
  apply();
}

function apply() {
  const h3 = findPinnedHeader();
  if (!h3) return false;
  const sect = h3.parentElement;
  const collapsed = isCollapsed();
  sect.classList.toggle(COLLAPSED_CLASS, collapsed);
  const existing = h3.querySelector('.zcodepro-pin-chevron');
  if (h3.classList.contains(HEAD_CLASS) && existing) {
    existing.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    return true;
  }
  h3.classList.add(HEAD_CLASS);
  // 整行可点（与「项目」分区头一致）；开关禁用后旧监听变空转，无需摘除
  h3.addEventListener('click', () => { if (enabled) toggle(); });
  const btn = h('button', {
    type: 'button',
    class: 'zcodepro-pin-chevron',
    'aria-label': t().pinnedToggleAria,
    'aria-expanded': collapsed ? 'false' : 'true',
    onClick: (e) => { e.stopPropagation(); if (enabled) toggle(); },
  });
  btn.append(chevronSvg());
  h3.append(btn);
  return true;
}

function sync() {
  if (enabled) apply();
}

function scheduleSync() {
  if (syncTimer) return;
  syncTimer = setTimeout(() => { syncTimer = 0; sync(); }, SYNC_DEBOUNCE_MS);
}

// 侧栏相关变动才重扫：分区/任务行的新增删除（重渲染、切分组/项目视图）
function relevantMutations(muts) {
  for (const m of muts) {
    for (const list of [m.addedNodes, m.removedNodes]) {
      for (const n of list) {
        if (!(n instanceof Element)) continue;
        if (n.tagName === 'H3' || n.matches('li[data-task-item-key]')
          || n.querySelector('h3, li[data-task-item-key]')) return true;
      }
    }
  }
  return false;
}

function teardown() {
  for (const h3 of document.querySelectorAll('.' + HEAD_CLASS)) {
    h3.classList.remove(HEAD_CLASS);
    h3.querySelector('.zcodepro-pin-chevron')?.remove();
    h3.parentElement?.classList.remove(COLLAPSED_CLASS);
  }
}

async function refreshConfig() {
  // 强制拉取：配置可能经设置弹窗以外的途径改动（缓存 3 秒内会是旧值）
  const cfg = await getConfig(true).catch(() => null);
  enabled = !cfg || !cfg.features || cfg.features.pinnedCollapse !== false;
  if (enabled) sync();
  else teardown();
}

export function startPinnedCollapse() {
  ensureStyle();
  window.addEventListener('zcodepro:config-changed', () => { void refreshConfig(); });
  void refreshConfig();
  new MutationObserver((muts) => { if (relevantMutations(muts)) scheduleSync(); })
    .observe(document.body, { childList: true, subtree: true });
  setInterval(() => { if (!document.hidden) sync(); }, SCAN_FALLBACK_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
}
