// 划词翻译面板：按住 Ctrl 拖选（可配置为“选中后敲一下 Ctrl”或 Alt+拖选）→
// 选区旁浮窗翻译。通道分两类：LLM（跟随会话 / 供应商×模型，带思考档位与
// 提示词预设）与机翻（helper 内置九家，凭据在设置页“翻译”标签填）。单词走
// LLM 出词典卡片，句子/段落经 SSE 流式出译文；有道机翻查单词带轻量词条。
// 后端是 helper 的 /translate* 端点（src/host/translate-lib.mjs）。
import { h, t, rpc, liveBoot, getConfig, errText } from '../core.js';
import { ensureStyle, showToast, openDialog, btnSmall } from '../ui.js';
import { copyToClipboard } from './copy-path.js';
import { openSettingsDialog } from './settings-dialog.js';
import { thinkingLabel, thinkingVariantsOf, resolveThinkingOptions, adaptThinking } from '../thinking-levels.js';

let installed = false;
let featureOn = true;
let cfg = null;       // /translate 配置（channel/promptId/prompts/panel/history/targetLang）
let providers = [];   // LLM 供应商表 [{id,name,models}]
let services = [];    // 机翻服务状态 [{id,configured}]
let panel = null;     // 面板根元素（关闭即移除）
let pinned = false;
let ctrlDown = false;
let altDown = false;
let ctrlTapUsed = false; // Ctrl 按住期间按过别的键/鼠标就不算“敲一下”
let currentAbort = null; // 在途翻译请求（新翻译开始时取消旧的）
let speakAudio = null;
let sessionInfo = null; // 当前会话的模型与档位（/translate/session-model）
let lastAnchor = null;   // 面板对应的选区矩形（尺寸变化后按它重新落位）
let selfDragging = false; // 用户正在拖动面板：期间不自动改位置

const MT_IDS = ['youdao', 'baidu', 'caiyun', 'deepl', 'deeplx', 'niu', 'tencent', 'aliyun', 'volc'];

function mtName(id) {
  const L = t();
  return L['translateMt' + id.charAt(0).toUpperCase() + id.slice(1)] || id;
}

async function loadState() {
  const c = await getConfig();
  featureOn = !(c && c.features && c.features.translate === false);
  const res = await rpc('/translate');
  if (res.ok && res.config) cfg = res.config;
  const sm = await rpc('/translate/session-model');
  if (sm.ok) sessionInfo = sm.session || null;
  const prov = await rpc('/translate/providers');
  if (prov.ok) {
    providers = Array.isArray(prov.providers) ? prov.providers : [];
    services = Array.isArray(prov.services) ? prov.services : [];
  }
}

export function startTranslatePanel() {
  if (installed) return;
  installed = true;
  void loadState();
  // 任何设置保存都会发这个事件：功能开关与翻译配置都借此刷新
  window.addEventListener('zcodepro:config-changed', () => { void loadState(); });
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('keyup', onKeyUp, true);
  document.addEventListener('mousedown', onMouseDown, true);
  document.addEventListener('mouseup', onMouseUp, true);
  window.addEventListener('blur', () => { ctrlDown = altDown = false; });
}

function onKeyDown(e) {
  // 输入法组合中一律放行（仓库统一约定），别抢组合过程中的按键
  if (e.isComposing) return;
  if (e.key === 'Control') { ctrlDown = true; ctrlTapUsed = false; return; }
  if (e.key === 'Alt') altDown = true;
  if (ctrlDown) ctrlTapUsed = true; // Ctrl 组合键（Ctrl+C 等）不算“敲一下”
  if (e.key === 'Escape' && panel) {
    // 设置等弹窗开着时让弹窗自己的 Esc 栈处理，别抢
    if (document.querySelector('.zcodepro-overlay')) return;
    e.preventDefault();
    hidePanel();
  }
}

function onKeyUp(e) {
  if (e.key === 'Control') {
    ctrlDown = false;
    // “选中后敲一下 Ctrl”触发：按下到松开之间没碰过别的键/鼠标才算敲一下
    if (ctrlTapUsed || !cfg || cfg.trigger?.mode !== 'ctrl-tap' || !featureOn) return;
    const sel = window.getSelection();
    const text = sel ? String(sel.toString()).trim() : '';
    // 面板内（如输入框）的选区不触发
    const inPanel = sel && sel.anchorNode && panel && panel.contains(sel.anchorNode);
    if (text && !inPanel) triggerFromSelection(sel);
    return;
  }
  if (e.key === 'Alt') altDown = false;
}

function onMouseDown(e) {
  if (e.button !== 0) return;
  if (ctrlDown) ctrlTapUsed = true; // Ctrl+点击/拖选都不算“敲一下”
}

