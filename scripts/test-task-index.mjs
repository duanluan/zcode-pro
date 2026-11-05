// 任务索引标题链路回归测试：setCustomSessionTitle 权威写入与
// reconcileCustomTitles 批量校正，外加 sweepDeferredBg 的延迟删除时间窗。
// 零依赖（node:sqlite），node scripts/test-task-index.mjs（或 npm test）直接跑，
// 全绿退出码 0。HOME 指进沙箱：任何漏到真实目录的写都会现形。
// 覆盖：custom 写入语义（title_source/timestamp/只增不减）、旧库无列跳过、
// 校正只动"我们写过且 CLI 仍是所写值"的行、他人改名/自动源/已删行不动、
// 坏会话 id 不崩、.tmp/.deleted 超 24 小时才清（进行中的不误删）。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, utimesSync, existsSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setCustomSessionTitle, reconcileCustomTitles, listSessionsActivity, listWorkspaceTaskIds, listSubagentChildrenActivity, listProjectsUnread } from '../src/host/taskIndex.mjs';
import { sweepDeferredBg, scanBackgroundBash } from '../src/host/helper.mjs';

const root = mkdtempSync(join(tmpdir(), 'zcodepro-taskindex-test-'));
process.env.HOME = join(root, 'fake-home'); // 真实 HOME 进沙箱，防写穿
mkdirSync(process.env.HOME, { recursive: true });

let failed = 0;
const assert = (cond, msg) => {
  if (!cond) { console.error('FAIL: ' + msg); failed = 1; }
  else console.log('ok: ' + msg);
};

// —— 建两个库：CLI 会话库 + 任务索引 ——
mkdirSync(join(root, 'cli', 'db'), { recursive: true });
mkdirSync(join(root, 'v2'), { recursive: true });
const cli = new DatabaseSync(join(root, 'cli', 'db', 'db.sqlite'));
cli.exec(`CREATE TABLE session (id TEXT PRIMARY KEY, title TEXT, title_source TEXT,
  time_title_updated INT DEFAULT 0, time_updated INT DEFAULT 100);`);
const idx = new DatabaseSync(join(root, 'v2', 'tasks-index.sqlite'));
idx.exec('CREATE TABLE tasks (task_id TEXT PRIMARY KEY, title TEXT, title_overridden INT DEFAULT 1, deleted INT DEFAULT 0);');
const addCli = (id, title, src, ts = 100) => cli.prepare('INSERT INTO session (id, title, title_source, time_updated) VALUES (?, ?, ?, ?)').run(id, title, src, ts);
const FUTURE_TS = Date.now() + 86400000;
addCli('sess_future', 'auto name', 'auto', FUTURE_TS); // 时间戳在未来：time_updated 只增不减的判别行
const addIdx = (id, title, overridden = 1, deleted = 0) => idx.prepare('INSERT INTO tasks (task_id, title, title_overridden, deleted) VALUES (?, ?, ?, ?)').run(id, title, overridden, deleted);

// —— setCustomSessionTitle ——
addCli('sess_ok', 'auto name', 'auto');
const w1 = await setCustomSessionTitle(root, 'sess_ok', '我的标题');
assert(w1 && w1.written === true, `custom 写入成功（实际 ${JSON.stringify(w1)}）`);
const row = cli.prepare('SELECT title, title_source, time_title_updated, time_updated FROM session WHERE id = ?').get('sess_ok');
assert(row.title === '我的标题' && row.title_source === 'custom', 'title 与 title_source=custom 落库');
assert(row.time_title_updated > 0 && row.time_updated >= 100, 'time_title_updated 写入、time_updated 不回退');
const w4 = await setCustomSessionTitle(root, 'sess_future', '新标题');
const fRow = cli.prepare('SELECT time_updated FROM session WHERE id = ?').get('sess_future');
assert(w4 && w4.written && fRow.time_updated === FUTURE_TS, 'time_updated 只增不减（未来时间戳不被改小）');
const w2 = await setCustomSessionTitle(root, 'sess_missing', 'x');
assert(w2 && w2.written === false && w2.skipped === 'no-session-row', `无会话行跳过（实际 ${JSON.stringify(w2)}）`);
const oldRoot = mkdtempSync(join(tmpdir(), 'zcodepro-taskindex-old-'));
mkdirSync(join(oldRoot, 'cli', 'db'), { recursive: true });
const oldCli = new DatabaseSync(join(oldRoot, 'cli', 'db', 'db.sqlite'));
oldCli.exec('CREATE TABLE session (id TEXT PRIMARY KEY, title TEXT);'); // 旧版无 title_source 列
oldCli.prepare('INSERT INTO session (id, title) VALUES (?, ?)').run('sess_old', 't');
oldCli.close();
const w3 = await setCustomSessionTitle(oldRoot, 'sess_old', 'x');
assert(w3 && w3.skipped === 'no-title-source', `旧库无 title_source 列跳过（实际 ${JSON.stringify(w3)}）`);

