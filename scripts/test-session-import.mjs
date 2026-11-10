// 导入会话回归测试：四个来源的扫描与解析、会话库/任务索引双写、来源登记去重、
// 项目归类、草稿工作区、图片与工具映射、多帧 zstd 解压。
// 零依赖，node scripts/test-session-import.mjs 直接跑，全绿退出码 0。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { zstdCompressSync } from 'node:zlib';
import { zstdDecompressAll } from '../src/host/session-import/zstd.mjs';

const base = process.platform === 'win32' ? tmpdir() : '/var/tmp';
const root = mkdtempSync(join(base, 'zcodepro-import-test-'));
const home = join(root, 'home');
mkdirSync(home, { recursive: true });
const cwd = join(root, 'project');
mkdirSync(cwd, { recursive: true });
const missingCwd = join(root, 'not-there');

process.env.HOME = home;
process.env.CODEX_HOME = join(root, 'codex');
process.env.CLAUDE_CONFIG_DIR = join(root, 'claude');
process.env.PI_CODING_AGENT_SESSION_DIR = join(root, 'pi', 'sessions');
process.env.DSH_HOME = join(root, 'dsh');

let failed = 0;
const assert = (cond, msg) => {
  if (!cond) { console.error('FAIL: ' + msg); failed = 1; }
  else console.log('ok: ' + msg);
};

const jsonl = (file, rows) => {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
};

// —— 四个来源的样本 ——
const codexId = '11111111-1111-4111-8111-111111111111';
const codexFile = join(process.env.CODEX_HOME, 'sessions', '2026', '01', '01', `rollout-2026-01-01T00-00-00-${codexId}.jsonl`);
jsonl(codexFile, [
  { timestamp: '2026-01-01T00:00:00.000Z', type: 'session_meta', payload: { id: codexId, cwd, timestamp: '2026-01-01T00:00:00.000Z', thread_source: 'user' } },
  { timestamp: '2026-01-01T00:00:01.000Z', type: 'event_msg', payload: { type: 'user_message', message: 'hello codex' } },
  { timestamp: '2026-01-01T00:00:02.000Z', type: 'event_msg', payload: { type: 'agent_message', message: 'running' } },
  { timestamp: '2026-01-01T00:00:03.000Z', type: 'response_item', payload: { type: 'function_call', name: 'shell', arguments: '{"command":"echo hi"}', call_id: 'call_1' } },
  { timestamp: '2026-01-01T00:00:04.000Z', type: 'response_item', payload: { type: 'function_call_output', call_id: 'call_1', output: [{ type: 'input_text', text: 'hi\n' }] } },
  { timestamp: '2026-01-01T00:00:05.000Z', type: 'response_item', payload: { type: 'function_call', name: 'mystery_tool', arguments: '{"x":1}', call_id: 'call_2' } },
  { timestamp: '2026-01-01T00:00:05.500Z', type: 'response_item', payload: { type: 'function_call_output', call_id: 'call_2', output: [{ type: 'input_text', text: 'unknown result' }] } },
  { timestamp: '2026-01-01T00:00:06.000Z', type: 'event_msg', payload: { type: 'agent_message', message: 'done' } },
]);
const codexState = new DatabaseSync(join(process.env.CODEX_HOME, 'state_5.sqlite'));
codexState.exec('CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT, created_at INTEGER, updated_at INTEGER, cwd TEXT, title TEXT, first_user_message TEXT, thread_source TEXT, archived INTEGER DEFAULT 0, model TEXT);');
codexState.prepare('INSERT INTO threads (id, rollout_path, created_at, updated_at, cwd, title, first_user_message, thread_source, archived, model) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)')
  .run(codexId, codexFile, Math.floor(Date.parse('2026-01-01T00:00:00Z') / 1000), Math.floor(Date.parse('2026-01-01T00:00:07Z') / 1000), cwd, 'Codex fixture', 'hello codex', 'user', 'gpt-x');
codexState.close();

