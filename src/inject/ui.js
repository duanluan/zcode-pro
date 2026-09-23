// ZCode 风格的弹窗与提示组件。
// 复用应用自身的 Tailwind 设计令牌（bg-surface、border-border、text-foreground 等），
// 因此自动适配亮/暗主题，与原生弹窗观感一致。
import { h, t } from './core.js';

let toastTimer = null;

export function showToast(text, kind = 'info') {
  document.getElementById('__zcodepro_toast__')?.remove();
  const el = h('div', {
    id: '__zcodepro_toast__',
    class: 'fixed bottom-6 right-6 z-[100] flex max-w-md items-center gap-2 rounded-lg border px-4 py-3 text-ui-sm shadow-lg ' +
      (kind === 'error' ? 'border-destructive/40 bg-menu text-foreground' : 'border-border bg-menu text-foreground'),
    style: 'animation:zcodepro-fade-in .18s ease',
  },
    h('span', { class: 'truncate' }, text));
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), kind === 'error' ? 5000 : 2600);
}

// 复用应用自身 AlertDialog 的真实类名组合（逆向自 app.asar 渲染层源码）：
// 遮罩 fixed inset-0 z-50 bg-black/60 + 毛玻璃 + Linux 下 top-12（让出自绘标题栏），
// 内容卡 rounded-2xl bg-popover/98 ring-border shadow-2xl。
// 注意：绝不能用 bg-surface 做面板底色——该 token 在应用里是 ~3% 不透明度的着色层（#0d0d0d08），
// 会导致整卡透明。关键视觉另在 ensureStyle 里以自有样式表兜底（ID 选择器 + 主题变量 + 字面量回退），
// 应用 Tailwind 类随版本更新变动时遮罩/面板仍能正确绘制。
const overlayClass = 'fixed inset-0 isolate z-50 flex items-center justify-center bg-black/60 supports-backdrop-filter:backdrop-blur-xs duration-100 p-4 platform-linux-desktop:top-12';
const overlayClassBare = 'fixed inset-0 isolate z-50 flex items-center justify-center duration-100 p-4 platform-linux-desktop:top-12';
const contentClass = 'w-full sm:max-w-md rounded-2xl border-none bg-popover/98 p-5 text-ui-base/relaxed text-foreground ring-border shadow-2xl';

// overlay: 'dim'（默认，半透明遮罩）| 'none'（透明遮罩）——设置弹窗用 'none'，方便边调样式边看会话。
// dismissOnOutside: 点弹窗外部是否关闭（默认 true）。为 false 时遮罩不再拦截鼠标，
// 可以直接操作弹窗后面的会话（滚动/选中），弹窗只通过关闭按钮或 Esc 关闭。
// draggable: 允许按住标题栏拖动弹窗。posKey: 记住拖动位置（localStorage）。
export function openDialog({ title, description, onMount, onClose, width = 'sm:max-w-md', overlay = 'dim', draggable = false, posKey = '', dismissOnOutside = true }) {
  const L = t();
  const prevActive = document.activeElement;
  let cleanupDrag = null;
  const close = () => {
    overlayEl.remove();
    document.removeEventListener('keydown', onKey);
    if (cleanupDrag) cleanupDrag();
    if (prevActive && prevActive.focus) { try { prevActive.focus(); } catch { /* ignore */ } }
    onClose && onClose();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
  };
  const content = h('div', {
    role: 'dialog',
    'aria-modal': 'true',
    id: 'zcodepro-card',
    class: contentClass.replace('sm:max-w-md', width),
  });
  const overlayEl = h('div', {
    id: 'zcodepro-overlay',
    'data-overlay': overlay,
    class: overlay === 'none' ? overlayClassBare : overlayClass,
    onMousedown: (e) => { if (dismissOnOutside && e.target === overlayEl) close(); },
  }, content);
  if (!dismissOnOutside) {
    overlayEl.style.pointerEvents = 'none';
    content.style.pointerEvents = 'auto';
  }

  const titleEl = h('h2', { class: 'text-lg font-semibold leading-none tracking-tight text-foreground' }, title);
  content.append(
    titleEl,
    // 注意不能把 null 直接传给 append：DOM 会把 null 渲染成字面量 "null" 文本
    ...(description ? [h('p', { class: 'mt-2 text-ui-sm/relaxed text-foreground-subtle' }, description)] : [])
  );
  const body = h('div', { class: 'mt-4' });
  content.append(body);
  if (draggable) {
    titleEl.style.cursor = 'move';
    titleEl.style.userSelect = 'none';
    let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
    const clampPos = (x, y) => {
      // 卡片在遮罩内居中，平移量不能超过卡片边缘到视口边缘的距离（留 8px 余量）
      const mx = Math.max(0, (window.innerWidth - content.offsetWidth) / 2 - 8);
      const my = Math.max(0, (window.innerHeight - content.offsetHeight) / 2 - 8);
      return [Math.min(mx, Math.max(-mx, x)), Math.min(my, Math.max(-my, y))];
    };
    const restore = () => {
      if (!posKey) return;
      try {
        const saved = JSON.parse(localStorage.getItem('zcodepro-dialog-pos:' + posKey) || 'null');
        if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
          [ox, oy] = clampPos(saved.x, saved.y);
          if (ox || oy) content.style.transform = `translate(${ox}px, ${oy}px)`;
        }
      } catch { /* ignore */ }
    };
    const onDown = (e) => {
      if (e.button !== 0) return;
      dragging = true;
      sx = e.clientX - ox; sy = e.clientY - oy;
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!dragging) return;
      [ox, oy] = clampPos(e.clientX - sx, e.clientY - sy);
      content.style.transform = `translate(${ox}px, ${oy}px)`;
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      if (posKey) {
        try { localStorage.setItem('zcodepro-dialog-pos:' + posKey, JSON.stringify({ x: ox, y: oy })); } catch { /* ignore */ }
      }
    };
    titleEl.addEventListener('mousedown', onDown);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    cleanupDrag = () => {
      titleEl.removeEventListener('mousedown', onDown);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    restore();
  }
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlayEl);
  try {
    onMount && onMount({ body, close, content });
  } catch (err) {
    console.error('[zcodepro] dialog onMount 失败:', err);
  }
  return { close };
}

