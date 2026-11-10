// 四个来源共用的解析工具：读 JSONL、取文件头尾、时间归一、文本提取、工具名映射。
import { closeSync, createReadStream, openSync, readSync, readdirSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve, sep } from 'node:path';

export async function* readJsonl(file) {
  const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      const s = line.trim();
      if (!s) continue;
      try { yield JSON.parse(s); } catch { /* 末尾写了一半的行，跳过 */ }
    }
  } finally {
    rl.close();
  }
}

export async function readJsonlAll(file) {
  const out = [];
  for await (const rec of readJsonl(file)) out.push(rec);
  return out;
}

export function readHead(file, bytes = 262144) {
  const fd = openSync(file, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const n = readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, n).toString('utf8');
  } finally {
    closeSync(fd);
  }
}

export function readTail(file, bytes = 65536) {
  const size = statSync(file).size;
  const start = Math.max(0, size - bytes);
  const fd = openSync(file, 'r');
  try {
    const buf = Buffer.alloc(size - start);
    const n = readSync(fd, buf, 0, buf.length, start);
    return buf.subarray(0, n).toString('utf8');
  } finally {
    closeSync(fd);
  }
}

export function parseTime(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v < 1e12 ? Math.round(v * 1000) : Math.round(v);
  if (typeof v === 'string' && v) {
    const t = Date.parse(v);
    if (Number.isFinite(t)) return t;
  }
  return 0;
}

export function oneLine(value, max = 200) {
  const s = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

export function blockText(block) {
  if (!block || typeof block !== 'object') return '';
  if (typeof block.text === 'string') return block.text;
  if (typeof block.thinking === 'string') return block.thinking;
  if (typeof block.content === 'string') return block.content;
  if (Array.isArray(block.content)) return block.content.map(blockText).filter(Boolean).join('\n');
  return '';
}

export function textOf(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(blockText).filter(Boolean).join('\n');
  return blockText(value);
}

export function isLocalCommandText(text) {
  const s = String(text || '').trim();
  return /^<(?:local-command|command-name|command-message|local-command-stdout)/.test(s);
}

export function stripPiInjections(text) {
  return String(text || '')
    .replace(/<skill>[\s\S]*?<\/skill>/g, '')
    .replace(/<available_skills>[\s\S]*?<\/available_skills>/g, '')
    .trim();
}

export function toDataUrl(mime, data) {
  const raw = String(data || '');
  if (!raw) return '';
  if (raw.startsWith('data:')) return raw;
  return `data:${mime || 'application/octet-stream'};base64,${raw}`;
}

export function dataUrlBytes(url) {
  const comma = String(url || '').indexOf(',');
  if (comma < 0) return 0;
  return Math.round((url.length - comma - 1) * 3 / 4);
}

// 只解图片头部，拿显示尺寸；认不出来就省略，不影响导入。
export function imageSize(dataUrl) {
  const comma = String(dataUrl || '').indexOf(',');
  if (comma < 0) return null;
  const buf = Buffer.from(dataUrl.slice(comma + 1, comma + 1 + 131072), 'base64');
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length >= 10 && buf.toString('ascii', 0, 3) === 'GIF') {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let p = 2;
    while (p + 9 < buf.length) {
      if (buf[p] !== 0xff) { p++; continue; }
      const marker = buf[p + 1];
      const len = buf.readUInt16BE(p + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: buf.readUInt16BE(p + 7), height: buf.readUInt16BE(p + 5) };
      }
      p += 2 + len;
    }
  }
  return null;
}

export function outputText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(blockText).filter(Boolean).join('\n');
  if (typeof value === 'object') {
    const t = blockText(value);
    if (t) return t;
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
}

export function truncateText(value, max, note = '内容过长，已截断') {
  const s = String(value == null ? '' : value);
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n\n[${note}，原长 ${s.length} 字符]`;
}

const TOOL_NAMES = {
  bash: 'Bash', shell: 'Bash', exec: 'Bash', run_shell_command: 'Bash', shell_command: 'Bash',
  read: 'Read', read_file: 'Read', readfile: 'Read',
  write: 'Write', write_file: 'Write', writefile: 'Write',
  edit: 'Edit', edit_file: 'Edit', str_replace_editor: 'Edit',
  grep: 'Grep', search: 'Grep',
  glob: 'Glob', find: 'Glob',
};

// 只映射参数形状能对上 ZCode 内置工具的调用；对不上就返回 null，由调用方转成文本块。
export function mapToolCall(name, input) {
  const mapped = TOOL_NAMES[String(name || '').toLowerCase()];
  if (!mapped) return null;
  const args = input && typeof input === 'object' ? input : {};
  if (mapped === 'Bash') {
    let command = args.command ?? args.cmd ?? args.input;
    if (Array.isArray(command)) command = command.join(' ');
    if (typeof command !== 'string' || !command.trim()) return null;
    return { tool: 'Bash', input: { command } };
  }
  if (mapped === 'Read') {
    const file = args.file_path ?? args.path ?? args.file;
    if (typeof file !== 'string' || !file) return null;
    return { tool: 'Read', input: { file_path: file } };
  }
  if (mapped === 'Write') {
    const file = args.file_path ?? args.path ?? args.file;
    const content = args.content ?? args.text;
    if (typeof file !== 'string' || !file || typeof content !== 'string') return null;
    return { tool: 'Write', input: { file_path: file, content } };
  }
  if (mapped === 'Edit') {
    const file = args.file_path ?? args.path ?? args.file;
    const oldText = args.old_string ?? args.oldText ?? args.search;
    const newText = args.new_string ?? args.newText ?? args.replace;
    if (typeof file !== 'string' || !file || typeof oldText !== 'string' || typeof newText !== 'string') return null;
    return { tool: 'Edit', input: { file_path: file, old_string: oldText, new_string: newText } };
  }
  if (mapped === 'Grep') {
    const pattern = args.pattern ?? args.query;
    if (typeof pattern !== 'string' || !pattern) return null;
    const path = args.path ?? args.cwd ?? args.directory;
    const out = { pattern };
    if (typeof path === 'string' && path) out.path = path;
    return { tool: 'Grep', input: out };
  }
  if (mapped === 'Glob') {
    const pattern = args.pattern ?? args.glob ?? args.query;
    if (typeof pattern !== 'string' || !pattern) return null;
    const path = args.path ?? args.cwd ?? args.directory;
    const out = { pattern };
    if (typeof path === 'string' && path) out.path = path;
    return { tool: 'Glob', input: out };
  }
  return null;
}

export function walkFiles(dir, accept, depth = 6) {
  const out = [];
  const visit = (current, level) => {
    let entries;
    try { entries = readdirSync(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = resolve(current, entry.name);
      if (entry.isDirectory()) {
        if (level < depth) visit(full, level + 1);
      } else if (entry.isFile() && accept(full, entry.name)) {
        out.push(full);
      }
    }
  };
  visit(dir, 0);
  return out;
}

export function normalizeRoots(roots) {
  const seen = new Set();
  const out = [];
  for (const root of Array.isArray(roots) ? roots : []) {
    if (typeof root !== 'string' || !root) continue;
    const p = resolve(root);
    if (p === sep || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

export function isUnder(file, roots) {
  if (!file) return false;
  const p = resolve(file);
  return roots.some((root) => p === root || p.startsWith(root.endsWith(sep) ? root : root + sep));
}
