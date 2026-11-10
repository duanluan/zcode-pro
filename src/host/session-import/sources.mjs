// 四个来源的会话扫描与解析。每个来源输出同一种结构：
// { sessionId, title, cwd, createdAt, updatedAt, model, messages }
// messages 里是 { role, time, parts }，parts 支持 text / reasoning / tool / file。
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { zstdDecompressAll } from './zstd.mjs';
import {
  dataUrlBytes, imageSize, isLocalCommandText, normalizeRoots, oneLine, outputText,
  parseTime, readHead, readJsonl, readJsonlAll, readTail, stripPiInjections, textOf, toDataUrl,
  walkFiles,
} from './util.mjs';

const LARGE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch { DatabaseSync = null; }

function fileSize(file) {
  try { return statSync(file).size; } catch { return 0; }
}

function fileMtime(file) {
  try { return Math.round(statSync(file).mtimeMs); } catch { return Date.now(); }
}

function sortNewest(list) {
  return list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || String(a.sessionId).localeCompare(String(b.sessionId)));
}

function imagePart(mime, dataUrl, filename = '') {
  const url = String(dataUrl || '');
  if (!url.startsWith('data:')) return null;
  const sizeBytes = dataUrlBytes(url);
  if (sizeBytes > MAX_IMAGE_BYTES) {
    return { type: 'text', text: `[图片过大，未导入：${filename || mime || 'image'}]` };
  }
  const dims = imageSize(url) || {};
  const metadata = {
    image: { ...dims, maxDimension: 2000, resized: false, transformedSizeBytes: sizeBytes },
    recoverability: 'provider_ready',
    sizeBytes,
    storageKind: 'inline',
  };
  const part = { type: 'file', mime: mime || 'image/png', url, metadata };
  if (filename) part.filename = filename;
  return part;
}

function toolPart(callID, name, input, start) {
  return {
    type: 'tool', callID: callID || `import_tool_${Math.random().toString(36).slice(2)}`,
    tool: name || 'tool', input: input == null ? {} : input,
    output: '', isError: false, start: start || Date.now(), end: start || Date.now(),
  };
}

function attachToolResult(toolParts, callID, output, isError, end) {
  const part = toolParts.get(callID);
  if (!part) return;
  part.output = outputText(output);
  part.isError = !!isError;
  part.end = end || part.end;
}

function finishMessages(messages) {
  return messages.filter((m) => m.parts && m.parts.length);
}

function parseJsonInput(raw) {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : { input: parsed };
  } catch {
    return { command: raw };
  }
}

// ---------------------------------------------------------------------------
// Codex
// ---------------------------------------------------------------------------

function codexHome() {
  return process.env.CODEX_HOME || join(homedir(), '.codex');
}

function codexStateDb() {
  const home = codexHome();
  try {
    const names = readdirSync(home).filter((n) => /^state_\d+\.sqlite$/.test(n))
      .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    return names.length ? join(home, names[names.length - 1]) : null;
  } catch {
    return null;
  }
}

function codexThreads() {
  const file = codexStateDb();
  if (!file || !DatabaseSync) return new Map();
  const out = new Map();
  try {
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      for (const row of db.prepare('SELECT * FROM threads').all()) {
        if (row && row.id) out.set(String(row.id), row);
      }
    } finally { db.close(); }
  } catch { /* 旧版 Codex 没有这个库 */ }
  return out;
}

function codexIndexTitles() {
  const file = join(codexHome(), 'session_index.jsonl');
  const out = new Map();
  if (!existsSync(file)) return out;
  try {
    const text = readTail(file, 4 * 1024 * 1024);
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line);
        if (rec && rec.id) out.set(String(rec.id), rec.thread_name || '');
      } catch { /* 坏行 */ }
    }
  } catch { /* 读不到就靠文件头 */ }
  return out;
}

function codexIdFromName(name) {
  const m = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i.exec(name);
  return m ? m[1] : '';
}

