// 任务索引（~/.zcode/v2/tasks-index.sqlite）的路径重映射。
// 项目切换文件夹后，侧边栏项目列表与任务历史由该库派生，需同步更新其中的路径引用。
//
// workspace 列分布（逆向自真实库 schema）：
// - 仅 workspace_key：task_group_workspace_bootstraps（主键）、automation_runs；
// - workspace_key + workspace_path + workspace_identity：
//   tasks（key 为联合主键）、automations、off_peak_tasks、task_group_members（key 为联合主键）；
// - 另有 tasks.meta_json 内嵌 "workspacePath":"<路径>"；
//   task_group_view_node_orders.node_key（node_type='task'）内嵌 JSON 数组 ["<workspace_key>","<task_id>"]；
// - workspace_identity 格式未详，按「引号界定的精确串」替换（哈希值不会含路径，LIKE 只做免更新过滤）；
// - tasks.searchable_text 是会话内容文本（可能提及任何路径），不属于路径引用，不动。
//
// 驱动：优先 node:sqlite（Node ≥23.4 内置），退回 sqlite3 CLI；两者都没有则返回 null，
// 调用方自行降级（只移动目录与更新 setting.json）。
// 并发：ZCode 宿主进程持有该库（WAL 模式），所有写入走 BEGIN IMMEDIATE + busy_timeout。

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const BUSY_TIMEOUT_MS = 5000;

export function taskIndexPath(dataRoot) {
  return join(dataRoot, 'v2', 'tasks-index.sqlite');
}

export async function taskIndexDriverAvailable() {
  return (await loadDriver()) !== null;
}

