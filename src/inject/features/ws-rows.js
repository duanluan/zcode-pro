// 侧边栏项目行定位：同时兼容两种结构（按 isNewProjectSidebar 自动选择）。
// - 旧结构（3.15.x 及以前）：项目行 testid 为 workspace-item-<绝对路径>；
// - 新结构（3.16.1 起“虚拟项目”）：项目行为 section[data-project-id]，不再携带
//   路径；本地项目的路径从区内任务行的 data-task-item-key 前缀取得（键格式
//   “<工作区路径>:<任务id>”，本地工作区路径即项目主目录）。没有任务行的项目
//   取不到路径，只能靠调用方按名称兜底（helper /projects）。
import { isNewProjectSidebar } from '../core.js';

const norm = (p) => String(p || '').replace(/[\\/]+$/, '');

// 新结构项目行选择器（旧结构为 [data-testid^="workspace-item-"]）
const NEW_ROW_SEL = 'section[data-project-id]';
const OLD_ROW_SEL = '[data-testid^="workspace-item-"]';

// 新结构：data-project-id → 工作区路径。任务行随折叠卸载，项目展开过一次才拿得到
// 路径；关联在会话内记住，之后按路径找行（session-switch、ws-running 等）不再依赖
// 该项目当前是否展开。
const pathByProjectId = new Map();

export function projectRowSelector() {
  return isNewProjectSidebar() ? NEW_ROW_SEL : OLD_ROW_SEL;
}

export function projectRows(root = document) {
  return [...root.querySelectorAll(projectRowSelector())];
}

// 项目行 → 本地项目路径；取不到返回 null。
// 远程项目分区（data-project-host 非 local）的任务键前缀是 identity 而非路径，
// 一律不返回路径——打开文件夹/复制路径/别名迁移都只应作用于本地项目。
// 新结构优先从在场任务行现算（官方“编辑项目”改过文件夹后路径会变），项目折叠、
// 任务行卸载时才用上次学到的缓存。
export function rowPath(row) {
  if (!row) return null;
  if (row.hasAttribute && row.hasAttribute('data-project-id')) {
    const host = row.getAttribute('data-project-host');
    if (host !== null && host !== 'local') return null;
    const id = row.getAttribute('data-project-id');
    let found = null;
    for (const el of row.querySelectorAll('[data-task-item-key]')) {
      const key = el.getAttribute('data-task-item-key') || '';
      // lastIndexOf 兼容 Windows 盘符路径里的 ':'（C:\… 只在盘符处出现一次）
      const cut = key.lastIndexOf(':');
      if (cut > 1) { found = key.slice(0, cut); break; }
    }
    if (found) pathByProjectId.set(id, found);
    return found || pathByProjectId.get(id) || null;
  }
  const testid = row.getAttribute && row.getAttribute('data-testid');
  if (!testid || !testid.startsWith('workspace-item-')) return null;
  return norm(testid.slice('workspace-item-'.length)) || null;
}

export function findProjectRow(path) {
  const want = norm(path);
  if (!want) return null;
  for (const row of projectRows()) {
    const p = rowPath(row);
    if (p && norm(p) === want) return row;
  }
  return null;
}
