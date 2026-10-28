// 功能二：项目“更多”下拉菜单中新增“打开文件夹 / 复制路径”。
// 旧结构（3.15.x 及以前）：菜单内存在带 data-testid（值中含项目绝对路径）且文案为“移除/Remove”
//   的菜单项，路径从 testid 提取；四项全注入（自定义别名/切换文件夹/打开文件夹/复制路径）。
// 新结构（3.16.1 起）：菜单项带稳定 testid（virtual-project-edit/-delete/-remove-entry），
//   项目行 section[data-project-id]；菜单打开时同步捕获触发行的 project-id，异步按 id 查
//   helper 的 /projects-v2（官方任务索引 projects/project_roots）拿项目名与全部目录——
//   不依赖项目展开状态或任务行。插在“编辑项目”之后：
//   - 打开文件夹：单目录直接打开主目录；多目录悬停展开二级菜单列各目录（自绘浮层，
//     官方 Radix 子菜单由 React 管理不便仿造）
//   - 复制路径：复制主目录路径
//   - 自定义别名与切换文件夹不再注入：官方“编辑项目”已支持改名与多目录增删
//   （迁移存量别名见 alias-migration.js；旧结构下两项照旧注入）
import { rpc, getConfig, itemsOf, itemText, isNewProjectSidebar, t } from '../core.js';
import { showToast } from '../ui.js';
import { copyToClipboard } from './copy-path.js';
import { appendAliasItem } from './alias.js';
import { appendRelocateItem } from './relocate-dialog.js';
import { appendOpenFolderItem } from './open-folder.js';
import { appendCopyPathItem } from './copy-path.js';

const REMOVE_TEXTS = ['移除', 'Remove'];

// data-testid 实测格式为 "<前缀>-<绝对路径>"（如 workspace-close-/home/x/y），
// 也兼容 ":"、"=" 等分隔符与 Windows 盘符路径。
function extractPathFromTestId(testid) {
  let m = testid.match(/[-:=,|](\/.+)$/); // Unix 绝对路径
  if (m) return m[1];
  m = testid.match(/[-:=,|]([A-Za-z]:\\.*)$/); // Windows 盘符路径
  return m ? m[1] : null;
}

// 新结构：菜单打开时找到触发的项目行。下拉按钮（virtual-project-menu）的打开态
// 实测（3.16.1）只反映在 aria-expanded=true 上，data-state 不变化，两者都查；
// 右键行（virtual-project-row）按 data-state/aria-expanded 兜底。菜单关闭后状态
// 即消失，必须同步调用
function openMenuProjectRow() {
  const trigger = document.querySelector(
    '[data-testid="virtual-project-menu"][aria-expanded="true"],'
    + ' [data-testid="virtual-project-menu"][data-state="open"],'
    + ' [data-testid="virtual-project-row"][data-state="open"],'
    + ' [data-testid="virtual-project-row"][aria-expanded="true"]'
  );
  const row = trigger ? trigger.closest('section[data-project-id]') : null;
  if (!row) return null;
  const host = row.getAttribute('data-project-host');
  return host === null || host === 'local' ? row : null;
}

async function resolveProjectPath(removeItem) {
  const extracted = extractPathFromTestId(removeItem.getAttribute('data-testid') || '');
  if (!extracted) return null;
  // 与 helper 的最近项目列表核对（仅用于确认路径有效；任务派生的项目可能不在列表中）
  const res = await rpc('/projects');
  if (res.ok && Array.isArray(res.projects)) {
    const norm = (p) => String(p).replace(/[\\/]+$/, '');
    const hit = res.projects.find((p) => norm(p.path) === norm(extracted));
    if (hit) return hit;
  }
  return { path: extracted, name: String(extracted).replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '' };
}