function codexMetaFromHead(file) {
  const head = readHead(file, 131072);
  let out = null;
  let title = '';
  let firstUser = '';
  for (const line of head.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    const p = rec && rec.payload;
    if (out === null && rec.type === 'session_meta' && p) {
      out = {
        id: p.id || p.session_id || '',
        cwd: p.cwd || '',
        time: parseTime(p.timestamp || rec.timestamp),
        subagent: p.thread_source === 'subagent' || !!p.parent_thread_id || !!p.source?.subagent,
      };
    }
    if (!title && rec.type === 'event_msg' && p?.type === 'thread_name_updated') title = String(p.thread_name || '');
    if (!firstUser && rec.type === 'event_msg' && p?.type === 'user_message') firstUser = String(p.message || '');
  }
  return out ? { ...out, title, firstUser } : null;
}

const codexSource = {
  id: 'codex',
  label: 'Codex',
  roots() {
    return [join(codexHome(), 'sessions'), join(codexHome(), 'archived_sessions')];
  },
  available() {
    return this.roots().some((p) => existsSync(p));
  },
  async list({ showAll = false } = {}) {
    const threads = codexThreads();
    const indexTitles = codexIndexTitles();
    const files = [];
    for (const dir of this.roots()) {
      if (!existsSync(dir)) continue;
      files.push(...walkFiles(dir, (file, name) => name.endsWith('.jsonl'), 6));
    }
    const byId = new Map();
    for (const file of files) {
      try {
        const nameId = codexIdFromName(basename(file));
        const meta = threads.get(nameId) || null;
        const id = String(meta?.id || nameId || '');
        if (!id) continue;
        const headMeta = meta ? null : codexMetaFromHead(file);
        const sessionId = String(meta?.id || headMeta?.id || id);
        const subagent = meta ? meta.thread_source === 'subagent' : !!headMeta?.subagent;
        if (subagent && !showAll) continue;
        const archived = /[\\/]archived_sessions[\\/]/.test(file) || Number(meta?.archived) === 1;
        const createdAt = parseTime(meta?.created_at) || headMeta?.time || fileMtime(file);
        const updatedAt = parseTime(meta?.updated_at) || fileMtime(file);
        const title = oneLine(meta?.title || indexTitles.get(sessionId) || meta?.first_user_message
          || headMeta?.title || headMeta?.firstUser) || sessionId;
        const entry = {
          source: 'codex', sessionId, title, cwd: String(meta?.cwd || headMeta?.cwd || ''),
          createdAt, updatedAt, sourcePath: file, archived, subagent,
          model: String(meta?.model || ''), large: fileSize(file) > LARGE_BYTES,
        };
        const prev = byId.get(sessionId);
        if (!prev || (prev.archived && !archived)) byId.set(sessionId, entry);
      } catch { /* 跳过读不了的文件 */ }
    }
    return sortNewest([...byId.values()]);
  },
  async read(item) {
    const file = item.sourcePath;
    const meta = codexThreads().get(String(item.sessionId)) || null;
    const indexTitle = codexIndexTitles().get(String(item.sessionId)) || '';
    const messages = [];
    const toolParts = new Map();
    const execResults = new Map();
    let current = null;
    let lastUser = null;
    let pendingImages = [];
    let title = String(meta?.title || indexTitle || meta?.first_user_message || '');
    let model = '';
    let cwd = '';
    let createdAt = 0;
    let updatedAt = 0;

    const flush = () => {
      if (current && current.parts.length) messages.push(current);
      current = null;
    };
    const ensureAssistant = (time) => {
      if (!current) current = { role: 'assistant', time: time || Date.now(), parts: [] };
      if (!current.time) current.time = time || Date.now();
      return current;
    };
    const pushUser = (time, text, images) => {
      const parts = [];
      const clean = String(text || '').trim();
      if (clean) parts.push({ type: 'text', text: clean });
      for (const img of images || []) {
        const part = imagePart(img.mime, img.dataUrl, img.filename);
        if (part) parts.push(part);
      }
      if (!parts.length) return;
      flush();
      const msg = { role: 'user', time: time || Date.now(), parts };
      messages.push(msg);
      lastUser = msg;
    };

    for await (const rec of readJsonl(file)) {
      const time = parseTime(rec.timestamp);
      if (time) updatedAt = time;
      const type = rec.type;
      const payload = rec.payload || {};
      if (type === 'session_meta') {
        cwd = cwd || String(payload.cwd || '');
        createdAt = createdAt || parseTime(payload.timestamp || rec.timestamp);
        model = model || String(payload.model || payload.model_provider || '');
        continue;
      }
      if (type === 'event_msg') {
        if (payload.type === 'user_message') {
          pushUser(time, payload.message, pendingImages);
          pendingImages = [];
        } else if (payload.type === 'agent_message') {
          const text = String(payload.message || '').trim();
          if (text) ensureAssistant(time).parts.push({ type: 'text', text });
        } else if (payload.type === 'agent_reasoning') {
          const text = String(payload.text || '').trim();
          if (text) ensureAssistant(time).parts.push({ type: 'reasoning', text });
        } else if (payload.type === 'thread_name_updated') {
          title = String(payload.thread_name || title);
        } else if (payload.type === 'exec_command_end') {
          const callID = payload.call_id;
          if (callID) {
            const out = [payload.stdout, payload.stderr].filter(Boolean).join('\n');
            execResults.set(callID, { output: out, isError: Number(payload.exit_code) !== 0, end: time });
          }
        } else if (payload.type === 'patch_apply_end') {
          const callID = payload.call_id;
          if (callID) execResults.set(callID, { output: outputText(payload.stdout || payload.changes), isError: false, end: time });
        } else if (payload.type === 'mcp_tool_call_end') {
          const callID = payload.call_id;
          if (callID) execResults.set(callID, { output: outputText(payload.result || payload.output), isError: false, end: time });
        }
        continue;
      }
      if (type === 'response_item') {
        if (payload.type === 'function_call' || payload.type === 'custom_tool_call') {
          const callID = payload.call_id || payload.id || '';
          const input = payload.arguments != null ? parseJsonInput(payload.arguments) : parseJsonInput(payload.input);
          const part = toolPart(callID, payload.name, input, time);
          ensureAssistant(time).parts.push(part);
          toolParts.set(part.callID, part);
        } else if (payload.type === 'function_call_output' || payload.type === 'custom_tool_call_output') {
          const callID = payload.call_id || '';
          attachToolResult(toolParts, callID, payload.output, payload.status === 'error' || payload.success === false, time);
        } else if (payload.type === 'message' && payload.role === 'user') {
          for (const block of Array.isArray(payload.content) ? payload.content : []) {
            if (block && (block.type === 'input_image' || block.type === 'image')) {
              const url = block.image_url || block.url || block.data || '';
              if (String(url).startsWith('data:')) {
                pendingImages.push({ mime: block.mime_type || block.mime || '', dataUrl: url, filename: block.filename || '' });
              }
            }
          }
        }
        continue;
      }
      if (type === 'turn_context') {
        cwd = cwd || String(payload.cwd || '');
        model = model || String(payload.model || '');
      }
    }
    flush();
    for (const [callID, result] of execResults) {
      const part = toolParts.get(callID);
      if (part && !part.output) {
        part.output = result.output;
        part.isError = result.isError;
        part.end = result.end || part.end;
      }
    }
    return {
      sessionId: item.sessionId, title: title || item.title, cwd: cwd || item.cwd,
      createdAt: createdAt || item.createdAt, updatedAt: updatedAt || item.updatedAt,
      model: model || item.model || '', messages: finishMessages(messages),
    };
  },
};

