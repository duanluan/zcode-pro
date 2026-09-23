// 图片右键「复制图片」：覆盖会话内容列（[data-v4-timeline-content-column]）里的图片与
// 点击放大的预览弹窗（role=dialog 内的大图），复制到系统剪贴板。
// 按渲染尺寸过滤行内技术图标（material-icons 约 16px）；blob:/data:/file: 源经 fetch 取 blob，
// 取不到回退 canvas，非 PNG 一律经 canvas 转 PNG（剪贴板只可靠支持 image/png）。
import { h, t, getConfig } from '../core.js';
import { showToast } from '../ui.js';

const MIN_SIZE = 48; // 过滤行内小图标（真实截图/照片远大于此值）

// 复制目标判定：target 是会话内容列或弹窗内的 <img> 且渲染尺寸达标。
// 预览大图上方常有透明交互层（缩放/拖拽捕获），右键的 target 不是 img 本身，
// 此时在弹窗内按坐标找被命中的图片（取面积最大者，避免命中角落装饰图）。
function copyTargetOf(el, x, y) {
  const sizeOk = (img) => {
    const r = img.getBoundingClientRect();
    return Math.min(r.width, r.height) >= MIN_SIZE;
  };
  if (el instanceof HTMLImageElement) {
    if (!el.closest('[data-v4-timeline-content-column]') && !el.closest('[role="dialog"]')) return null;
    return sizeOk(el) ? el : null;
  }
  if (!(el instanceof Element)) return null;
  const dialog = el.closest('[role="dialog"]');
  if (!dialog) return null;
  let best = null;
  for (const img of dialog.querySelectorAll('img')) {
    const r = img.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
    if (!sizeOk(img)) continue;
    const area = r.width * r.height;
    if (!best || area > best.area) best = { img, area };
  }
  return best ? best.img : null;
}

let menuEl = null;
let hideMenu = () => {};

function showMenu(x, y, img) {
  hideMenu();
  const L = t();
  // 菜单打开时就预取图片数据：点击复制时若图片已被卸载（如弹窗关闭）仍可完成
  const preBlob = fetchImageBlob(img);
  menuEl = h('div', {
    role: 'menu',
    class: 'fixed rounded-xl border border-border bg-menu p-1 text-ui-sm text-foreground',
    style: 'z-index:2147483000;min-width:9rem;box-shadow:0 10px 30px rgba(0,0,0,.18);pointer-events:auto',
  },
    h('div', {
      role: 'menuitem',
      tabindex: '0',
      class: 'zcodepro-imgmenu-item flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-1.5',
      onClick: () => {
        hideMenu();
        void copyImage(img, preBlob);
      },
    },
      hCopyIcon(),
      document.createTextNode(L.imageCopy)));
  document.body.append(menuEl);
  const r = menuEl.getBoundingClientRect();
  menuEl.style.left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8)) + 'px';
  menuEl.style.top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) + 'px';

  const onPointerDown = (e) => {
    if (menuEl && menuEl.contains(e.target)) {
      // 菜单内的按下交给菜单项自身 click 处理；stopPropagation 防止预览弹窗
      // （Radix「点击外部关闭」）连带关闭、图片被卸载导致复制落空
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    hideMenu();
  };
  const onKeyDown = (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    hideMenu(); // 只负责收起菜单；预览弹窗自身的 Esc 关闭不受影响
  };
  hideMenu = () => {
    if (menuEl) { menuEl.remove(); menuEl = null; }
    window.removeEventListener('blur', hideMenu);
    window.removeEventListener('resize', hideMenu);
    document.removeEventListener('scroll', hideMenu, true);
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
    hideMenu = () => {};
  };
  window.addEventListener('blur', hideMenu);
  window.addEventListener('resize', hideMenu);
  document.addEventListener('scroll', hideMenu, true);
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onKeyDown, true);
}

// 取图片二进制：blob:/data:/file: 源走 fetch，失败或非图片时回退 canvas
async function fetchImageBlob(img) {
  const src = img.currentSrc || img.src || '';
  if (src) {
    try {
      const resp = await fetch(src);
      if (resp.ok) {
        const blob = await resp.blob();
        if (/^image\//.test(blob.type)) return blob;
      }
    } catch { /* 跨域等场景回退 canvas */ }
  }
  return await fromCanvas(img);
}

async function copyImage(img, preBlob) {
  const L = t();
  try {
    let blob = await (preBlob || fetchImageBlob(img));
    if (!blob) throw new Error('empty image');
    if (blob.type !== 'image/png') blob = await toPng(blob);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    showToast(L.imageCopied);
  } catch {
    // 部分 Electron/Linux 组合上 navigator.clipboard 写图片报 DataError（写文本正常），
    // 回退 execCommand：选中 <img> 后复制，Chromium 会把图片本体写入剪贴板
    if (copyViaSelection(img)) showToast(L.imageCopied);
    else showToast(L.imageCopyFailed, 'error');
  }
}

function copyViaSelection(img) {
  try {
    // 预览大图带 select-none（user-select:none），复制期间临时改为可选中
    const prevSelect = img.style.userSelect;
    img.style.userSelect = 'text';
    const range = document.createRange();
    range.selectNode(img);
    const sel = window.getSelection();
    const saved = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    sel.removeAllRanges();
    sel.addRange(range);
    const ok = document.execCommand('copy');
    sel.removeAllRanges();
    if (saved) sel.addRange(saved);
    img.style.userSelect = prevSelect;
    return ok;
  } catch {
    return false;
  }
}

// 从已渲染的 img 直接画 canvas（同源/blob/data 图片可用；跨域图片会因画布污染失败）
function fromCanvas(img) {
  return new Promise((resolve) => {
    try {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth || 0;
      c.height = img.naturalHeight || 0;
      if (!c.width || !c.height) { resolve(null); return; }
      c.getContext('2d').drawImage(img, 0, 0);
      c.toBlob((b) => resolve(b), 'image/png');
    } catch {
      resolve(null);
    }
  });
}

async function toPng(blob) {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext('2d').drawImage(bmp, 0, 0);
  const png = await new Promise((resolve) => c.toBlob(resolve, 'image/png'));
  if (!png) throw new Error('png convert failed');
  return png;
}

function hCopyIcon() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', 'size-4 shrink-0 text-foreground-subtle');
  const rect = document.createElementNS(ns, 'rect');
  rect.setAttribute('width', '14');
  rect.setAttribute('height', '14');
  rect.setAttribute('x', '8');
  rect.setAttribute('y', '8');
  rect.setAttribute('rx', '2');
  rect.setAttribute('ry', '2');
  svg.append(rect);
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2');
  svg.append(p);
  return svg;
}

export function startImageMenu() {
  if (typeof window === 'undefined') return;
  if (typeof navigator.clipboard?.write !== 'function' || typeof window.ClipboardItem === 'undefined') return;
  // preventDefault 必须同步做，功能开关用最近一次配置结果判断（右键时顺带刷新）
  let enabled = true;
  const refresh = () => { void getConfig().then((c) => { enabled = !(c.features && c.features.imageCopy === false); }); };
  refresh();
  document.addEventListener('contextmenu', (e) => {
    if (e.defaultPrevented) return;
    const img = copyTargetOf(e.target, e.clientX, e.clientY);
    if (!img) return;
    e.preventDefault();
    if (enabled) showMenu(e.clientX, e.clientY, img);
    refresh();
  }, true);
}
