// 任务索引（~/.zcode/v2/tasks-index.sqlite）的路径重映射。
// 项目切换文件夹后，侧边栏项目列表与任务历史由该库派生，需同步更新其中的路径引用。
//
// workspace 列分布（逆向自真实库 schema）：
// - 仅 workspace_key：task_group_workspace_bootstraps（主键）、automation_runs；
// - workspace_key + workspace_path + workspace_identity：
//   tasks（key 为联合主键）、automations、off_peak_tasks、task_group_members（key 为联合主键）；
// - 另有 tasks.meta_json 内嵌 "workspacePath":"<路径>"；
//   task_group_view_node_orders.node_key（node_type='task'）内嵌 JSON 数组 ["<workspace_key>","<task_id>"]；
// - workspace_identity 格式未详，按“引号界定的精确串”替换（哈希值不会含路径，LIKE 只做免更新过滤）；
// - tasks.searchable_text 是会话内容文本（可能提及任何路径），不属于路径引用，不动。
//
// 驱动：优先 node:sqlite（Node ≥23.4 内置），退回 sqlite3 CLI；两者都没有则返回 null，
// 调用方自行降级（只移动目录与更新 setting.json）。
// 并发：ZCode 宿主进程持有该库（WAL 模式），所有写入走 BEGIN IMMEDIATE + busy_timeout。

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
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

// 虚拟项目清单（projects + project_roots，只读）：别名迁移弹窗用它判断每条别名的
// 目标现状——路径是某项目的附加目录（3.16.1 多目录合并）还是已删除的项目。
// 返回 { projects: [{ name, roots: [{ path, primary }] }], deletedRoots: [path] }；
// 读不到（库缺失/无驱动/查询失败）返回 null，调用方降级为纯 DOM 检测
export async function listVirtualProjects(dataRoot) {
  const dbFile = taskIndexPath(dataRoot);
  if (!existsSync(dbFile)) return null;
  const driver = await loadDriver();
  if (!driver) return null;
  const SQL_ACTIVE = `SELECT p.project_id AS pid, p.name AS name, r.root_path AS path, r.is_primary, p.name_overridden
    FROM projects p JOIN project_roots r ON r.project_id = p.project_id
    WHERE p.deleted = 0 AND (p.host_id = 'local' OR p.host_id IS NULL)`;
  const SQL_DELETED = `SELECT r.root_path AS path
    FROM projects p JOIN project_roots r ON r.project_id = p.project_id
    WHERE p.deleted = 1 AND (p.host_id = 'local' OR p.host_id IS NULL)`;
  // CLI 驱动用制表符分隔行（项目名含引号/逗号都安全；名字含制表符的极端情况不处理）
  const TAB = "char(9)";
  try {
    let activeRows;
    let deletedRows;
    if (driver.kind === 'node') {
      const db = new driver.DatabaseSync(dbFile, { readOnly: true });
      try {
        activeRows = db.prepare(SQL_ACTIVE).all();
        deletedRows = db.prepare(SQL_DELETED).all();
      } finally { db.close(); }
    } else {
      const act = runCli(dbFile,
        `SELECT p.project_id || ${TAB} || p.name || ${TAB} || r.root_path || ${TAB} || r.is_primary || ${TAB} || p.name_overridden${SQL_ACTIVE.slice(SQL_ACTIVE.indexOf(' FROM'))};`).stdout;
      activeRows = act.split('\n').filter(Boolean).map((l) => {
        const [pid, name, path, primary, overridden] = l.split('\t');
        return { pid, name, path, primary, name_overridden: overridden };
      });
      const del = runCli(dbFile,
        `SELECT r.root_path FROM projects p JOIN project_roots r ON r.project_id = p.project_id
        WHERE p.deleted = 1 AND (p.host_id = 'local' OR p.host_id IS NULL);`).stdout;
      deletedRows = del.split('\n').filter(Boolean).map((p) => ({ path: p }));
    }
    const byId = new Map();
    for (const row of activeRows) {
      const key = String(row.pid || row.name || '');
      let proj = byId.get(key);
      if (!proj) {
        proj = { id: String(row.pid || ''), name: String(row.name || ''), roots: [], overridden: Number(row.name_overridden) === 1 };
        byId.set(key, proj);
      }
      proj.roots.push({ path: String(row.path || ''), primary: Number(row.is_primary) === 1 });
    }
    // 全部出现过的任务工作区（含非项目工作区：draft/独立任务等，它们的任务
    // 显示在侧栏“任务”分区）：供分区头运行判定把活跃任务按归属分类
    let allPaths = [];
    try {
      if (driver.kind === 'node') {
        const db = new driver.DatabaseSync(dbFile, { readOnly: true });
        try { allPaths = db.prepare('SELECT DISTINCT workspace_path FROM tasks').all().map((r) => String(r.workspace_path || '')); } finally { db.close(); }
      } else {
        allPaths = runCli(dbFile, 'SELECT DISTINCT workspace_path FROM tasks;').stdout.split('\n').filter(Boolean);
      }
    } catch { /* 读不到就不带，调用方只有项目路径 */ }
    return {
      projects: [...byId.values()],
      deletedRoots: deletedRows.map((r) => String(r.path || '')),
      allPaths,
    };
  } catch {
    return null;
  }
}

