// 「复制路径」：项目“更多”菜单中把项目绝对路径复制到剪贴板。
// navigator.clipboard 在渲染进程有焦点时可用；失败时回退 execCommand 写入隐藏输入框。
import { h, t, closeRadixMenu } from '../core.js';
import { showToast } from '../ui.js';

export async function appendCopyPathItem(menu, anchorItem, project) {
  if (menu.querySelector('[data-zcodepro-item="copy-path"]')) return;
  const L = t();
  const item = anchorItem.cloneNode(true);
  item.removeAttribute('data-testid');
  item.removeAttribute('data-highlighted');
  item.setAttribute('data-zcodepro-item', 'copy-path');
  for (const child of [...item.childNodes]) child.remove();
  const origIcon = anchorItem.querySelector('svg');
  const iconClass = origIcon ? origIcon.getAttribute('class') : 'h-3.5 w-3.5';
  item.append(hCopyIcon(iconClass), document.createTextNode(L.copyPathItem));
  item.addEventListener('mouseenter', () => {
    for (const el of menu.querySelectorAll('[role="menuitem"]')) el.removeAttribute('data-highlighted');
    item.setAttribute('data-highlighted', '');
  });
  item.addEventListener('mouseleave', () => item.removeAttribute('data-highlighted'));
  item.addEventListener('click', () => {
    closeRadixMenu(menu);
    void copyText(project.path);
  });
  anchorItem.before(item);
}

async function copyText(text) {
  const L = t();
  if (await copyToClipboard(text)) showToast(L.pathCopied);
  else showToast(L.pathCopyFailed, 'error');
}

// 通用文本复制：成功返回 true，调用方自己决定提示文案
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return copyViaHiddenInput(text);
  }
}

// 剪贴板 API 不可用时的回退：临时输入框 + execCommand('copy')
function copyViaHiddenInput(text) {
  try {
    const input = h('input', { type: 'text', style: 'position:fixed;left:-9999px;top:0;opacity:0' });
    input.value = text;
    document.body.append(input);
    input.select();
    const ok = document.execCommand('copy');
    input.remove();
    return ok;
  } catch {
    return false;
  }
}

export function hCopyIcon(cls) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', cls);
  // lucide copy
  for (const d of ['M8 8h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Z',
    'M4 16c-1.1 0-2-.9-2-2V4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2']) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}
