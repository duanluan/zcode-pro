// 划词翻译的后端库：zcode-translate.json 配置读写、LLM 通道调用（anthropic/openai
// 双格式，支持思考档位与流式）、单词词典卡片的提示词与解析、机翻通道适配。
// LLM 请求体构造与 helper.mjs 的智能起名、zcode-plugins 的 vision-lib.mjs 各有
// 一份复刻（仓库惯例：发布产物不跨仓库 import），改请求体结构时三处同改。

import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

// 划词翻译的配置文件（与设置页“翻译”标签、翻译面板共用）
export function defaultTranslateFile() {
  return join(homedir(), '.zcode', 'zcode-translate.json');
}

function historyFileOf(translateFile) {
  return join(dirname(translateFile), 'zcode-translate-history.json');
}

function readJsonFile(p) {
  try {
    // Windows 记事本/PowerShell 保存的 JSON 带 UTF-8 BOM，JSON.parse 不认：先剥掉
    const text = readFileSync(p, 'utf-8');
    return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch { return null; }
}

// ———— 配置：默认值、读取归一、校验、合并写 ————

// 思考档位：各模型支持的档位不同（GLM 是 low/high/max，MiMo 只有 off/enabled，
// Meta 有 6 档）。这里只做通用校验，具体可选值来自供应商表里每个模型的
// modelReasoning.variants；'off' 统一表示关闭
export const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'enabled'];
export const isValidThinking = (v) => typeof v === 'string' && /^[a-z]{2,10}$/.test(v);
export const TRIGGER_MODES = ['ctrl-drag', 'ctrl-tap', 'alt-drag'];
export const PANEL_THEMES = ['follow', 'light', 'dark'];

// 机翻通道注册表：新增一家只需在 MT_ADAPTERS（见下）加适配函数并在此登记凭据字段
export const MT_SERVICES = [
  { id: 'youdao', creds: ['appKey', 'key'] },
  { id: 'baidu', creds: ['appId', 'secret'] },
  { id: 'caiyun', creds: ['token'] },
  { id: 'deepl', creds: ['authKey'] },
  { id: 'deeplx', creds: ['apiUrl'] },
  { id: 'niu', creds: ['apiKey'] },
  { id: 'tencent', creds: ['secretId', 'secretKey'] },
  { id: 'aliyun', creds: ['accessKeyId', 'accessKeySecret'] },
  { id: 'volc', creds: ['accessKeyId', 'secretAccessKey'] },
];

export const DEFAULT_TRANSLATE_PROMPTS = [
  { id: 'quick', name: '快译', prompt: '你是翻译引擎。把用户消息翻译成{target}，只输出译文：不解释、不加注、保留原文的换行与段落结构。' },
  { id: 'refined', name: '精翻', prompt: '你是资深译者。把用户消息翻译成{target}：先吃透原意，再用符合{target}表达习惯的文字重写，做到信达雅，正确使用{target}标点，保留原文的语气与正式程度；只输出最终译文。' },
  { id: 'tech', name: '技术文档', prompt: '你是技术文档译者。把用户消息翻译成{target}：代码、命令、路径、API 名、产品名保留原文不译；专有名词首次出现时在译文后括注原文；同一术语全文统一；只输出译文。' },
];

export const TARGET_LANG_NAMES = {
  zh: '简体中文', en: 'English', ja: '日本語', ko: '한국어',
  fr: 'Français', de: 'Deutsch', ru: 'Русский', es: 'Español', pt: 'Português',
};

function defaultTranslateConfig() {
  return {
    enabled: true,
    trigger: { mode: 'ctrl-drag' },
    channel: { type: 'llm', provider: 'session', model: '', thinking: 'off', service: 'deepl' },
    promptId: 'quick',
    prompts: DEFAULT_TRANSLATE_PROMPTS.map((p) => ({ ...p })),
    targetLang: 'zh',
    // height: 用户拖拽设置的像素高度，0 表示未设置（按 maxHeightPct 自适应内容）
    panel: { width: 450, maxHeightPct: 80, height: 0, theme: 'follow' },
    history: { enabled: true, limit: 100 },
    mt: { services: {} },
  };
}