function onMouseUp(e) {
  if (e.button !== 0) return;
  if (!featureOn || !cfg) return;
  if (panel && panel.contains(e.target)) return; // 面板内部的松开（含选中译文）不触发
  // 设置等 zcode-pro 弹窗开着时不动面板：用户是在设置里操作（改翻译配置），
  // 这时点任何地方都不该把面板关掉（面板此刻被降到设置遮罩之下，仍应保留）
  if (document.querySelector('.zcodepro-overlay')) return;
  const mode = cfg.trigger?.mode || 'ctrl-drag';
  // ctrl-tap 模式只认“敲一下 Ctrl”，选中过程的松开不触发
  if (mode === 'ctrl-tap') { hideIfNotPinned(); return; }
  const sel = window.getSelection();
  const text = sel ? String(sel.toString()).trim() : '';
  if (!text) { hideIfNotPinned(); return; }
  if (mode === 'ctrl-drag' && !ctrlDown) return;
  if (mode === 'alt-drag' && !altDown) return;
  triggerFromSelection(sel);
}

// 收起 ZCode 自带的选中菜单。菜单由 React 管理，不能删节点（会让 React 摘
// 节点时抛 removeChild 错误、整块会话区域崩掉）；清选区 + 派发 selectionchange
// 让官方自己卸载。必须在 React 提交本次渲染之后再执行：mouseup 时菜单还没
// 渲染出来，同步清选区后 React 照样把它挂上，所以分几拍补发
function dismissSelectionToolbar() {
  const once = () => {
    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount) sel.removeAllRanges();
      document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    } catch { /* ignore */ }
  };
  once();
  // React 的提交可能落在随后的几帧里：再补两次，确保菜单不会在之后冒出来
  requestAnimationFrame(() => {
    once();
    requestAnimationFrame(once);
  });
  setTimeout(once, 120);
}

function triggerFromSelection(sel) {
  const text = String(sel.toString()).trim();
  if (!text || [...text].length > 8000) return;
  if (!sel.rangeCount) return;
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  if (!rect || (!rect.width && !rect.height)) return;
  // 选区完全滚出视口（切会话、页面滚动后残留选区）时不弹面板，
  // 否则会贴着一个看不见的位置乱放
  if (rect.bottom < 0 || rect.top > window.innerHeight) return;
  ensurePanel(rect, text);
  // 面板已拿到文本和位置，再收起官方菜单（ctrl+双击/拖选都会弹出它）
  dismissSelectionToolbar();
}

// ———— 面板 ————

function hideIfNotPinned() { if (!pinned) hidePanel(); }
function hidePanel() {
  pinned = false;
  lastAnchor = null;
  selfDragging = false;
  if (currentAbort) currentAbort.abort();
  if (panel) {
    try { panel.__ro?.disconnect(); } catch { /* ignore */ }
    panel.remove();
    panel = null;
  }
}

// 供外部入口（会话选中工具栏的「翻译」按钮）打开面板并翻译指定文本。
// anchor 是选区矩形：面板贴在选区上方、尖角对准选区水平中心（照官方“添加注释”弹窗）
export function openTranslatePanelAt(anchor, text) {
  if (!text) return;
  ensurePanel(anchor, text);
}
export function closeTranslatePanel() { hidePanel(); }

function ensurePanel(anchor, text) {
  ensureStyle();
  // 每次划词前刷新配置：设置页里改过的通道/档位/提示词要立即生效，
  // 不能沿用上次打开面板时的旧缓存
  void loadState().then(() => {
    if (!panel) return;
    const old = panel.querySelector('.zcodepro-tr-toolbar');
    if (old) old.replaceWith(buildToolbar());
  });
  if (!panel) {
    panel = buildPanel();
    document.body.append(panel);
    // 面板内容是异步变化的（翻译中 → 词典卡片/流式译文 → 报错），高度会变。
    // 只在 append 那一刻量一次高度不够：量到的是空面板，内容撑高后就会压到
    // 文字上。跟随尺寸变化重新落位（拖动过的不再干预）
    lastAnchor = anchor || null;
    const ro = new ResizeObserver(() => {
      if (selfDragging || !lastAnchor || !panel) return;
      positionPanel(lastAnchor);
    });
    ro.observe(panel);
    panel.__ro = ro;
  }
  if (anchor) lastAnchor = anchor;
  positionPanel(lastAnchor);
  setInput(text);
  void runTranslation(text);
}

// 面板落位：贴在选区上方，尖角（.zcodepro-tr-arrow）水平对准选区中心。
// 上方放不下（或会盖住选区分太多）时翻到下方，尖角同步翻到面板顶部。
// 左右夹取到视口内，尖角位置按面板实际左边距反算，仍指着选区。
//
// 与选区的空隙按选区行高动态算（ARROW_H 尖角高 + 呼吸空间）：字号/行高在
// 设置里调过之后，这里的空隙自动跟着变，不会出现尖角压住文字。行高取选区
// 高度的近似值并封顶——多行选区的矩形高度是整块，不是行高，不能直接拿来做
// 空隙，否则空出大半屏。
//
// 注意：尖角是 absolute + 负偏移探出面板边界的，getBoundingClientRect 量不到
// 它。所以落位时要把 ARROW_H 单独算进间隙：面板边到选区边 = ARROW_H + 净空，
// 尖角正好占掉 ARROW_H，净空就是尖端到文字的实际距离。
const ARROW_H = 8;          // 与 ui.js 里 .zcodepro-tr-arrow 的 border 宽度一致
const MIN_CLEARANCE = 10;   // 尖端到文字的最小距离
const MAX_LINE_H = 32;      // 行高估算上限（多行选区防空隙过大）

