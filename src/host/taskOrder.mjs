// 会话（任务）手动排序持久化。
// 侧边栏两个列表来源（逆向自应用查询）：
// - 置顶 / 项目中的会话：按 tasks.updated_at DESC 排序，
//   重排 = 按新顺序重盖 updated_at（同步 meta_json.updatedAt，避免下次合并回跳）；
// - 分组中的会话：按 task_group_members.sort_order 升序（compareGroupTasks），
//   重排 = 重写该组成员的 sort_order。
// 两种都采用「子序列拼接」策略：仅调整拖动子集的相对位置，
// 未出现在拖动结果里的任务保持原有相对次序。
// 会话键格式与页面 data-task-item-key 一致：`<workspace_path>:<task_id>`（按最后一个 ':' 分割）。

import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';

function splitKey(k) {
  const sep = k.lastIndexOf(':');
  if (sep <= 0) return null;
  return [k.slice(0, sep), k.slice(sep + 1)];
}

function withDb(dataRoot, fn) {
  const db = new DatabaseSync(join(dataRoot, 'v2', 'tasks-index.sqlite'));
  try {
    db.exec('PRAGMA busy_timeout = 5000');
    return fn(db);
  } finally {
    db.close();
  }
}

// 在 current 全序中剔除子集后，把子集按新顺序插回其原有最小位置
function spliceSubset(current, orderedSubset) {
  const subset = new Set(orderedSubset);
  let anchor = Infinity;
  current.forEach((k, i) => { if (subset.has(k)) anchor = Math.min(anchor, i); });
  if (!isFinite(anchor)) anchor = current.length;
  const head = current.filter((k, i) => !subset.has(k) && i < anchor);
  const tail = current.filter((k, i) => !subset.has(k) && i >= anchor);
  return [...head, ...orderedSubset.filter((k) => subset.has(k)), ...tail];
}

export async function reorderWorkspaceTasks(dataRoot, orderedKeys) {
  const first = splitKey(orderedKeys[0] || '');
  if (!first) return { error: '无效的会话标识' };
  const workspace = first[0];

  return withDb(dataRoot, (db) => {
    const current = db.prepare(
      `SELECT task_id FROM tasks
       WHERE workspace_key = ? AND deleted = 0
       ORDER BY updated_at DESC, created_at DESC, task_id DESC`
    ).all(workspace).map((r) => r.task_id);
    if (current.length === 0) return { error: '工作区不存在或没有会话' };

    const next = spliceSubset(current, orderedKeys.map((k) => splitKey(k)[1]));
    const now = Date.now();
    const upd = db.prepare(
      `UPDATE tasks SET updated_at = ?, meta_json = json_set(meta_json, '$.updatedAt', ?)
       WHERE workspace_key = ? AND task_id = ?`
    );
    db.exec('BEGIN IMMEDIATE');
    try {
      next.forEach((taskId, idx) => upd.run(now - idx * 1000, now - idx * 1000, workspace, taskId));
      db.exec('COMMIT');
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch { /* ignore */ }
      return { error: '写入排序失败: ' + (err?.message || err) };
    }
    return { reordered: Math.min(orderedKeys.length, current.length), workspace };
  });
}

export async function reorderGroupMembers(dataRoot, orderedKeys) {
  return withDb(dataRoot, (db) => {
    // 定位同时包含全部所列会话的组（应当唯一）
    const counts = new Map();
    const stmt = db.prepare(`SELECT group_id FROM task_group_members WHERE workspace_key = ? AND task_id = ?`);
    for (const k of orderedKeys) {
      const pair = splitKey(k);
      if (!pair) return { error: '无效的会话标识: ' + k };
      for (const r of stmt.all(...pair)) {
        counts.set(r.group_id, (counts.get(r.group_id) || 0) + 1);
      }
    }
    const groupIds = [...counts.entries()].filter(([, c]) => c === orderedKeys.length).map(([g]) => g);
    if (groupIds.length !== 1) {
      return { error: groupIds.length === 0 ? '未找到包含这些会话的分组' : '无法唯一确定分组' };
    }
    const groupId = groupIds[0];

    const current = db.prepare(
      `SELECT workspace_key || ':' || task_id AS k
       FROM task_group_members WHERE group_id = ?
       ORDER BY COALESCE(sort_order, 2147483647) ASC, added_at ASC`
    ).all(groupId).map((r) => r.k);

    const next = spliceSubset(current, orderedKeys);
    const upd = db.prepare(
      `UPDATE task_group_members SET sort_order = ?, updated_at = ?
       WHERE group_id = ? AND workspace_key = ? AND task_id = ?`
    );
    const now = Date.now();
    db.exec('BEGIN IMMEDIATE');
    try {
      next.forEach((k, idx) => {
        const [w, t] = splitKey(k);
        upd.run(idx, now, groupId, w, t);
      });
      db.exec('COMMIT');
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch { /* ignore */ }
      return { error: '写入分组排序失败: ' + (err?.message || err) };
    }
    return { reordered: Math.min(orderedKeys.length, current.length), groupId };
  });
}
