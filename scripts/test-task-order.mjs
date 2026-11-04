// 会话排序回归测试：用临时 tasks-index.sqlite 跑真实的 reorderWorkspaceTasks /
// reorderGroupMembers。零依赖（node:sqlite），node scripts/test-task-order.mjs
//（或 npm test）直接跑，全绿退出码 0。
// 覆盖：子序列拼接（拖动子集插回原锚位、未拖动项相对次序不变）、updated_at 与
// meta_json.updatedAt 同值（重启后顺序不变）、坏键回 400、
// 外区键/重复键不挤占序号、库不存在不凭空建库、分组排序与歧义判定、
// reorderTasks 作用域路由（置顶跨工作区并序、无容器按数据判分组）与时间戳不标新、
// 空工作区报错、已删行不进排序不占序号、平局按 created_at/task_id 决出、
// updated_at 全 0 时基数退回当前时间。
import { mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reorderTasks, reorderWorkspaceTasks, reorderGroupMembers } from '../src/host/taskOrder.mjs';

const root = mkdtempSync(join(tmpdir(), 'zcodepro-taskorder-test-'));
mkdirSync(join(root, 'v2'), { recursive: true });
const dbFile = join(root, 'v2', 'tasks-index.sqlite');

let failed = 0;
const assert = (cond, msg) => {
  if (!cond) { console.error('FAIL: ' + msg); failed = 1; }
  else console.log('ok: ' + msg);
};

// 库不存在：明确报错，且不凭空建出空库文件
const noDb = await reorderWorkspaceTasks(root, ['/ws:sess_a']).catch((e) => ({ thrown: e.message }));
assert(noDb.thrown && /不存在/.test(noDb.thrown), `库不存在时抛明确错误（实际 ${JSON.stringify(noDb)}）`);
assert(!existsSync(dbFile), '库不存在时不创建空库文件');

// 建库：一个工作区 4 个会话（updated_at 降序 = t1 t2 t3 t4），另一个工作区 1 个
const { DatabaseSync } = await import('node:sqlite');
const db = new DatabaseSync(dbFile);
db.exec(`CREATE TABLE tasks (task_id TEXT, workspace_key TEXT, deleted INT DEFAULT 0,
  updated_at INT, created_at INT, meta_json TEXT DEFAULT '{}');
  CREATE TABLE task_group_members (group_id TEXT, workspace_key TEXT, task_id TEXT,
  sort_order INT, added_at INT, updated_at INT);`);
const ins = db.prepare('INSERT INTO tasks (task_id, workspace_key, updated_at, created_at, meta_json) VALUES (?, ?, ?, ?, ?)');
const WS = '/ws';
for (const [i, id] of ['t1', 't2', 't3', 't4'].entries()) {
  ins.run(id, WS, 1000 - i, 500 - i, JSON.stringify({ updatedAt: 1000 - i }));
}
ins.run('x1', '/other', 900, 400, '{}');
const order = () => db.prepare(
  'SELECT task_id FROM tasks WHERE workspace_key = ? AND deleted = 0 ORDER BY updated_at DESC, created_at DESC, task_id DESC'
).all(WS).map((r) => r.task_id);

assert(order().join(',') === 't1,t2,t3,t4', '初始顺序 t1 t2 t3 t4');

// 拖动 [t3, t1]：子集按新顺序插回原最小锚位（t1 原在 0 位）→ t3 t1 t2 t4
const r1 = await reorderWorkspaceTasks(root, ['/ws:t3', '/ws:t1']);
assert(r1 && r1.reordered === 2, `重排受理（实际 ${JSON.stringify(r1)}）`);
assert(order().join(',') === 't3,t1,t2,t4', `子序列拼接顺序正确（实际 ${order().join(',')}）`);
const row = db.prepare('SELECT updated_at, meta_json FROM tasks WHERE task_id = ?').get('t3');
assert(JSON.parse(row.meta_json).updatedAt === row.updated_at, 'meta_json.updatedAt 与 updated_at 同值（重启后顺序不变）');