export function dialogFooter(...buttons) {
  return h('div', { class: 'mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end' }, buttons);
}

export function btnSecondary(text, onClick, extra = '') {
  return h('button', {
    type: 'button',
    class: 'inline-flex h-9 items-center justify-center whitespace-nowrap rounded-lg border border-border bg-surface px-4 text-ui-sm font-medium text-foreground transition-colors hover:bg-surface-hover disabled:pointer-events-none disabled:opacity-50 ' + extra,
    onClick,
  }, text);
}

export function btnPrimary(text, onClick, extra = '') {
  return h('button', {
    type: 'button',
    class: 'inline-flex h-9 items-center justify-center whitespace-nowrap rounded-lg bg-primary px-4 text-ui-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 ' + extra,
    onClick,
  }, text);
}

export function textInput({ value = '', placeholder = '', onInput, onEnter, autofocus = true } = {}) {
  const input = h('input', {
    type: 'text',
    value,
    placeholder,
    class: 'h-9 w-full rounded-lg border border-border bg-input px-3 text-ui-sm text-foreground outline-none transition-shadow placeholder:text-foreground-subtle focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40',
  });
  if (onInput) input.addEventListener('input', onInput);
  if (onEnter) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') onEnter(); });
  if (autofocus) {
    const tryFocus = () => {
      if (!input.isConnected) return;
      input.focus();
      if (document.activeElement === input) input.select();
    };
    tryFocus();
    // 原生弹层（Radix 菜单等）关闭时会把焦点还给触发元素，可能晚于首次聚焦；
    // 分段检查：只要焦点落到弹窗外就收回输入框，用户点到弹窗内其他控件则不打扰。
    for (const ms of [120, 300, 600]) {
      setTimeout(() => {
        if (!input.isConnected) return;
        const dialog = input.closest('[role="dialog"]');
        if (dialog && !dialog.contains(document.activeElement)) tryFocus();
      }, ms);
    }
  }
  return input;
}

// 数字输入框（样式调整用，交互对齐 gemini-pro 的滚轮数字框）：
// 滚轮向上增大/向下减小（步进 step）、回车/失焦提交手输值、非法或越界回退到上次有效值。
// onCommit 只在值确定变化时回调；显示层始终是纯数字，单位由调用方放在框外标签。
export function numberField({ value = null, fallback = 0, min = 0, max = 48, step = 1, onCommit }) {
  let current = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const input = h('input', {
    type: 'text',
    inputmode: 'decimal',
    value: String(current),
    class: 'h-8 w-16 rounded-lg border border-border bg-input px-2 text-right text-ui-sm tabular-nums text-foreground outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40',
  });
  const clamp = (v) => Math.min(max, Math.max(min, v));
  const display = (v) => { input.value = String(v); };
  const commit = (v) => {
    const next = clamp(v);
    if (next === current) { display(next); return; }
    current = next;
    display(next);
    onCommit && onCommit(next);
  };
  // 滚轮调值（需 preventDefault，阻止页面滚动）；有小数步进时按 step 对齐
  input.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dir = (e.deltaY || 0) < 0 ? 1 : -1;
    const raw = current + dir * step;
    commit(step < 1 ? Math.round(raw / step) * step : Math.round(raw));
  }, { passive: false });
  // 手输：回车/失焦提交；非法或空回退
  const submitTyped = () => {
    const parsed = parseFloat(String(input.value).trim());
    if (!Number.isFinite(parsed)) { display(current); return; }
    commit(step < 1 ? Math.round(parsed / step) * step : parsed);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitTyped(); } });
  input.addEventListener('blur', submitTyped);
  return {
    el: input,
    set(v) { current = clamp(v); display(current); },
    reset() { current = fallback; display(current); },
    get() { return current; },
  };
}