const claudeId = '22222222-2222-4222-8222-222222222222';
const png1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l3n4WQAAAABJRU5ErkJggg==';
const claudeFile = join(process.env.CLAUDE_CONFIG_DIR, 'projects', '-tmp-project', `${claudeId}.jsonl`);
jsonl(claudeFile, [
  { type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-01-02T00:00:00.000Z', cwd, isMeta: false, message: { role: 'user', content: [{ type: 'text', text: 'hello claude' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png1x1.split(',')[1] } }] } },
  { type: 'assistant', uuid: 'a1', parentUuid: 'u1', timestamp: '2026-01-02T00:00:01.000Z', cwd, message: { role: 'assistant', model: 'claude-x', content: [{ type: 'text', text: 'working' }, { type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'echo hi' } }] } },
  { type: 'user', uuid: 'u2', parentUuid: 'a1', timestamp: '2026-01-02T00:00:02.000Z', cwd, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'hi\n' }] } },
  { type: 'assistant', uuid: 'a2', parentUuid: 'u2', timestamp: '2026-01-02T00:00:03.000Z', cwd, message: { role: 'assistant', model: 'claude-x', content: [{ type: 'text', text: 'done' }] } },
  { type: 'custom-title', customTitle: 'Claude fixture', sessionId: claudeId },
]);

const piId = '33333333-3333-4333-8333-333333333333';
const piFile = join(process.env.PI_CODING_AGENT_SESSION_DIR, '--tmp-project--', `2026-01-03T00-00-00-000Z_${piId}.jsonl`);
jsonl(piFile, [
  { type: 'session', version: 3, id: piId, timestamp: '2026-01-03T00:00:00.000Z', cwd },
  { type: 'message', id: 'm1', parentId: null, timestamp: '2026-01-03T00:00:01.000Z', message: { role: 'user', content: [{ type: 'text', text: 'hello pi' }] } },
  { type: 'message', id: 'm2', parentId: 'm1', timestamp: '2026-01-03T00:00:02.000Z', message: { role: 'assistant', model: 'pi-x', content: [{ type: 'text', text: 'working' }, { type: 'toolCall', id: 'tc1', name: 'bash', arguments: { command: 'echo hi' } }] } },
  { type: 'message', id: 'm3', parentId: 'm2', timestamp: '2026-01-03T00:00:03.000Z', message: { role: 'toolResult', toolCallId: 'tc1', toolName: 'bash', content: [{ type: 'text', text: 'hi\n' }], isError: false } },
  { type: 'message', id: 'm4', parentId: 'm3', timestamp: '2026-01-03T00:00:04.000Z', message: { role: 'assistant', model: 'pi-x', content: [{ type: 'text', text: 'done' }] } },
  { type: 'session_info', id: 'si', parentId: 'm4', timestamp: '2026-01-03T00:00:05.000Z', name: 'pi fixture' },
]);