function clampInt(v, fallback, min, max) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// 读取并按默认归一：磁盘上缺的键补默认值，非法值回退，多出的未知键原样保留
export function readTranslateConfig(file) {
  const cur = readJsonFile(file);
  const def = defaultTranslateConfig();
  const doc = cur && typeof cur === 'object' && !Array.isArray(cur) ? cur : {};
  const out = { ...def, ...doc };
  out.enabled = doc.enabled !== false;
  out.trigger = { ...def.trigger, ...(doc.trigger && typeof doc.trigger === 'object' ? doc.trigger : {}) };
  if (!TRIGGER_MODES.includes(out.trigger.mode)) out.trigger.mode = 'ctrl-drag';
  out.channel = { ...def.channel, ...(doc.channel && typeof doc.channel === 'object' ? doc.channel : {}) };
  if (out.channel.type !== 'mt') out.channel.type = 'llm';
  if (!isValidThinking(out.channel.thinking)) out.channel.thinking = 'off';
  if (typeof out.promptId !== 'string' || !out.promptId) out.promptId = 'quick';
  if (!Array.isArray(out.prompts) || !out.prompts.length) out.prompts = def.prompts;
  out.prompts = out.prompts
    .filter((p) => p && typeof p === 'object' && typeof p.id === 'string' && typeof p.prompt === 'string')
    .slice(0, 20)
    .map((p) => ({ id: p.id.slice(0, 40), name: String(p.name || p.id).slice(0, 30), prompt: p.prompt.slice(0, 4000) }));
  if (!out.prompts.length) out.prompts = def.prompts;
  if (typeof out.targetLang !== 'string' || !/^[a-z]{2,8}$/.test(out.targetLang)) out.targetLang = 'zh';
  out.panel = { ...def.panel, ...(doc.panel && typeof doc.panel === 'object' ? doc.panel : {}) };
  out.panel.width = clampInt(out.panel.width, 450, 240, 1200);
  out.panel.maxHeightPct = clampInt(out.panel.maxHeightPct, 80, 40, 95);
  out.panel.height = clampInt(out.panel.height, 0, 0, 2000);
  if (!PANEL_THEMES.includes(out.panel.theme)) out.panel.theme = 'follow';
  out.history = { ...def.history, ...(doc.history && typeof doc.history === 'object' ? doc.history : {}) };
  out.history.enabled = out.history.enabled !== false;
  out.history.limit = clampInt(out.history.limit, 100, 10, 1000);
  const mt = doc.mt && typeof doc.mt === 'object' && doc.mt.services && typeof doc.mt.services === 'object' ? doc.mt.services : {};
  const services = {};
  for (const s of MT_SERVICES) {
    const src = mt[s.id] && typeof mt[s.id] === 'object' ? mt[s.id] : {};
    const dst = {};
    for (const k of s.creds) if (typeof src[k] === 'string') dst[k] = src[k].slice(0, 300);
    if (s.id === 'deeplx' && typeof src.token === 'string') dst.token = src.token.slice(0, 300); // DeepLX 的 token 可选（Bearer 或 {{apiKey}} 占位）
    services[s.id] = dst;
  }
  out.mt = { services };
  return out;
}

// 校验前端提交的配置（返回 [cfg, err]，cfg 只含认识且合法的键）
export function validateTranslateConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [null, 'config 需为对象'];
  const def = defaultTranslateConfig();
  const out = {};
  if (raw.enabled !== undefined) {
    if (typeof raw.enabled !== 'boolean') return [null, 'enabled 需为布尔值'];
    out.enabled = raw.enabled;
  }
  if (raw.trigger && typeof raw.trigger === 'object') {
    if (raw.trigger.mode !== undefined) {
      if (!TRIGGER_MODES.includes(raw.trigger.mode)) return [null, 'trigger.mode 取值不合法'];
      out.trigger = { mode: raw.trigger.mode };
    }
  }
  if (raw.channel && typeof raw.channel === 'object') {
    const c = raw.channel;
    const dst = {};
    if (c.type !== undefined) {
      if (c.type !== 'llm' && c.type !== 'mt') return [null, 'channel.type 只能是 llm 或 mt'];
      dst.type = c.type;
    }
    for (const k of ['provider', 'model', 'service']) {
      if (typeof c[k] === 'string') dst[k] = c[k].slice(0, 200);
    }
    if (c.thinking !== undefined) {
      if (!isValidThinking(c.thinking)) return [null, 'channel.thinking 取值不合法'];
      dst.thinking = c.thinking;
    }
    if (Object.keys(dst).length) out.channel = dst;
  }
  if (typeof raw.promptId === 'string' && raw.promptId) out.promptId = raw.promptId.slice(0, 40);
  if (raw.prompts !== undefined) {
    if (!Array.isArray(raw.prompts)) return [null, 'prompts 需为数组'];
    const list = [];
    for (const p of raw.prompts.slice(0, 20)) {
      if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !p.id || typeof p.prompt !== 'string') {
        return [null, 'prompts 条目需含 id 与 prompt 字符串'];
      }
      list.push({ id: p.id.slice(0, 40), name: String(p.name || p.id).slice(0, 30), prompt: p.prompt.slice(0, 4000) });
    }
    if (!list.length) return [null, 'prompts 不能为空'];
    out.prompts = list;
  }
  if (raw.targetLang !== undefined) {
    if (typeof raw.targetLang !== 'string' || !/^[a-z]{2,8}$/.test(raw.targetLang)) return [null, 'targetLang 取值不合法'];
    out.targetLang = raw.targetLang;
  }
  if (raw.panel && typeof raw.panel === 'object') {
    const dst = {};
    if (raw.panel.width !== undefined) dst.width = clampInt(raw.panel.width, 450, 240, 1200);
    if (raw.panel.maxHeightPct !== undefined) dst.maxHeightPct = clampInt(raw.panel.maxHeightPct, 80, 40, 95);
    if (raw.panel.height !== undefined) dst.height = clampInt(raw.panel.height, 0, 0, 2000);
    if (raw.panel.theme !== undefined) {
      if (!PANEL_THEMES.includes(raw.panel.theme)) return [null, 'panel.theme 取值不合法'];
      dst.theme = raw.panel.theme;
    }
    if (Object.keys(dst).length) out.panel = dst;
  }
  if (raw.history && typeof raw.history === 'object') {
    const dst = {};
    if (raw.history.enabled !== undefined) {
      if (typeof raw.history.enabled !== 'boolean') return [null, 'history.enabled 需为布尔值'];
      dst.enabled = raw.history.enabled;
    }
    if (raw.history.limit !== undefined) dst.limit = clampInt(raw.history.limit, 100, 10, 1000);
    if (Object.keys(dst).length) out.history = dst;
  }
  if (raw.mt && typeof raw.mt === 'object' && raw.mt.services && typeof raw.mt.services === 'object') {
    const known = new Set(MT_SERVICES.map((s) => s.id));
    const dst = {};
    for (const [id, val] of Object.entries(raw.mt.services)) {
      if (!known.has(id)) return [null, `未知机翻服务 ${id}`];
      if (!val || typeof val !== 'object') return [null, `mt.services.${id} 需为对象`];
      const fields = MT_SERVICES.find((s) => s.id === id).creds;
      const sv = {};
      for (const k of fields) if (typeof val[k] === 'string') sv[k] = val[k].slice(0, 300);
      if (id === 'deeplx' && typeof val.token === 'string') sv.token = val.token.slice(0, 300); // DeepLX 的 token 可选
      dst[id] = sv;
    }
    out.mt = { services: dst };
  }
  return [out, ''];
}