// ---------------------------------------------------------------------------
// Claude Code
// ---------------------------------------------------------------------------

function claudeHome() {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
}

function claudeRecords(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* 坏行 */ }
  }
  return out;
}

function claudeTitle(records) {
  let title = '';
  for (const rec of records) {
    if (rec.type === 'custom-title' && rec.customTitle) title = rec.customTitle;
    else if (rec.type === 'ai-title' && rec.aiTitle) title = rec.aiTitle;
    else if (rec.type === 'last-prompt' && rec.lastPrompt) title = rec.lastPrompt;
  }
  return title;
}

function claudeFirstUserText(records) {
  for (const rec of records) {
    if (rec.type !== 'user' || rec.isMeta) continue;
    const text = textOf(rec.message?.content ?? rec.content);
    if (text && !isLocalCommandText(text)) return oneLine(text);
  }
  return '';
}

function claudeSubagent(records) {
  return records.some((rec) => rec.isSidechain === true || rec.teamName
    || /^daemon/.test(String(rec.sessionKind || ''))
    || /^sdk-/.test(String(rec.entrypoint || '')));
}

const claudeSource = {
  id: 'claude',
  label: 'Claude Code',
  roots() {
    return [join(claudeHome(), 'projects')];
  },
  available() {
    return existsSync(this.roots()[0]);
  },
  async list({ showAll = false } = {}) {
    const dir = this.roots()[0];
    if (!existsSync(dir)) return [];
    const files = walkFiles(dir, (file, name) => name.endsWith('.jsonl'), 4)
      .filter((file) => !/[\\/](?:worktree|worktrees)[\\/]/.test(file));
    const out = [];
    for (const file of files) {
      try {
        const head = claudeRecords(readHead(file, 262144));
        const tail = claudeRecords(readTail(file, 131072));
        const all = head.concat(tail);
        const sessionId = basename(file, '.jsonl');
        const cwd = String(all.find((r) => r.cwd)?.cwd || '');
        const title = oneLine(claudeTitle(tail) || claudeTitle(head) || claudeFirstUserText(head)) || sessionId;
        const hasContent = all.some((r) => r.type === 'assistant')
          || (head.some((r) => r.type === 'user' && !r.isMeta && !isLocalCommandText(textOf(r.message?.content ?? r.content))));
        if (!hasContent && !showAll) continue;
        const subagent = claudeSubagent(all);
        if (subagent && !showAll) continue;
        const times = all.map((r) => parseTime(r.timestamp)).filter(Boolean).sort((a, b) => a - b);
        out.push({
          source: 'claude', sessionId, title, cwd,
          createdAt: times[0] || fileMtime(file), updatedAt: times[times.length - 1] || fileMtime(file),
          sourcePath: file, archived: false, subagent,
          model: String(all.find((r) => r.type === 'assistant' && r.message?.model)?.message?.model || ''),
          large: fileSize(file) > LARGE_BYTES,
        });
      } catch { /* 跳过读不了的文件 */ }
    }
    return sortNewest(out);
  },
  async read(item) {
    const records = await readJsonlAll(item.sourcePath);
    const byUuid = new Map();
    let leaf = null;
    for (const rec of records) {
      if (rec.uuid) byUuid.set(rec.uuid, rec);
      if (rec.type === 'last-prompt' && rec.leafUuid) leaf = byUuid.get(rec.leafUuid) || null;
      else if (rec.uuid) leaf = rec;
    }
    const chain = [];
    const seen = new Set();
    let cursor = leaf;
    while (cursor && cursor.uuid && !seen.has(cursor.uuid)) {
      seen.add(cursor.uuid);
      chain.push(cursor);
      cursor = cursor.parentUuid ? byUuid.get(cursor.parentUuid) : null;
    }
    chain.reverse();
    if (!chain.length) chain.push(...records.filter((r) => r.uuid));

    const messages = [];
    const toolParts = new Map();
    let current = null;
    let title = claudeTitle(records) || claudeFirstUserText(records);    let model = '';
    let cwd = '';
    let createdAt = 0;
    let updatedAt = 0;

    const flush = () => {
      if (current && current.parts.length) messages.push(current);
      current = null;
    };
    const ensureAssistant = (time) => {
      if (!current) current = { role: 'assistant', time: time || Date.now(), parts: [] };
      return current;
    };
    const pushUser = (time, parts) => {
      if (!parts.length) return;
      flush();
      messages.push({ role: 'user', time: time || Date.now(), parts });
    };

    for (const rec of chain) {
      const time = parseTime(rec.timestamp);
      if (time) { createdAt = createdAt || time; updatedAt = time; }
      if (rec.cwd && !cwd) cwd = String(rec.cwd);
      if (rec.message?.model) model = String(rec.message.model);
      if (rec.type === 'user') {
        const content = rec.message?.content ?? rec.content;
        const blocks = Array.isArray(content) ? content : [{ type: 'text', text: typeof content === 'string' ? content : '' }];
        const parts = [];
        for (const block of blocks) {
          if (!block || typeof block !== 'object') continue;
          if (block.type === 'tool_result') {
            attachToolResult(toolParts, block.tool_use_id, block.content, block.is_error, time);
            continue;
          }
          if (block.type === 'text') {
            if (rec.isMeta || isLocalCommandText(block.text)) continue;
            if (block.text && block.text.trim()) parts.push({ type: 'text', text: block.text });
          } else if (block.type === 'image') {
            const src = block.source || {};
            if (src.type === 'base64') {
              const part = imagePart(src.media_type, toDataUrl(src.media_type, src.data));
              if (part) parts.push(part);
            }
          }
        }
        pushUser(time, parts);
        continue;
      }
      if (rec.type === 'assistant') {
        const blocks = Array.isArray(rec.message?.content) ? rec.message.content : [];
        for (const block of blocks) {
          if (!block || typeof block !== 'object') continue;
          if (block.type === 'text' && block.text && block.text.trim()) {
            ensureAssistant(time).parts.push({ type: 'text', text: block.text });
          } else if (block.type === 'thinking' && block.thinking) {
            ensureAssistant(time).parts.push({ type: 'reasoning', text: block.thinking });
          } else if (block.type === 'tool_use') {
            const part = toolPart(block.id, block.name, block.input || {}, time);
            ensureAssistant(time).parts.push(part);
            toolParts.set(block.id, part);
          }
        }
      }
    }
    flush();
    return {
      sessionId: item.sessionId, title: title || item.title, cwd: cwd || item.cwd,
      createdAt: createdAt || item.createdAt, updatedAt: updatedAt || item.updatedAt,
      model: model || item.model || '', messages: finishMessages(messages),
    };
  },
};