// 数值+单位同框的输入框（内容宽度等需要 px/% 切换的设置项，交互对齐 gemini-pro）：
// 框内显示如「900px」「85%」；滚轮按单位各自步进（px 大步、% 小步）；
// 手输可带单位（缺省沿用当前单位），非法或越界回退。onCommit 回调 { value, unit }。
export function unitField({ value = null, fallback = { value: 100, unit: '%' }, step = { px: 10, '%': 1 }, onCommit }) {
  const RANGES = { px: [320, 3840], '%': [20, 100] };
  const norm = (v) => {
    if (!v || !RANGES[v.unit]) return null;
    const [min, max] = RANGES[v.unit];
    const n = v.unit === 'px' ? Math.round(v.value) : Math.round(v.value * 10) / 10;
    return Number.isFinite(n) ? { value: Math.min(max, Math.max(min, n)), unit: v.unit } : null;
  };
  let current = norm(value) || norm(fallback) || { value: 100, unit: '%' };
  const input = h('input', {
    type: 'text',
    inputmode: 'decimal',
    value: `${current.value}${current.unit}`,
    class: 'h-8 w-20 rounded-lg border border-border bg-input px-2 text-right text-ui-sm tabular-nums text-foreground outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40',
  });
  const display = () => { input.value = `${current.value}${current.unit}`; };
  const commit = (v) => {
    const next = norm(v);
    if (!next || (next.value === current.value && next.unit === current.unit)) { display(); return; }
    current = next;
    display();
    onCommit && onCommit({ ...current });
  };
  input.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dir = (e.deltaY || 0) < 0 ? 1 : -1;
    commit({ value: current.value + dir * (step[current.unit] || 1), unit: current.unit });
  }, { passive: false });
  const parseTyped = (s) => {
    const m = String(s).trim().match(/^(\d+(?:\.\d+)?)\s*(px|%)?$/i);
    if (!m) return null;
    return { value: parseFloat(m[1]), unit: (m[2] || current.unit).toLowerCase() === 'px' ? 'px' : '%' };
  };
  const submitTyped = () => {
    const parsed = parseTyped(input.value);
    if (!parsed) { display(); return; }
    commit(parsed);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitTyped(); } });
  input.addEventListener('blur', submitTyped);
  return {
    el: input,
    reset() { current = norm(fallback) || current; display(); },
    get() { return { ...current } },
  };
}

// 设置项行：名称 + 描述 + 开关
// 开关样式完全由 ensureStyle 中的自有规则驱动（几何/配色固定写入，
// 颜色取主题变量），不依赖应用的 Tailwind 工具类——v4 只为应用源码
// 实际用过的类生成 CSS，注入标记里"长得像"的类名不保证有样式。
export function settingRow(name, desc, checked, onToggle) {
  const knob = h('span', { class: 'zcodepro-switch-knob' });
  const track = h('span', {
    class: 'zcodepro-switch',
    'data-zcodepro-switch': '',
    'data-state': checked ? 'on' : 'off',
  }, knob);
  const row = h('div', {
    class: 'flex cursor-pointer items-start gap-3 rounded-lg p-3 transition-colors hover:bg-surface-hover',
    onClick: () => { onToggle(); },
  },
    h('div', { class: 'min-w-0 flex-1' },
      h('div', { class: 'text-ui-sm font-medium text-foreground' }, name),
      h('div', { class: 'mt-0.5 text-ui-xs/relaxed text-foreground-subtle' }, desc)),
    h('button', {
      type: 'button',
      role: 'switch',
      'aria-checked': String(checked),
      class: 'relative inline-flex shrink-0 cursor-pointer items-center',
    }, track));
  return row;
}