// 合并写：只覆盖提交的键，磁盘上其余键保留；临时文件 + rename 防多写者撕裂，
// mode 0600（文件里有机翻密钥）。与 /vision、headroom 的写法同款。
export function writeTranslateConfig(file, cfg) {
  const cur = readJsonFile(file);
  const base = cur && typeof cur === 'object' && !Array.isArray(cur) ? cur : {};
  const merged = { ...base, ...cfg };
  const tmp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`;
  writeFileSync(tmp, JSON.stringify(merged, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmp, file);
}

// 机翻通道的下拉状态：各家是否已配置凭据（不回密钥本身）
export function translateServicesStatus(file) {
  const cfg = readTranslateConfig(file);
  return MT_SERVICES.map((s) => ({
    id: s.id,
    configured: s.creds.every((k) => String(cfg.mt.services[s.id]?.[k] || '').trim() !== ''),
  }));
}

// ———— 文本判定与提示词 ————

export const TRANSLATE_MAX_TEXT = 8000; // 送入通道的文本长度上限（按字符计）

// 单词判定：纯英文字母（允许连字符/撇号），无空白 —— 只有这种才出词典卡片
export function isWordText(text) {
  return /^[A-Za-z][A-Za-z'-]{0,39}$/.test(text);
}

// 中文为主的文本在目标为中文时把目标转成英文（翻译才有意义）
export function targetLangFor(text, targetLang) {
  const cjk = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  const letters = (text.match(/[A-Za-z]/g) || []).length;
  if (targetLang === 'zh' && cjk > letters) return 'en';
  return targetLang;
}

export function targetLangName(lang) {
  return TARGET_LANG_NAMES[lang] || lang;
}

// 从字符集猜源语言：LLM 通道的译文区用（机翻优先用接口返回的检测语言，
// 没有时也退回这里）。只认字符集能区分的常见语种，猜不出返回空串不硬凑
export function guessSourceLang(text) {
  const s = String(text || '');
  const cjk = (s.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  const kana = (s.match(/[\u3040-\u30ff]/g) || []).length;
  const hangul = (s.match(/[\uac00-\ud7af]/g) || []).length;
  const cyr = (s.match(/[\u0400-\u04ff]/g) || []).length;
  const latin = (s.match(/[A-Za-z]/g) || []).length;
  const total = cjk + kana + hangul + cyr + latin;
  if (!total) return '';
  if (kana > 0 && kana >= cjk * 0.2) return 'ja'; // 假名是日文的强信号
  if (hangul > total * 0.3) return 'ko';
  if (cjk > total * 0.5) return 'zh';
  if (cyr > total * 0.5) return 'ru';
  if (latin > total * 0.5) return 'en';
  return '';
}

// 渲染提示词里的 {target} 占位
export function renderTranslatePrompt(prompt, targetLang) {
  return String(prompt || '').replaceAll('{target}', targetLangName(targetLang));
}

const WORD_CARD_PROMPT = '你是词典引擎。把用户消息里的英文单词整理成词典卡片，只输出一个 JSON 对象（不要 markdown 围栏、不要任何解释），结构：{"phonetic":{"uk":"","us":""},"senses":[{"pos":"词性","defs":["中文释义"]}],"examples":[{"src":"英文例句","dst":"例句的中文翻译"}],"forms":["词形变化"]}\n规则：释义与例句翻译用简体中文；例句最多 2 条；没有的信息用空串或空数组；除 JSON 外不输出任何内容。';

// 解析模型的词典卡片输出：剥思考块与代码围栏后取首个 { 到末个 } 的 JSON，字段宽松归一
export function parseWordCard(text, word) {
  let t = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  t = t.replace(/^```[a-zA-Z]*\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  let doc = null;
  if (start >= 0 && end > start) {
    try { doc = JSON.parse(t.slice(start, end + 1)); } catch { doc = null; }
  }
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const card = {
    word: word || '',
    phonetic: { uk: str(doc?.phonetic?.uk), us: str(doc?.phonetic?.us) },
    senses: [],
    examples: [],
    forms: [],
    tts: '',
  };
  if (Array.isArray(doc?.senses)) {
    for (const s of doc.senses.slice(0, 8)) {
      const defs = Array.isArray(s?.defs) ? s.defs.filter((d) => typeof d === 'string' && d.trim()).slice(0, 8) : [];
      if (defs.length) card.senses.push({ pos: str(s?.pos), defs });
    }
  }
  if (Array.isArray(doc?.examples)) {
    for (const e of doc.examples.slice(0, 3)) {
      if (e && typeof e === 'object' && str(e.src)) card.examples.push({ src: str(e.src), dst: str(e.dst) });
    }
  }
  if (Array.isArray(doc?.forms)) card.forms = doc.forms.filter((f) => typeof f === 'string' && f.trim()).slice(0, 8);
  if (card.word) card.tts = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(card.word)}&type=2`;
  return card;
}

// ———— LLM 通道调用（anthropic / openai 双格式） ————
// 与 helper.mjs 的 callAnthropicText/callOpenAiText、vision-lib.mjs 的 callProxy
// 各有一份复刻；这里多了 system 消息、思考档位与流式。

const TRANSLATE_TIMEOUT_MS = 60000;

function anthropicUrl(baseUrl) { return baseUrl.replace(/\/+$/, '') + '/v1/messages'; }
function openaiUrl(baseUrl) {
  const base = baseUrl.replace(/\/+$/, '');
  return /\/v\d+$/.test(base) ? base + '/chat/completions' : base + '/v1/chat/completions';
}

// 思考档位写进请求体。档位值由调用方按所选模型的实际档位给出（模型不支持
// 思考时不会走到这里）。映射：
// - anthropic 协议：换算成思考预算（max_tokens 必须大于预算）
// - 智谱 openai 兼容端点：只认思考开/关，任何非 off 档位都发 enabled
// - 其他 openai 兼容端点：原样发 reasoning_effort（low/high/max 等由厂商定义）
export function applyThinking(body, format, baseUrl, level) {
  const isBigmodel = /bigmodel\.cn/.test(baseUrl);
  const off = !level || level === 'off';
  if (off) {
    // 智谱 GLM-4.5+ 默认开思考，显式关闭时必须发 disabled
    if (format === 'openai' && isBigmodel) body.thinking = { type: 'disabled' };
    if (format === 'anthropic' && isBigmodel) body.thinking = { type: 'disabled' };
    return;
  }
  if (format === 'anthropic') {
    const budget = THINKING_BUDGET[level] || 8192;
    body.thinking = { type: 'enabled', budget_tokens: budget };
    body.max_tokens = Math.max(body.max_tokens || 0, budget + 8192);
  } else if (isBigmodel) {
    body.thinking = { type: 'enabled' };
  } else {
    body.reasoning_effort = level;
  }
}

// 档位名 → anthropic 思考预算（未列出的档位给中等值）
const THINKING_BUDGET = { minimal: 1024, low: 2048, medium: 6144, high: 12288, xhigh: 16384, max: 24576, enabled: 8192 };

function stripThinking(body) {
  delete body.thinking;
  delete body.reasoning_effort;
}

function hadThinking(body) {
  return body.thinking !== undefined || body.reasoning_effort !== undefined;
}

// messages 为 [{role:'system'|'user', content}]；anthropic 的 system 走顶层参数。
// 返回模型输出的文本（思考块/思考字段已过滤）；onDelta 存在时走流式并逐段回调。
async function callTranslateLlm(conn, messages, { maxTokens = 4096, thinking = 'off', onDelta = null, signal = null } = {}) {
  const anthropic = (conn.format || 'openai') === 'anthropic';
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const chat = messages.filter((m) => m.role !== 'system');
  const buildBody = () => {
    const body = anthropic
      ? { model: conn.model, max_tokens: maxTokens, messages: chat.map((m) => ({ role: m.role, content: m.content })) }
      : { model: conn.model, max_tokens: maxTokens, messages: system ? [{ role: 'system', content: system }, ...chat] : chat };
    if (anthropic && system) body.system = system;
    applyThinking(body, conn.format, conn.baseUrl, thinking);
    return body;
  };
  const url = anthropic ? anthropicUrl(conn.baseUrl) : openaiUrl(conn.baseUrl);
  const headers = anthropic
    ? { 'content-type': 'application/json', 'x-api-key': conn.apiKey, 'anthropic-version': '2023-06-01' }
    : { 'content-type': 'application/json', authorization: `Bearer ${conn.apiKey}` };
  if (onDelta) {
    headers.accept = 'text/event-stream';
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TRANSLATE_TIMEOUT_MS);
  if (signal) signal.addEventListener('abort', () => ctrl.abort(), { once: true });
  const doFetch = async (body) => {
    let payload = { ...body };
    if (onDelta) payload.stream = true;
    return fetch(url, { method: 'POST', signal: ctrl.signal, headers, body: JSON.stringify(payload) });
  };
  try {
    let body = buildBody();
    let resp = await doFetch(body);
    // 老端点不认思考参数会回 400：去掉思考键重试一次
    if (resp.status === 400 && hadThinking(body)) {
      body = { ...body };
      stripThinking(body);
      resp = await doFetch(body);
    }
    if (!resp.ok) {
      const errText = (await resp.text()).slice(0, 300);
      throw new Error(`HTTP ${resp.status} [model=${conn.model}]: ${errText}`);
    }
    if (!onDelta) {
      const doc = JSON.parse(await resp.text());
      const text = anthropic
        ? (Array.isArray(doc.content) ? doc.content.filter((b) => b && b.type === 'text').map((b) => b.text || '').join('') : '')
        : (doc.choices?.[0]?.message?.content || '');
      if (!text) {
        const e = new Error(anthropic && doc?.stop_reason === 'max_tokens'
          ? '模型的思考用完了输出上限，仍未给出文本：请调低思考档位或换模型' : '响应中没有文本内容');
        e.code = 'translate-empty';
        throw e;
      }
      return text;
    }
    // 流式：逐行解析上游 SSE，把文本增量回调给调用方
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let full = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).replace(/\r$/, '');
        buf = buf.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        let evt;
        try { evt = JSON.parse(data); } catch { continue; }
        let delta = '';
        if (anthropic) {
          if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') delta = evt.delta.text || '';
        } else {
          delta = evt.choices?.[0]?.delta?.content || '';
        }
        if (delta) { full += delta; onDelta(delta); }
      }
    }
    if (!full.trim()) {
      const e = new Error('流式响应中没有文本内容');
      e.code = 'translate-empty';
      throw e;
    }
    return full;
  } catch (err) {
    if (err && err.name === 'AbortError') {
      const e = new Error(signal && signal.aborted ? '请求已取消' : `请求超时（${Math.round(TRANSLATE_TIMEOUT_MS / 1000)} 秒）`);
      e.code = signal && signal.aborted ? 'translate-cancelled' : 'translate-timeout';
      throw e;
    }
    throw err;
  } finally { clearTimeout(timer); }
}

// 非流式翻译：单词出词典卡片，句子/段落出整段译文
export async function translateJson(conn, opts) {
  if (opts.isWord) {
    const raw = await callTranslateLlm(conn, [
      { role: 'system', content: WORD_CARD_PROMPT },
      { role: 'user', content: opts.text },
    ], { maxTokens: 2000 });
    return { kind: 'dict', dict: parseWordCard(raw, opts.text) };
  }
  const text = await callTranslateLlm(conn, [
    { role: 'system', content: opts.prompt },
    { role: 'user', content: opts.text },
  ], { maxTokens: 8192, thinking: opts.thinking });
  return { kind: 'trans', trans: { text, sourceLang: guessSourceLang(opts.text) } };
}

// 流式翻译（仅句子/段落）：先发 meta，再逐段 delta，结束由调用方发 done
export async function streamTranslateText(conn, opts, send, signal) {
  const sourceLang = guessSourceLang(opts.text);
  send({ type: 'meta', kind: 'trans', sourceLang });
  const text = await callTranslateLlm(conn, [
    { role: 'system', content: opts.prompt },
    { role: 'user', content: opts.text },
  ], { maxTokens: 8192, thinking: opts.thinking, onDelta: (d) => send({ type: 'delta', text: d }), signal });
  send({ type: 'done', text, sourceLang });
}

// ———— 机翻通道（适配器逐家实现，凭据来自 zcode-translate.json） ————

// ———— 机翻通道适配器 ————
// 请求与签名算法参考沙拉查词（crimx/ext-saladist，MIT 许可）的 @opentranslate
// 包与手写适配。适配器统一返回 { paragraphs: [译文段], detectedLang: '', tts: '', dict: null }。
// 语言内部码为 ISO（zh/en/ja/...），from 一律 auto（面板不做源语言选择）。

async function fetchJson(url, options = {}, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...options, signal: ctrl.signal });
    const body = await resp.text();
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${body.slice(0, 200)}`);
    try { return JSON.parse(body); } catch { throw new Error('响应不是合法 JSON: ' + body.slice(0, 200)); }
  } finally { clearTimeout(timer); }
}

