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
let lastOverRow = null; // 上一次预览的目标行与方向：都没变就不动 DOM
let lastOverBefore = false;
let moveRaf = 0; // 预览移动合并进 rAF：每帧最多动一次 DOM
let pendingMove = null; // 待执行的预览移动 { row, before }

// 落实一次预览移动（查源行 + insertBefore 都放在这里，dragover 只登记不写 DOM）
function applyMove() {
  const mv = pendingMove;
  pendingMove = null;
  if (!mv || !dragKey) return;
  const list = mv.row.parentElement;
  if (!list) return;
  const src = [...list.querySelectorAll('[data-task-item-key]')]
    .find((el) => el.getAttribute('data-task-item-key') === dragKey);
  if (src && src !== mv.row) {
    mv.row.parentNode.insertBefore(src, mv.before ? mv.row : mv.row.nextSibling);
  }
}
function scheduleMove(row, before) {
  pendingMove = { row, before };
  if (moveRaf) return;
  moveRaf = requestAnimationFrame(() => { moveRaf = 0; applyMove(); });
}

export function startTaskOrderWatcher() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  ensureStyle();

  document.addEventListener('dragstart', (e) => {
    const row = e.target.closest && e.target.closest('[data-task-item-key]');
    dragKey = row ? row.getAttribute('data-task-item-key') : null;
  }, true);

  document.addEventListener('dragend', () => {
    dragKey = null;
    lastOverRow = null;
    pendingMove = null;
    if (moveRaf) { cancelAnimationFrame(moveRaf); moveRaf = 0; }
  }, true);

  // 拖拽经过会话行时允许落下（应用自身未必 preventDefault），并做实时预览
  document.addEventListener('dragover', (e) => {
    if (!dragKey) return;
    const row = e.target.closest && e.target.closest('[data-task-item-key]');
    if (!row || row.getAttribute('data-task-item-key') === dragKey) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    // 实时预览：把拖动行移动到目标行前/后（拖动期间 React 不重渲染；写入数据库后刷新重建）。
    // 方向每次按行的当前几何算（自己挪过 DOM 后行位置会变，缓存会算错），
    // 但目标行与方向都没变就不登记移动——dragover 每秒几十次，逐次查源行并
    // insertBefore 会读写交错抖动；真正移动合并进 rAF 每帧最多一次
    const rect = row.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    if (row === lastOverRow && before === lastOverBefore) return;
    lastOverRow = row;
    lastOverBefore = before;
    scheduleMove(row, before);
  }, true);

  document.addEventListener('drop', (e) => {
    if (!dragKey) return;
    applyMove(); // 还没落地的预览移动先做掉，下面读到的顺序才是用户看到的顺序
    const row = e.target.closest && e.target.closest('[data-task-item-key]');
    const list = row ? row.parentElement : null;
    if (!list) return;
    const rows = [...list.querySelectorAll('[data-task-item-key]')];
    if (rows.length < 2) return;
    e.preventDefault();
    e.stopPropagation();
    dragKey = null;
    // 列表种类取自落点行的容器：项目分区（section[data-project-id]）内是工作区
    // 列表；带其他 section 的是分组/任务分区容器；没有 section 的是"已置顶"列表
    //（可跨工作区）。不要按"键里工作区数量"猜——分组可能全在同一工作区，置顶
    // 也可能跨工作区，两个方向都会猜错
    const hint = row.closest('section[data-project-id]') ? 'project'
      : row.closest('section') ? 'section' : 'pinned';
    void persistOrder(rows.map((el) => el.getAttribute('data-task-item-key')), hint);
  }, true);
}

let persisting = false;
async function persistOrder(ordered, hint) {
  if (persisting) return;
  persisting = true;
  try {
    const config = await getConfig();
    if (config.features && config.features.taskOrder === false) return;
    ensureStyle();
    const L = t();
    const res = await rpc('/task-order', { method: 'POST', body: { hint, ordered } });
    if (res && res.ok) {
      showToast(L.taskOrderSaved, 'success');
      setTimeout(() => location.reload(), 600);
    } else {
      showToast(L.failed + ': ' + (errText(res) || L.retryHint), 'error');
    }
  } finally {
    persisting = false;
  }
}