const dshId = 'session-44444444-4444-4444-8444-444444444444';
const dshDir = join(process.env.DSH_HOME, 'sessions', '--tmp-project--', dshId);
mkdirSync(dshDir, { recursive: true });
const dshLines = [
  { type: 'session', version: 4, id: dshId, createdAt: Date.parse('2026-01-04T00:00:00.000Z'), cwd, delegationDepth: 0 },
  { type: 'user/message', seq: 2, time: Date.parse('2026-01-04T00:00:01.000Z'), data: { id: 'd1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'hello dsh' }] } },
  { type: 'assistant/message', seq: 3, time: Date.parse('2026-01-04T00:00:02.000Z'), data: { turn: 1, step: 1, message: { role: 'assistant', source: { model: 'dsh-x' }, content: [{ type: 'text', text: 'working' }, { type: 'tool-call', id: 'dc1', name: 'bash', arguments: '{"command":"echo hi"}' }] } } },
  { type: 'tool/result', seq: 4, time: Date.parse('2026-01-04T00:00:03.000Z'), data: { turn: 1, step: 1, toolCallId: 'dc1', message: { role: 'tool', content: [{ type: 'text', text: 'hi\n' }], isError: false } } },
  { type: 'assistant/message', seq: 5, time: Date.parse('2026-01-04T00:00:04.000Z'), data: { turn: 1, step: 2, message: { role: 'assistant', source: { model: 'dsh-x' }, content: [{ type: 'text', text: 'done' }] } } },
  { type: 'session/title', seq: 6, time: Date.parse('2026-01-04T00:00:05.000Z'), data: { title: 'dsh fixture' } },
];
const dshRaw = Buffer.from(dshLines.map((r) => JSON.stringify(r)).join('\n') + '\n');
const cut = Math.floor(dshRaw.length / 2);
const dshFile = join(dshDir, 'session.v4.jsonl.zstd');
writeFileSync(dshFile, Buffer.concat([zstdCompressSync(dshRaw.subarray(0, cut)), zstdCompressSync(dshRaw.subarray(cut))]));

// —— 多帧 zstd ——
const multi = zstdDecompressAll(readFileSync(dshFile));
assert(multi.toString('utf8').includes('dsh fixture') && multi.toString('utf8').split('\n').filter(Boolean).length === dshLines.length,
  '多帧 zstd 全部解压');

// —— 假数据根：会话库 + 任务索引 ——
const dataRoot = join(root, 'data');
mkdirSync(join(dataRoot, 'cli', 'db'), { recursive: true });
mkdirSync(join(dataRoot, 'v2'), { recursive: true });
const cli = new DatabaseSync(join(dataRoot, 'cli', 'db', 'db.sqlite'));
cli.exec(`
CREATE TABLE session (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, workspace_id TEXT, parent_id TEXT,
  slug TEXT NOT NULL, directory TEXT NOT NULL, path TEXT, title TEXT NOT NULL, version TEXT NOT NULL,
  share_url TEXT, summary_additions INTEGER, summary_deletions INTEGER, summary_files INTEGER,
  summary_diffs TEXT, revert TEXT, permission TEXT, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL,
  time_compacting INTEGER, time_archived INTEGER, task_type TEXT NOT NULL DEFAULT 'interactive',
  title_source TEXT NOT NULL DEFAULT 'first_input', title_message_id TEXT, time_title_updated INTEGER,
  trace_id TEXT, time_deleted INTEGER, last_outcome TEXT);
CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, time_created INTEGER NOT NULL,
  time_updated INTEGER NOT NULL, data TEXT NOT NULL, sequence INTEGER);
CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT NOT NULL, session_id TEXT NOT NULL,
  time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL, data TEXT NOT NULL, sequence INTEGER);
CREATE TABLE session_entry (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, type TEXT NOT NULL,
  time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL, data TEXT NOT NULL);
CREATE TABLE todo (session_id TEXT NOT NULL, content TEXT NOT NULL, status TEXT NOT NULL,
  priority TEXT NOT NULL, position INTEGER NOT NULL, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL,
  PRIMARY KEY (session_id, position));
`);
cli.prepare("INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated, task_type, title_source) VALUES ('sess_base', 'proj_x', 'sess_base', ?, 'base', '0.17.1', 1, 1, 'interactive', 'custom')").run(cwd);
cli.close();

const idx = new DatabaseSync(join(dataRoot, 'v2', 'tasks-index.sqlite'));
idx.exec(`
CREATE TABLE projects (project_id TEXT PRIMARY KEY, name TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0, host_id TEXT);
CREATE TABLE project_roots (project_id TEXT NOT NULL, root_path TEXT NOT NULL, position INTEGER NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (project_id, root_path));
CREATE TABLE tasks (workspace_key TEXT NOT NULL, workspace_path TEXT NOT NULL, workspace_identity TEXT,
  task_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', task_status TEXT, provider TEXT,
  mode TEXT NOT NULL DEFAULT 'build', model TEXT, migration_source TEXT, forked_from_task_id TEXT,
  created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0, unread_at INTEGER,
  pinned INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0,
  title_overridden INTEGER NOT NULL DEFAULT 0, meta_json TEXT NOT NULL DEFAULT '{}',
  searchable_text TEXT NOT NULL DEFAULT '', cron_automation_id TEXT, last_unread_at INTEGER NOT NULL DEFAULT 0,
  off_peak_task_id TEXT, host_id TEXT, root_path TEXT, project_id TEXT, execution_directories TEXT,
  sort_order INTEGER, cli_title TEXT, handoff_pending INTEGER NOT NULL DEFAULT 0, cli_title_source TEXT,
  cli_created_at INTEGER, cli_updated_at INTEGER, cli_last_outcome TEXT, cli_deleted INTEGER,
  PRIMARY KEY (workspace_key, task_id));
CREATE TABLE task_group_admissions (workspace_key TEXT NOT NULL, task_id TEXT NOT NULL, system_kind TEXT,
  user_organized INTEGER NOT NULL DEFAULT 0, creation_id TEXT, PRIMARY KEY (workspace_key, task_id));
CREATE TABLE task_group_view_node_orders (node_type TEXT NOT NULL, node_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  PRIMARY KEY (node_type, node_key));
`);
idx.prepare("INSERT INTO projects (project_id, name, position, deleted, host_id) VALUES ('p1', 'fixture project', 0, 0, 'local')").run();
idx.prepare('INSERT INTO project_roots (project_id, root_path, position, is_primary) VALUES (?, ?, 0, 1)').run('p1', cwd);
idx.close();

// —— 列出来源 ——
const { listSourceSessions, readSourceSession } = await import('../src/host/session-import/sources.mjs');
const { listImportSessions, runImport } = await import('../src/host/session-import/index.mjs');
const { purgeImportedTask, aliveTaskIds, getProject } = await import('../src/host/session-import/write.mjs');

for (const [source, id] of [['codex', codexId], ['claude', claudeId], ['pi', piId], ['dsh', dshId]]) {
  const list = await listSourceSessions(source, { showAll: true });
  assert(list.some((s) => s.sessionId === id), `${source} 列表包含样本`);
  const item = list.find((s) => s.sessionId === id);
  const parsed = await readSourceSession(source, item);
  assert(parsed.messages.length === 2, `${source} 解析出 user + assistant 两条消息（实际 ${parsed.messages.length}）`);
  const assistant = parsed.messages.find((m) => m.role === 'assistant');
  assert(assistant && assistant.parts.some((p) => p.type === 'tool'), `${source} 解析出工具调用`);
  assert(parsed.title && parsed.title !== id, `${source} 取得标题（${parsed.title}）`);
}
const claudeParsed = await readSourceSession('claude', (await listSourceSessions('claude', { showAll: true })).find((s) => s.sessionId === claudeId));
assert(claudeParsed.messages[0].parts.some((p) => p.type === 'file' && p.url.startsWith('data:image/png')), 'Claude 图片转成内联 file part');
const codexParsed = await readSourceSession('codex', (await listSourceSessions('codex', { showAll: true })).find((s) => s.sessionId === codexId));
assert(codexParsed.messages[1].parts.some((p) => p.type === 'tool' && p.tool === 'shell' && p.output === 'hi\n'), 'Codex 工具结果配对');
assert(codexParsed.messages[1].parts.some((p) => p.type === 'tool' && p.tool === 'mystery_tool'), '未知工具保留原始名字');

// —— 导入：无项目 ——
const list = await listImportSessions({ dataRoot, source: 'codex', showAll: true });
assert(list.ok && list.sessions.some((s) => s.sessionId === codexId && !s.imported), '列表可读且未标记已导入');
const first = await runImport({ dataRoot, source: 'codex', items: [{ sessionId: codexId, sourcePath: codexFile }] });
assert(first.ok && first.imported.length === 1 && !first.failed.length, `无项目导入成功（${JSON.stringify(first.failed)}）`);
const taskId = first.imported[0].taskId;

const check = new DatabaseSync(join(dataRoot, 'v2', 'tasks-index.sqlite'), { readOnly: true });
const task = check.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId);
assert(task && task.project_id === null && task.provider === 'glm' && task.host_id === 'local', '任务行无项目、provider=glm、host=local');
assert(task && task.cli_created_at > 0 && task.title_overridden === 1 && task.cli_title_source === 'custom', '任务行时间与标题锁定');
assert(task && task.cli_updated_at > task.cli_created_at && task.cli_updated_at >= Date.now() - 60000, '导入任务按导入时间排到列表前面');
assert(task && task.unread_at > 0 && task.last_unread_at > 0, '导入任务标成未读（原生蓝点）');
assert(task && task.migration_source === 'codex', '任务行标记来源');
const adm = check.prepare('SELECT * FROM task_group_admissions WHERE task_id = ?').get(taskId);
assert(adm && adm.workspace_key === task.workspace_key, '分组记账写入');
const order = check.prepare('SELECT * FROM task_group_view_node_orders WHERE node_key = ?').get(JSON.stringify([task.workspace_key, taskId]));
assert(order, '分组排序行写入');
check.close();

const cdb = new DatabaseSync(join(dataRoot, 'cli', 'db', 'db.sqlite'), { readOnly: true });
const sess = cdb.prepare('SELECT * FROM session WHERE id = ?').get(taskId);
assert(sess && sess.task_type === 'interactive' && sess.title_source === 'custom' && sess.time_deleted === null, '会话行写入');
const msgs = cdb.prepare('SELECT * FROM message WHERE session_id = ? ORDER BY sequence').all(taskId);
assert(msgs.length === 2 && JSON.parse(msgs[0].data).role === 'user', '消息行写入');
const parts = cdb.prepare('SELECT data FROM part WHERE session_id = ? ORDER BY sequence').all(taskId);
const partTypes = parts.map((p) => JSON.parse(p.data).type);
assert(partTypes.includes('text') && partTypes.includes('tool'), '文本与工具 part 写入');
const toolPart = parts.map((p) => JSON.parse(p.data)).find((p) => p.type === 'tool');
assert(toolPart && toolPart.tool === 'Bash' && toolPart.state.output === 'hi\n', '工具名映射为 Bash 且结果保留');
const fallback = parts.map((p) => JSON.parse(p.data)).find((p) => p.type === 'text' && p.text.includes('mystery_tool'));
assert(fallback, '未知工具转成文本块');
cdb.close();

const alive = aliveTaskIds(dataRoot);
assert(alive.has(taskId), '任务存活判定');
const arch = new DatabaseSync(join(dataRoot, 'v2', 'tasks-index.sqlite'));
arch.prepare('UPDATE tasks SET archived = 1 WHERE task_id = ?').run(taskId);
arch.close();
const listed = await listImportSessions({ dataRoot, source: 'codex', showAll: true });
const listedRow = listed.sessions.find((s) => s.sessionId === codexId);
assert(listedRow && listedRow.imported && listedRow.importedArchived, '归档后的导入任务标记为已导入（任务已归档）');
const again = await runImport({ dataRoot, source: 'codex', items: [{ sessionId: codexId, sourcePath: codexFile }] });
assert(again.skipped.length === 1 && again.skipped[0].reason === 'already-imported', '重复导入跳过');

// —— 导入：选项目 ——
purgeImportedTask(dataRoot, taskId);
assert(!aliveTaskIds(dataRoot).has(taskId), '测试清理生效');
const project = getProject(dataRoot, 'p1');
assert(project && project.roots.length === 1, '项目查询');
const second = await runImport({ dataRoot, source: 'codex', items: [{ sessionId: codexId, sourcePath: codexFile }], projectId: 'p1' });
assert(second.ok && second.imported.length === 1, '带项目导入成功');
const check2 = new DatabaseSync(join(dataRoot, 'v2', 'tasks-index.sqlite'), { readOnly: true });
const task2 = check2.prepare('SELECT * FROM tasks WHERE task_id = ?').get(second.imported[0].taskId);
assert(task2.project_id === 'p1', '任务行写入项目 UUID');
check2.close();

// —— 草稿工作区：cwd 不存在、不选项目 ——
const draftRoot = join(root, 'draft-data');
mkdirSync(join(draftRoot, 'cli', 'db'), { recursive: true });
mkdirSync(join(draftRoot, 'v2'), { recursive: true });
writeFileSync(join(draftRoot, 'cli', 'db', 'db.sqlite'), readFileSync(join(dataRoot, 'cli', 'db', 'db.sqlite')));
writeFileSync(join(draftRoot, 'v2', 'tasks-index.sqlite'), readFileSync(join(dataRoot, 'v2', 'tasks-index.sqlite')));
const missingFile = join(process.env.PI_CODING_AGENT_SESSION_DIR, '--gone--', `2026-01-05T00-00-00-000Z_55555555-5555-4555-8555-555555555555.jsonl`);
jsonl(missingFile, [
  { type: 'session', version: 3, id: '55555555-5555-4555-8555-555555555555', timestamp: '2026-01-05T00:00:00.000Z', cwd: missingCwd },
  { type: 'message', id: 'x1', parentId: null, timestamp: '2026-01-05T00:00:01.000Z', message: { role: 'user', content: [{ type: 'text', text: 'missing cwd' }] } },
]);
const third = await runImport({ dataRoot: draftRoot, source: 'pi', items: [{ sessionId: '55555555-5555-4555-8555-555555555555', sourcePath: missingFile }] });
assert(third.ok && third.imported.length === 1, 'cwd 不存在时仍可导入');
assert(third.imported[0].title === 'missing cwd', '没有标题时回退到首条用户消息');
assert(third.imported[0].workspace.startsWith(join(draftRoot, 'workspace', 'draft-')), 'cwd 不存在且无项目时建草稿工作区');
assert(existsSync(third.imported[0].workspace), '草稿工作区目录存在');

rmSync(root, { recursive: true, force: true });
if (failed) {
  console.error('有用例失败');
  process.exitCode = 1;
} else {
  console.log('全部通过');
}