function selectionGap(anchor) {
  const lineH = Math.min(anchor.height || 16, MAX_LINE_H);
  const clearance = Math.max(MIN_CLEARANCE, Math.round(lineH * 0.7));
  return { gap: ARROW_H + clearance, clearance };
}

function positionPanel(anchor) {
  if (!panel || !anchor) return;
  // 坐标必须是有限数：传进坏值（NaN/undefined）时 CSS 收到 NaNpx 会失效，
  // 面板落到默认位置（左上角）。宁可不定位也不跑偏
  const ok = (v) => Number.isFinite(v);
  if (!ok(anchor.left) || !ok(anchor.top) || !ok(anchor.width)) return;
  panel.style.visibility = 'hidden';
  requestAnimationFrame(() => {
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    const margin = 8;         // 视口最小边距
    const { gap } = selectionGap(anchor);
    const centerX = anchor.left + anchor.width / 2;
    // 竖直：优先上方；上方空间不够且下方更宽裕时翻到下方
    const spaceAbove = anchor.top - margin;
    const spaceBelow = window.innerHeight - anchor.bottom - margin;
    const placeAbove = spaceAbove >= r.height + gap || spaceAbove >= spaceBelow;
    const top = placeAbove ? Math.max(margin, anchor.top - gap - r.height) : Math.min(window.innerHeight - r.height - margin, anchor.bottom + gap);
    // 水平：面板中心对准选区中心，再夹取到视口内
    let left = centerX - r.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - r.width - margin));
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    panel.dataset.placement = placeAbove ? 'top' : 'bottom';
    delete panel.dataset.dragged; // 重新定位后恢复显示尖角
    // 尖角水平位置：相对面板左边，钳在圆角范围内（16px 内边距）
    const arrowX = Math.max(16, Math.min(centerX - left, r.width - 16));
    panel.style.setProperty('--tr-arrow-x', arrowX + 'px');
    panel.style.visibility = '';
  });
}

// 面板图标：与状态栏同一套 lucide 描边图标（16px、stroke-width 2、currentColor），
// 统一为纯色描边风格，不再混用彩色 emoji。路径取自 lucide 图标集
const TR_ICONS = {
  pin: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  edit: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  enter: '<path d="M20 4v7a4 4 0 0 1-4 4H4"/><path d="m9 10-5 5 5 5"/>',
  volume: '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>',
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/>',
  text: '<path d="M15 18H3"/><path d="M17 6H3"/><path d="M21 12H3"/>',
};
// 生成 lucide 描边图标；尺寸默认 14px（面板内按钮），颜色跟随 currentColor
function trIcon(name, size = 14) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.style.flexShrink = '0';
  svg.innerHTML = TR_ICONS[name] || '';
  return svg;
}

function iconBtn(icon, title, onClick) {
  return h('button', { type: 'button', class: 'zcodepro-tr-ibtn', title, 'aria-label': title, onClick }, trIcon(icon));
}