// ---------------------------------------------------------------------------
// pi
// ---------------------------------------------------------------------------

function piHome() {
  return join(homedir(), '.pi', 'agent');
}

function piSessionsDir() {
  const env = String(process.env.PI_CODING_AGENT_SESSION_DIR || '').trim();
  if (env) return env;
  try {
    const settings = JSON.parse(readHead(join(piHome(), 'settings.json'), 65536) || '{}');
    if (settings.sessionDir) {
      const dir = String(settings.sessionDir);
      return dir.startsWith('~') ? join(homedir(), dir.slice(1)) : resolve(dir);
    }
  } catch { /* 没有设置文件就用默认目录 */ }
  return join(piHome(), 'sessions');
}

function piHeader(file) {
  const head = readHead(file, 262144);
  for (const line of head.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line);
      if (rec && rec.type === 'session') return rec;
    } catch { /* 继续找 */ }
  }
  return null;
}

const piSource = {
  id: 'pi',
  label: 'pi',
  roots() {
    return [piSessionsDir()];
  },
  available() {
    return existsSync(this.roots()[0]);
  },
  async list({ showAll = false } = {}) {
    const dir = this.roots()[0];
    if (!existsSync(dir)) return [];
    const files = walkFiles(dir, (file, name) => name.endsWith('.jsonl') && !name.endsWith('.edit-backup'), 4);
    const out = [];
    for (const file of files) {
      try {
        const header = piHeader(file);
        if (!header || !header.id) continue;
        const head = readHead(file, 262144);
        const tail = readTail(file, 131072);
        const records = claudeRecords(head).concat(claudeRecords(tail));
        const lastInfo = records.filter((r) => r.type === 'session_info' && r.name).pop();
        const firstUser = records.map((r) => (r.type === 'message' && r.message?.role === 'user'
          ? stripPiInjections(textOf(r.message.content)) : '')).find(Boolean);
        const codexImport = records.some((r) => r.type === 'codex_import');
        if (codexImport && !showAll) continue;
        const subagent = header.origin === 'subagent' || Number(header.delegationDepth) > 0;
        if (subagent && !showAll) continue;
        const times = records.map((r) => parseTime(r.timestamp || r.message?.timestamp)).filter(Boolean).sort((a, b) => a - b);
        out.push({
          source: 'pi', sessionId: String(header.id),
          title: oneLine(lastInfo?.name || firstUser) || String(header.id),
          cwd: String(header.cwd || ''), createdAt: parseTime(header.timestamp) || fileMtime(file),
          updatedAt: times[times.length - 1] || fileMtime(file), sourcePath: file,
          archived: false, subagent, codexImport,
          model: String(records.find((r) => r.type === 'message' && r.message?.role === 'assistant' && r.message?.model)?.message?.model || ''),
          large: fileSize(file) > LARGE_BYTES,
        });
      } catch { /* 跳过读不了的文件 */ }
    }
    return sortNewest(out);
  },
  async read(item) {
    const records = await readJsonlAll(item.sourcePath);
    const header = records.find((r) => r.type === 'session') || {};
    const firstUser = records.map((r) => (r.type === 'message' && r.message?.role === 'user'
      ? stripPiInjections(textOf(r.message.content)) : '')).find(Boolean) || '';
    let title = records.filter((r) => r.type === 'session_info' && r.name).pop()?.name || '';
    const byId = new Map();
    let leaf = null;
    for (const rec of records) {
      if (rec.id) byId.set(rec.id, rec);
      if (rec.type === 'message') leaf = rec;
    }
    const chain = [];
    const seen = new Set();
    let cursor = leaf;
    while (cursor && cursor.id && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      chain.push(cursor);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : null;
    }
    chain.reverse();

    const messages = [];
    const toolParts = new Map();
    let current = null;
    let model = '';

    const flush = () => {
      if (current && current.parts.length) messages.push(current);
      current = null;
    };
    const ensureAssistant = (time) => {
      if (!current) current = { role: 'assistant', time: time || Date.now(), parts: [] };
      return current;
    };
    const pushUser = (time, parts) => {
      if (!parts.length) return;
      flush();
      messages.push({ role: 'user', time: time || Date.now(), parts });
    };

    for (const rec of chain) {
      const time = parseTime(rec.timestamp || rec.message?.timestamp);
      if (rec.type === 'session_info' && rec.name) title = String(rec.name);
      if (rec.type !== 'message') continue;
      const message = rec.message || {};
      if (message.role === 'user') {
        const parts = [];
        for (const block of Array.isArray(message.content) ? message.content : []) {
          if (block.type === 'text') {
            const text = stripPiInjections(block.text);
            if (text) parts.push({ type: 'text', text });
          } else if (block.type === 'image') {
            const part = imagePart(block.mimeType, toDataUrl(block.mimeType, block.data));
            if (part) parts.push(part);
          }
        }
        pushUser(time, parts);
      } else if (message.role === 'assistant') {
        if (message.model) model = String(message.model);
        for (const block of Array.isArray(message.content) ? message.content : []) {
          if (block.type === 'text' && block.text && block.text.trim()) {
            ensureAssistant(time).parts.push({ type: 'text', text: block.text });
          } else if (block.type === 'thinking' && block.thinking) {
            ensureAssistant(time).parts.push({ type: 'reasoning', text: block.thinking });
          } else if (block.type === 'toolCall') {
            const part = toolPart(block.id, block.name, block.arguments || {}, time);
            ensureAssistant(time).parts.push(part);
            toolParts.set(block.id, part);
          }
        }
      } else if (message.role === 'toolResult') {
        attachToolResult(toolParts, message.toolCallId, message.content, message.isError, time);
      }
    }
    flush();
    return {
      sessionId: item.sessionId, title: title || oneLine(firstUser) || item.title, cwd: header.cwd || item.cwd,
      createdAt: parseTime(header.timestamp) || item.createdAt, updatedAt: item.updatedAt,
      model: model || item.model || '', messages: finishMessages(messages),
    };
  },
};

