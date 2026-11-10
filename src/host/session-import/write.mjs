// 导入写入：会话库（session/message/part）与任务索引（tasks + 分组记账）双写，
// 以及来源登记文件和已导入状态查询。
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { mapToolCall, oneLine, truncateText } from './util.mjs';

// 按需加载：旧版 Node 没有 node:sqlite，不能让整个 helper 启动失败。
let DatabaseSync = null;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch { DatabaseSync = null; }

const BUSY_TIMEOUT_MS = 5000;
const MAX_TOOL_CHARS = 100000;
const MAX_TOOL_FALLBACK = 20000;
const MAX_SEARCHABLE = 200000;

function openDb(file, readOnly = false) {
  if (!DatabaseSync) {
    throw Object.assign(new Error('当前 Node 不支持内置 SQLite，无法写入 ZCode 数据'), { code: 'sqlite-unavailable' });
  }
  const db = new DatabaseSync(file, readOnly ? { readOnly: true } : {});
  db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
  return db;
}

function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    fn();
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* 已回滚 */ }
    throw err;
  }
}

function dbFile(dataRoot) {
  return join(dataRoot, 'cli', 'db', 'db.sqlite');
}

function indexFile(dataRoot) {
  return join(dataRoot, 'v2', 'tasks-index.sqlite');
}

function projectIdOf(workspace) {
  return 'proj_' + String(workspace).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// 官方 Claude 迁移用的来源标记是 claudeCode，这里保持一致，其他来源用来源 id。
function migrationSourceOf(source) {
  return source === 'claude' ? 'claudeCode' : source;
}

export function registryPath(dataRoot) {
  return join(dataRoot, 'zcodepro-imports.json');
}

export function readRegistry(dataRoot) {
  try {
    const data = JSON.parse(readFileSync(registryPath(dataRoot), 'utf8'));
    if (data && typeof data === 'object' && data.imports && typeof data.imports === 'object') {
      return { version: 1, imports: data.imports };
    }
  } catch { /* 没有或损坏就重建 */ }
  return { version: 1, imports: {} };
}

export function writeRegistry(dataRoot, registry) {
  mkdirSync(dataRoot, { recursive: true });
  const file = registryPath(dataRoot);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(registry, null, 2));
  renameSync(tmp, file);
}

export function sourceKey(source, sessionId) {
  return `${source}:${sessionId}`;
}

// 一次读出还活着的任务（tasks 未删 + 会话未软删），并带上归档状态，
// 用于列表页判断“已导入”和提示“任务已归档”。
export function aliveTaskStates(dataRoot) {
  const states = new Map();
  const tasksDb = indexFile(dataRoot);
  const cliDb = dbFile(dataRoot);
  const tasks = new Map();
  const sessions = new Set();
  try {
    if (existsSync(tasksDb)) {
      const db = openDb(tasksDb, true);
      try {
        for (const row of db.prepare('SELECT task_id, archived FROM tasks WHERE deleted = 0 AND coalesce(cli_deleted, 0) = 0').all()) {
          tasks.set(String(row.task_id), { archived: Number(row.archived) === 1 });
        }
      } finally { db.close(); }
    }
  } catch { /* 库读不到就不标已导入 */ }
  try {
    if (existsSync(cliDb)) {
      const db = openDb(cliDb, true);
      try {
        for (const row of db.prepare('SELECT id FROM session WHERE time_deleted IS NULL').all()) {
          sessions.add(String(row.id));
        }
      } finally { db.close(); }
    }
  } catch { /* 同上 */ }
  for (const [id, state] of tasks) if (sessions.has(id)) states.set(id, state);
  return states;
}

export function aliveTaskIds(dataRoot) {
  return new Set(aliveTaskStates(dataRoot).keys());
}

