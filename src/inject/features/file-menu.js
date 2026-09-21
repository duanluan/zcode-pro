// 功能五：文件菜单增强——文件操作弹出菜单（含「复制绝对路径」项的菜单，右键文件链接 chip
// 与预览卡片「打开 ▾」下拉均有）：
// - 「打开」分组内、可用编辑器列表（无可用时为「未找到可用 App」禁用项）上方新增「默认应用打开」
//   （宿主桥 window.zcode.openExternalFile，Electron preload 原生暴露）；
// - 「复制绝对路径」上方新增「打开所在目录」（helper /reveal-path 在文件管理器中定位文件；
//   不用宿主 openInFileManager——其在 Linux/Windows 的实现只是 shell.openPath，即用默认应用打开）。
// 路径获取（按序尝试）：触发器 title（文件 chip 右键场景，message.tsx 写入绝对路径）→
// 触发器/菜单的 React fiber props（OpenSplitButton 场景 target/fileLink/row.path）。
import { t, closeRadixMenu, itemsOf, itemText, rpc } from '../core.js';
import { getConfig } from '../core.js';

const COPY_ABS_TEXTS = ['复制绝对路径', 'Copy absolute path'];
const NO_APPS_TEXTS = ['未找到可用 App', 'No apps found'];

// lucide 图标：app-window（默认应用打开）/ folder-open（打开所在目录）
const ICON_OPEN_DEFAULT = [
  { rect: { x: '2', y: '4', width: '20', height: '16', rx: '2' } },
  { d: 'M10 4v4' },
  { d: 'M2 8h20' },
  { d: 'M6 4v4' },
];
const ICON_REVEAL = [
  { d: 'm6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.22a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2' },
];

function buildIcon(cls, shapes) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  if (cls) svg.setAttribute('class', cls);
  for (const s of shapes) {
    if (s.rect) {
      const r = document.createElementNS(ns, 'rect');
      for (const [k, v] of Object.entries(s.rect)) r.setAttribute(k, v);
      svg.append(r);
    } else {
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', s.d);
      svg.append(p);
    }
  }
  return svg;
}

// 触发器 title 里应是绝对路径（Unix 或 Windows 盘符），防误取其他 title
function looksLikePath(v) {
  return typeof v === 'string' && (/^[\\/]/.test(v) || /^[A-Za-z]:[\\/]/.test(v));
}

// 从 React fiber 的祖先链上取文件路径（OpenSplitButton 等场景路径只在 props 里）
function pathFromReactFiber(el) {
  try {
    const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
    let fiber = key ? el[key] : null;
    for (let i = 0; fiber && i < 40; i++, fiber = fiber.return) {
      const props = fiber.memoizedProps;
      if (!props || typeof props !== 'object') continue;
      for (const k of ['target', 'fileLink', 'row']) {
        const v = props[k];
        if (v && looksLikePath(v.path)) return v.path;
      }
      if (looksLikePath(props.path)) return props.path;
    }
  } catch { /* ignore */ }
  return null;
}

function resolveTargetPath(content) {
  const id = content.id;
  if (id) {
    try {
      const trigger = document.querySelector(`[aria-controls="${CSS.escape(id)}"]`);
      const p = trigger?.getAttribute('title');
      if (looksLikePath(p)) return p;
      const fromFiber = trigger && pathFromReactFiber(trigger);
      if (fromFiber) return fromFiber;
    } catch { /* ignore */ }
  }
  // 兜底：当前打开状态的右键触发器（同一时刻通常只有一个菜单）
  const open = document.querySelector('[data-slot="context-menu-trigger"][data-state="open"]');
  const p2 = open?.getAttribute('title');
  if (looksLikePath(p2)) return p2;
  return pathFromReactFiber(content);
}

function appendMenuItem(content, template, anchor, { marker, label, icon, onPick }) {
  // 模板必须取可用项（复制绝对路径）：禁用项带 data-disabled 与 pointer-events:none 类，
  // 克隆会导致灰显且点击穿透。悬停高亮是 Radix 行为，克隆节点需手动模拟。
  const item = template.cloneNode(true);
  item.removeAttribute('data-testid');
  item.removeAttribute('data-highlighted');
  item.removeAttribute('data-disabled');
  item.removeAttribute('aria-disabled');
  item.setAttribute('data-zcodepro-item', marker);
  for (const child of [...item.childNodes]) child.remove();
  const origIcon = template.querySelector('svg');
  item.append(buildIcon(origIcon?.getAttribute('class') || 'size-4', icon), document.createTextNode(label));
  item.addEventListener('mouseenter', () => {
    for (const el of content.querySelectorAll('[role="menuitem"]')) el.removeAttribute('data-highlighted');
    item.setAttribute('data-highlighted', '');
  });
  item.addEventListener('mouseleave', () => item.removeAttribute('data-highlighted'));
  item.addEventListener('click', () => {
    closeRadixMenu(content);
    onPick();
  });
  anchor.before(item);
  return item;
}

export function handleFileMenu(content) {
  if (content.dataset.zcodeproFileMenu) return;
  const items = itemsOf(content);
  const copyAbs = items.find((el) => COPY_ABS_TEXTS.some((x) => itemText(el).startsWith(x)));
  if (!copyAbs) return;
  // 宿主桥缺失（非桌面端）时不注入
  if (typeof window === 'undefined'
    || typeof window.zcode?.openExternalFile !== 'function'
    || typeof window.zcode?.openInFileManager !== 'function') return;
  // 同步占位防竞态：注入在下方异步段执行，多个观察者回调同时进入时只允许第一个注入
  content.dataset.zcodeproFileMenu = '1';
  void (async () => {
    const config = await getConfig();
    if (config.features && config.features.fileActions === false) return;
    const path = resolveTargetPath(content);
    if (!path) return;
    const L = t();
    // 「默认应用打开」锚在编辑器列表末尾（无可用编辑器时即「未找到可用 App」禁用项）之上；
    // 找不到该组时退而锚在「复制绝对路径」上，保持「打开方式在前、路径操作在后」的次序
    const noApps = items.find((el) => NO_APPS_TEXTS.some((x) => itemText(el) === x))
      || content.querySelector('[data-disabled][role="menuitem"]');
    const openAnchor = noApps && content.contains(noApps) ? noApps : copyAbs;
    appendMenuItem(content, copyAbs, openAnchor, {
      marker: 'file-open-default',
      label: L.fileOpenDefault,
      icon: ICON_OPEN_DEFAULT,
      onPick: () => { try { void window.zcode.openExternalFile(path); } catch { /* ignore */ } },
    });
    appendMenuItem(content, copyAbs, copyAbs, {
      marker: 'file-reveal',
      label: L.fileReveal,
      icon: ICON_REVEAL,
      onPick: () => { try { void rpc('/reveal-path', { method: 'POST', body: { path } }); } catch { /* ignore */ } },
    });
  })();
}