function buildPanel() {
  const L = t();
  pinned = false;
  const root = h('div', {
    class: 'zcodepro-translate-panel',
    role: 'dialog',
    'data-theme': (cfg?.panel?.theme) || 'follow', // follow=跟随宿主主题，light/dark 强制
    // 尺寸：宽度用设置值；高度优先用用户拖拽记住的像素值，没设过才按 maxHeightPct 自适应
    style: (() => {
      const pw = (cfg?.panel?.width) || 450;
      const ph = Number(cfg?.panel?.height) || 0;
      const mh = (cfg?.panel?.maxHeightPct) || 80;
      return ph > 0
        ? `width:${pw}px;height:${ph}px;max-height:${mh}vh`
        : `width:${pw}px;max-height:${mh}vh`;
    })(),
  });
  const head = h('div', { class: 'zcodepro-tr-head' },
    h('span', { class: 'zcodepro-tr-title' }, L.translateTitle),
    h('div', { class: 'zcodepro-tr-headbtns' },
      iconBtn('pin', L.translatePin, () => { pinned = !pinned; showToast(pinned ? L.translatePinned : L.translateUnpinned, 'info'); }),
      iconBtn('history', L.translateHistory, () => { void showHistory(); }),
      iconBtn('settings', L.translateSettings, () => {
        // 设置弹窗遮罩是 z-50，翻译面板在最高层（2147483000）会压住它。
        // 按用户要求保留面板、把设置抬到上方：打开期间把面板降到遮罩之下，
        // 设置关闭后恢复；面板本身不隐藏
        if (panel) {
          panel.style.zIndex = '40';
          const restore = () => {
            if (panel) panel.style.zIndex = '';
            window.removeEventListener('zcodepro:settings-closed', restore);
          };
          window.addEventListener('zcodepro:settings-closed', restore);
        }
        openSettingsDialog('translate');
      }),
      iconBtn('close', L.close, () => { hidePanel(); })));
  // 拖动：head 上按下（按钮除外）移动整面板
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const r = root.getBoundingClientRect();
    const ox = e.clientX - r.left;
    const oy = e.clientY - r.top;
    selfDragging = true;
    const move = (ev) => {
      root.style.left = Math.max(0, Math.min(ev.clientX - ox, window.innerWidth - 60)) + 'px';
      root.style.top = Math.max(0, Math.min(ev.clientY - oy, window.innerHeight - 40)) + 'px';
      // 手动拖动后尖角不再对准选区，隐藏它（避免指向错误位置）
      root.dataset.dragged = '1';
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      // 拖动结束后仍保持用户放的位置（直到下次划词），所以 lastAnchor 一并清空：
      // 后续尺寸变化不再把面板拉回选区旁
      selfDragging = false;
      lastAnchor = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    e.preventDefault();
  });
  // 尖角：CSS 画的小三角，指向选中的文字（--tr-arrow-x 由 positionPanel 反算）
  const arrow = h('div', { class: 'zcodepro-tr-arrow', 'aria-hidden': 'true' });
  // 缩放入口：面板四边与四角都能拖（透明覆盖层，没有可见图标）。
  // dir 是允许缩放的方向组合，如 'n'（只改上边）、'se'（右下角）、'e'（右边）。
  // 改左边/上边时同步移动面板位置，视觉上就是那一条边在跟着鼠标走。
  const edges = [
    ['n', 'top:0;left:8px;right:8px;height:5px;cursor:ns-resize'],
    ['s', 'bottom:0;left:8px;right:8px;height:5px;cursor:ns-resize'],
    ['w', 'left:0;top:8px;bottom:8px;width:5px;cursor:ew-resize'],
    ['e', 'right:0;top:8px;bottom:8px;width:5px;cursor:ew-resize'],
    ['nw', 'left:0;top:0;width:12px;height:12px;cursor:nwse-resize'],
    ['ne', 'right:0;top:0;width:12px;height:12px;cursor:nesw-resize'],
    ['sw', 'left:0;bottom:0;width:12px;height:12px;cursor:nesw-resize'],
    ['se', 'right:0;bottom:0;width:12px;height:12px;cursor:nwse-resize'],
  ];
  const MIN_W = 240;
  const MIN_H = 140;
  const edgeEls = edges.map(([dir, css]) => {
    const el = h('div', { class: 'zcodepro-tr-edge', 'data-dir': dir, 'aria-hidden': 'true', style: css + ';z-index:3' });
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const r = root.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = r.width;
      const startH = r.height;
      const startLeft = r.left;
      const startTop = r.top;
      const hasN = dir.includes('n');
      const hasS = dir.includes('s');
      const hasW = dir.includes('w');
      const hasE = dir.includes('e');
      selfDragging = true; // 缩放期间不让 ResizeObserver 把面板拉回选区
      let w = startW;
      let h = startH;
      let left = startLeft;
      let top = startTop;
      const move = (ev) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (hasE) w = Math.max(MIN_W, Math.min(startW + dx, window.innerWidth - startLeft - 8));
        if (hasS) h = Math.max(MIN_H, Math.min(startH + dy, window.innerHeight - startTop - 8));
        if (hasW) {
          // 拖左边：左边界跟鼠标走，宽度反向变化，右边界保持不动
          const maxDx = startW - MIN_W;
          const clampedDx = Math.min(dx, maxDx);            // 不让宽度小于下限
          left = Math.max(8, startLeft + clampedDx);
          w = startW - (left - startLeft);                  // 实际宽度按夹取后的左边界算
        }
        if (hasN) {
          const maxDy = startH - MIN_H;
          const clampedDy = Math.min(dy, maxDy);
          top = Math.max(8, startTop + clampedDy);
          h = startH - (top - startTop);
        }
        root.style.left = left + 'px';
        root.style.top = top + 'px';
        root.style.width = w + 'px';
        root.style.height = h + 'px';
        root.dataset.dragged = '1'; // 手动改过尺寸后尖角不再对准选区
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        selfDragging = false;
        lastAnchor = null;
        void rpc('/translate', { method: 'POST', body: { config: { panel: { ...(cfg?.panel || {}), width: Math.round(w), height: Math.round(h) } } } })
          .then((res) => { if (res.ok && res.config) cfg = res.config; });
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    return el;
  });
  root.append(arrow, head, buildToolbar(), buildInputRow(), h('div', { class: 'zcodepro-tr-body' }), ...edgeEls);
  return root;
}

// 通道下拉值：“session” | 供应商 id | “mt:<服务id>”
function channelValue() {
  const ch = cfg?.channel || {};
  return ch.type === 'mt' ? ('mt:' + (ch.service || 'deepl')) : (ch.provider || 'session');
}

