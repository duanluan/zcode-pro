// 会话选中文本的浮动工具栏增强：在官方「注释」按钮右侧插入「翻译」按钮。
// 官方工具栏结构（3.16.x 实测）：
//   div[data-conversation-selection-tooltip](fixed z-50，官方内联 left/top)
//     ├ button[data-conversation-selection-action="comment"]        「注释」
//     ├ div.w-px.bg-border                                          分隔线
//     └ button[data-conversation-selection-action="ask-in-side-chat"]「在辅助对话中提问」
// 工具栏是官方 React 渲染的，生命周期由它自己管：这里只在它出现时补一个按钮，
// 它重建/移除时跟着消失（按钮挂在同一容器里，不持有跨渲染状态）。
// 点击后走和划词面板相同的翻译流程（helper 的 /translate/do），面板浮在按钮附近。
import { h, t, rpc, getConfig } from '../core.js';
import { showToast } from '../ui.js';
import { openTranslatePanelAt, closeTranslatePanel } from './translate-panel.js';

let installed = false;
let enabled = true;
const MARK = 'data-zcodepro-translate-btn';

async function refreshEnabled() {
  try {
    const cfg = await getConfig();
    enabled = !(cfg && cfg.features && cfg.features.translate === false);
  } catch { /* 配置读不到时按开启处理（与默认值一致） */ }
}

// 选区文本与矩形：官方工具栏是基于当前选区出现的。点击时现取即可——实测
// click 触发时选区仍完整（pointerdown 被官方拦掉，收不到，所以不依赖它）
function currentSelection() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return { text: '', rect: null };
  const text = String(sel.toString()).trim();
  const rect = text ? sel.getRangeAt(0).getBoundingClientRect() : null;
  return { text, rect };
}

// h() 用 createElement，建出的 <svg> 在 HTML 命名空间里不渲染：SVG 必须用
// createElementNS 建（settings-dialog 的标题图标同款做法）
function svgIcon(paths, cls) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('xmlns', ns);
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

// 关闭官方选中菜单：菜单是 React 管理的节点，直接 remove() 会让 React 之后
// 摘节点时抛 “removeChild ... is not a child of this node”，整个会话区域崩掉
// （实测过）。正确做法是让官方自己收：清掉选区并派发 selectionchange，React
// 收到后自行卸载菜单，DOM 树保持由 React 独占。分几拍补发，覆盖 React 在
// 本次事件之后才提交渲染的情况（否则菜单会在我们关完后又冒出来）
function dismissToolbar() {
  const once = () => {
    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount) sel.removeAllRanges();
      document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    } catch { /* ignore */ }
  };
  once();
  requestAnimationFrame(() => {
    once();
    requestAnimationFrame(once);
  });
  setTimeout(once, 120);
}

function injectButton(tooltip) {
  if (!enabled) return;
  if (tooltip.querySelector('[' + MARK + ']')) return;
  const anchor = tooltip.querySelector('[data-conversation-selection-action="comment"]');
  // 找不到「注释」就不动：官方结构变了时宁可不加，也不插到奇怪的位置
  if (!anchor) return;

  const btn = h('button', {
    type: 'button',
    [MARK]: '1',
    // 复刻官方「注释」按钮的排版（padding/gap/hover 用官方同款工具类）
    class: 'flex min-w-0 items-center gap-1 px-2.5 py-1.5 hover:bg-menu-hover',
    title: t().translateToolbarTitle,
  },
  // 图标与文字间不留空档：图标存在时用官方同款 gap-1；无图标只剩文字
  svgIcon(['m5 8 6 6', 'm4 14 6-6 2-3', 'M2 5h12', 'M7 2h1', 'm22 22-5-10-5 10', 'M14 18h6'], 'size-3.5 shrink-0 text-foreground-subtle'),
  h('span', {}, t().translateToolbarLabel));

  // 事件注册：官方在捕获阶段就对 click 调 stopPropagation（实测我们的冒泡
  // 监听器一次都没触发，事件根本到不了目标），所以必须用捕获阶段监听器。
  // h() 只能挂冒泡，这里手动加
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const cur = currentSelection();
    const text = cur.text;
    const raw = cur.rect;
    if (!text) return;
    // DOMRect 的 left/top/width 等都是原型上的 getter，展开运算符拷不到
    // （{ ...domRect } 得到空对象），必须逐字段读出来
    let rect = raw
      ? { left: raw.left, right: raw.right, top: raw.top, bottom: raw.bottom, width: raw.width, height: raw.height }
      : null;
    // 选区矩形可能超出视口（选中跨屏长段、页面滚动过）：官方工具栏能显示就
    // 说明选区可见，把矩形夹回视口内再落位，不因越界直接放弃
    if (rect) {
      const top = Math.max(0, Math.min(rect.top, window.innerHeight - 1));
      const bottom = Math.max(top, Math.min(rect.bottom, window.innerHeight));
      if (bottom <= 0 || top >= window.innerHeight) {
        // 完全不可见时才退回工具栏自身位置
        const tr = tooltip.getBoundingClientRect();
        rect = { left: tr.left, right: tr.right, top: tr.top, bottom: tr.bottom, width: tr.width, height: tr.height };
      } else {
        rect = { ...rect, top, bottom, height: Math.max(1, bottom - top) };
      }
    }
    closeTranslatePanel();
    openTranslatePanelAt(rect, text);
    // 弹出翻译面板后收起官方选中菜单（先取选区矩形再关，顺序不能反）
    dismissToolbar();
  }, true); // 捕获阶段
  // pointerdown 也拦一下，避免官方把它当成“点工具栏外部”而收起
  btn.addEventListener('pointerdown', (e) => e.stopPropagation(), true);

  // 结构：「注释」‖ 翻译 ‖「在辅助对话中提问」。
  // 官方原结构是 [注释][分隔线][辅助对话]。要拿到两条竖线，把翻译插在
  // 官方分隔线“之前”：先在锚点后插分隔线，再把翻译插到那条新分隔线前面，
  // 得到 [注释][新分隔线][翻译][官方分隔线][辅助对话]
  const sep = h('div', { class: 'w-px shrink-0 bg-border' });
  anchor.after(sep);
  sep.after(btn);
}

const TIP_SEL = '[data-conversation-selection-tooltip]';
let lastTip = null;

// 工具栏是官方弹层，出现/消失频繁：监听容器增删，命中就补按钮。
// 只用 MutationObserver 的变化记录做廉价判断（新增节点里是否带工具栏），
// 命中才查一次 DOM——界面流式输出时 body 变动极频繁，不能每次都全文档查询
function scan(records) {
  let maybe = false;
  for (const rec of records || []) {
    for (const node of rec.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.matches?.(TIP_SEL) || node.querySelector?.(TIP_SEL)) { maybe = true; break; }
    }
    if (maybe) break;
  }
  // 当前工具栏若已被官方移除，清掉引用（下次插入时重新注入）
  const cur = document.querySelector(TIP_SEL);
  if (cur !== lastTip) lastTip = cur;
  if (!maybe && !cur) return;
  if (!cur) return;
  injectButton(cur);
}

export function startSelectionToolbarTranslate() {
  if (installed) return;
  installed = true;
  void refreshEnabled();
  window.addEventListener('zcodepro:config-changed', () => { void refreshEnabled(); });
  const mo = new MutationObserver((records) => scan(records));
  mo.observe(document.body, { childList: true, subtree: true });
  scan([]);
}