// ---------------------------------------------------------------------------
// dsh
// ---------------------------------------------------------------------------

function dshHome() {
  const env = String(process.env.DSH_HOME || '').trim();
  return env || join(homedir(), '.dsh');
}

const dshCache = new Map();

function dshFiles() {
  const dir = join(dshHome(), 'sessions');
  if (!existsSync(dir)) return [];
  const out = [];
  for (const project of readdirSync(dir, { withFileTypes: true })) {
    if (!project.isDirectory()) continue;
    const projectDir = join(dir, project.name);
    for (const session of readdirSync(projectDir, { withFileTypes: true })) {
      if (!session.isDirectory()) continue;
      const sessionDir = join(projectDir, session.name);
      let names = [];
      try { names = readdirSync(sessionDir); } catch { continue; }
      const plain = names.find((n) => /^session\.jsonl$/.test(n));
      if (plain) { out.push({ file: join(sessionDir, plain), compressed: false }); continue; }
      const zst = names.filter((n) => /^session(?:\.v\d+)?\.jsonl\.zstd$/.test(n))
        .sort((a, b) => Number((a.match(/\.v(\d+)\./) || [])[1] || 0) - Number((b.match(/\.v(\d+)\./) || [])[1] || 0));
      if (zst.length) out.push({ file: join(sessionDir, zst[zst.length - 1]), compressed: true });
    }
  }
  return out;
}