// —— 新结构注入：编辑项之后插入 ——
// 官方菜单项结构：[data-radix-collection-item]（div，含 svg + 文本）。克隆保证样式一致
function cloneMenuItem(anchor, testid, label) {
  const item = anchor.cloneNode(true);
  item.removeAttribute('data-testid');
  item.removeAttribute('data-highlighted');
  item.removeAttribute('id');
  item.setAttribute('data-zcodepro-item', testid);
  for (const child of [...item.childNodes]) child.remove();
  const origIcon = anchor.querySelector('svg');
  const iconClass = origIcon ? origIcon.getAttribute('class') : 'h-3.5 w-3.5';
  // 文件夹图标
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', iconClass);
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z');
  svg.append(p);
  item.append(svg, document.createTextNode(label));
  return item;
}

function wireHighlight(menu, item) {
  item.addEventListener('mouseenter', () => {
    for (const el of menu.querySelectorAll('[role="menuitem"]')) el.removeAttribute('data-highlighted');
    item.setAttribute('data-highlighted', '');
  });
  item.addEventListener('mouseleave', () => item.removeAttribute('data-highlighted'));
}

// 多目录的二级子菜单：悬停“打开文件夹”即在右侧展开，一级菜单保持可见；
// 点击该项同样展开（触屏可达）。移出项与子菜单 300ms 后收起；一级菜单被
// 关闭（Esc/外部点击）时子菜单一并收起
function attachFolderHover(menu, item, roots) {
  const L = t();
  let sub = null;
  let subHovered = false;
  let hideTimer = 0;
  let aliveTimer = 0;

  const removeSub = () => {
    clearTimeout(hideTimer);
    clearInterval(aliveTimer);
    sub?.remove();
    sub = null;
    subHovered = false;
  };
  const position = () => {
    const rect = item.getBoundingClientRect();
    sub.style.left = rect.right + 'px';
    sub.style.top = rect.top + 'px';
    const r = sub.getBoundingClientRect();
    if (r.right > window.innerWidth - 8) {
      sub.style.left = '';
      sub.style.right = (window.innerWidth - rect.left) + 'px';
    }
  };
  const ensureSub = () => {
    if (sub) { position(); return; }
    sub = document.createElement('div');
    sub.setAttribute('role', 'menu');
    sub.setAttribute('data-zcodepro-item', 'open-folder-sub');
    sub.className = 'zcodepro-card flex flex-col gap-0.5 rounded-lg border border-border bg-menu p-1 text-ui-sm shadow-lg';
    sub.style.cssText = 'position:fixed;z-index:60;min-width:14rem;';
    for (const root of roots) {
      const base = String(root.path).replace(/[\\/]+$/, '').split(/[\\/]/).pop() || root.path;
      const row = document.createElement('div');
      row.setAttribute('role', 'menuitem');
      row.className = 'flex cursor-pointer items-center gap-2 truncate rounded-md px-2 py-1.5 text-foreground transition-colors hover:bg-surface-hover';
      row.title = root.path;
      row.append(document.createTextNode(base + (root.primary ? ` · ${L.openFolderPrimary}` : '')));
      row.addEventListener('click', () => {
        // 关一级菜单（Escape 走 Radix）再打开目录
        try { menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true })); } catch { /* ignore */ }
        removeSub();
        void rpc('/open-folder', { method: 'POST', body: { path: root.path } });
      });
      sub.append(row);
    }
    sub.addEventListener('mouseenter', () => { subHovered = true; clearTimeout(hideTimer); });
    sub.addEventListener('mouseleave', () => { subHovered = false; scheduleHide(); });
    document.body.append(sub);
    position();
    // 子菜单存活期间周期确认一级还在（Radix 被关后不残留）
    aliveTimer = setInterval(() => { if (!menu.isConnected) removeSub(); }, 400);
  };
  const scheduleHide = () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { if (!subHovered) removeSub(); }, 300);
  };

  item.addEventListener('mouseenter', () => { clearTimeout(hideTimer); ensureSub(); });
  item.addEventListener('mouseleave', scheduleHide);
  // 点击同样展开且不关一级（项是注入节点，不触发 Radix 的选中即关闭）
  item.addEventListener('click', () => { clearTimeout(hideTimer); ensureSub(); });
}