async function loadDriver() {
  // ZCODEPRO_SQLITE_DRIVER=cli：调试/测试用，强制走 sqlite3 CLI 驱动
  if (String(process.env.ZCODEPRO_SQLITE_DRIVER || '').toLowerCase() !== 'cli') {
    try {
      const { DatabaseSync } = await import('node:sqlite');
      return { kind: 'node', DatabaseSync };
    } catch { /* Node <23.4：退回 CLI */ }
  }
  try {
    const r = spawnSync('sqlite3', ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return { kind: 'cli' };
  } catch { /* 没有 sqlite3 可执行文件 */ }
  return null;
}

// 探测：能在 BUSY_TIMEOUT 内拿到写锁。失败抛 { code: 'index-busy' | 'index-error' }。
export async function probeTaskIndexWritable(dataRoot) {
  const dbFile = taskIndexPath(dataRoot);
  const driver = await loadDriver();
  if (!driver) {
    const err = new Error('缺少 SQLite 支持（需要 Node ≥23.4 或 sqlite3 命令）');
    err.code = 'index-error';
    throw err;
  }
  try {
    if (driver.kind === 'node') {
      const db = new driver.DatabaseSync(dbFile);
      try {
        db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
        db.exec('BEGIN IMMEDIATE');
        db.exec('ROLLBACK');
      } finally { db.close(); }
    } else {
      runCli(dbFile, 'BEGIN IMMEDIATE;\nROLLBACK;');
    }
  } catch (err) {
    if (!isBusyError(err)) {
      const e = new Error('任务索引不可写: ' + (err?.message || err));
      e.code = 'index-error';
      throw e;
    }
    const e = new Error('任务索引正被占用（ZCode 可能正在写入），请稍后重试');
    e.code = 'index-busy';
    throw e;
  }
}

// 把索引中所有引用 oldPath 的 workspace 键/字段重映射为 newPath，单事务。
// 返回 { changed }（SQLite changes() 计数之和，CLI 驱动返回 null）。
export async function remapTaskIndexPaths(dataRoot, oldPath, newPath) {
  const dbFile = taskIndexPath(dataRoot);
  const driver = await loadDriver();
  if (!driver) {
    const err = new Error('缺少 SQLite 支持（需要 Node ≥23.4 或 sqlite3 命令）');
    err.code = 'index-error';
    throw err;
  }
  const sep = process.platform === 'win32' ? '\\' : '/';
  // workspace_key 的两种拼写（正常化尾分隔符差异）
  const variants = [
    [oldPath, newPath],
    [oldPath + sep, newPath + sep],
  ];
  // workspace_key 所在的表（精确等值替换，无前缀误伤风险）
  const KEY_TABLES = ['tasks', 'task_group_members', 'task_group_workspace_bootstraps', 'automations', 'automation_runs', 'off_peak_tasks'];
  // 带 workspace_path / workspace_identity 的表
  const PATH_TABLES = ['tasks', 'automations', 'off_peak_tasks', 'task_group_members'];
  // 引号界定的 JSON 字符串替换："/a/b/old" 不会命中 "/a/b/old2"
  const quoted = (p) => JSON.stringify(p);
  const metaToken = (p) => '"workspacePath":' + JSON.stringify(p);

  if (driver.kind === 'node') return remapWithNode(driver.DatabaseSync, dbFile);
  return remapWithCli(dbFile);

  function remapWithNode(DatabaseSync, file) {
    const db = new DatabaseSync(file);
    let changed = 0;
    try {
      db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
      db.exec('BEGIN IMMEDIATE');
      try {
        const run = (sql, params) => {
          changed += db.prepare(sql).run(...params).changes;
        };
        for (const [oldKey, newKey] of variants) {
          for (const table of KEY_TABLES) {
            run(`UPDATE ${table} SET workspace_key = ? WHERE workspace_key = ?`, [newKey, oldKey]);
          }
          for (const table of PATH_TABLES) {
            run(`UPDATE ${table} SET workspace_path = ? WHERE workspace_path = ?`, [newKey, oldKey]);
            run(`UPDATE ${table} SET workspace_identity = replace(workspace_identity, ?, ?)
                 WHERE instr(workspace_identity, ?) > 0`, [quoted(oldKey), quoted(newKey), oldKey]);
          }
          run(`UPDATE tasks SET meta_json = replace(meta_json, ?, ?)
               WHERE instr(meta_json, ?) > 0`, [metaToken(oldKey), metaToken(newKey), oldKey]);
          run(`UPDATE task_group_view_node_orders SET node_key = replace(node_key, ?, ?)
               WHERE instr(node_key, ?) > 0`, [quoted(oldKey), quoted(newKey), oldKey]);
        }
        db.exec('COMMIT');
      } catch (err) {
        try { db.exec('ROLLBACK'); } catch { /* 已回滚/连接失效 */ }
        throw asRemapError(err);
      }
    } finally { db.close(); }
    return { changed };
  }

  function remapWithCli(file) {
    const esc = (v) => "'" + String(v).replace(/'/g, "''") + "'";
    const stmts = [];
    for (const [oldKey, newKey] of variants) {
      for (const table of KEY_TABLES) {
        stmts.push(`UPDATE ${table} SET workspace_key = ${esc(newKey)} WHERE workspace_key = ${esc(oldKey)};`);
      }
      for (const table of PATH_TABLES) {
        stmts.push(`UPDATE ${table} SET workspace_path = ${esc(newKey)} WHERE workspace_path = ${esc(oldKey)};`);
        stmts.push(`UPDATE ${table} SET workspace_identity = replace(workspace_identity, ${esc(quoted(oldKey))}, ${esc(quoted(newKey))})
                    WHERE instr(workspace_identity, ${esc(oldKey)}) > 0;`);
      }
      stmts.push(`UPDATE tasks SET meta_json = replace(meta_json, ${esc(metaToken(oldKey))}, ${esc(metaToken(newKey))})
                  WHERE instr(meta_json, ${esc(oldKey)}) > 0;`);
      stmts.push(`UPDATE task_group_view_node_orders SET node_key = replace(node_key, ${esc(quoted(oldKey))}, ${esc(quoted(newKey))})
                  WHERE instr(node_key, ${esc(oldKey)}) > 0;`);
    }
    try {
      runCli(file, 'BEGIN IMMEDIATE;\n' + stmts.join('\n') + '\nCOMMIT;');
    } catch (err) {
      throw asRemapError(err);
    }
    return { changed: null };
  }

  function asRemapError(err) {
    if (isBusyError(err)) {
      const e = new Error('任务索引正被占用（ZCode 可能正在写入），请稍后重试');
      e.code = 'index-busy';
      return e;
    }
    const e = new Error(String(err?.message || err));
    e.code = 'index-remap-failed';
    return e;
  }
}

function isBusyError(err) {
  const s = String(err?.code || '') + String(err?.message || '');
  return /SQLITE_BUSY|database is locked/i.test(s);
}

function runCli(dbFile, script) {
  const r = spawnSync('sqlite3', ['-bail', '-batch', dbFile], {
    input: `.timeout ${BUSY_TIMEOUT_MS}\n` + script,
    encoding: 'utf8',
    maxBuffer: 1 << 20,
  });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error('sqlite3 CLI 执行失败: ' + (r.stderr || r.stdout || ('exit ' + r.status)));
  return r;
}
