// 「打开文件夹」：项目“更多”菜单中在系统文件管理器里打开项目目录。
// 走 helper /open-folder：三平台行为一致（宿主桥 openInFileManager 在 macOS 是定位而非打开）。
import { h, t, rpc, closeRadixMenu } from '../core.js';

export function appendOpenFolderItem(menu, anchorItem, project) {
  if (menu.querySelector('[data-zcodepro-item="open-folder"]')) return;
  const L = t();
  const item = anchorItem.cloneNode(true);
  item.removeAttribute('data-testid');
  item.removeAttribute('data-highlighted');
  item.setAttribute('data-zcodepro-item', 'open-folder');
  for (const child of [...item.childNodes]) child.remove();
  const origIcon = anchorItem.querySelector('svg');
  const iconClass = origIcon ? origIcon.getAttribute('class') : 'h-3.5 w-3.5';
  item.append(hFolderIcon(iconClass), document.createTextNode(L.openFolderItem));
  item.addEventListener('mouseenter', () => {
    for (const el of menu.querySelectorAll('[role="menuitem"]')) el.removeAttribute('data-highlighted');
    item.setAttribute('data-highlighted', '');
  });
  item.addEventListener('mouseleave', () => item.removeAttribute('data-highlighted'));
  item.addEventListener('click', () => {
    closeRadixMenu(menu);
    try { void rpc('/open-folder', { method: 'POST', body: { path: project.path } }); } catch { /* ignore */ }
  });
  anchorItem.before(item);
}

function hFolderIcon(cls) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', cls);
  // lucide folder
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 0-1.69.9l-.58.87A2 2 0 0 1 8.93 8H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2Z');
  svg.append(p);
  return svg;
}