function splitParagraphs(s) { return String(s).split(/\n+/).map((x) => x.trim()).filter(Boolean); }

function decodeEntities(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

const YOUDAO_LANG = { zh: 'zh-CHS', en: 'en', ja: 'ja', ko: 'ko', fr: 'fr', ru: 'ru', pt: 'pt', es: 'es', it: 'it' };
const BAIDU_LANG = { zh: 'zh', en: 'en', ja: 'jp', ko: 'kor', fr: 'fra', es: 'spa', ru: 'ru', de: 'de', it: 'it', pt: 'pt', vi: 'vie', th: 'th', ar: 'ara' };
const TENCENT_LANG = { zh: 'zh', en: 'en', ja: 'jp', ko: 'kr', de: 'de', es: 'es', fr: 'fr', ru: 'ru', it: 'it', pt: 'pt', vi: 'vn', th: 'th', ms: 'ms', id: 'id' };
const NIU_LANG = { zh: 'zh', en: 'en', ja: 'ja', ko: 'ko', fr: 'fr', ru: 'ru', es: 'es', pt: 'pt', de: 'de', it: 'it' };

// 有道 signType=v3 签名：sha256(appKey + truncate(q) + salt + curtime + key)。导出以便测试
export function youdaoSign(appKey, key, text, salt, curtime) {
  const input = text.length <= 20 ? text : text.slice(0, 10) + text.length + text.slice(-10);
  return createHash('sha256').update(appKey + input + salt + curtime + key).digest('hex');
}

// 把有道 basic 词条数据（官方文档口径，字段做防御式兼容）整理成轻量词条卡
function youdaoBasicToDict(b, word) {
  if (!b || typeof b !== 'object') return null;
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const senseMap = new Map();
  for (const line of (Array.isArray(b.explains) ? b.explains : [])) {
    const s = String(line).trim();
    if (!s) continue;
    const m = /^([A-Za-z][A-Za-z.]*|\d+[.])\s+(.+)$/.exec(s);
    const pos = m ? m[1] : '';
    const def = m ? m[2] : s;
    if (!senseMap.has(pos)) senseMap.set(pos, []);
    senseMap.get(pos).push(def);
  }
  const forms = (Array.isArray(b.wfs) ? b.wfs : [])
    .map((w) => w && w.wf ? `${String(w.wf.name || '').trim()} ${String(w.wf.value || '').trim()}`.trim() : '')
    .filter(Boolean);
  if (!senseMap.size && !str(b.uk_phonetic) && !str(b.us_phonetic) && !forms.length) return null;
  return {
    word,
    phonetic: { uk: str(b.uk_phonetic), us: str(b.us_phonetic) },
    senses: [...senseMap].map(([pos, defs]) => ({ pos, defs })),
    examples: [],
    forms,
    tts: `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=2`,
  };
}

async function mtYoudao(creds, { text, to }) {
  const salt = String(Date.now());
  const curtime = String(Math.round(Date.now() / 1000));
  const doc = await fetchJson('https://openapi.youdao.com/api', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      q: text, appKey: creds.appKey, salt, from: 'auto', to: YOUDAO_LANG[to] || 'zh-CHS',
      sign: youdaoSign(creds.appKey, creds.key, text, salt, curtime), signType: 'v3', curtime,
    }).toString(),
  });
  if (doc.errorCode && doc.errorCode !== '0') throw new Error(`有道接口错误码 ${doc.errorCode}`);
  const paragraphs = Array.isArray(doc.translation) ? doc.translation.filter(Boolean) : [];
  if (!paragraphs.length) throw new Error('有道未返回译文');
  return { paragraphs, detectedLang: '', tts: '', dict: youdaoBasicToDict(doc.basic, text) };
}