export function getProject(dataRoot, projectId) {
  const file = indexFile(dataRoot);
  if (!existsSync(file)) throw Object.assign(new Error('任务索引不存在'), { code: 'index-missing' });
  const db = openDb(file, true);
  try {
    const row = db.prepare('SELECT project_id, name FROM projects WHERE project_id = ? AND deleted = 0').get(projectId);
    if (!row) return null;
    const roots = db.prepare('SELECT root_path, is_primary FROM project_roots WHERE project_id = ? ORDER BY is_primary DESC, position').all(projectId)
      .map((r) => ({ path: String(r.root_path || ''), primary: Number(r.is_primary) === 1 }))
      .filter((r) => r.path);
    return { id: String(row.project_id), name: String(row.name || ''), roots };
  } finally {
    db.close();
  }
}

function latestValue(db, sql, fallback) {
  try {
    const row = db.prepare(sql).get();
    return row ? Object.values(row)[0] : fallback;
  } catch {
    return fallback;
  }
}

const modelCaches = new Map();

function modelContext(db, cliFile) {
  const cached = modelCaches.get(cliFile);
  if (cached && Date.now() - cached.at < 30000) return cached.value;
  let modelSelection = null;
  let modelId = '';
  let providerId = '';
  try {
    const row = db.prepare("SELECT data FROM message WHERE json_extract(data, '$.role') = 'user' AND json_extract(data, '$.modelSelection') IS NOT NULL ORDER BY time_created DESC LIMIT 1").get();
    if (row) modelSelection = JSON.parse(row.data).modelSelection || null;
  } catch { /* ignore */ }
  try {
    const row = db.prepare("SELECT data FROM message WHERE json_extract(data, '$.role') = 'assistant' ORDER BY time_created DESC LIMIT 1").get();
    if (row) {
      const data = JSON.parse(row.data);
      modelId = data.modelId || '';
      providerId = data.providerId || '';
    }
  } catch { /* ignore */ }
  const value = { modelSelection, modelId, providerId };
  modelCaches.set(cliFile, { at: Date.now(), value });
  return value;
}

function userMessageData(time, migrationSource, modelSelection) {
  const data = {
    role: 'user',
    time: { created: time },
    agent: 'zcode-agent',
    metadata: { migrationSource },
    semantics: {
      origin: 'real_user', kind: 'user_prompt',
      uiVisibility: 'visible', providerVisibility: 'visible', transcriptVisibility: 'visible',
    },
  };
  if (modelSelection) data.modelSelection = modelSelection;
  return data;
}

function assistantMessageData(time, parentID, ctx) {
  const data = {
    role: 'assistant',
    time: { created: time, completed: time },
    parentID: parentID || null,
    mode: 'build',
    planEnabled: false,
    agent: 'zcode-agent',
    path: { cwd: ctx.workspace, root: ctx.workspace },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    finish: 'completed',
    semantics: {
      origin: 'agent_runtime', kind: 'assistant_response',
      uiVisibility: 'visible', providerVisibility: 'visible', transcriptVisibility: 'visible',
    },
  };
  if (ctx.modelId) data.modelId = ctx.modelId;
  if (ctx.providerId) data.providerId = ctx.providerId;
  return data;
}

function partData(part, time, declIndex) {
  const start = Number(part.start) || time;
  const end = Number(part.end) || start;
  if (part.type === 'text') {
    return { type: 'text', text: String(part.text || ''), time: { start, end: start } };
  }
  if (part.type === 'reasoning') {
    return { type: 'reasoning', text: String(part.text || ''), time: { start, end: start } };
  }
  if (part.type === 'file') {
    const out = { type: 'file', mime: part.mime, url: part.url, metadata: part.metadata || {} };
    if (part.filename) out.filename = part.filename;
    return out;
  }
  if (part.type === 'tool') {
    const output = truncateText(part.output, MAX_TOOL_CHARS, '工具输出过长，已截断');
    const mapped = mapToolCall(part.tool, part.input);
    if (mapped) {
      return {
        type: 'tool',
        callID: String(part.callID || `import_tool_${declIndex}`),
        declarationIndex: declIndex,
        tool: mapped.tool,
        metadata: {},
        state: {
          status: part.isError ? 'error' : 'completed',
          input: mapped.input,
          ...(part.isError ? { error: output || '工具执行失败' } : { output }),
          title: mapped.tool,
          metadata: { schemaVersion: 1 },
          time: { start, end },
        },
      };
    }
    const input = (() => {
      try { return JSON.stringify(part.input); } catch { return String(part.input); }
    })();
    return {
      type: 'text',
      text: `[工具 ${part.tool}]\n参数：${input}\n结果：${truncateText(output, MAX_TOOL_FALLBACK, '工具输出过长，已截断')}`,
      time: { start, end: start },
    };
  }
  return null;
}

