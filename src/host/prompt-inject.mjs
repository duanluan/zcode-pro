// 提示词注入：供应商代理转发前，把用户写的正文追加到请求体已有的 system 内容末尾。
//
// 只处理“带完整对话”的请求：有 system 内容、有非空 messages（或 responses 的 input）。
// 计 token、列模型这类附带请求原样放过。请求体读不懂（非 JSON、解压失败、超过上限）
// 也原样放过——宁可这次不注入，也不能把用户的请求搞坏。
//
// 协议按请求体形状判断，不看供应商配置里的协议字段：同一供应商的不同接口可能形状不同。
// - Anthropic messages：顶层 system（字符串或内容块数组）+ messages
// - OpenAI chat completions：messages 里 role=system/developer
// - OpenAI responses：顶层 instructions 字符串，或 input 数组里的 system/developer 项
import { brotliDecompressSync, gunzipSync, inflateRawSync, inflateSync } from 'node:zlib';

// 读取请求体的上限：超过就原样转发，不做改写（防止代理把内存吃光）
export const MAX_BODY_BYTES = 64 * 1024 * 1024;

// 主对话的识别标记：官方 system 里主对话带 "# Harness" 段，子代理（Zic 组装）
// 只有 CLI Prefix 与 Subagent Notes，没有这一段。
const HARNESS_MARK = '# Harness';

// 这些路径不是对话请求（计 token 等），即使形状像也不注入
const SKIP_PATH_RE = /(^|\/)count_tokens(\/|$)/i;

function decodeBody(raw, encoding) {
  const enc = String(encoding || '').trim().toLowerCase();
  if (!enc || enc === 'identity') return raw;
  try {
    if (enc === 'gzip' || enc === 'x-gzip') return gunzipSync(raw);
    if (enc === 'deflate') {
      try { return inflateSync(raw); } catch { return inflateRawSync(raw); }
    }
    if (enc === 'br') return brotliDecompressSync(raw);
  } catch {
    return null; // 解压失败：调用方原样转发
  }
  return null; // 不认识的编码：不碰
}

// 把消息 content（字符串或内容块数组）里的文字拼出来，用于判断是不是主对话
function textOfContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b) => b && typeof b === 'object' && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n');
}

function isNonEmptyArray(v) {
  return Array.isArray(v) && v.length > 0;
}

// 请求体形状识别；返回协议名或 null
export function detectProtocol(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (isNonEmptyArray(body.messages)) {
    // Anthropic 用顶层 system；OpenAI chat completions 把 system 放 messages 里
    if (body.system !== undefined) return 'anthropic';
    const sys = body.messages.find((m) => m && (m.role === 'system' || m.role === 'developer'));
    return sys ? 'openai-chat' : null;
  }
  if (Array.isArray(body.input) && body.input.length > 0) return 'openai-responses';
  if (typeof body.instructions === 'string' && body.instructions.trim()) return 'openai-responses';
  return null;
}

// 取出该请求的 system 文字（可能有多段，拼起来做判断）
function systemText(body, protocol) {
  if (protocol === 'anthropic') return textOfContent(body.system);
  if (protocol === 'openai-chat') {
    return body.messages
      .filter((m) => m && (m.role === 'system' || m.role === 'developer'))
      .map((m) => textOfContent(m.content))
      .join('\n');
  }
  if (protocol === 'openai-responses') {
    const parts = [];
    if (typeof body.instructions === 'string') parts.push(body.instructions);
    for (const item of Array.isArray(body.input) ? body.input : []) {
      if (item && (item.role === 'system' || item.role === 'developer')) parts.push(textOfContent(item.content));
    }
    return parts.join('\n');
  }
  return '';
}

// 往 content（字符串或块数组）末尾追加文字；返回新的 content
function appendToContent(content, text) {
  if (typeof content === 'string') return content ? `${content}\n\n${text}` : text;
  if (Array.isArray(content)) {
    return [...content, { type: 'text', text: `\n\n${text}` }];
  }
  return text;
}

// 按协议把正文写进请求体；返回是否改动过
function applyText(body, protocol, text) {
  if (protocol === 'anthropic') {
    // 字符串直接拼；数组 push 一个新块，原有块的 cache_control 一概不动，
    // 这样前面的提示词缓存前缀仍然有效
    if (Array.isArray(body.system)) {
      body.system = appendToContent(body.system, text);
    } else if (typeof body.system === 'string') {
      body.system = body.system ? `${body.system}\n\n${text}` : text;
    } else {
      return false;
    }
    return true;
  }
  if (protocol === 'openai-chat') {
    const idx = body.messages.findIndex((m) => m && (m.role === 'system' || m.role === 'developer'));
    if (idx >= 0) {
      body.messages[idx] = { ...body.messages[idx], content: appendToContent(body.messages[idx].content, text) };
    } else {
      body.messages = [{ role: 'system', content: text }, ...body.messages];
    }
    return true;
  }
  if (protocol === 'openai-responses') {
    // instructions 是 responses 接口的 system 位；有就拼，没有再看 input 里的 system 项
    if (typeof body.instructions === 'string' && body.instructions.trim()) {
      body.instructions = `${body.instructions}\n\n${text}`;
      return true;
    }
    const input = Array.isArray(body.input) ? body.input : null;
    if (input) {
      const idx = input.findIndex((m) => m && (m.role === 'system' || m.role === 'developer'));
      if (idx >= 0) {
        input[idx] = { ...input[idx], content: appendToContent(input[idx].content, text) };
        return true;
      }
      input.unshift({ role: 'system', content: text });
      return true;
    }
  }
  return false;
}

// 判断这次请求要不要注入
export function shouldInject({ url = '', body, text, includeSubagents = false }) {
  if (typeof text !== 'string' || !text.trim()) return null;
  if (SKIP_PATH_RE.test(String(url))) return null;
  const protocol = detectProtocol(body);
  if (!protocol) return null;
  if (!includeSubagents) {
    // 默认只给主对话：system 里必须有官方 Harness 段。
    // 后台起名/标题这类请求没有 system 或没有这一段，天然被排除
    if (!systemText(body, protocol).includes(HARNESS_MARK)) return null;
  }
  return protocol;
}

// 改写一个请求体。返回 { buffer, changed }；不需要改动时 changed 为 false、buffer 为原字节。
export function rewriteRequest({ url = '', headers = {}, rawBody, text, includeSubagents = false }) {
  const original = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody || '');
  const unchanged = { buffer: original, changed: false };
  if (!original.length) return unchanged;
  if (original.length > MAX_BODY_BYTES) return unchanged;

  const decoded = decodeBody(original, headers['content-encoding'] || headers['Content-Encoding']);
  if (!decoded || !decoded.length) return unchanged;

  let body;
  try {
    body = JSON.parse(decoded.toString('utf8'));
  } catch {
    return unchanged;
  }

  const protocol = shouldInject({ url, body, text, includeSubagents });
  if (!protocol) return unchanged;
  if (!applyText(body, protocol, String(text).trim())) return unchanged;

  return { buffer: Buffer.from(JSON.stringify(body), 'utf8'), changed: true };
}