// 坏键回 400 类错误；混入外区键/重复键不挤占序号
const r2 = await reorderWorkspaceTasks(root, ['/ws:t2', 'badkey']);
assert(r2 && r2.code === 'invalid-request', `坏键被拒为 invalid-request（实际 ${JSON.stringify(r2)}）`);
await reorderWorkspaceTasks(root, ['/ws:t2', '/other:x1', '/ws:t2']);
assert(order().join(',') === 't3,t1,t2,t4', `外区键与重复键被过滤、顺序不被挤偏（实际 ${order().join(',')}）`);
assert(db.prepare('SELECT updated_at FROM tasks WHERE task_id = ?').get('x1').updated_at === 900, '外区会话的时间戳不被碰');
// 重复键不只挤偏：不去重时同一会话被写两次时间戳、顺序错乱（t3,t1,t4,t2），
// 这个断言专抓"忘了过滤/去重"的回归。子集插回原最小锚位（t1 原在 1 位）
await reorderWorkspaceTasks(root, ['/ws:t4', '/ws:t1', '/ws:t4']);
assert(order().join(',') === 't3,t4,t1,t2', `重复键去重后按首次意图排序（实际 ${order().join(',')}）`);

// —— reorderTasks 的作用域路由与时间戳基数 ——
// 置顶列表跨工作区：两区的行并成一个全序按拖后顺序重盖，写入值不高于重排前
// 最小值（重排只改顺序，不把会话标成"刚更新过"）
ins.run('p1', '/w2', 800, 300, '{}');
ins.run('p2', '/w2', 700, 200, '{}');
const r3 = await reorderTasks(root, ['/w2:p1', '/other:x1', '/w2:p2'], 'pinned');
assert(r3 && r3.reordered === 3, `置顶跨工作区受理（实际 ${JSON.stringify(r3)}）`);
const pinnedRows = db.prepare(
  "SELECT workspace_key || ':' || task_id AS k, updated_at FROM tasks WHERE workspace_key IN ('/w2','/other') AND deleted = 0 ORDER BY updated_at DESC"
).all();
assert(pinnedRows.map((r) => r.k).join(',') === '/w2:p1,/other:x1,/w2:p2',
  `跨工作区顺序按拖后来（实际 ${pinnedRows.map((r) => r.k).join(',')}）`);
assert(pinnedRows.every((r) => r.updated_at <= 700),
  `重排不把时间戳标新（实际 ${pinnedRows.map((r) => r.updated_at).join(',')}）`);