function dshLines(file, compressed) {
  const mtime = fileMtime(file);
  const cached = dshCache.get(file);
  if (cached && cached.mtime === mtime) return cached.lines;
  const raw = compressed ? zstdDecompressAll(readFileSync(file)) : readFileSync(file);
  const lines = [];
  for (const line of raw.toString('utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { lines.push(JSON.parse(line)); } catch { /* 坏行 */ }
  }
  dshCache.set(file, { mtime, lines, size: raw.length });
  return lines;
}

const dshSource = {
  id: 'dsh',
  label: 'dsh',
  roots() {
    return [join(dshHome(), 'sessions')];
  },
  available() {
    return existsSync(this.roots()[0]);
  },
  async list({ showAll = false } = {}) {
    const out = [];
    for (const item of dshFiles()) {
      let lines;
      try { lines = dshLines(item.file, item.compressed); } catch { continue; }
      const header = lines.find((r) => r.type === 'session');
      if (!header || !header.id) continue;
      const subagent = header.origin === 'subagent' || Number(header.delegationDepth) > 0;
      if (subagent && !showAll) continue;
      const titles = lines.filter((r) => r.type === 'session/title' && r.data?.title);
      const firstUser = lines.map((r) => (r.type === 'user/message' && r.data?.source?.kind === 'user'
        ? textOf(r.data.content) : '')).find(Boolean);
      const times = lines.map((r) => parseTime(r.time)).filter(Boolean).sort((a, b) => a - b);
      const size = dshCache.get(item.file)?.size || fileSize(item.file);
      out.push({
        source: 'dsh', sessionId: String(header.id),
        title: oneLine(titles[titles.length - 1]?.data?.title || firstUser) || String(header.id),
        cwd: String(header.cwd || ''), createdAt: parseTime(header.createdAt) || fileMtime(item.file),
        updatedAt: times[times.length - 1] || fileMtime(item.file), sourcePath: item.file,
        archived: false, subagent,
        model: String(lines.find((r) => r.type === 'request/context')?.data?.model || ''),
        large: size > LARGE_BYTES,
      });
    }
    return sortNewest(out);
  },
  async read(item) {
    const lines = dshLines(item.sourcePath, /\.zstd$/.test(item.sourcePath));
    const header = lines.find((r) => r.type === 'session') || {};
    const firstUser = lines.map((r) => (r.type === 'user/message' && r.data?.source?.kind === 'user'
      ? textOf(r.data.content) : '')).find(Boolean) || '';
    const messages = [];
    const toolParts = new Map();
    let current = null;
    let title = '';
    let model = '';

    const flush = () => {
      if (current && current.parts.length) messages.push(current);
      current = null;
    };
    const ensureAssistant = (time) => {
      if (!current) current = { role: 'assistant', time: time || Date.now(), parts: [] };
      return current;
    };
    const pushUser = (time, parts) => {
      if (!parts.length) return;
      flush();
      messages.push({ role: 'user', time: time || Date.now(), parts });
    };

    for (const rec of lines) {
      const time = parseTime(rec.time);
      if (rec.type === 'session/title' && rec.data?.title) title = String(rec.data.title);
      if (rec.type === 'request/context' && rec.data?.model) model = String(rec.data.model);
      if (rec.type === 'user/message') {
        if (rec.data?.source?.kind !== 'user') continue;
        const parts = [];
        for (const block of Array.isArray(rec.data.content) ? rec.data.content : []) {
          if (block.type === 'text') {
            const text = String(block.text || '').trim();
            if (text) parts.push({ type: 'text', text });
          } else if (block.type === 'image') {
            const part = imagePart(block.mimeType, toDataUrl(block.mimeType, block.data));
            if (part) parts.push(part);
          }
        }
        pushUser(time, parts);
      } else if (rec.type === 'assistant/message') {
        const message = rec.data?.message || {};
        if (message.source?.model) model = String(message.source.model);
        for (const block of Array.isArray(message.content) ? message.content : []) {
          if (block.type === 'text' && block.text && block.text.trim()) {
            ensureAssistant(time).parts.push({ type: 'text', text: block.text });
          } else if (block.type === 'reasoning' && block.text) {
            ensureAssistant(time).parts.push({ type: 'reasoning', text: block.text });
          } else if (block.type === 'tool-call') {
            const part = toolPart(block.id, block.name, parseJsonInput(block.arguments), time);
            ensureAssistant(time).parts.push(part);
            toolParts.set(block.id, part);
          }
        }
      } else if (rec.type === 'tool/result') {
        const callID = rec.data?.toolCallId || rec.data?.message?.toolCallId;
        attachToolResult(toolParts, callID, rec.data?.message?.content || rec.data?.content, rec.data?.message?.isError, time);
      }
    }
    flush();
    return {
      sessionId: item.sessionId, title: title || oneLine(firstUser) || item.title, cwd: header.cwd || item.cwd,
      createdAt: parseTime(header.createdAt) || item.createdAt, updatedAt: item.updatedAt,
      model: model || item.model || '', messages: finishMessages(messages),
    };
  },
};

export const SOURCES = { codex: codexSource, claude: claudeSource, pi: piSource, dsh: dshSource };

export function sourceList() {
  return Object.values(SOURCES).map((s) => ({ id: s.id, label: s.label, available: s.available() }));
}

export function sourceRoots(id) {
  return normalizeRoots(SOURCES[id]?.roots() || []);
}

export function sourceAvailable(id) {
  return !!SOURCES[id]?.available();
}

export async function listSourceSessions(id, opts) {
  if (!SOURCES[id]) throw new Error('未知来源');
  return SOURCES[id].list(opts);
}

export async function readSourceSession(id, item) {
  if (!SOURCES[id]) throw new Error('未知来源');
  return SOURCES[id].read(item);
}