function buildToolbar() {
  const L = t();
  const ch = cfg?.channel || {};
  const box = h('div', { class: 'zcodepro-tr-toolbar' });

  const channelSel = h('select', { class: 'zcodepro-tr-select' },
    h('optgroup', { label: L.translateChannelLlm },
      h('option', { value: 'session', selected: ch.type === 'llm' && (!ch.provider || ch.provider === 'session') }, L.translateChannelSession),
      ...providers.map((p) => h('option', { value: p.id, selected: ch.type === 'llm' && ch.provider === p.id }, p.name || p.id))),
    h('optgroup', { label: L.translateChannelMt },
      ...MT_IDS.map((id) => {
        const st = services.find((s) => s.id === id);
        return h('option', { value: 'mt:' + id, selected: ch.type === 'mt' && ch.service === id },
          mtName(id) + (st && !st.configured ? '（' + L.translateUnconfigured + '）' : ''));
      })));
  channelSel.addEventListener('change', () => {
    const v = channelSel.value;
    const next = v.startsWith('mt:')
      ? { type: 'mt', provider: 'session', model: '', thinking: 'off', service: v.slice(3) }
      : { type: 'llm', provider: v, model: '', thinking: ch.thinking || 'off', service: ch.service || 'deepl' };
    void persistChannel(next, true);
  });

  const items = [channelSel];

  // 模型：LLM 且非跟随会话时显示（模型表为空给手输框）
  if (ch.type === 'llm' && ch.provider && ch.provider !== 'session') {
    const entry = providers.find((p) => p.id === ch.provider);
    const models = (entry && Array.isArray(entry.models)) ? entry.models : [];
    if (models.length) {
      const modelSel = h('select', { class: 'zcodepro-tr-select' },
        ...models.map((m) => h('option', { value: m, selected: ch.model === m }, m)));
      // 换模型必须重建工具栏：思考档位跟着所选模型变
      modelSel.addEventListener('change', () => { void persistChannel({ ...ch, model: modelSel.value }, true); });
      items.push(modelSel);
    } else {
      const modelIn = h('input', { type: 'text', class: 'zcodepro-tr-input', value: ch.model || '', placeholder: L.translateModelEmpty, style: 'max-width:150px' });
      modelIn.addEventListener('change', () => { void persistChannel({ ...ch, model: modelIn.value.trim() }, true); });
      items.push(modelIn);
    }
  }

  // 思考档位与提示词：仅 LLM 通道
  if (ch.type !== 'mt') {
    // 思考档位随所选模型变化；跟随会话当前模型时用会话那个模型的档位，
    // 且把配置里的档位自适应映射到该模型支持的档位（如 max → enabled）
    const opts = resolveThinkingOptions(providers, ch, sessionInfo);
    const thinkSel = h('select', {
      class: 'zcodepro-tr-select',
      title: opts.unsupported ? L.translateThinkingUnsupported
        : (opts.sessionModelId ? L.translateThinkingFollowSession.replaceAll('{model}', opts.sessionModelId) : L.translateThinking),
      disabled: opts.unsupported ? true : undefined,
    },
    ...opts.variants.map((k) => h('option', { value: k, selected: opts.display === k }, thinkingLabel(k, L))));
    thinkSel.addEventListener('change', () => { void persistChannel({ ...ch, thinking: thinkSel.value }); });
    items.push(thinkSel);

    const promptSel = h('select', { class: 'zcodepro-tr-select', title: L.translatePrompt },
      ...(cfg?.prompts || []).map((p) => h('option', { value: p.id, selected: (cfg?.promptId) === p.id }, p.name || p.id)));
    promptSel.addEventListener('change', async () => {
      const res = await rpc('/translate', { method: 'POST', body: { config: { promptId: promptSel.value } } });
      if (res.ok && res.config) cfg = res.config;
      retryCurrent();
    });
    items.push(promptSel);
    items.push(h('button', { type: 'button', class: 'zcodepro-tr-ibtn', title: L.translatePromptEdit, onClick: () => { void editPrompt(); } }, trIcon('edit')));
  }

  box.replaceChildren(...items);
  return box;
}

function buildInputRow() {
  const L = t();
  const input = h('input', { type: 'text', class: 'zcodepro-tr-input', placeholder: L.translateInputPh });
  input.addEventListener('keydown', (e) => {
    e.stopPropagation(); // 别让面板输入的按键被全局监听拿去
    if (e.key === 'Enter' && input.value.trim()) {
      ensurePanelOpenNearInput(input);
      void runTranslation(input.value.trim());
    }
  });
  const row = h('div', { class: 'zcodepro-tr-inputrow' }, input,
    h('button', { type: 'button', class: 'zcodepro-tr-ibtn', title: L.translateGo, onClick: () => {
      if (input.value.trim()) { ensurePanelOpenNearInput(input); void runTranslation(input.value.trim()); }
    } }, trIcon('enter')));
  return row;
}