// 百度签名：md5(appId + 完整原文 + salt + secret)。导出以便测试
export function baiduSign(appId, secret, text, salt) {
  return createHash('md5').update(appId + text + salt + secret).digest('hex');
}

async function mtBaidu(creds, { text, to }) {
  const salt = String(Date.now());
  const qs = new URLSearchParams({
    q: text, from: 'auto', to: BAIDU_LANG[to] || 'zh',
    appid: creds.appId, salt, sign: baiduSign(creds.appId, creds.secret, text, salt),
  });
  const doc = await fetchJson('https://api.fanyi.baidu.com/api/trans/vip/translate?' + qs.toString());
  if (doc.error_code) throw new Error(`百度接口错误 ${doc.error_code}: ${doc.error_msg || ''}`);
  const list = Array.isArray(doc.trans_result) ? doc.trans_result : [];
  if (!list.length) throw new Error('百度未返回译文');
  return { paragraphs: list.map((r) => String(r.dst || '')), detectedLang: doc.from && doc.from !== 'auto' ? doc.from : '', tts: '', dict: null };
}

async function mtCaiyun(creds, { text, to }) {
  const tgt = { zh: 'zh', en: 'en', ja: 'ja' }[to];
  if (!tgt) throw new Error('彩云小译只支持中文/英文/日文目标');
  const doc = await fetchJson('https://api.interpreter.caiyunai.com/v1/translator', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-authorization': 'token ' + String(creds.token).trim() },
    body: JSON.stringify({ source: text.split(/\n+/), trans_type: `auto2${tgt}`, detect: true }),
  });
  const paragraphs = Array.isArray(doc.target) ? doc.target.filter(Boolean) : [];
  if (!paragraphs.length) throw new Error('彩云未返回译文');
  return { paragraphs, detectedLang: '', tts: '', dict: null };
}

