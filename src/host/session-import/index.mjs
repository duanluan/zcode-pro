// 导入会话的入口：列出来源会话、批量导入。
import { existsSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { isUnder, oneLine } from './util.mjs';
import { listSourceSessions, readSourceSession, sourceAvailable, sourceList, sourceRoots } from './sources.mjs';
import {
  aliveTaskIds, aliveTaskStates, getProject, readRegistry, sourceKey, workspaceForImport, writeImportedSession, writeRegistry,
} from './write.mjs';

function present(session) {
  return {
    source: session.source,
    sessionId: session.sessionId,
    title: oneLine(session.title, 200) || session.sessionId,
    cwd: session.cwd || '',
    createdAt: session.createdAt || 0,
    updatedAt: session.updatedAt || 0,
    sourcePath: session.sourcePath,
    archived: !!session.archived,
    subagent: !!session.subagent,
    codexImport: !!session.codexImport,
    large: !!session.large,
    model: session.model || '',
    cwdExists: !!session.cwd && existsSync(session.cwd),
  };
}

export async function listImportSessions({ dataRoot, source, showAll = false, search = '', roots = [] }) {
  if (!source) return { ok: true, sources: sourceList(), sessions: [] };
  if (!sourceList().some((s) => s.id === source)) {
    return { ok: false, code: 'bad-source', error: '未知来源' };
  }
  if (!sourceAvailable(source)) {
    return { ok: true, sources: sourceList(), sessions: [], unavailable: true };
  }
  const all = await listSourceSessions(source, { showAll: !!showAll });
  const filterRoots = (Array.isArray(roots) ? roots : []).filter((r) => typeof r === 'string' && r);
  const needle = String(search || '').trim().toLowerCase();
  const registry = readRegistry(dataRoot);
  const alive = aliveTaskStates(dataRoot);
  const sessions = all
    .filter((s) => (showAll || !s.subagent) && (showAll || !s.codexImport))
    .filter((s) => {
      if (filterRoots.length && !isUnder(s.cwd, filterRoots)) return false;
      if (!needle) return true;
      return `${s.title}\n${s.cwd}`.toLowerCase().includes(needle);
    })
    .map((s) => {
      const rec = registry.imports[sourceKey(source, s.sessionId)];
      const state = rec ? alive.get(rec.taskId) : null;
      return {
        ...present(s),
        imported: !!state,
        importedArchived: !!(state && state.archived),
        importedTaskId: state ? rec.taskId : '',
      };
    });
  return { ok: true, sources: sourceList(), sessions };
}

export async function runImport({ dataRoot, source, items: rawItems, projectId = null }) {
  if (!source || !sourceList().some((s) => s.id === source)) {
    return { ok: false, code: 'bad-source', error: '未知来源' };
  }
  if (!sourceAvailable(source)) {
    return { ok: false, code: 'source-unavailable', error: '没有找到该工具的会话目录' };
  }
  const items = Array.isArray(rawItems) ? rawItems : [];
  if (!items.length) return { ok: false, code: 'bad-request', error: '没有选择会话' };
  if (items.length > 1000) {
    return { ok: false, code: 'too-many-items', error: '一次最多导入 1000 条，请分批选择' };
  }

  let projectRoot = '';
  if (projectId) {
    let project;
    try {
      project = getProject(dataRoot, projectId);
    } catch (err) {
      return { ok: false, code: err.code || 'index-error', error: err.message || String(err) };
    }
    if (!project || !project.roots.length) {
      return { ok: false, code: 'project-not-found', error: '项目不存在或没有可用目录' };
    }
    projectRoot = project.roots.find((r) => r.primary)?.path || project.roots[0].path;
  }

  const roots = sourceRoots(source);
  const registry = readRegistry(dataRoot);
  const alive = aliveTaskIds(dataRoot);
  const imported = [];
  const skipped = [];
  const failed = [];

  for (const item of items) {
    const sessionId = String(item && item.sessionId || '');
    const sourcePath = String(item && item.sourcePath || '');
    if (!sessionId || !sourcePath) {
      failed.push({ sessionId, error: '缺少会话 id 或文件路径', code: 'bad-request' });
      continue;
    }
    if (!isUnder(sourcePath, roots) || !existsSync(sourcePath)) {
      failed.push({ sessionId, error: '会话文件不在来源目录内或已不存在', code: 'bad-source-path' });
      continue;
    }
    const key = sourceKey(source, sessionId);
    const prev = registry.imports[key];
    if (prev && alive.has(prev.taskId)) {
      skipped.push({ sessionId, taskId: prev.taskId, reason: 'already-imported' });
      continue;
    }
    try {
      const parsed = await readSourceSession(source, { ...item, sessionId, sourcePath });
      if (parsed.sessionId && parsed.sessionId !== sessionId) {
        throw Object.assign(new Error('会话 id 与文件内容不一致'), { code: 'session-mismatch' });
      }
      let workspace = workspaceForImport({ cwd: parsed.cwd, projectRoot });
      if (!workspace) {
        workspace = join(dataRoot, 'workspace', `draft-${randomUUID()}`);
        mkdirSync(workspace, { recursive: true });
      }
      const result = writeImportedSession({
        dataRoot, source, parsed, workspace, projectId: projectId || null,
      });
      registry.imports[key] = {
        taskId: result.taskId,
        sourcePath,
        title: result.title,
        importedAt: Date.now(),
      };
      writeRegistry(dataRoot, registry);
      imported.push({ sessionId, taskId: result.taskId, title: result.title, workspace });
    } catch (err) {
      failed.push({ sessionId, error: err.message || String(err), code: err.code || 'import-failed' });
    }
  }

  return { ok: true, imported, skipped, failed };
}