function ensurePanelOpenNearInput(input) {
  // 面板已关（钉住被关后输入行不存在）时不会走到这；这里只需保证可见
  if (!panel) return;
  const r = input.getBoundingClientRect();
  if (r.top < 0 || r.bottom > window.innerHeight) panel.scrollIntoView({ block: 'nearest' });
}

function setInput(text) {
  const input = panel?.querySelector('.zcodepro-tr-inputrow input');
  if (input) input.value = text;
}

function currentText() {
  const input = panel?.querySelector('.zcodepro-tr-inputrow input');
  return input ? String(input.value || '').trim() : '';
}

function retryCurrent() {
  const text = currentText();
  if (text) void runTranslation(text);
}

async function persistChannel(next, rerender) {
  // 保存前把思考档位规整到该模型支持的范围内：换模型时原档位可能不存在
  // （如从 GLM 的 max 换到只有开关的 MiMo），留着无效值会让后端每次降级
  let toSave = next;
  if (next && next.type !== 'mt') {
    const opts = resolveThinkingOptions(providers, next, sessionInfo);
    if (opts.current !== next.thinking) toSave = { ...next, thinking: opts.current };
  }
  const res = await rpc('/translate', { method: 'POST', body: { config: { channel: toSave } } });
  if (res.ok && res.config) cfg = res.config;
  else showToast(t().failed + ': ' + errText(res), 'error');
  if (rerender && panel) {
    const old = panel.querySelector('.zcodepro-tr-toolbar');
    const fresh = buildToolbar();
    if (old) old.replaceWith(fresh);
    retryCurrent();
  }
}

// 提示词编辑（可改可新增）：名称 + 内容，保存写回 prompts 与 promptId
async function editPrompt() {
  const L = t();
  const current = (cfg?.prompts || []).find((p) => p.id === cfg?.promptId) || { id: '', name: '', prompt: '' };
  openDialog({
    title: L.translatePromptEditTitle,
    width: 'sm:max-w-lg',
    onMount: async ({ body, close }) => {
      const nameIn = h('input', { type: 'text', value: current.name || '', placeholder: L.translatePromptName, class: 'zcodepro-tr-input' });
      const textIn = h('textarea', { class: 'zcodepro-tr-textarea', rows: '8' });
      textIn.value = current.prompt || '';
      const hint = h('div', { class: 'zcodepro-tr-hint' }, L.translatePromptHint);
      body.append(
        h('div', { class: 'mb-2' }, nameIn),
        textIn,
        hint,
        h('div', { class: 'mt-3 flex justify-end gap-2' },
          h('button', { type: 'button', class: 'zcodepro-tr-ibtn', onClick: () => close() }, L.cancel),
          h('button', {
            type: 'button',
            class: 'zcodepro-tr-ibtn zcodepro-tr-ibtn-primary',
            onClick: async () => {
              const name = nameIn.value.trim();
              const prompt = textIn.value.trim();
              if (!name || !prompt) { showToast(L.translatePromptRequired, 'warning'); return; }
              const prompts = (cfg?.prompts || []).slice();
              // 改了名称 = 另存为新预设（与提示一致，原预设不动）；名称没改 = 就地更新
              const renamed = !!current.id && name !== current.name;
              const id = renamed || !current.id ? ('c' + Date.now().toString(36)) : current.id;
              const idx = prompts.findIndex((p) => p.id === id);
              if (idx >= 0) prompts[idx] = { ...prompts[idx], name, prompt };
              else prompts.push({ id, name, prompt });
              const res = await rpc('/translate', { method: 'POST', body: { config: { prompts, promptId: id } } });
              if (res.ok && res.config) {
                cfg = res.config;
                if (panel) {
                  const old = panel.querySelector('.zcodepro-tr-toolbar');
                  if (old) old.replaceWith(buildToolbar());
                }
                close();
                retryCurrent();
              } else {
                showToast(L.failed + ': ' + errText(res), 'error');
              }
            },
          }, L.translateSave)));
    },
  });
}

// ———— 翻译执行与渲染 ————

function bodyEl() { return panel?.querySelector('.zcodepro-tr-body'); }

function renderLoading() {
  const L = t();
  const el = bodyEl();
  if (el) el.replaceChildren(h('div', { class: 'zcodepro-tr-loading' }, L.translateLoading));
}

function renderError(msg) {
  const L = t();
  const el = bodyEl();
  if (el) el.replaceChildren(
    h('div', { class: 'zcodepro-tr-err' }, msg || L.translateFailed),
    h('div', { class: 'zcodepro-tr-actions' },
      h('button', { type: 'button', class: 'zcodepro-tr-ibtn', onClick: () => { retryCurrent(); } }, L.translateRetry)));
}

function copyBtn(text) {
  const L = t();
  return h('button', {
    type: 'button', class: 'zcodepro-tr-ibtn',
    onClick: async () => { if (await copyToClipboard(text)) showToast(L.translateCopied, 'success'); },
  }, L.translateCopy);
}