// 分组排序：单组受理按新顺序盖 sort_order；两组都含全部键时报歧义
const insG = db.prepare('INSERT INTO task_group_members (group_id, workspace_key, task_id, sort_order, added_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
for (const [i, id] of ['t1', 't2', 't3'].entries()) insG.run('g1', WS, id, i, i, 0);
const g1 = await reorderGroupMembers(root, ['/ws:t3', '/ws:t1', '/ws:t2']);
assert(g1 && g1.groupId === 'g1' && g1.reordered === 3, `分组重排受理（实际 ${JSON.stringify(g1)}）`);
const gOrder = db.prepare('SELECT task_id FROM task_group_members WHERE group_id = ? ORDER BY sort_order ASC').all('g1').map((r) => r.task_id);
assert(gOrder.join(',') === 't3,t1,t2', `分组顺序正确（实际 ${gOrder.join(',')}）`);
// 无项目容器的列表按数据判定：同属唯一分组 → 分组排序；不属任何分组 → 工作区排序
const r4 = await reorderTasks(root, ['/ws:t3', '/ws:t1'], 'section');
assert(r4 && r4.groupId === 'g1', `分组列表按数据判定进分组（实际 ${JSON.stringify(r4)}）`);
const r5 = await reorderTasks(root, ['/ws:t4', '/ws:t2']);
assert(r5 && r5.workspace === '/ws' && !r5.groupId, `无分组时退回工作区排序（实际 ${JSON.stringify(r5)}）`);
for (const id of ['t1', 't2', 't3']) insG.run('g2', WS, id, 0, 0, 0);
const g2 = await reorderGroupMembers(root, ['/ws:t3', '/ws:t1', '/ws:t2']);
assert(g2 && g2.code === 'group-ambiguous', `两组同键报歧义（实际 ${JSON.stringify(g2)}）`);
// 旧注入包的 scope 值直通对应分支；'section' 遇歧义双组退回工作区排序
const r6 = await reorderTasks(root, ['/ws:t2', '/ws:t4'], 'workspace');
assert(r6 && r6.workspace === '/ws' && !r6.groupId, `旧 scope=workspace 直通工作区（实际 ${JSON.stringify(r6)}）`);
const r7 = await reorderTasks(root, ['/ws:t3', '/ws:t1'], 'group-members');
assert(r7 && r7.code === 'group-ambiguous', `旧 scope=group-members 直通分组、歧义原样报错（实际 ${JSON.stringify(r7)}）`);
const r8 = await reorderTasks(root, ['/ws:t3', '/ws:t1'], 'section');
assert(r8 && r8.workspace === '/ws' && !r8.groupId, `歧义双组退回工作区排序（实际 ${JSON.stringify(r8)}）`);

// —— 边界分支 ——
const wsOrder = (ws) => db.prepare(
  'SELECT task_id FROM tasks WHERE workspace_key = ? AND deleted = 0 ORDER BY updated_at DESC, created_at DESC, task_id DESC'
).all(ws).map((r) => r.task_id);

// 空工作区：键合法但库里没有该工作区的会话 → workspace-empty
const r9 = await reorderWorkspaceTasks(root, ['/nows:zz']);
assert(r9 && r9.code === 'workspace-empty' && /不存在或没有会话/.test(r9.error || ''),
  `空工作区报 workspace-empty（实际 ${JSON.stringify(r9)}）`);

// deleted=1 的行不进排序也不占序号（查询漏了 deleted=0 会让已删会话挤进全序、被重盖时间戳）
const insDel = db.prepare('INSERT INTO tasks (task_id, workspace_key, deleted, updated_at, created_at, meta_json) VALUES (?, ?, 1, ?, ?, ?)');
insDel.run('del1', '/wsd', 999999, 999999, '{}');
ins.run('d1', '/wsd', 500, 400, '{}');
ins.run('d2', '/wsd', 400, 300, '{}');
const rd = await reorderWorkspaceTasks(root, ['/wsd:d2', '/wsd:d1']);
assert(rd && rd.reordered === 2, `已删行不占序号（reordered=2，实际 ${JSON.stringify(rd)}）`);
assert(wsOrder('/wsd').join(',') === 'd2,d1', `已删行不进排序（实际 ${wsOrder('/wsd').join(',')}）`);
assert(db.prepare('SELECT updated_at FROM tasks WHERE task_id = ?').get('del1').updated_at === 999999, '已删行时间戳不被重盖');

// 平局排序：updated_at 相同按 created_at / task_id 决出（只拖第二个，锚位算错就会换位）
ins.run('tt_a', '/wst', 500, 500, '{}');
ins.run('tt_b', '/wst', 500, 500, '{}');
ins.run('tc_x', '/wst', 600, 200, '{}');
ins.run('tc_y', '/wst', 600, 100, '{}');
const rt = await reorderWorkspaceTasks(root, ['/wst:tt_a']);
const tRows = db.prepare('SELECT task_id, updated_at FROM tasks WHERE workspace_key = ?').all('/wst');
assert(rt && rt.reordered === 1 && new Set(tRows.map((r) => r.updated_at)).size === 4,
  `平局重排后各行时间戳互不相同（写入生效，实际 ${JSON.stringify(tRows)}）`);
assert(wsOrder('/wst').join(',') === 'tc_x,tc_y,tt_b,tt_a',
  `平局按 created_at/task_id 决出且锚位正确（实际 ${wsOrder('/wst').join(',')}）`);

// 基数退化：全部 updated_at 为 0 时基数退回当前时间，不抛错、顺序照常生效
ins.run('z1', '/ws0', 0, 300, '{}');
ins.run('z2', '/ws0', 0, 200, '{}');
const rz = await reorderWorkspaceTasks(root, ['/ws0:z2', '/ws0:z1']);
const zRows = db.prepare('SELECT task_id, updated_at FROM tasks WHERE workspace_key = ?').all('/ws0');
assert(rz && rz.reordered === 2 && !rz.code, `updated_at 全 0 时不炸（实际 ${JSON.stringify(rz)}）`);
assert(wsOrder('/ws0').join(',') === 'z2,z1' && zRows.every((r) => r.updated_at > Date.now() - 60_000),
  `基数退回当前时间、顺序生效（实际 ${JSON.stringify(zRows)}）`);
db.close();

rmSync(root, { recursive: true, force: true });
console.log(failed ? 'FAILED' : 'all ok');
process.exit(failed);