// —— reconcileCustomTitles 批量校正 ——
addCli('sess_fix', 'A', 'custom');        // 我们写过、CLI 仍是所写值
addIdx('sess_fix', 'B');                  // 索引被自动标题改回旧值 → 应校正回 A
addCli('sess_other', 'X', 'custom');      // 他人已改名（≠ 所写值）
addIdx('sess_other', 'B');
addCli('sess_auto', 'A', 'auto');         // 自动源不认
addIdx('sess_auto', 'B');
addCli('sess_gone', 'A', 'custom');
addIdx('sess_gone', 'B', 1, 1);           // 已删行不动
addCli('sess_plain', 'A', 'custom');
addIdx('sess_plain', 'B', 0);             // title_overridden=0 不动
const r = await reconcileCustomTitles(root, {
  sess_fix: { title: 'A', at: 1 },
  sess_other: { title: 'B', at: 1 },      // 所写值 B ≠ CLI 的 X → 跳过
  sess_auto: { title: 'A', at: 1 },
  sess_gone: { title: 'A', at: 1 },
  sess_plain: { title: 'A', at: 1 },
  'bad id; DROP': { title: 'A', at: 1 },  // 坏 id 不崩
});
assert(Array.isArray(r) && r.length === 1 && r[0] === 'sess_fix', `只校正命中的行（实际 ${JSON.stringify(r)}）`);
assert(idx.prepare('SELECT title FROM tasks WHERE task_id = ?').get('sess_fix').title === 'A', '索引标题改回所写值');
assert(idx.prepare('SELECT title FROM tasks WHERE task_id = ?').get('sess_other').title === 'B', '他人改名的不动');
assert(idx.prepare('SELECT title FROM tasks WHERE task_id = ?').get('sess_auto').title === 'B', '自动源的不动');
assert(idx.prepare('SELECT title FROM tasks WHERE task_id = ?').get('sess_gone').title === 'B', '已删行不动');
cli.close();
idx.close();

// —— sweepDeferredBg：超 24 小时才清，进行中的不误删 ——
const bgDir = join(root, 'backgrounds');
mkdirSync(bgDir, { recursive: true });
const old = new Date(Date.now() - 25 * 3600 * 1000);
const mid = new Date(Date.now() - 2 * 3600 * 1000); // 2 小时龄：24 小时窗口的判别年龄
for (const n of ['fresh.tmp', 'a.deleted-x']) writeFileSync(join(bgDir, n), 'x');
writeFileSync(join(bgDir, 'mid.tmp'), 'x');
utimesSync(join(bgDir, 'mid.tmp'), mid, mid);
for (const n of ['old.tmp', 'b.deleted-x', 'keep.png']) {
  writeFileSync(join(bgDir, n), 'x');
  utimesSync(join(bgDir, n), old, old);
}
sweepDeferredBg(bgDir);
const left = readdirSync(bgDir).sort();
assert(left.includes('fresh.tmp') && left.includes('a.deleted-x') && left.includes('mid.tmp'), '24 小时内的 .tmp/.deleted 不清（进行中/待删保留，含 2 小时龄）');
assert(!left.includes('old.tmp') && !left.includes('b.deleted-x'), '超 24 小时的 .tmp/.deleted 清掉');
assert(left.includes('keep.png'), '正常媒体文件不碰');
assert(!existsSync(join(process.env.HOME, '.zcode', 'headroom.json')), '不写真实 HOME');