function speakBtn(text, ttsUrl) {
  const L = t();
  return h('button', { type: 'button', class: 'zcodepro-tr-ibtn', title: L.translateSpeak, onClick: () => speak(text, ttsUrl) }, trIcon('volume'));
}

function speak(text, ttsUrl) {
  try {
    if (ttsUrl) {
      if (speakAudio) speakAudio.pause();
      speakAudio = new Audio(ttsUrl);
      void speakAudio.play();
      return;
    }
    if (!text || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = /[\u4e00-\u9fff]/.test(text) ? 'zh-CN' : 'en-US';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch { /* ignore */ }
}

// 词典卡片（LLM 单词 / 有道 basic 词条共用）
function renderDict(dict) {
  const L = t();
  const el = bodyEl();
  if (!el || !dict) return;
  // 模型没按 JSON 给词条时落到空卡片：明确提示，不显示一张只有单词的空壳
  const hasContent = (dict.senses || []).length || (dict.examples || []).length || (dict.forms || []).length;
  if (!hasContent) {
    el.replaceChildren(
      h('div', { class: 'zcodepro-tr-empty' }, L.translateEmpty),
      h('div', { class: 'zcodepro-tr-actions' },
        h('button', { type: 'button', class: 'zcodepro-tr-ibtn', onClick: () => { retryCurrent(); } }, L.translateRetry)));
    return;
  }
  const head = h('div', { class: 'zcodepro-tr-wordrow' },
    h('span', { class: 'zcodepro-tr-word' }, dict.word || ''),
    dict.phonetic?.uk ? h('span', { class: 'zcodepro-tr-phon' }, 'uk /' + dict.phonetic.uk + '/') : null,
    dict.phonetic?.us ? h('span', { class: 'zcodepro-tr-phon' }, 'us /' + dict.phonetic.us + '/') : null,
    speakBtn(dict.word || '', dict.tts || ''));
  const parts = [head];
  for (const s of (dict.senses || [])) {
    parts.push(h('div', { class: 'zcodepro-tr-defs' },
      s.pos ? h('span', { class: 'zcodepro-tr-pos' }, s.pos) : null,
      h('span', {}, (s.defs || []).join('；'))));
  }
  for (const ex of (dict.examples || [])) {
    parts.push(h('div', { class: 'zcodepro-tr-example' },
      h('div', {}, ex.src || ''),
      ex.dst ? h('div', { class: 'zcodepro-tr-example-dst' }, ex.dst) : null));
  }
  if ((dict.forms || []).length) {
    parts.push(h('div', { class: 'zcodepro-tr-forms' }, (dict.forms || []).join(' · ')));
  }
  const dictText = [
    dict.word,
    dict.phonetic?.uk ? '/' + dict.phonetic.uk + '/' : '',
    ...(dict.senses || []).map((s) => (s.pos ? s.pos + ' ' : '') + (s.defs || []).join('；')),
    ...(dict.examples || []).map((e) => e.src + (e.dst ? '\n' + e.dst : '')),
  ].filter(Boolean).join('\n');
  parts.push(h('div', { class: 'zcodepro-tr-actions' }, copyBtn(dictText)));
  el.replaceChildren(...parts);
}

// 译文区（句子/段落）；流式时增量更新同一节点。朗读/复制的按钮在创建时
// 就闭包引用 out 元素，点击时读实时文本，不再事后接线（避免双处理器）
function renderTransShell() {
  const L = t();
  const el = bodyEl();
  if (!el) return null;
  const src = h('div', { class: 'zcodepro-tr-src' });
  const out = h('div', { class: 'zcodepro-tr-out' });
  const meta = h('span', { class: 'zcodepro-tr-meta' });
  el.replaceChildren(src, out,
    h('div', { class: 'zcodepro-tr-actions' }, meta,
      h('button', { type: 'button', class: 'zcodepro-tr-ibtn', onClick: () => { retryCurrent(); } }, L.translateRetry),
      h('button', { type: 'button', class: 'zcodepro-tr-ibtn', title: L.translateSpeak, onClick: () => speak(out.textContent, '') }, trIcon('volume')),
      h('button', {
        type: 'button', class: 'zcodepro-tr-ibtn',
        onClick: async () => {
          const text = String(out.textContent || '').trim();
          if (text && await copyToClipboard(text)) showToast(L.translateCopied, 'success');
        },
      }, L.translateCopy)));
  return { src, out, meta };
}

async function runTranslation(text) {
  const L = t();
  if (!cfg) await loadState();
  if (!cfg) { renderError('config unavailable'); return; }
  if (currentAbort) currentAbort.abort();
  const abort = new AbortController();
  currentAbort = abort;
  const ch = cfg.channel || {};
  const label = ch.type === 'mt' ? mtName(ch.service) : ((!ch.provider || ch.provider === 'session') ? (L.translateChannelSession + ' · ' + (ch.model || '')) : (ch.provider + ' · ' + (ch.model || '')));
  const reqBody = {
    text,
    channel: { type: ch.type, provider: ch.provider, model: ch.model, thinking: ch.thinking, service: ch.service },
    promptId: cfg.promptId,
    stream: ch.type !== 'mt',
  };
  renderLoading();
  const finish = async (kind) => {
    if (abort.signal.aborted) return;
    if (cfg.history?.enabled !== false) {
      void rpc('/translate/history', { method: 'POST', body: { text, kind, label } });
    }
  };
  try {
    if (reqBody.stream) {
      const ui = renderTransShell();
      let full = '';
      let handled = false; // 词典卡片等整段结果已渲染，外层不再做非空检查
      await rpcStream('/translate/do', reqBody, abort.signal, (evt) => {
        if (!ui || abort.signal.aborted) return;
        if (evt.type === 'meta') {
          ui.out.textContent = '';
          if (evt.sourceLang) ui.meta.textContent = evt.sourceLang;
        } else if (evt.type === 'delta') {
          full += evt.text || '';
          ui.out.textContent = full;
        } else if (evt.type === 'done') {
          full = evt.text || full;
          ui.out.textContent = full;
          wireTransActions(ui, { srcText: text, sourceLang: evt.sourceLang || '' });
        } else if (evt.type === 'result') {
          // 服务端回的是整段结果（单词词典卡片等）：直接按 kind 渲染
          const p = evt.payload || {};
          if (p.kind === 'dict') {
            handled = true;
            renderDict(p.dict);
            void finish('dict');
            return;
          }
          full = (p.trans && p.trans.text) || '';
          ui.out.textContent = full;
          wireTransActions(ui, { srcText: text, sourceLang: (p.trans && p.trans.sourceLang) || '' });
        } else if (evt.type === 'error') {
          throw new Error(evt.error || 'translate failed');
        }
      });
      if (!handled && !full.trim() && !abort.signal.aborted) throw new Error(L.translateEmpty);
      if (!handled) void finish('trans');
    } else {
      const res = await rpc('/translate/do', { method: 'POST', body: { ...reqBody, stream: false } });
      if (!res.ok) throw new Error(errText(res));
      if (res.kind === 'dict') {
        renderDict(res.dict);
        void finish('dict');
      } else {
        const ui = renderTransShell();
        if (ui) {
          ui.out.textContent = (res.trans && res.trans.text) || '';
          wireTransActions(ui, { srcText: text, sourceLang: (res.trans && res.trans.sourceLang) || '' });
        }
        void finish('trans');
      }
    }
  } catch (err) {
    if (abort.signal.aborted) return;
    if (err && err.name === 'AbortError') return;
    renderError(String((err && err.message) || err));
  }
}

// 译文区收尾：填原文折叠行与源语言标注（朗读/复制按钮无需再接线）
function wireTransActions(ui, { srcText, sourceLang }) {
  const L = t();
  if (!ui) return;
  ui.src.replaceChildren(
    h('details', { class: 'zcodepro-tr-details' },
      h('summary', {}, L.translateShowSource),
      h('div', { class: 'zcodepro-tr-src-text' }, srcText)));
  if (sourceLang) ui.meta.textContent = sourceLang;
}

async function rpcStream(path, body, signal, onEvent) {
  const boot = liveBoot();
  const resp = await fetch((boot.helperUrl || 'http://127.0.0.1:47889') + path, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'X-ZCodePro-Token': boot.token || '' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const j = await resp.json().catch(() => ({}));
    throw new Error((j && j.error) || ('HTTP ' + resp.status));
  }
  if (!(resp.headers.get('content-type') || '').includes('text/event-stream')) {
    // 服务端回了整段 JSON（单词词典卡片，或通道不支持流式）：包成 result
    // 事件交给上层，按 kind 分别渲染。不能丢弃——单词请求本来就不走 SSE
    const j = await resp.json().catch(() => ({}));
    if (j && j.ok === false) throw new Error(j.error || 'translate failed');
    onEvent({ type: 'result', payload: j });
    return;
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        try { onEvent(JSON.parse(payload)); } catch { /* 半截行忽略 */ }
      }
    }
  }
}

// ———— 历史 ————

async function showHistory() {
  const L = t();
  const el = bodyEl();
  if (!el) return;
  const res = await rpc('/translate/history');
  const items = res.ok && Array.isArray(res.items) ? res.items : [];
  if (!items.length) {
    el.replaceChildren(h('div', { class: 'zcodepro-tr-empty' }, L.translateNoHistory));
    return;
  }
  el.replaceChildren(...items.slice(0, 50).map((it) => h('div', {
    class: 'zcodepro-tr-histitem',
    title: it.text || '',
    onClick: () => {
      setInput(it.text || '');
      void runTranslation(String(it.text || ''));
    },
  },
  h('span', { class: 'zcodepro-tr-histtime' }, new Date(it.t || Date.now()).toLocaleTimeString()),
  h('span', { class: 'zcodepro-tr-histtext' }, trIcon(it.kind === 'dict' ? 'book' : 'text', 12), ' ', it.text || ''))));
}
