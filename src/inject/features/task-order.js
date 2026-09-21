// 会话拖动排序：应用自带的列表拖拽只更新视觉、不持久化（逆向确认：
// 置顶/项目列表按 updated_at DESC 排序、分组会话按 members.sort_order 排序，
// 均无拖拽写入路径）。本功能在拖放结束时读取列表的最终顺序，
// 交给 helper 持久化（workspace 列表重盖 updated_at，分组列表重写
// sort_order），随后刷新界面使新顺序生效。
import { t, rpc, getConfig } from '../core.js';
import { showToast, ensureStyle } from '../ui.js';
import { errText } from '../core.js';

let installed = false;
let dragKey = null; // 拖动源会话键（dragstart 记录，dragend 清除）

export function startTaskOrderWatcher() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  ensureStyle();

  document.addEventListener('dragstart', (e) => {
    const row = e.target.closest && e.target.closest('[data-task-item-key]');
    dragKey = row ? row.getAttribute('data-task-item-key') : null;
  }, true);

  document.addEventListener('dragend', () => { dragKey = null; }, true);

  // 拖拽经过会话行时允许落下（应用自身未必 preventDefault），并做实时预览
  document.addEventListener('dragover', (e) => {
    if (!dragKey) return;
    const row = e.target.closest && e.target.closest('[data-task-item-key]');
    if (!row || row.getAttribute('data-task-item-key') === dragKey) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    // 实时预览：把拖动行移动到目标行前/后（拖动期间 React 不重渲染；落库后刷新重建）
    const rect = row.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    const src = [...row.parentElement.querySelectorAll('[data-task-item-key]')]
      .find((el) => el.getAttribute('data-task-item-key') === dragKey);
    if (src && src !== row) {
      row.parentNode.insertBefore(src, before ? row : row.nextSibling);
    }
  }, true);

  document.addEventListener('drop', (e) => {
    if (!dragKey) return;
    const row = e.target.closest && e.target.closest('[data-task-item-key]');
    const list = row ? row.parentElement : null;
    if (!list) return;
    const rows = [...list.querySelectorAll('[data-task-item-key]')];
    if (rows.length < 2) return;
    e.preventDefault();
    e.stopPropagation();
    dragKey = null;
    void persistOrder(rows.map((el) => el.getAttribute('data-task-item-key')));
  }, true);
}

let persisting = false;
async function persistOrder(ordered) {
  if (persisting) return;
  persisting = true;
  try {
    const config = await getConfig();
    if (config.features && config.features.taskOrder === false) return;
    ensureStyle();
    const L = t();
    // 同一工作区的列表 → workspace 作用域（置顶/项目列表）；跨工作区 → 分组成员作用域
    const workspaces = new Set(ordered.map((k) => k.slice(0, k.lastIndexOf(':'))));
    const scope = workspaces.size === 1 ? 'workspace' : 'group-members';
    const res = await rpc('/task-order', { method: 'POST', body: { scope, ordered } });
    if (res && res.ok) {
      showToast(L.taskOrderSaved);
      setTimeout(() => location.reload(), 600);
    } else {
      showToast(L.failed + ': ' + (errText(res) || L.retryHint), 'error');
    }
  } finally {
    persisting = false;
  }
}