// 腾讯云 TC3-HMAC-SHA256 签名头（tmt 服务）。导出以便测试
export function tencentHeaders({ secretId, secretKey, timestamp, body }) {
  const host = 'tmt.tencentcloudapi.com';
  const hashedPayload = createHash('sha256').update(body).digest('hex');
  const canonical = ['POST', '/', '', 'content-type:application/json; charset=utf-8',
    `host:${host}`, '', 'content-type;host', hashedPayload].join('\n');
  const datestamp = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const stringToSign = ['TC3-HMAC-SHA256', String(timestamp),
    `${datestamp}/tmt/tc3_request`, createHash('sha256').update(canonical).digest('hex')].join('\n');
  const hmac = (key, msg) => createHmac('sha256', key).update(msg).digest();
  const kDate = hmac(Buffer.from('TC3' + secretKey, 'utf8'), datestamp);
  const kService = hmac(kDate, 'tmt');
  const kSigning = hmac(kService, 'tc3_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  return {
    'content-type': 'application/json; charset=utf-8', Host: host,
    'X-TC-Action': 'TextTranslate', 'X-TC-Timestamp': String(timestamp),
    'X-TC-Region': 'ap-beijing', 'X-TC-Version': '2018-03-21',
    Authorization: `TC3-HMAC-SHA256 Credential=${secretId}/${datestamp}/tmt/tc3_request, SignedHeaders=content-type;host, Signature=${signature}`,
  };
}