// 把一段 <style> 注入页面（弹窗关键视觉兜底 + toast 动画 keyframes）
export function ensureStyle() {
  if (document.getElementById('__zcodepro_style__')) return;
  const root = document.head || document.documentElement;
  if (!root) return;
  root.append(h('style', { id: '__zcodepro_style__' }, `
    @keyframes zcodepro-fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
    /* 弹窗遮罩/面板兜底：不依赖应用 Tailwind 类是否仍存在；主题色走 --color-* 变量，缺失时回退字面量 */
    #zcodepro-overlay { background-color: rgba(0, 0, 0, 0.6); }
    #zcodepro-overlay[data-overlay="none"] { background-color: transparent; }
    #zcodepro-card {
      background-color: var(--color-popover, #fff);
      border-radius: 16px;
      outline: none;
      box-shadow: 0 0 0 1px var(--color-border, rgba(0, 0, 0, 0.1)), 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    }
    /* 开关（设置弹窗）：几何固定写入，颜色随主题变量 */
    [data-zcodepro-switch] {
      position: relative;
      display: inline-flex;
      align-items: center;
      width: 32px;
      height: 18px;
      border-radius: 9999px;
      padding: 1px;
      transition: background-color 0.15s ease;
      background-color: color-mix(in oklab, var(--color-primary, #000) 30%, transparent);
    }
    [data-zcodepro-switch][data-state="on"] { background-color: var(--color-primary, #000); }
    .zcodepro-switch-knob {
      display: block;
      width: 16px;
      height: 16px;
      border-radius: 9999px;
      background-color: var(--color-primary-foreground, #fff);
      transition: transform 0.15s ease;
    }
    [data-zcodepro-switch][data-state="on"] .zcodepro-switch-knob { transform: translateX(14px); }
    /* 标签页切换（设置弹窗）：胶囊容器 + 激活高亮，视觉参考侧栏「分组/项目」切换；
       与开关同理，几何/配色写入自有规则并取主题变量，不依赖应用 Tailwind 类 */
    .zcodepro-tablist {
      display: inline-flex;
      align-items: center;
      height: 28px;
      padding: 2px;
      border-radius: 9999px;
      background-color: color-mix(in oklab, var(--color-foreground, #888) 8%, transparent);
    }
    .zcodepro-tab {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 24px;
      padding: 0 14px;
      border: none;
      border-radius: 9999px;
      background: transparent;
      cursor: pointer;
      font-size: 12px;
      line-height: 1;
      color: var(--color-muted-foreground, #888);
      transition: color 0.15s ease, background-color 0.15s ease;
    }
    .zcodepro-tab[data-state="active"] {
      background-color: var(--color-background, #fff);
      color: var(--color-foreground, #111);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
    }
    /* 全局提示词编辑框（设置弹窗）：与开关/标签页同理，几何/配色写入自有规则并取主题变量。
       边框用 border 而非 box-shadow：应用全局样式对 :focus/:focus-visible 强制
       box-shadow:none !important、outline:none !important，box-shadow 边框聚焦瞬间会被清掉；
       应用自身输入框的聚焦反馈同样只走 border 变色 */
    .zcodepro-textarea {
      display: block;
      width: 100%;
      min-height: 11rem;
      max-height: 22rem;
      resize: vertical;
      padding: 10px 12px;
      border: 1px solid var(--color-border, rgba(0, 0, 0, 0.12));
      border-radius: 10px;
      outline: none;
      background-color: var(--color-input, var(--color-popover, #fff));
      color: var(--color-foreground, #111);
      font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
      font-size: 12px;
      line-height: 1.6;
    }
    .zcodepro-textarea:focus-visible {
      border-color: var(--color-primary, #111);
    }
    .zcodepro-textarea::placeholder { color: var(--color-muted-foreground, #888); }
    .zcodepro-textarea:disabled { opacity: 0.5; }
    /* 行高滑杆（样式调整标签页） */
    .zcodepro-range {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 4px;
      border-radius: 9999px;
      background: color-mix(in oklab, var(--color-foreground, #888) 18%, transparent);
      outline: none;
    }
    .zcodepro-range::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 14px;
      height: 14px;
      border-radius: 9999px;
      background: var(--color-primary, #111);
      cursor: pointer;
    }
    /* 图片右键菜单项悬停高亮：同上不依赖应用 Tailwind hover 类是否存在 */
    .zcodepro-imgmenu-item { transition: background-color 0.12s ease; }
    .zcodepro-imgmenu-item:hover {
      background-color: var(--color-accent, color-mix(in oklab, var(--color-foreground, #888) 10%, transparent));
    }
  `));
}
