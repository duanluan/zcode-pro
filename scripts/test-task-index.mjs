// 任务索引标题链路回归测试：setCustomSessionTitle 权威写入与
// reconcileCustomTitles 批量校正，外加 sweepDeferredBg 的延迟删除时间窗。
// 零依赖（node:sqlite），node scripts/test-task-index.mjs（或 npm test）直接跑，
// 全绿退出码 0。HOME 指进沙箱：任何漏到真实目录的写都会现形。
// 覆盖：custom 写入语义（title_source/timestamp/只增不减）、旧库无列跳过、
// 校正只动"我们写过且 CLI 仍是所写值"的行、他人改名/自动源/已删行不动、
// 坏会话 id 不崩、.tmp/.deleted 超 24 小时才清（进行中的不误删）。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, utimesSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setCustomSessionTitle, reconcileCustomTitles } from '../src/host/taskIndex.mjs';
import { sweepDeferredBg } from '../src/host/helper.mjs';

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

rmSync(root, { recursive: true, force: true });
rmSync(oldRoot, { recursive: true, force: true });
console.log(failed ? 'FAILED' : 'all ok');
process.exit(failed);
