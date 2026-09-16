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
const contentClass = 'w-full sm:max-w-md rounded-2xl border-none bg-popover/98 p-5 text-ui-base/relaxed text-foreground ring-border shadow-2xl';

export function openDialog({ title, description, onMount, onClose, width = 'sm:max-w-md' }) {
  const L = t();
  const prevActive = document.activeElement;
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
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
  const overlay = h('div', {
    id: 'zcodepro-overlay',
    class: overlayClass,
    onMousedown: (e) => { if (e.target === overlay) close(); },
  }, content);

  content.append(
    h('h2', { class: 'text-lg font-semibold leading-none tracking-tight text-foreground' }, title),
    // 注意不能把 null 直接传给 append：DOM 会把 null 渲染成字面量 "null" 文本
    ...(description ? [h('p', { class: 'mt-2 text-ui-sm/relaxed text-foreground-subtle' }, description)] : [])
  );
  const body = h('div', { class: 'mt-4' });
  content.append(body);
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
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
  `));
}