function searchableText(messages) {
  const lines = [];
  for (const msg of messages) {
    for (const part of msg.parts) {
      if (part.type === 'text' && part.text) lines.push(String(part.text));
    }
  }
  return truncateText(lines.join('\n'), MAX_SEARCHABLE, '搜索文本过长，已截断');
}

function purgeCliSession(db, sessionId) {
  tx(db, () => {
    db.prepare('DELETE FROM part WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM message WHERE session_id = ?').run(sessionId);
    try { db.prepare('DELETE FROM session_entry WHERE session_id = ?').run(sessionId); } catch { /* 旧库没有该表 */ }
    try { db.prepare('DELETE FROM todo WHERE session_id = ?').run(sessionId); } catch { /* 旧库没有该表 */ }
    db.prepare('DELETE FROM session WHERE id = ?').run(sessionId);
  });
}

export function writeImportedSession({ dataRoot, source, parsed, workspace, projectId }) {
  const cliDb = dbFile(dataRoot);
  const idxDb = indexFile(dataRoot);
  if (!existsSync(cliDb) || !existsSync(idxDb)) {
    throw Object.assign(new Error('ZCode 的会话库或任务索引不存在'), { code: 'db-missing' });
  }
  const sessionId = `sess_${randomUUID()}`;
  const migrationSource = migrationSourceOf(source);
  const title = oneLine(parsed.title || '导入的会话', 120) || '导入的会话';
  const createdAt = Math.max(1, Number(parsed.createdAt) || Date.now());
  // 侧边栏按 cli_updated_at 倒序；导入的任务用导入时间，才能在“任务”和项目
  // 列表里排到最上面。源会话的创建时间仍写进 cli_created_at。
  const importedAt = Math.max(createdAt, Date.now());
  const traceId = randomUUID();
  const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
  if (!messages.length) {
    throw Object.assign(new Error('会话里没有可导入的消息'), { code: 'empty-session' });
  }

  let cli = null;
  let idx = null;
  try {
    cli = openDb(cliDb);
    const version = latestValue(cli, 'SELECT version FROM session ORDER BY time_updated DESC LIMIT 1', '0.0.0');
    const model = modelContext(cli, cliDb);
    const userInsert = cli.prepare('INSERT INTO message (id, session_id, time_created, time_updated, data, sequence) VALUES (?, ?, ?, ?, ?, ?)');
    const partInsert = cli.prepare('INSERT INTO part (id, message_id, session_id, time_created, time_updated, data, sequence) VALUES (?, ?, ?, ?, ?, ?, ?)');

    tx(cli, () => {
      cli.prepare(`INSERT INTO session
        (id, project_id, workspace_id, parent_id, slug, directory, path, title, version, permission,
         time_created, time_updated, task_type, title_source, trace_id, last_outcome)
        VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'interactive', 'custom', ?, 'completed')`)
        .run(
          sessionId, projectIdOf(workspace), sessionId, workspace, workspace, title, String(version || '0.0.0'),
          JSON.stringify({ mode: 'build' }), createdAt, importedAt, traceId
        );

      let lastUserId = null;
      messages.forEach((msg, index) => {
        const time = Math.max(1, Number(msg.time) || createdAt);
        const messageId = `${sessionId}_import_${index}`;
        const data = msg.role === 'user'
          ? userMessageData(time, migrationSource, model.modelSelection)
          : assistantMessageData(time, lastUserId, { ...model, workspace });
        userInsert.run(messageId, sessionId, time, time, JSON.stringify(data), index + 1);
        msg.parts.forEach((part, partIndex) => {
          const body = partData(part, time, partIndex);
          if (!body) return;
          partInsert.run(
            `${messageId}_p${partIndex}`, messageId, sessionId,
            Number(part.start) || time, Number(part.end) || time,
            JSON.stringify(body), partIndex + 1
          );
        });
        if (msg.role === 'user') lastUserId = messageId;
      });
    });

    idx = openDb(idxDb);
    const meta = {
      taskId: sessionId,
      traceId,
      title,
      titleOverridden: true,
      workspacePath: workspace,
      createdAt,
      updatedAt: importedAt,
      mode: 'build',
      provider: 'glm',
      status: 'completed',
      migrationSource,
      unreadAt: importedAt,
    };
    tx(idx, () => {
      idx.prepare(`INSERT INTO tasks
        (workspace_key, workspace_path, task_id, title, task_status, provider, mode, migration_source,
         created_at, updated_at, unread_at, pinned, archived, deleted, title_overridden, meta_json, searchable_text,
         last_unread_at, root_path, project_id, cli_title, handoff_pending, cli_title_source,
         cli_created_at, cli_updated_at, cli_last_outcome, cli_deleted, host_id)
        VALUES (?, ?, ?, ?, 'completed', 'glm', 'build', ?, ?, ?, ?, 0, 0, 0, 1, ?, ?, ?, ?, ?, ?, 0, 'custom', ?, ?, 'completed', 0, 'local')`)
        .run(
          workspace, workspace, sessionId, title, migrationSource, createdAt, importedAt, importedAt,
          JSON.stringify(meta), searchableText(messages), importedAt, workspace, projectId || null,
          title, createdAt, importedAt
        );
      idx.prepare(`INSERT OR IGNORE INTO task_group_admissions
        (workspace_key, task_id, system_kind, user_organized, creation_id) VALUES (?, ?, NULL, 0, NULL)`)
        .run(workspace, sessionId);
      const min = idx.prepare('SELECT coalesce(min(sort_order), 0) - 1 AS n FROM task_group_view_node_orders').get();
      const now = Date.now();
      idx.prepare(`INSERT OR IGNORE INTO task_group_view_node_orders
        (node_type, node_key, sort_order, created_at, updated_at) VALUES ('task', ?, ?, ?, ?)`)
        .run(JSON.stringify([workspace, sessionId]), Number(min?.n) || 0, now, now);
    });
  } catch (err) {
    if (cli) {
      try { purgeCliSession(cli, sessionId); } catch { /* 清理失败也不掩盖原错误 */ }
    }
    throw err;
  } finally {
    try { if (cli) cli.close(); } catch { /* ignore */ }
    try { if (idx) idx.close(); } catch { /* ignore */ }
  }

  return { taskId: sessionId, title, createdAt, updatedAt: importedAt, messageCount: messages.length };
}