// 批量查会话终态：task_id → { status, updatedAt, title }。分区头运行判定用它
// 剔除官方 syncer 卡滞的报告（会话已完成但内存态仍报活跃时，任务行 loader 会
// 一直卡转）；title 供 alt+r 弹窗显示折叠项目（行不在场）会话的标题。
// 读不到（库缺失/无驱动）返回 null，调用方按未确认处理
export async function listTaskStatuses(dataRoot, ids) {
  const out = {};
  const dbFile = taskIndexPath(dataRoot);
  if (!existsSync(dbFile)) return null;
  const driver = await loadDriver();
  if (!driver) return null;
  const esc = (v) => "'" + String(v).replace(/'/g, "''") + "'";
  const inList = ids.map((id) => esc(id)).join(', ');
  const sql = `SELECT task_id, task_status, updated_at, title FROM tasks WHERE task_id IN (${inList})`;
  try {
    let rows;
    if (driver.kind === 'node') {
      const db = new driver.DatabaseSync(dbFile, { readOnly: true });
      try { rows = db.prepare(sql).all(); } finally { db.close(); }
    } else {
      // 标题可含任意字符（含分隔符），CLI 路径走 JSON 聚合，不做分隔符切分
      const agg = runCli(dbFile,
        `SELECT coalesce(json_group_array(json_object('task_id', task_id, 'task_status', task_status, 'updated_at', updated_at, 'title', title)), '[]') FROM tasks WHERE task_id IN (${inList});`);
      rows = JSON.parse(agg.stdout.trim() || '[]');
    }
    for (const r of rows) out[String(r.task_id)] = { status: String(r.task_status || ''), updatedAt: Number(r.updated_at) || 0, title: String(r.title || '') };
    return out;
  } catch {
    return null;
  }
}

// 已重命名会话的标题表：task_id → title（title_overridden = 1 且未删除）。
// 状态栏统计用：任务总数（未删除的会话行）
export async function countTasks(dataRoot) {
  const dbFile = taskIndexPath(dataRoot);
  if (!existsSync(dbFile)) return 0;
  const driver = await loadDriver();
  if (!driver) return 0;
  const sql = 'SELECT COUNT(*) AS n FROM tasks WHERE deleted = 0';
  try {
    if (driver.kind === 'node') {
      const db = new driver.DatabaseSync(dbFile, { readOnly: true });
      try { return Number(db.prepare(sql).get()?.n) || 0; } finally { db.close(); }
    }
    return Number(runCli(dbFile, sql + ';').stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

// 只读单条 SELECT，不开事务；库不存在或没有 SQLite 支持时返回空表，
// 调用方（会话名锁定）自然降级为不干预。
export async function listOverriddenTitles(dataRoot) {
  const dbFile = taskIndexPath(dataRoot);
  if (!existsSync(dbFile)) return { titles: {} };
  const driver = await loadDriver();
  if (!driver) return { titles: {} };
  const titles = {};
  try {
    if (driver.kind === 'node') {
      const db = new driver.DatabaseSync(dbFile);
      try {
        db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
        for (const row of db.prepare(
          'SELECT task_id, title FROM tasks WHERE title_overridden = 1 AND deleted = 0'
        ).all()) {
          titles[row.task_id] = row.title;
        }
      } finally { db.close(); }
    } else {
      // json_group_object：标题里的任意字符（含引号竖线）都被正确转义，整行即一个 JSON
      const r = runCli(dbFile,
        'SELECT coalesce(json_group_object(task_id, title), \'{}\') FROM tasks WHERE title_overridden = 1 AND deleted = 0;');
      Object.assign(titles, JSON.parse(r.stdout.trim() || '{}'));
    }
  } catch (err) {
    const e = new Error('读取任务索引失败: ' + (err?.message || err));
    e.code = 'index-error';
    return { error: e.message, code: e.code };
  }
  return { titles };
}

// 智能起名的前置判定：会话是否已被手动重命名（或已被起名写过）。双写前先查它，
// 已重命名就整体跳过——避免起名晚到的写入盖掉用户的 custom 标题。读取失败按
// 未重命名处理（后续写入自带原子守卫兜底）
export async function isTaskTitleOverridden(dataRoot, sessId) {
  const dbFile = taskIndexPath(dataRoot);
  if (!existsSync(dbFile)) return false;
  const driver = await loadDriver();
  if (!driver) return false;
  try {
    if (driver.kind === 'node') {
      const db = new driver.DatabaseSync(dbFile, { readOnly: true });
      try {
        const r = db.prepare('SELECT title_overridden FROM tasks WHERE task_id = ? AND deleted = 0').get(sessId);
        return r?.title_overridden === 1;
      } finally { db.close(); }
    }
    const esc = (v) => "'" + String(v).replace(/'/g, "''") + "'";
    const r = runCli(dbFile, `SELECT title_overridden FROM tasks WHERE task_id = ${esc(sessId)} AND deleted = 0;`);
    return /^1/m.test(r.stdout);
  } catch { return false; }
}

// 智能起名写入：把生成标题按“手动重命名”存入索引（title_overridden = 1），
// 之后官方自动标题不会再覆盖这条记录。仅在会话未删除、且从未被手动重命名过
// （title_overridden = 0）时写入——手动重命名永远优先。返回 { written, title }；
// written = false 表示没写（已重命名或会话不在索引中）。库被占用时抛 index-busy。
export async function setTaskTitleIfNotOverridden(dataRoot, sessId, title) {
  const dbFile = taskIndexPath(dataRoot);
  if (!existsSync(dbFile)) return { written: false, title };
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
        try {
          const r = db.prepare(
            'UPDATE tasks SET title = ?, title_overridden = 1 WHERE task_id = ? AND deleted = 0 AND title_overridden = 0'
          ).run(title, sessId);
          db.exec('COMMIT');
          return { written: r.changes > 0, title };
        } catch (err) {
          try { db.exec('ROLLBACK'); } catch { /* 已回滚/连接失效 */ }
          throw err;
        }
      } finally { db.close(); }
    }
    const esc = (v) => "'" + String(v).replace(/'/g, "''") + "'";
    const r = runCli(dbFile,
      'BEGIN IMMEDIATE;\n'
      + `UPDATE tasks SET title = ${esc(title)}, title_overridden = 1`
      + ` WHERE task_id = ${esc(sessId)} AND deleted = 0 AND title_overridden = 0;\n`
      + 'SELECT changes();\nCOMMIT;');
    return { written: Number(r.stdout.trim()) > 0, title };
  } catch (err) {
    if (isBusyError(err)) {
      const e = new Error('任务索引正被占用（ZCode 可能正在写入）');
      e.code = 'index-busy';
      throw e;
    }
    const e = new Error('写入任务标题失败: ' + (err?.message || err));
    e.code = 'index-error';
    throw e;
  }
}

function isBusyError(err) {
  const s = String(err?.code || '') + String(err?.message || '');
  return /SQLITE_BUSY|database is locked/i.test(s);
}

// 读某会话记录的模型信息（智能起名“跟随当前会话”用）。model 列存
// “<供应商id>/<模型id>”（如 be0a90cb…/glm-5.3），拆开后返回
// { providerId, modelId }；没有斜线时 providerId 退回 provider 列的值。
// 会话不存在返回 null；读取失败按 null 处理（调用方换明确报错）。
// sessId 为空 = 取最近更新的会话（设置面板的测试按钮没有会话上下文，
// 与视觉代理的测试同款语义）
export async function getTaskProviderModel(dataRoot, sessId) {
  const driver = await loadDriver();
  if (!driver) return null;
  const esc = (v) => "'" + String(v).replace(/'/g, "''") + "'";

  // 优先读 CLI 会话库的 model_usage：首个 turn 开始时即写入，比任务索引的
  // model 列早十几秒（任务索引由桌面同步器延迟写；新会话头十几秒里它还是
  // 空值，起名第一次调用会因此解析到不存在的模型，实测 400 模型不存在）
  const usageFile = join(dataRoot, 'cli', 'db', 'db.sqlite');
  if (existsSync(usageFile) && sessId) {
    try {
      if (driver.kind === 'node') {
        const db = new driver.DatabaseSync(usageFile, { readOnly: true });
        try {
          const r = db.prepare(
            "SELECT provider_id, model_id FROM model_usage WHERE session_id = ? AND provider_id IS NOT NULL AND provider_id != '' ORDER BY started_at DESC LIMIT 1"
          ).get(sessId);
          if (r && r.model_id) return { providerId: r.provider_id, modelId: r.model_id };
        } finally { db.close(); }
      } else {
        const r = runCli(usageFile,
          `SELECT coalesce(json_object('provider_id', provider_id, 'model_id', model_id), 'null') FROM (SELECT provider_id, model_id FROM model_usage WHERE session_id = ${esc(sessId)} AND provider_id IS NOT NULL AND provider_id != '' ORDER BY started_at DESC LIMIT 1);`);
        const parsed = JSON.parse(r.stdout.trim() || 'null');
        if (parsed && parsed.model_id) return { providerId: parsed.provider_id, modelId: parsed.model_id };
      }
    } catch { /* 表不存在（旧版 CLI）等：走任务索引兜底 */ }
  }

  const dbFile = taskIndexPath(dataRoot);
  if (!existsSync(dbFile)) return null;
  let row = null;
  const where = sessId
    ? `WHERE task_id = ${esc(sessId)} AND deleted = 0`
    : 'WHERE deleted = 0 AND model != \'\' ORDER BY updated_at DESC LIMIT 1';
  try {
    if (driver.kind === 'node') {
      const db = new driver.DatabaseSync(dbFile);
      try {
        db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
        row = db.prepare(`SELECT provider, model FROM tasks ${where}`).get() || null;
      } finally { db.close(); }
    } else {
      const r = runCli(dbFile,
        `SELECT coalesce(json_object('provider', provider, 'model', model), 'null') FROM (SELECT provider, model FROM tasks ${where});`);
      const parsed = JSON.parse((r.stdout.trim() || 'null'));
      row = parsed && typeof parsed === 'object' ? parsed : null;
    }
  } catch { /* 读不了就当没有 */ }
  if (!row) return null;
  const model = String(row.model || '');
  const slash = model.indexOf('/');
  return slash > 0
    ? { providerId: model.slice(0, slash), modelId: model.slice(slash + 1) }
    : { providerId: String(row.provider || ''), modelId: model };
}

// 任务（会话）ID → 工作区路径（无尾分隔符）：空闲回收在 Windows 上的后台命令
// 归属判定用（命令行里只带会话 ID，需经索引反查它属于哪个项目）。
// 读取失败返回空表，调用方按“无法归属”保守处理
export async function listTaskWorkspaceMap(dataRoot) {
  const out = {};
  const dbFile = taskIndexPath(dataRoot);
  if (!existsSync(dbFile)) return out;
  const driver = await loadDriver();
  if (!driver) return out;
  try {
    let rows = [];
    if (driver.kind === 'node') {
      const db = new driver.DatabaseSync(dbFile);
      try {
        db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
        rows = db.prepare('SELECT task_id, workspace_path, workspace_key FROM tasks').all();
      } finally { db.close(); }
    } else {
      const r = runCli(dbFile,
        "SELECT coalesce(json_group_array(json_object('id', task_id, 'path', workspace_path, 'key', workspace_key)), '[]') FROM tasks;");
      rows = JSON.parse(r.stdout.trim() || '[]');
    }
    for (const row of rows) {
      const id = row.task_id ?? row.id;
      const ws = String(row.workspace_path ?? row.path ?? row.workspace_key ?? row.key ?? '').replace(/[\\/]+$/, '');
      if (id && ws) out[id] = ws;
    }
  } catch { /* 读取失败按空表处理 */ }
  return out;
}

function runCli(dbFile, script) {
  const r = spawnSync('sqlite3', ['-bail', '-batch', dbFile], {
    windowsHide: true,
    input: `.timeout ${BUSY_TIMEOUT_MS}\n` + script,
    encoding: 'utf8',
    maxBuffer: 1 << 20,
  });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error('sqlite3 CLI 执行失败: ' + (r.stderr || r.stdout || ('exit ' + r.status)));
  return r;
}

// CLI 会话库（~/.zcode/cli/db/db.sqlite）的会话标题权威写入：title + title_source=
// 'custom'（官方 setCustomSessionTitle 同款语义）。custom 后官方运行时彻底知情：
// 自动起名写回后的自动校正：桌面端打开会话时会把运行时内存缓存的旧标题写回
// 任务索引（实测点开会话的瞬间发生，运行时不知道我们直写过 CLI 库），索引里的
// 标题因此被改回旧值。CLI 库的 custom 标题才是权威——对“我们写过、且 CLI 标题
// 仍等于我们所写”的会话，索引标题若不同就改回 CLI 值。只认自己写过的记录：
// 官方手动改名（renameTask）两库同步更新不会分歧；其 v4 同步失败时索引比 CLI 新
// （历史会话场景），不认记录就绝不会误回滚用户的手动改名。
// writtenMap: { sessId → { title, at } }；返回本次校正的会话数（失败静默，下次再试）
export async function reconcileCustomTitles(dataRoot, writtenMap) {
  const repaired = [];
  if (!writtenMap || typeof writtenMap !== 'object') return repaired;
  const driver = await loadDriver();
  if (!driver) return repaired;
  const esc = (v) => "'" + String(v).replace(/'/g, "''") + "'";
  const cliFile = join(dataRoot, 'cli', 'db', 'db.sqlite');
  const idxFile = taskIndexPath(dataRoot);
  if (!existsSync(cliFile) || !existsSync(idxFile)) return repaired;

  const readCli = async (sessId) => {
    if (driver.kind === 'node') {
      const db = new driver.DatabaseSync(cliFile, { readOnly: true });
      try {
        return db.prepare("SELECT title, title_source FROM session WHERE id = ?").get(sessId) || null;
      } finally { db.close(); }
    }
    const r = runCli(cliFile, `SELECT coalesce(json_object('title', title, 'title_source', title_source), 'null') FROM session WHERE id = ${esc(sessId)};`);
    const parsed = JSON.parse(r.stdout.trim() || 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  };

  for (const [sessId, rec] of Object.entries(writtenMap)) {
    if (!/^sess_[A-Za-z0-9._-]+$/.test(sessId) || !rec || typeof rec.title !== 'string') continue;
    let cli;
    try { cli = await readCli(sessId); } catch { continue; }
    // CLI 已不是我们所写的 custom 标题：别人改过（手动改名/官方），不碰
    if (!cli || cli.title_source !== 'custom' || cli.title !== rec.title) continue;
    try {
      if (driver.kind === 'node') {
        const db = new driver.DatabaseSync(idxFile);
        try {
          db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
          db.exec('BEGIN IMMEDIATE');
          try {
            const r = db.prepare(
              'UPDATE tasks SET title = ? WHERE task_id = ? AND deleted = 0 AND title_overridden = 1 AND title != ?'
            ).run(rec.title, sessId, rec.title);
            db.exec('COMMIT');
            if (r.changes > 0) repaired.push(sessId);
          } catch (err) {
            try { db.exec('ROLLBACK'); } catch { /* 已回滚 */ }
            throw err;
          }
        } finally { db.close(); }
      } else {
        const r = runCli(idxFile,
          'BEGIN IMMEDIATE;\n'
          + `UPDATE tasks SET title = ${esc(rec.title)} WHERE task_id = ${esc(sessId)} AND deleted = 0 AND title_overridden = 1 AND title != ${esc(rec.title)};\n`
          + 'SELECT changes();\nCOMMIT;');
        if (Number(r.stdout.trim()) > 0) repaired.push(sessId);
      }
    } catch { /* 占用等：下次再校正 */ }
  }
  return repaired;
}

// 自动起名在写回前重读时看到 custom 会放弃（session-title.ts 的 custom_title 短路），
// 桌面同步器（zcodeTaskIndexSyncer）会把 custom 标题带着 titleOverridden=1 写回
// 任务索引——单写任务索引被官方排队的自动标题覆盖的竞态（实测 14 秒后覆盖）由此
// 消除。time_title_updated/time_updated 与官方 updateSession 一致（title 变更即刷新，
// time_updated 只增不减）；title_message_id 保留原值。旧版 CLI 库没有 title_source
// 列时返回 skipped（缺 custom 语义，写了也守不住，退回单写任务索引的旧行为）。
// 库被占用时抛 index-busy（与任务索引写入同款重试语义）。
export async function setCustomSessionTitle(dataRoot, sessId, title) {
  const dbFile = join(dataRoot, 'cli', 'db', 'db.sqlite');
  if (!existsSync(dbFile)) return { written: false, skipped: 'no-cli-db' };
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
        const cols = db.prepare("PRAGMA table_info('session')").all();
        if (!cols.some((c) => c.name === 'title_source')) return { written: false, skipped: 'no-title-source' };
        db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
        db.exec('BEGIN IMMEDIATE');
        try {
          const now = Date.now();
          const r = db.prepare(
            "UPDATE session SET title = ?, title_source = 'custom', time_title_updated = ?, time_updated = max(time_updated, ?) WHERE id = ?"
          ).run(title, now, now, sessId);
          db.exec('COMMIT');
          return { written: r.changes > 0, skipped: r.changes > 0 ? '' : 'no-session-row' };
        } catch (err) {
          try { db.exec('ROLLBACK'); } catch { /* 已回滚/连接失效 */ }
          throw err;
        }
      } finally {
        db.close();
      }
    }
    const esc = (v) => "'" + String(v).replace(/'/g, "''") + "'";
    const cols = runCli(dbFile, "PRAGMA table_info('session');").stdout;
    if (!/title_source/.test(cols)) return { written: false, skipped: 'no-title-source' };
    const now = Date.now();
    const r = runCli(dbFile,
      'BEGIN IMMEDIATE;\n'
      + `UPDATE session SET title = ${esc(title)}, title_source = 'custom',`
      + ` time_title_updated = ${now}, time_updated = max(time_updated, ${now})`
      + ` WHERE id = ${esc(sessId)};\n`
      + 'SELECT changes();\nCOMMIT;');
    const changed = Number(r.stdout.trim()) > 0;
    return { written: changed, skipped: changed ? '' : 'no-session-row' };
  } catch (err) {
    if (isBusyError(err)) {
      const e = new Error('CLI 会话库正被占用（ZCode 可能正在写入）');
      e.code = 'index-busy';
      throw e;
    }
    const e = new Error('写入 CLI 会话标题失败: ' + (err?.message || err));
    e.code = 'index-error';
    throw e;
  }
}
