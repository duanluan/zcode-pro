// 手动“自动重命名”：按会话最近 N 轮问答 + 设置弹窗“自动重命名”tab 的提示词
// 重新生成任务名，按“手动重命名”写库（已重命名也覆盖——用户显式改名）。两个入口：
// - 任务行悬浮按钮：挂在官方悬浮操作区（data-task-row-actions，归档按钮旁）。
//   操作区悬停才渲染、React 重渲染会抹掉注入节点，按行内变动去抖补挂；
// - 右键菜单：在“重命名任务”下方插入一项。菜单是 Radix 浮层，右键任务行时
//   先记下会话键，菜单出现后克隆官方菜单项样式插入。
// 生成成功即更新侧栏行并刷新标题锁定表（同 title-gen.js）；手动动作失败弹提示
//（不再静默）。入口各有开关、素材轮数可调，都在“自动重命名”tab 下。
import { rpc, getConfig, itemsOf, itemText, closeRadixMenu, t } from '../core.js';
import { showToast } from '../ui.js';
import { setRowTitle, refreshPinnedTitles } from './title-lock.js';

const TASK_SEL = '[data-task-item-key]';
const ACTIONS_SEL = '[data-task-row-actions]';
const SCAN_DEBOUNCE_MS = 300;    // 任务行相关 DOM 变动后的去抖
const RENAME_CTX_VALID_MS = 15000; // 右键任务行到菜单出现的有效窗口

let installed = false;
const runningKeys = new Set(); // 正在生成的会话键，防重复触发
let ctxKey = '';               // 最近右键的任务行键（菜单浮层不带行，靠它定位目标会话）
let ctxAt = 0;

function sessIdOf(key) {
  const i = key.lastIndexOf(':');
  return i > 0 ? key.slice(i + 1) : '';
}

async function runAutoRename(key) {
  const L = t();
  const sessId = sessIdOf(key);
  if (!sessId || runningKeys.has(key)) return;
  runningKeys.add(key);
  showToast(L.autoRenameWorking, 'info');
  try {
    const res = await rpc('/title-gen/rename', { method: 'POST', body: { sessId } }).catch(() => null);
    if (res && res.ok && res.title) {
      setRowTitle(key, res.title);
      void refreshPinnedTitles();
      showToast(L.autoRenameDone + res.title, 'success');
    } else {
      showToast((res && res.error) || L.failed, 'error');
    }
  } finally {
    runningKeys.delete(key);
  }
}

// 自动起名图标：四角星 + 小闪星（纯手绘路径，风格随所在按钮的 stroke 设置）
function sparklesSvg(cls) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  const star = document.createElementNS(ns, 'path');
  star.setAttribute('d', 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z');
  const spark = document.createElementNS(ns, 'path');
  spark.setAttribute('d', 'M19 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z');
  svg.append(star, spark);
  return svg;
}

// 悬浮按钮：官方操作区（悬停才渲染）出现即在归档按钮旁补挂。克隆归档按钮的
// 包装与样式，换图标与文案；注入节点被 React 重渲染抹掉后由观察器补回
async function injectHoverButtons() {
  const cfg = await getConfig();
  if (!cfg || !cfg.titleGen) return; // 配置没取到：不动现有按钮，等下一轮
  const enabled = cfg.titleGen.hoverBtn !== false;
  const L = t();
  for (const area of document.querySelectorAll(ACTIONS_SEL)) {
    const existing = area.querySelector('[data-zcodepro-item="auto-rename"]');
    if (!enabled) {
      existing?.remove();
      continue;
    }
    if (existing) continue;
    const row = area.closest(TASK_SEL);
    const key = row ? row.getAttribute('data-task-item-key') : '';
    if (!key) continue;
    const archive = area.querySelector('button[data-testid^="task-archive-"]');
    if (!archive) continue;
    const anchor = archive.closest('[data-slot="tooltip-trigger"]') || archive;
    const node = anchor.cloneNode(true);
    const btn = node.tagName === 'BUTTON' ? node : node.querySelector('button');
    if (!btn) continue;
    btn.removeAttribute('data-testid');
    btn.setAttribute('data-zcodepro-item', 'auto-rename');
    btn.setAttribute('aria-label', L.autoRenameItem);
    btn.setAttribute('title', L.autoRenameItem);
    btn.querySelector('svg')?.remove();
    btn.append(sparklesSvg('h-3.5 w-3.5'));
    btn.addEventListener('mousedown', (e) => e.stopPropagation()); // 不触发行拖拽
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation(); // 不触发行点击（切换会话）
      void runAutoRename(key);
    });
    anchor.parentNode.insertBefore(node, anchor);
  }
}

// 右键菜单注入：在“重命名任务”下方插入“自动重命名”（克隆同款菜单项样式）。
// Radix 只初始化一次菜单内容、重复打开复用同一节点，插入前查重
export function handleTaskRowMenu(content) {
  if (!ctxKey || Date.now() - ctxAt > RENAME_CTX_VALID_MS) return;
  if (content.querySelector('[data-zcodepro-item="auto-rename"]')) return;
  const anchor = itemsOf(content).find((el) => /^重命名|^rename/i.test(itemText(el)));
  if (!anchor) return;
  const key = ctxKey;
  void getConfig().then((cfg) => {
    if (!cfg || !cfg.titleGen || cfg.titleGen.menuEntry === false) return;
    if (content.querySelector('[data-zcodepro-item="auto-rename"]')) return; // 等配置期间已注入
    const L = t();
    const item = anchor.cloneNode(false);
    item.removeAttribute('id');
    item.removeAttribute('data-highlighted');
    item.setAttribute('data-zcodepro-item', 'auto-rename');
    item.textContent = L.autoRenameItem;
    item.addEventListener('mouseenter', () => {
      for (const el of content.querySelectorAll('[role="menuitem"]')) el.removeAttribute('data-highlighted');
      item.setAttribute('data-highlighted', '');
    });
    item.addEventListener('mouseleave', () => item.removeAttribute('data-highlighted'));
    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeRadixMenu(content); // 先关菜单再动手
      void runAutoRename(key);
    });
    anchor.after(item);
  });
}

export function startAutoRename() {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  // 右键记下目标会话（捕获阶段，菜单未弹出前）
  document.addEventListener('contextmenu', (e) => {
    const row = e.target instanceof Element && e.target.closest(TASK_SEL);
    ctxKey = row ? (row.getAttribute('data-task-item-key') || '') : '';
    ctxAt = Date.now();
  }, true);

  // 悬浮按钮按任务行相关变动去抖补挂（聊天区流式输出的高频变动在此滤掉）
  let scanTimer = 0;
  const schedule = () => {
    if (scanTimer) return;
    scanTimer = setTimeout(() => { scanTimer = 0; void injectHoverButtons(); }, SCAN_DEBOUNCE_MS);
  };
  const inTaskRow = (node) => !!(node instanceof Element && node.closest && node.closest(TASK_SEL));
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (inTaskRow(m.target) || [...m.addedNodes].some((n) => inTaskRow(n))) { schedule(); return; }
    }
  }).observe(document.body, { childList: true, subtree: true });

  void injectHoverButtons();
  // 设置弹窗开关保存后立即生效（撤钮后补挂/移除按钮）
  window.addEventListener('zcodepro:config-changed', schedule);
}