// —— listSessionsActivity / listWorkspaceTaskIds（子代理运行提示的配套查询）——
// 自带一套库，不共用上面的 fixture（列结构不同）
const root3 = mkdtempSync(join(tmpdir(), 'zcodepro-taskindex-subagent-'));
mkdirSync(join(root3, 'cli', 'db'), { recursive: true });
mkdirSync(join(root3, 'v2'), { recursive: true });
const cli3 = new DatabaseSync(join(root3, 'cli', 'db', 'db.sqlite'));
cli3.exec('CREATE TABLE session (id TEXT PRIMARY KEY, time_updated INT DEFAULT 0, parent_id TEXT, task_type TEXT DEFAULT \'interactive\');');
cli3.prepare('INSERT INTO session (id, time_updated) VALUES (?, ?)').run('sess_a', 1111);
cli3.prepare('INSERT INTO session (id, time_updated) VALUES (?, ?)').run("sess_'q", 2222); // 引号 id 不崩
const addChild3 = (id, parent, at, type = 'subagent_child') => cli3.prepare(
  'INSERT INTO session (id, time_updated, parent_id, task_type) VALUES (?, ?, ?, ?)').run(id, at, parent, type);
addChild3('child_1', 'sess_a', 3333);
addChild3('grand_1', 'child_1', 4444);              // 嵌套子代理，根归 sess_a
addChild3('child_side', 'sess_other_root', 5555);   // 别的会话的子代理不掺进来
addChild3('not_sub', 'sess_a', 6666, 'interactive'); // 非子代理会话不算
const idx3 = new DatabaseSync(join(root3, 'v2', 'tasks-index.sqlite'));
idx3.exec(`CREATE TABLE tasks (task_id TEXT PRIMARY KEY, workspace_path TEXT,
  updated_at INT DEFAULT 0, deleted INT DEFAULT 0,
  project_id TEXT, unread_at INT, task_status TEXT, cli_deleted INT DEFAULT 0);`);
const NOW3 = Date.now();
const addIdx3 = (id, ws, at, del = 0) => idx3.prepare(
  'INSERT INTO tasks (task_id, workspace_path, updated_at, deleted) VALUES (?, ?, ?, ?)').run(id, ws, at, del);