async function mtTencent(creds, { text, to }) {
  const body = JSON.stringify({ ProjectId: 0, Source: 'auto', SourceText: text, Target: TENCENT_LANG[to] || 'en' });
  const doc = await fetchJson('https://tmt.tencentcloudapi.com', {
    method: 'POST', headers: tencentHeaders({ ...creds, timestamp: Math.floor(Date.now() / 1000), body }), body,
  });
  const r = doc.Response || {};
  if (r.Error) throw new Error(`腾讯接口错误 ${r.Error.Code}: ${r.Error.Message}`);
  if (!r.TargetText) throw new Error('腾讯未返回译文');
  return { paragraphs: splitParagraphs(decodeEntities(r.TargetText)), detectedLang: r.Source || '', tts: '', dict: null };
}

async function mtDeepl(creds, { text, to }) {
  const target = to === 'zh' ? 'ZH-HANS' : to.toUpperCase();
  const base = /:fx$/.test(creds.authKey) ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
  const doc = await fetchJson(base + '/v2/translate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'DeepL-Auth-Key ' + String(creds.authKey).trim() },
    body: JSON.stringify({ text: [text], target_lang: target }),
  });
  const t = doc.translations && doc.translations[0];
  if (!t || !t.text) throw new Error('DeepL 未返回译文');
  return { paragraphs: splitParagraphs(t.text), detectedLang: t.detected_source_language || '', tts: '', dict: null };
}

async function mtDeeplx(creds, { text, to }) {
  const target = to === 'zh' ? 'ZH-HANS' : to.toUpperCase();
  let url = String(creds.apiUrl || '').trim();
  if (creds.token) url = url.replaceAll('{{apiKey}}', encodeURIComponent(String(creds.token).trim()));
  if (!/\/translate\/?$/.test(url)) url = url.replace(/\/+$/, '') + '/translate';
  const useBearer = creds.token && !String(creds.apiUrl).includes('{{apiKey}}');
  const doc = await fetchJson(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(useBearer ? { authorization: 'Bearer ' + String(creds.token).trim() } : {}) },
    body: JSON.stringify({ text, source_lang: 'auto', target_lang: target }),
  });
  const out = (typeof doc.data === 'string' ? doc.data : '')
    || doc.translation || doc.translated || doc.translatedText
    || (doc.translations && doc.translations[0] && doc.translations[0].text) || '';
  if (!out) throw new Error('DeepLX 未返回译文');
  const src = doc.source_lang || doc.sourceLanguage || doc.detected_source_language
    || (doc.translations && doc.translations[0] && doc.translations[0].detected_source_language) || '';
  return { paragraphs: splitParagraphs(out), detectedLang: src, tts: '', dict: null };
}

// 阿里云 RPC 签名：HMAC-SHA1(secret + "&", "GET&%2F&" + percent(canonicalQuery)) 的 base64。导出以便测试
export function aliyunSignature(params, accessKeySecret) {
  const pe = (s) => encodeURIComponent(String(s)).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  const canonical = Object.keys(params).sort().map((k) => pe(k) + '=' + pe(params[k])).join('&');
  const stringToSign = 'GET&%2F&' + pe(canonical);
  return { canonical, signature: createHmac('sha1', accessKeySecret + '&').update(stringToSign).digest('base64'), pe };
}

async function mtAliyun(creds, { text, to }) {
  const params = {
    AccessKeyId: creds.accessKeyId, Action: 'TranslateGeneral', Format: 'JSON', FormatType: 'text',
    Scene: 'general', SignatureMethod: 'HMAC-SHA1', SignatureNonce: Math.random().toString(36).slice(2),
    SignatureVersion: '1.0', SourceLanguage: 'auto', SourceText: text,
    TargetLanguage: to === 'zh' ? 'zh' : to,
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), Version: '2018-10-12',
  };
  const { canonical, signature, pe } = aliyunSignature(params, creds.accessKeySecret);
  const doc = await fetchJson('https://mt.aliyuncs.com/?' + canonical + '&Signature=' + pe(signature));
  let data = doc.Data;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch { data = null; } }
  const out = (data && (data.Translated || data.translated || data.TranslatedText)) || '';
  if (!out) throw new Error(doc.Message ? `阿里接口错误 ${doc.Code || ''}: ${doc.Message}` : '阿里未返回译文');
  return { paragraphs: splitParagraphs(out), detectedLang: (data && data.DetectedLanguage) || '', tts: '', dict: null };
}

