// 会话（任务）手动排序持久化。
// 侧边栏三个列表来源（逆向自应用查询）：
// - 置顶 / 项目 / 任务分区中的会话：按 tasks.updated_at DESC 排序，
//   重排 = 按新顺序重盖 updated_at（同步 meta_json.updatedAt，避免下次合并回跳）；
// - 分组中的会话：按 task_group_members.sort_order 升序（compareGroupTasks），
//   重排 = 重写该组成员的 sort_order。
// 两种都采用"子序列拼接"策略：仅调整拖动子集的相对位置，
// 未出现在拖动结果里的任务保持原有相对次序。
// 会话键格式与页面 data-task-item-key 一致：`<workspace_path>:<task_id>`（按最后一个 ':' 分割）。

import { existsSync } from 'node:fs';
import { join } from 'node:path';

function splitKey(k) {
  const sep = k.lastIndexOf(':');
  if (sep <= 0) return null;
  return [k.slice(0, sep), k.slice(sep + 1)];
}

// node:sqlite 自 Node 22.5 起才有；延迟加载——运行时过旧时只让排序功能
// 报错，别在模块加载期把整个 helper 拖垮
let DatabaseSync = null;
async function withDb(dataRoot, fn) {
  if (!DatabaseSync) {
    try {
      ({ DatabaseSync } = await import('node:sqlite'));
    } catch {
      throw new Error('当前 Node 运行时缺少 node:sqlite（需 22.5+），会话排序功能不可用');
    }
  }
  const file = join(dataRoot, 'v2', 'tasks-index.sqlite');
  // 库不存在就报错：默认 CREATE 打开会凭空建一个空库文件，
  // 误导其它按存在性判定"索引就绪"的逻辑
  if (!existsSync(file)) throw new Error('任务索引库不存在，无法排序');
  const db = new DatabaseSync(file);
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

// —— 工作区列表（置顶/项目/任务分区）重排：按新顺序重盖 updated_at ——
// multi=false：只收第一个工作区的键（项目列表是单工作区，混入的外区键是脏数据）；
// multi=true：键可跨工作区（置顶/任务分区列表会列出多个项目的会话），
// 各工作区的行并成一个全序一起重盖，跨工作区的穿插顺序也按拖后来。
// 查询与写放在同一个 BEGIN IMMEDIATE 里：读到的全序就是写入依据，
// 不被并发的 updated_at 变化按过期快照重盖。
function workspaceReorderInDb(db, orderedKeys, multi) {
  const pairs = orderedKeys.map((k) => splitKey(k));
  if (!pairs.length || pairs.some((p) => !p)) return { code: 'invalid-request', error: '无效的会话标识' };
  const workspaces = multi ? [...new Set(pairs.map((p) => p[0]))] : [pairs[0][0]];

  db.exec('BEGIN IMMEDIATE');
  try {
    const marks = workspaces.map(() => '?').join(',');
    const rows = db.prepare(
      `SELECT workspace_key || ':' || task_id AS k, updated_at FROM tasks
       WHERE workspace_key IN (${marks}) AND deleted = 0
       ORDER BY updated_at DESC, created_at DESC, task_id DESC`
    ).all(...workspaces);
    if (rows.length === 0) {
      db.exec('ROLLBACK');
      return { code: 'workspace-empty', error: '工作区不存在或没有会话' };
    }

    // 只收确实在当前列表里的键：混入的外区键/重复键/过期键会挤占序号时间戳，
    // 把真实任务的排序挤偏
    const currentKeys = rows.map((r) => r.k);
    const keep = [...new Set(pairs.map((p) => p.join(':')).filter((k) => currentKeys.includes(k)))];
    const next = spliceSubset(currentKeys, keep);
    // 时间戳按新顺序重盖成降序秩。基数取现有值的最小值、不取当前时间：重排只改
    // 顺序，不把会话标成"刚更新过"——否则拖一次序，整个工作区的已完成会话 5 分钟
    // 内都被"复活在跑"的近度判定当成活跃，"最近会话"兜底查询也会被排序动作干扰
    const nums = rows.map((r) => Number(r.updated_at)).filter((n) => isFinite(n) && n > 0);
    // reduce 求最小值：展开成参数在超大工作区（十万行级）会撞参数个数上限
    const base = nums.length ? nums.reduce((a, b) => (b < a ? b : a)) : Date.now();
    const upd = db.prepare(
      `UPDATE tasks SET updated_at = ?, meta_json = json_set(meta_json, '$.updatedAt', ?)
       WHERE workspace_key = ? AND task_id = ?`
    );
    next.forEach((k, idx) => {
      const [w, t] = splitKey(k);
      upd.run(base - idx * 1000, base - idx * 1000, w, t);
    });
    db.exec('COMMIT');
    return { reordered: Math.min(orderedKeys.length, rows.length), workspace: workspaces[0] };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    return { code: 'order-write', error: '写入排序失败: ' + (err?.message || err) };
  }
}

// 找同时包含全部所列会话的组（应当唯一）。返回 { groupId } 或错误结果
function locateGroup(db, orderedKeys) {
  const counts = new Map();
  const stmt = db.prepare(`SELECT group_id FROM task_group_members WHERE workspace_key = ? AND task_id = ?`);
  for (const k of orderedKeys) {
    const pair = splitKey(k);
    if (!pair) return { code: 'invalid-request', error: '无效的会话标识: ' + k };
    for (const r of stmt.all(...pair)) {
      counts.set(r.group_id, (counts.get(r.group_id) || 0) + 1);
    }
  }
  const groupIds = [...counts.entries()].filter(([, c]) => c === orderedKeys.length).map(([g]) => g);
  if (groupIds.length !== 1) {
    return groupIds.length === 0
      ? { code: 'group-not-found', error: '未找到包含这些会话的分组' }
      : { code: 'group-ambiguous', error: '无法唯一确定分组' };
  }
  return { groupId: groupIds[0] };
}

// —— 分组成员列表重排：重写该组成员的 sort_order ——
function groupReorderInDb(db, orderedKeys) {
  const g = locateGroup(db, orderedKeys);
  if (!g.groupId) return g;
  const groupId = g.groupId;

  db.exec('BEGIN IMMEDIATE');
  try {
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
    next.forEach((k, idx) => {
      const [w, t] = splitKey(k);
      upd.run(idx, now, groupId, w, t);
    });
    db.exec('COMMIT');
    return { reordered: Math.min(orderedKeys.length, current.length), groupId };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    return { code: 'order-write', error: '写入分组排序失败: ' + (err?.message || err) };
  }
}

// 拖动落点所在的列表决定改哪套排序字段。注入侧给 hint：
// 'project'（项目分区内的工作区列表）、'pinned'（已置顶列表，可跨工作区）、
// 'section'（分组/任务分区这类无项目属性的容器）。分组容器没有稳定的 DOM 标识，
// 'section' 与缺省先按数据判定：这批键同属唯一分组就按分组排序，否则按工作区排序
//（同属一组又恰好在工作区列表里拖动时会误判，等拿到分组容器标识再收紧）。
// 旧注入包的 scope（workspace / group-members）原样认作 hint。
export async function reorderTasks(dataRoot, orderedKeys, hint) {
  if (hint === 'workspace' || hint === 'project') {
    return withDb(dataRoot, (db) => workspaceReorderInDb(db, orderedKeys, false));
  }
  if (hint === 'pinned') {
    return withDb(dataRoot, (db) => workspaceReorderInDb(db, orderedKeys, true));
  }
  if (hint === 'group-members') {
    return withDb(dataRoot, (db) => groupReorderInDb(db, orderedKeys));
  }
  return withDb(dataRoot, (db) => {
    const g = locateGroup(db, orderedKeys);
    return g.groupId
      ? groupReorderInDb(db, orderedKeys)
      : workspaceReorderInDb(db, orderedKeys, true);
  });
}

export async function reorderWorkspaceTasks(dataRoot, orderedKeys) {
  return withDb(dataRoot, (db) => workspaceReorderInDb(db, orderedKeys, false));
}

export async function reorderGroupMembers(dataRoot, orderedKeys) {
  return withDb(dataRoot, (db) => groupReorderInDb(db, orderedKeys));
}