addIdx3('sess_old', '/proj/', NOW3 - 1000, 0);
addIdx3('sess_new', '/proj', NOW3 - 500, 0);          // 尾分隔符两种写法都算同一工作区
addIdx3('sess_del', '/proj', NOW3 - 400, 1);          // 已删除的不返回
addIdx3('sess_aged', '/proj', NOW3 - 8 * 86400_000);  // 超 7 天的不返回
addIdx3('sess_else', '/other', NOW3 - 300);
// —— listProjectsUnread 的素材（项目未读徽标忽略错误行）——
const addUnread3 = (id, proj, status, unreadAt, del = 0, cliDel = 0) => idx3.prepare(
  'INSERT INTO tasks (task_id, workspace_path, updated_at, deleted, project_id, unread_at, task_status, cli_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  .run(id, '/unread-proj', Date.now(), del, proj, unreadAt, status, cliDel);
addUnread3('u_err_1', 'P1', 'error', 100);        // 错误态：不算
addUnread3('u_ok_1', 'P1', 'completed', 100);    // 真未读：算
addUnread3('u_err_2', 'P2', 'error', 100);       // 只有错误未读：真未读 0
addUnread3('u_del', 'P2', 'error', 100, 1);      // 已删的不计
addUnread3('u_read', 'P2', 'completed', null);   // 已读的不计
cli3.close();
idx3.close();

const act = await listSessionsActivity(root3, ['sess_a', 'sess_missing', "sess_'q"]);
assert(act.sess_a === 1111 && act["sess_'q"] === 2222, '活动时间按 id 返回（含引号 id）');
assert(act.sess_missing === undefined, '查不到的会话不记活动');
assert(Object.keys(await listSessionsActivity(root3, [])).length === 0, '空输入返回空表');
const wsIds = await listWorkspaceTaskIds(root3, '/proj/');
assert(wsIds.join(',') === 'sess_new,sess_old', `工作区会话按最近更新排序、尾分隔符归一、删/超期不返回（实际 ${wsIds.join(',')}）`);
assert((await listWorkspaceTaskIds(root3, '/other')).join(',') === 'sess_else', '别的工作区不串');
assert((await listWorkspaceTaskIds(root3, '/none')).length === 0, '无匹配返回空');
assert((await listWorkspaceTaskIds(join(root3, 'no-such'), '/proj')).length === 0, '库不存在返回空');

const kids = await listSubagentChildrenActivity(root3, ['sess_a', 'sess_none']);
const kidMap = Object.fromEntries(kids.map((k) => [k.id, k]));
assert(kidMap.child_1 && kidMap.child_1.root === 'sess_a' && kidMap.child_1.at === 3333, '子代理带根归属与活动时间返回');
assert(kidMap.grand_1 && kidMap.grand_1.root === 'sess_a', '嵌套子代理递归归到最初会话');
assert(!kidMap.child_side, '别的会话的子代理不掺进来');
assert(!kidMap.not_sub, '非子代理会话不算');
assert((await listSubagentChildrenActivity(root3, [])).length === 0, '空输入返回空');

// —— listProjectsUnread（项目未读徽标忽略错误行）——
const pu = await listProjectsUnread(root3, ['P1', 'P2', 'P3', "P'q"]);
assert(pu.P1 === 1, `错误行不算未读（实际 ${pu.P1})`);
assert(pu.P2 === 0, '只有错误未读的项目真未读为 0（徽标应隐）');
assert(pu.P3 === undefined && pu["P'q"] === undefined, '没有未读的项目不返回');
assert(await listProjectsUnread(root3, []) !== null, '空输入返回空表');
rmSync(root3, { recursive: true, force: true });

// —— scanBackgroundBash（后台终端命令扫描：进程握着任务日志才算在跑）——
const root4 = mkdtempSync(join(tmpdir(), 'zcodepro-bashscan-'));
const proc4 = join(root4, 'proc');
mkdirSync(join(root4, 'zcode-bash-abc', 'sess_x1'), { recursive: true });
mkdirSync(join(root4, 'zcode-bash-abc', 'sess_x2'), { recursive: true });
mkdirSync(join(root4, 'zcode-bash-abc', 'notsess'), { recursive: true });
writeFileSync(join(root4, 'zcode-bash-abc', 'sess_x1', 'call_j1-stdout.log'), '');
writeFileSync(join(root4, 'zcode-bash-abc', 'sess_x2', 'call_j2-stdout.log'), '');
writeFileSync(join(root4, 'zcode-bash-abc', 'sess_x2', 'call_j3-stderr.log'), ''); // 只认 stdout 日志
mkdirSync(join(proc4, '501', 'fd'), { recursive: true });
mkdirSync(join(proc4, '502', 'fd'), { recursive: true });
symlinkSync(join(root4, 'zcode-bash-abc', 'sess_x2', 'call_j2-stdout.log'), join(proc4, '502', 'fd', '1'));
const bb = scanBackgroundBash(root4, proc4);
assert(bb.ok === true && bb.jobs.length === 1 && bb.jobs[0].sessionId === 'sess_x2' && bb.jobs[0].jobId === 'j2',
  `只认被进程握着的日志（实际 ${JSON.stringify(bb.jobs)}）`);
symlinkSync(join(root4, 'zcode-bash-abc', 'sess_x2', 'call_j2-stdout.log'), join(proc4, '501', 'fd', '2'));
const bb2 = scanBackgroundBash(root4, proc4);
assert(bb2.ok && bb2.jobs.length === 1, '同任务 stdout/stderr 两个 fd 去重');
rmSync(join(proc4, '501'), { recursive: true, force: true });
rmSync(join(proc4, '502'), { recursive: true, force: true });
const bb3 = scanBackgroundBash(root4, proc4);
assert(bb3.ok && bb3.jobs.length === 0, '进程退出（没人握文件）就不算在跑');
assert(typeof scanBackgroundBash(root4, join(root4, 'no-proc')).ok === 'boolean', '无 /proc 走回退不抛错');
rmSync(root4, { recursive: true, force: true });

rmSync(root, { recursive: true, force: true });
rmSync(oldRoot, { recursive: true, force: true });
console.log(failed ? 'FAILED' : 'all ok');
process.exit(failed);