async function mtNiu(creds, { text, to }) {
  const doc = await fetchJson('https://api.niutrans.com/NiuTransServer/translation', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ from: 'auto', to: NIU_LANG[to] || 'zh', apikey: creds.apiKey, src_text: text }).toString(),
  });
  if (doc.error_code) throw new Error(`小牛接口错误 ${doc.error_code}: ${doc.error_msg || ''}`);
  const out = doc.tgt_text || doc.tgtText || doc.translation || doc.translated || '';
  if (!out) throw new Error('小牛未返回译文');
  return { paragraphs: splitParagraphs(out), detectedLang: doc.from || '', tts: '', dict: null };
}

// 火山引擎 V4 签名头（translate 服务，region cn-north-1）。导出以便测试
export function volcHeaders({ accessKeyId, secretAccessKey, xDate, body }) {
  const host = 'translate.volcengineapi.com';
  const payloadHash = createHash('sha256').update(body).digest('hex');
  const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-content-sha256:${payloadHash}\nx-date:${xDate}`;
  const signedHeaders = 'content-type;host;x-content-sha256;x-date';
  const canonicalRequest = ['POST', '/', 'Action=TranslateText&Version=2020-06-01',
    canonicalHeaders + '\n', signedHeaders, payloadHash].join('\n');
  const dateStamp = xDate.slice(0, 8);
  const scope = `${dateStamp}/cn-north-1/translate/request`;
  const stringToSign = ['HMAC-SHA256', xDate, scope, createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
  const hmac = (key, msg) => createHmac('sha256', key).update(msg).digest();
  let k = hmac(Buffer.from(secretAccessKey, 'utf8'), dateStamp);
  k = hmac(k, 'cn-north-1'); k = hmac(k, 'translate'); k = hmac(k, 'request');
  const signature = createHmac('sha256', k).update(stringToSign).digest('hex');
  return {
    'content-type': 'application/json', 'X-Content-Sha256': payloadHash, 'X-Date': xDate,
    Authorization: `HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

async function mtVolc(creds, { text, to }) {
  const body = JSON.stringify({ TargetLanguage: to === 'zh' ? 'zh' : to, TextList: [text] });
  const xDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const doc = await fetchJson('https://translate.volcengineapi.com/?Action=TranslateText&Version=2020-06-01', {
    method: 'POST', headers: volcHeaders({ ...creds, xDate, body }), body,
  });
  const list = doc.TranslationList || doc.translationList || (doc.Result && doc.Result.TranslationList) || [];
  const out = list.map((x) => x && x.Translation).filter(Boolean).join('\n');
  if (!out) {
    const err = doc.ResponseMetadata && doc.ResponseMetadata.Error;
    throw new Error(err ? `火山接口错误 ${err.Code || ''}: ${err.Message || ''}` : '火山未返回译文');
  }
  const first = list[0] || {};
  return { paragraphs: splitParagraphs(out), detectedLang: first.DetectedSourceLanguage || first.SourceLanguage || '', tts: '', dict: null };
}

const MT_ADAPTERS = {
  youdao: mtYoudao, baidu: mtBaidu, caiyun: mtCaiyun, deepl: mtDeepl, deeplx: mtDeeplx,
  niu: mtNiu, tencent: mtTencent, aliyun: mtAliyun, volc: mtVolc,
};

export async function translateMt(file, service, { text, targetLang }) {
  const cfg = readTranslateConfig(file);
  const meta = MT_SERVICES.find((s) => s.id === service);
  const adapter = MT_ADAPTERS[service];
  if (!meta || !adapter) throw new Error(`未知机翻服务 ${service}`);
  const creds = cfg.mt.services[service] || {};
  const missing = meta.creds.filter((k) => !String(creds[k] || '').trim());
  if (missing.length) throw new Error(`${service} 未配置（缺 ${missing.join('/')}），请在设置页“翻译”标签填写`);
  const r = await adapter(creds, { text, from: 'auto', to: targetLangFor(text, targetLang) });
  // 检测语言优先用接口返回值，接口不给时按字符集猜
  return { ...r, detectedLang: r.detectedLang || guessSourceLang(text) };
}

// ———— 历史记录（独立文件，避免配置文件被频繁重写） ————

export function readTranslateHistory(file) {
  const doc = readJsonFile(historyFileOf(file));
  return Array.isArray(doc) ? doc : [];
}

export function appendTranslateHistory(file, item, limit) {
  const cur = readTranslateHistory(file);
  const entry = {
    t: Date.now(),
    text: String(item?.text || '').slice(0, 300),
    kind: item?.kind === 'dict' ? 'dict' : 'trans',
    label: String(item?.label || '').slice(0, 80),
  };
  const next = [entry, ...cur.filter((h) => h && typeof h === 'object')].slice(0, Math.max(1, limit || 100));
  const out = historyFileOf(file);
  const tmp = `${out}.${process.pid}.${Date.now().toString(36)}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmp, out);
}

export function translateHistoryFile(file) { return historyFileOf(file); }