export function purgeImportedTask(dataRoot, taskId) {
  const tasksDb = indexFile(dataRoot);
  const cliDb = dbFile(dataRoot);
  if (existsSync(tasksDb)) {
    const db = openDb(tasksDb);
    try {
      tx(db, () => {
        const row = db.prepare('SELECT workspace_key FROM tasks WHERE task_id = ?').get(taskId);
        const workspace = row ? String(row.workspace_key) : '';
        db.prepare('DELETE FROM task_group_view_node_orders WHERE node_type = \'task\' AND node_key = ?')
          .run(JSON.stringify([workspace, taskId]));
        db.prepare('DELETE FROM task_group_admissions WHERE task_id = ?').run(taskId);
        db.prepare('DELETE FROM tasks WHERE task_id = ?').run(taskId);
      });
    } finally { db.close(); }
  }
  if (existsSync(cliDb)) {
    const db = openDb(cliDb);
    try { purgeCliSession(db, taskId); } finally { db.close(); }
  }
}

export function workspaceForImport({ cwd, projectRoot }) {
  for (const candidate of [cwd, projectRoot]) {
    if (!candidate) continue;
    try { if (statSync(candidate).isDirectory()) return resolve(candidate); } catch { /* 不存在就试下一个 */ }
  }
  return null;
}