async function injectNewMenuItems(content, menuRow) {
  const L = t();
  const projectId = menuRow.getAttribute('data-project-id');
  const editItem = content.querySelector('[data-testid="virtual-project-edit"]');
  if (!editItem || !projectId) return;
  if (content.querySelector('[data-zcodepro-item]')) return;
  const config = await getConfig();
  // 同一组开关（旧结构共用 features.projectMenu）
  if (config.features && config.features.projectMenu === false) return;
  const res = await rpc('/projects-v2');
  if (!res.ok || !res.available) return;
  const proj = (res.projects || []).find((p) => p.id === projectId);
  if (!proj) return;
  const roots = (proj.roots || []).slice().sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0));
  if (!roots.length) return;
  const primary = roots.find((r) => r.primary) || roots[0];

  // 打开文件夹：单目录点击直接打开；多目录悬停/点击展开二级子菜单（带 › 指示）
  const openItem = cloneMenuItem(editItem, 'open-folder', L.openFolderItem);
  wireHighlight(content, openItem);
  if (roots.length === 1) {
    openItem.addEventListener('click', () => {
      try { content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true })); } catch { /* ignore */ }
      void rpc('/open-folder', { method: 'POST', body: { path: primary.path } });
    });
  } else {
    // 行尾 › 子级指示（与官方菜单 chevron 同款样式）
    const ns = 'http://www.w3.org/2000/svg';
    const chev = document.createElementNS(ns, 'svg');
    chev.setAttribute('viewBox', '0 0 24 24');
    chev.setAttribute('fill', 'none');
    chev.setAttribute('stroke', 'currentColor');
    chev.setAttribute('stroke-width', '2');
    chev.setAttribute('stroke-linecap', 'round');
    chev.setAttribute('stroke-linejoin', 'round');
    chev.setAttribute('class', 'ml-auto size-3.5 shrink-0 text-foreground-subtle');
    const chevPath = document.createElementNS(ns, 'path');
    chevPath.setAttribute('d', 'm9 18 6-6-6-6');
    chev.append(chevPath);
    openItem.append(chev);
    attachFolderHover(content, openItem, roots);
  }
  editItem.after(openItem);

  // 复制路径：主目录
  const copyItem = cloneMenuItem(editItem, 'copy-path', L.copyPathItem);
  wireHighlight(content, copyItem);
  copyItem.addEventListener('click', () => {
    try { content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true })); } catch { /* ignore */ }
    void copyToClipboard(primary.path).then((ok) => showToast(ok ? L.pathCopied : L.pathCopyFailed, ok ? 'success' : 'error'));
  });
  openItem.after(copyItem);
}

export function handleProjectMenu(content) {
  if (content.querySelector('[data-zcodepro-item]')) return;
  const items = itemsOf(content);
  const newUi = isNewProjectSidebar();
  // 菜单关闭后 data-state 即消失：项目行必须在任何 await 之前捕获
  const menuRow = newUi ? openMenuProjectRow() : null;
  const anchor = newUi
    ? items.find((el) => el.getAttribute('data-testid') === 'virtual-project-edit')
    : items.find(
      (el) => el.hasAttribute('data-testid') && REMOVE_TEXTS.some((x) => itemText(el).startsWith(x))
    );
  if (!anchor) return;
  if (newUi) {
    if (!menuRow) return;
    void injectNewMenuItems(content, menuRow);
    return;
  }
  void (async () => {
    const config = await getConfig();
    // 一组开关控制整组菜单项（别名 / 切换文件夹 / 打开文件夹 / 复制路径）
    if (config.features && config.features.projectMenu === false) return;
    const project = await resolveProjectPath(anchor);
    if (!project) return;
    // 菜单顺序：自定义别名 → 切换文件夹 → 打开文件夹 → 复制路径 → 移除（均插在“移除”之前）
    appendAliasItem(content, anchor, project);
    appendRelocateItem(content, anchor, project);
    appendOpenFolderItem(content, anchor, project);
    appendCopyPathItem(content, anchor, project);
  })();
}
