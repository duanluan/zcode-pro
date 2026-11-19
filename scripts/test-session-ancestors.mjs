// 会话库查询回归：listSessionAncestors（子代理会话沿 parent_id 上溯，Windows
// 归属用）与 listWorkspaceSubagentActivity（空闲回收的子代理保护）。用临时库
// 分别跑 node 驱动和 sqlite3 CLI 驱动，避免只在一个驱动上碰巧正确。
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { listSessionAncestors, listWorkspaceSubagentActivity } from '../src/host/taskIndex.mjs';

let failed = 0;
const assert = (cond, msg) => {
  if (!cond) { console.error('FAIL: ' + msg); failed = 1; }
  else console.log('ok: ' + msg);
};

const root = mkdtempSync(join(tmpdir(), 'zcodepro-anc-'));
const dbFile = join(root, 'cli', 'db', 'db.sqlite');
mkdirSync(join(root, 'cli', 'db'), { recursive: true });
const sql = `
  CREATE TABLE session (
    id TEXT PRIMARY KEY, parent_id TEXT, directory TEXT NOT NULL DEFAULT '',
    time_updated INTEGER NOT NULL DEFAULT 0,
    task_type TEXT NOT NULL DEFAULT 'interactive'
  );
  INSERT INTO session (id, parent_id, directory, time_updated, task_type) VALUES
    ('root_a', NULL, '/w/a/', 50, 'interactive'),
    ('child_b', 'root_a', '/w/a/', 50, 'interactive'),
    ('grand_c', 'child_b', '/w/a/', 50, 'interactive'),
    ('sess_subagent_agent_x', 'grand_c', '/w/a/', 100, 'subagent_child'),
    ('sess_subagent_agent_y', 'root_a', '/w/a', 200, 'subagent_child'),
    ('sess_subagent_win', 'root_a', 'C:\\x\\Y\\', 300, 'subagent_child'),
    ('only_interactive', NULL, '/w/b/', 999, 'interactive'),
    ('selfloop', 'selfloop', '', 0, 'interactive'),
    ('cyc_p', 'cyc_q', '', 0, 'interactive'),
    ('cyc_q', 'cyc_p', '', 0, 'interactive');
`;
try {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(dbFile);
  try { db.exec(sql); } finally { db.close(); }
} catch {
  const r = spawnSync('sqlite3', [dbFile], { input: sql, encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('FAIL: 无法创建临时会话库: ' + (r.stderr || r.error));
    process.exit(1);
  }
}

const chk = (r, id, want, label) => {
  assert(JSON.stringify(r[id]) === JSON.stringify(want), `${label}: ${id} → ${JSON.stringify(r[id])}`);
};

const run = async (driver) => {
  if (driver === 'cli') process.env.ZCODEPRO_SQLITE_DRIVER = 'cli';
  else delete process.env.ZCODEPRO_SQLITE_DRIVER;
  const ids = ['root_a', 'child_b', 'grand_c', 'sess_subagent_agent_x', 'missing', 'selfloop', 'cyc_p'];
  const r = await listSessionAncestors(root, ids);
  chk(r, 'root_a', ['root_a'], `${driver} 根会话`);
  chk(r, 'child_b', ['child_b', 'root_a'], `${driver} 一层父链`);
  chk(r, 'grand_c', ['grand_c', 'child_b', 'root_a'], `${driver} 两层父链`);
  chk(r, 'sess_subagent_agent_x', ['sess_subagent_agent_x', 'grand_c', 'child_b', 'root_a'], `${driver} 子代理会话上溯到根`);
  assert(!('missing' in r), `${driver} 不存在的 id 不出现在结果里`);
  chk(r, 'selfloop', ['selfloop'], `${driver} 自引用不死循环`);
  assert(r.cyc_p && r.cyc_p[0] === 'cyc_p' && r.cyc_p.includes('cyc_q'), `${driver} 环不死循环`);

  // 子代理活动：directory 各平台写法归一（尾 /、尾 \、大小写），只算 subagent_child
  const act = (p) => listWorkspaceSubagentActivity(root, p);
  assert(await act('/w/a') === 200, `${driver} directory 带尾斜杠命中`);
  assert(await act('/w/a/') === 200, `${driver} 请求带尾斜杠命中`);
  assert(await act('/W/A') === 200, `${driver} 大小写不同仍命中`);
  assert(await act('c:/x/y') === 300, `${driver} Windows 正斜杠形式命中`);
  assert(await act('c:\\X\\Y') === 300, `${driver} Windows 反斜杠 + 大小写命中`);
  assert(await act('/w/none') === 0, `${driver} 没有子代理的工作区返回 0`);
  assert(await act('/w/b') === 0, `${driver} 只有 interactive 会话不算子代理活动`);
};

for (const driver of ['node', 'cli']) await run(driver);

delete process.env.ZCODEPRO_SQLITE_DRIVER;

// 会话库不存在 = 确定没有子代理活动，返回 0（而不是“未知”）
const emptyRoot = mkdtempSync(join(tmpdir(), 'zcodepro-empty-'));
assert(await listWorkspaceSubagentActivity(emptyRoot, '/w/a') === 0, '会话库不存在返回 0');
rmSync(emptyRoot, { recursive: true, force: true });

rmSync(root, { recursive: true, force: true });
assert(!existsSync(root), '临时库已清理');
process.exit(failed);
