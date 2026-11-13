// 注入层纯逻辑回归测试：自写假 document/Element 跑真实源码，零依赖。
// node scripts/test-inject-logic.mjs 直接跑，全绿退出码 0，有失败退出码 1。
// 断言风格与 scripts/test-usage-stats.mjs 一致（ok:/FAIL: 输出，结尾 all ok）。
//
// 做法：被测函数大多是模块内私有函数（没 export），没法直接 import。这里按
// 函数名从源文件截出完整源码（按括号配对找起止位置，字符串/模板串/注释/
// 正则里的括号会跳过），拼进 new Function 的函数体里执行，DOM、t()、
// isZhLocale()、rpc 等换成测试里的假实现。截取或装配失败时对应断言报 FAIL
// 并跳过，不中断整个测试。
//
// 各断言对应的源码行为：
// - turn-usage.js scan() 的区间归属（假 DOM 跑真实 scan）：每条回答拥有
//   "自己的提问时刻 <= 桶完成时刻 < 下一条提问时刻" 的全部调用；比窗口里
//   最早的行还早的桶丢弃；桶完成时刻与行的提问时刻分属两天的丢弃；最后一条
//   回答收到其后所有桶；in+out 全为 0 的行不注入；重扫先删旧标注再注入；
//   统计开关关掉时清标注不注入；页面隐藏时不注入；切换会话先清空桶。
// - turn-usage.js rowTimeTs（注入假 Date 固定当前时刻）：今天 HH:MM、
//   昨天|Yesterday HH:MM、月日 HH:MM（算出来在未来的按上一年）、其它文本 null。
// - turn-usage.js fmt、status-bar.js fmtNum/fmtTokens：中文 万/亿（含
//   99,999,999 进位成 1 亿）、英文 k/M/B；injectRow 的缓存命中率保留两位小数。
// - session-switch.js record()/idOf：unseen 按会话 id 归一后删除（两种键形
//   一起删）、MRU 去重置顶与条数上限。"运行结束记 unseen" 的规则在
//   collectEndedUnseen（从 setInterval 抽出的具名函数）里：截取真实函数跑
//   假输入（按 id 判消失、当前会话不记、current 为 null 不抛、超上限留最后 N 条）。
// - taskOrder.mjs spliceSubset：拖动子集按新顺序插回其原有最小位置，未拖动
//   的键保持相对次序。任务里写的是 session-switch.js，实际函数在 host 的
//   taskOrder.mjs（session-switch.js 里没有 spliceSubset），这里测真实现。
//
// 没测的部分：
// - attentionList 的弹窗合并顺序：要再造一套 wsRunningKeys 的运行状态才有
//   意义，收益低，跳过。
// - rowTimeTs 对 25:00 这类越界时间不校验（new Date 会自然进位到第二天），
//   属现状，未断言。
// - 成对括号匹配器不处理模板串插值里的正则字面量（现有源码没有这种写法）。
import { readFileSync } from 'node:fs';

let failed = 0;
const assert = (cond, msg) => {
  if (!cond) { console.error('FAIL: ' + msg); failed = 1; }
  else console.log('ok: ' + msg);
};
// 每段测试各自 try/catch：一段抛错记 FAIL，后面的段继续跑；async 段收集起来
// 在结尾统一 await（process.exit 会掐断未 await 的 promise 续体）
const pendingRuns = [];
const run = (name, fn) => {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      pendingRuns.push(r.catch((err) => assert(false, name + ' 抛错: ' + (err && err.message))));
    }
  } catch (err) { assert(false, name + ' 抛错: ' + (err && err.message)); }
};

// —— 源码截取工具 —— //

// 给 src 生成掩码数组：true 表示该字符在字符串/模板串/注释/正则字面量里，
// 括号配对与语句扫描只看掩码为 false 的代码字符
function makeMask(src) {
  const mask = new Array(src.length).fill(false);
  const mark = (a, b) => { for (let j = a; j < b && j < src.length; j++) mask[j] = true; };
  const skipStr = (i) => {
    const q = src[i]; i++;
    while (i < src.length) {
      if (src[i] === '\\') i += 2;
      else if (src[i] === q) return i + 1;
      else i++;
    }
    return src.length;
  };
  // 模板串：整段（含 ${} 插值）都算非代码字符，插值里递归找配对的 }
  const skipTpl = (i) => {
    mark(i, i + 1); i++;
    while (i < src.length) {
      if (src[i] === '\\') { mark(i, i + 2); i += 2; continue; }
      if (src[i] === '`') { mark(i, i + 1); return i + 1; }
      if (src[i] === '$' && src[i + 1] === '{') { mark(i, i + 2); i = skipCode(i + 2); continue; }
      mark(i, i + 1); i++;
    }
    return src.length;
  };
  // 正则字面量：按前一个非空字符/单词判别除号与正则；判错就按除号只挪一位
  const skipRegex = (i) => {
    let cls = false, j = i + 1;
    while (j < src.length) {
      const c = src[j];
      if (c === '\\') { j += 2; continue; }
      if (c === '\n') return i + 1;
      if (cls) { if (c === ']') cls = false; }
      else if (c === '[') cls = true;
      else if (c === '/') {
        j++;
        while (j < src.length && /[a-z]/i.test(src[j])) j++;
        mark(i, j);
        return j;
      }
      j++;
    }
    return i + 1;
  };
  const regexAllowed = (prevChar, prevWord) =>
    prevChar === '' || '(,=:[!&|?{};+-*%~^<>'.includes(prevChar)
    || ['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'instanceof', 'do', 'else'].includes(prevWord);
  // 模板串插值里的代码段：扫到配对的 } 为止
  const skipCode = (i) => {
    let depth = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); const end = e < 0 ? src.length : e; mark(i, end); i = end; continue; }
      if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? src.length : e + 2; mark(i, end); i = end; continue; }
      if (c === '"' || c === "'") { const e = skipStr(i); mark(i, e); i = e; continue; }
      if (c === '`') { i = skipTpl(i); continue; }
      if (c === '}') {
        if (depth === 0) { mark(i, i + 1); return i + 1; }
        depth--;
      } else if (c === '{') depth++;
      i++;
    }
    return src.length;
  };
  let i = 0, prevChar = '', prevWord = '', word = '';
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); const end = e < 0 ? src.length : e; mark(i, end); i = end; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? src.length : e + 2; mark(i, end); i = end; continue; }
    if (c === '"' || c === "'") { const e = skipStr(i); mark(i, e); i = e; prevChar = '"'; prevWord = ''; continue; }
    if (c === '`') { i = skipTpl(i); prevChar = '"'; prevWord = ''; continue; }
    if (c === '/' && regexAllowed(prevChar, prevWord)) { i = skipRegex(i); prevChar = '"'; prevWord = ''; continue; }
    if (/[A-Za-z0-9_$]/.test(c)) word += c;
    else { prevWord = word; word = ''; }
    prevChar = c;
    i++;
  }
  return mask;
}

// 从 src[open] 的 openCh 找配对的 closeCh，返回闭合字符位置，找不到返回 -1
function matchPair(src, mask, open, openCh, closeCh) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (mask[i]) continue;
    if (src[i] === openCh) depth++;
    else if (src[i] === closeCh) { depth--; if (depth === 0) return i; }
  }
  return -1;
}

// 截出 name 的完整源码：function 声明（去掉开头的 export）或 const 赋值语句。
// 找不到、括号配对失败都返回 null，调用方报 FAIL 后跳过相关断言
function extractBinding(src, name, mask) {
  const fnRe = new RegExp('(?:^|[\\n;,{}])\\s*(?:export\\s+)?function\\s+' + name + '\\s*\\(');
  const m = fnRe.exec(src);
  if (m) {
    const start = src.indexOf('function', m.index);
    const paren = src.indexOf('(', start);
    const parenEnd = matchPair(src, mask, paren, '(', ')');
    if (parenEnd < 0) return null;
    let i = parenEnd + 1;
    while (i < src.length && (mask[i] || /\s/.test(src[i]))) i++;
    if (src[i] !== '{') return null;
    const end = matchPair(src, mask, i, '{', '}');
    return end < 0 ? null : src.slice(start, end + 1);
  }
  const cRe = new RegExp('(?:^|[\\n;,{}])\\s*const\\s+' + name + '\\s*=');
  const cm = cRe.exec(src);
  if (!cm) return null;
  const start = cm.index + cm[0].lastIndexOf('const');
  let depth = 0;
  for (let i = start + 5; i < src.length; i++) {
    if (mask[i]) continue;
    const c = src[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ';' && depth === 0) return src.slice(start, i + 1);
  }
  return null;
}

// —— 假 DOM —— //

const kebab = (s) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

class FakeEl {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase();
    this.attrs = new Map();
    this.children = [];
    this.parentElement = null;
    this.className = '';
    this.style = {};
    this._text = '';
    this._html = '';
    // dataset 与属性同源（真实 DOM 里 dataset.foo 对应 data-foo 属性），
    // 选择器按属性匹配，dataset 读写走同一张表
    const attrs = this.attrs;
    this.dataset = new Proxy({}, {
      set: (_t, k, v) => { attrs.set('data-' + kebab(String(k)), String(v)); return true; },
      deleteProperty: (_t, k) => { attrs.delete('data-' + kebab(String(k))); return true; },
      get: (_t, k) => (attrs.has('data-' + kebab(String(k))) ? attrs.get('data-' + kebab(String(k))) : undefined),
      has: (_t, k) => attrs.has('data-' + kebab(String(k))),
    });
  }
  get title() { return this.getAttribute('title') || ''; }
  set title(v) { this.setAttribute('title', String(v)); }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); }
  getAttribute(n) { return this.attrs.has(n) ? this.attrs.get(n) : null; }
  setAttribute(n, v) { this.attrs.set(n, String(v)); }
  append(...els) { for (const e of els) { e.parentElement = this; this.children.push(e); } }
  remove() {
    if (this.parentElement) {
      const sib = this.parentElement.children;
      const i = sib.indexOf(this);
      if (i >= 0) sib.splice(i, 1);
      this.parentElement = null;
    }
  }
  querySelectorAll(sel) { return collectMatches(this.children, sel); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

// 只支持被测代码用到的选择器形态：tag、[attr]、[attr="v"]、[attr^="v"]、
// [attr$="v"]，以及逗号并列
function selMatches(el, sel) {
  const m = /^([a-zA-Z][\w-]*)?((?:\[[^\]]*\])*)$/.exec(sel);
  if (!m) return false;
  if (m[1] && el.tagName !== m[1].toUpperCase()) return false;
  for (const g of m[2].match(/\[[^\]]*\]/g) || []) {
    const am = /^([\w-]+)(?:([\^$]?=)"([\s\S]*)")?$/.exec(g.slice(1, -1));
    if (!am) return false;
    const v = el.getAttribute(am[1]);
    if (v == null) return false;
    if (am[2] === '=' && v !== am[3]) return false;
    if (am[2] === '^=' && !v.startsWith(am[3])) return false;
    if (am[2] === '$=' && !v.endsWith(am[3])) return false;
  }
  return true;
}

function collectMatches(roots, sel) {
  const parts = String(sel).split(',').map((s) => s.trim()).filter(Boolean);
  const out = [];
  const walk = (el) => {
    if (parts.some((p) => selMatches(el, p))) out.push(el);
    for (const c of el.children) walk(c);
  };
  for (const r of roots) walk(r);
  return out;
}

function makeDoc() {
  return {
    roots: [],
    hidden: false,
    createElement: (tag) => new FakeEl(tag),
    querySelectorAll(sel) { return collectMatches(this.roots, sel); },
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
  };
}

// —— 读源码并截取 —— //

const readSrc = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const turnSrc = readSrc('../src/inject/features/turn-usage.js');
const sbSrc = readSrc('../src/inject/features/status-bar.js');
const ssSrc = readSrc('../src/inject/features/session-switch.js');
const toSrc = readSrc('../src/host/taskOrder.mjs');
const turnMask = makeMask(turnSrc);
const sbMask = makeMask(sbSrc);
const ssMask = makeMask(ssSrc);
const toMask = makeMask(toSrc);

const fmtSrc = extractBinding(turnSrc, 'fmt', turnMask);
assert(!!fmtSrc, '截取 turn-usage.js fmt 成功');
const rowTimeTsSrc = extractBinding(turnSrc, 'rowTimeTs', turnMask);
assert(!!rowTimeTsSrc, '截取 turn-usage.js rowTimeTs 成功');
const findRowsSrc = extractBinding(turnSrc, 'findRows', turnMask);
assert(!!findRowsSrc, '截取 turn-usage.js findRows 成功');
const curSidSrc = extractBinding(turnSrc, 'currentSessionId', turnMask);
assert(!!curSidSrc, '截取 turn-usage.js currentSessionId 成功');
const injectRowSrc = extractBinding(turnSrc, 'injectRow', turnMask);
assert(!!injectRowSrc, '截取 turn-usage.js injectRow 成功');
const scanSrc = extractBinding(turnSrc, 'scan', turnMask);
assert(!!scanSrc, '截取 turn-usage.js scan 成功');
const fmtTokensSrc = extractBinding(sbSrc, 'fmtTokens', sbMask);
assert(!!fmtTokensSrc, '截取 status-bar.js fmtTokens 成功');
const fmtNumSrc = extractBinding(sbSrc, 'fmtNum', sbMask);
assert(!!fmtNumSrc, '截取 status-bar.js fmtNum 成功');
const spliceSrc = extractBinding(toSrc, 'spliceSubset', toMask);
assert(!!spliceSrc, '截取 taskOrder.mjs spliceSubset 成功');
const idOfSrc = extractBinding(ssSrc, 'idOf', ssMask);
assert(!!idOfSrc, '截取 session-switch.js idOf 成功');
const recordSrc = extractBinding(ssSrc, 'record', ssMask);
assert(!!recordSrc, '截取 session-switch.js record 成功');
const mruLimitSrc = extractBinding(ssSrc, 'MRU_LIMIT', ssMask);
assert(!!mruLimitSrc, '截取 session-switch.js MRU_LIMIT 成功');
const collectEndedSrc = extractBinding(ssSrc, 'collectEndedUnseen', ssMask);
assert(!!collectEndedSrc, '截取 session-switch.js collectEndedUnseen 成功');
const unseenLimitSrc = extractBinding(ssSrc, 'UNSEEN_LIMIT', ssMask);
assert(!!unseenLimitSrc, '截取 session-switch.js UNSEEN_LIMIT 成功');
const irSrc = readSrc('../src/inject/features/idle-reclaim.js');
const irMask = makeMask(irSrc);
const dueSrc = extractBinding(irSrc, 'dueForReclaim', irMask);
assert(!!dueSrc, '截取 idle-reclaim.js dueForReclaim 成功');
const wsrunSrc = readSrc('../src/inject/features/ws-running.js');
const wsrunMask = makeMask(wsrunSrc);
const cachedIdsSrc = extractBinding(wsrunSrc, 'listActiveIdsCached', wsrunMask);
assert(!!cachedIdsSrc, '截取 ws-running.js listActiveIdsCached 成功');
const ttlSrc = extractBinding(wsrunSrc, 'ACTIVE_IDS_TTL_MS', wsrunMask);
assert(!!ttlSrc, '截取 ws-running.js ACTIVE_IDS_TTL_MS 成功');
const cacheTimeoutSrc = extractBinding(wsrunSrc, 'ACTIVE_IDS_TIMEOUT_MS', wsrunMask);
assert(!!cacheTimeoutSrc, '截取 ws-running.js ACTIVE_IDS_TIMEOUT_MS 成功');
const idsCacheSrc = extractBinding(wsrunSrc, 'activeIdsCache', wsrunMask);
assert(!!idsCacheSrc, '截取 ws-running.js activeIdsCache 成功');

// —— 装配：把截出的函数放进 new Function 的函数体，注入假依赖 —— //

// turn-usage.js 的 fmt/rowTimeTs/findRows/currentSessionId/injectRow/scan 一组
function makeTurnBundle() {
  const factory = new Function(
    'document', 't', 'isZhLocale', 'icon', 'tick',
    [
      'let enabled = true;',
      'let rounds = [];',
      'let liveRounds = [];',
      "let lastSid = '';",
      "let turnCfg = [{ id: 'turnIn', on: true }, { id: 'turnOut', on: true }, { id: 'turnTps', on: true }, { id: 'turnCache', on: true }];",
      fmtSrc,
      rowTimeTsSrc,
      findRowsSrc,
      curSidSrc,
      injectRowSrc,
      scanSrc,
      'return { scan, fmt, rowTimeTs, findRows, currentSessionId,',
      '  setEnabled: (v) => { enabled = v; },',
      '  setRounds: (r) => { rounds = r; },',
      '  setLive: (r) => { liveRounds = r; },',
      '  getLive: () => liveRounds,',
      '  getRounds: () => rounds,',
      '  setTurnCfg: (c) => { turnCfg = c; } };',
    ].join('\n')
  );
  return factory;
}

// —— 各段测试 —— //

const zhState = { zh: true };
const tickState = { calls: 0 };
const tStub = () => ({ sbLabelIn: 'IN', sbLabelOut: 'OUT', sbLabelTps: 'TPS', sbLabelCache: 'CACHE', turnUsageTitle: 'TURN' });
const iconStub = (name) => '<' + name + '/>';
const tickStub = () => { tickState.calls++; };

// 2. rowTimeTs：四种时间形态 + 跨年回拨（假 Date 固定在 2026-06-15 12:00）
run('rowTimeTs', () => {
  if (!rowTimeTsSrc) return;
  const FIXED = new Date(2026, 5, 15, 12, 0, 0).getTime();
  class FakeDate extends Date {
    constructor(...a) { super(...(a.length ? a : [FIXED])); }
  }
  let rt = null;
  try {
    rt = new Function('Date', rowTimeTsSrc + '\nreturn rowTimeTs;')(FakeDate);
  } catch (err) {
    assert(false, '装配 rowTimeTs 失败: ' + (err && err.message));
    return;
  }
  const at = (y, mo, d, h, mi) => new Date(y, mo, d, h, mi).getTime();
  assert(rt('18:16') === at(2026, 5, 15, 18, 16), '今天形态 HH:MM');
  assert(rt('9:05') === at(2026, 5, 15, 9, 5), '今天形态单位数小时');
  assert(rt('昨天 18:16') === at(2026, 5, 14, 18, 16), '昨天形态');
  assert(rt('Yesterday 0:05') === at(2026, 5, 14, 0, 5), 'Yesterday 形态');
  assert(rt('1/1 08:30') === at(2026, 0, 1, 8, 30), '月日形态（过去的日子不回拨）');
  assert(rt('12/25 17:41') === at(2025, 11, 25, 17, 41), '月日形态（未来的日子回拨上一年）');
  assert(rt('6/15 12:00') === at(2026, 5, 15, 12, 0), '月日形态（恰好等于当前时刻不回拨）');
  assert(rt('abc') === null && rt('') === null, '无法识别的文本返回 null');
  assert(rt('18:16:30') === null && rt('10-21 17:41') === null, '非官方形态返回 null');
});

// 3. fmt / fmtNum / fmtTokens：中文万/亿、英文 k/M/B
run('fmt', () => {
  if (!fmtSrc) return;
  let fmt = null;
  try {
    fmt = new Function('isZhLocale', fmtSrc + '\nreturn fmt;')(() => zhState.zh);
  } catch (err) {
    assert(false, '装配 fmt 失败: ' + (err && err.message));
    return;
  }
  zhState.zh = true;
  assert(fmt(0) === '0' && fmt(9999) === '9999', '中文不足一万显示原数');
  assert(fmt(10000) === '1万', '中文整万');
  assert(fmt(12000) === '1.2万', '中文一位小数的万');
  assert(fmt(484000) === '48.4万', '中文 48.4万');
  assert(fmt(9000000) === '900万', '中文 900万');
  assert(fmt(99990000) === '9999万', '中文 9999万');
  assert(fmt(99999999) === '1亿', '中文 99,999,999 的万位进位成 1 亿');
  assert(fmt(1e8) === '1.0亿', '中文整亿带一位小数（fmt 现状）');
  assert(fmt(350000000) === '3.5亿', '中文 3.5亿');
  zhState.zh = false;
  assert(fmt(999) === '999' && fmt(0) === '0', '英文不足一千显示原数');
  assert(fmt(1500) === '1.5k', '英文 1.5k');
  assert(fmt(2.5e6) === '2.5M', '英文 2.5M');
  assert(fmt(1e9) === '1.0B', '英文 1.0B');
  zhState.zh = true;
});

run('fmtNum/fmtTokens', () => {
  if (!fmtNumSrc || !fmtTokensSrc) return;
  let fmtNum = null, fmtTokens = null;
  try {
    const f = new Function('isZhLocale', fmtTokensSrc + '\n' + fmtNumSrc + '\nreturn { fmtTokens, fmtNum };')(() => zhState.zh);
    fmtNum = f.fmtNum; fmtTokens = f.fmtTokens;
  } catch (err) {
    assert(false, '装配 fmtNum 失败: ' + (err && err.message));
    return;
  }
  zhState.zh = true;
  assert(fmtNum(9999) === '9999', 'fmtNum 中文不足一万显示原数');
  assert(fmtNum(10000) === '1万', 'fmtNum 中文整万');
  assert(fmtNum(12345) === '1.2万', 'fmtNum 中文一位小数的万');
  assert(fmtNum(484000) === '48.4万', 'fmtNum 中文 48.4万');
  assert(fmtNum(99990000) === '9999万', 'fmtNum 中文 9999万');
  assert(fmtNum(99999999) === '1亿', 'fmtNum 中文 99,999,999 的万位进位成 1 亿');
  assert(fmtNum(1e8) === '1亿', 'fmtNum 中文整亿不带 .0（与 fmt 的 1.0亿 不同，各自照现状）');
  assert(fmtNum(350000000) === '3.5亿', 'fmtNum 中文 3.5亿');
  zhState.zh = false;
  assert(fmtNum(1500) === '1.5k' && fmtNum(2.5e6) === '2.5M', 'fmtNum 非中文走 k/M 缩写');
  zhState.zh = true;
  assert(fmtTokens(0) === '0' && fmtTokens(999) === '999', 'fmtTokens 不足一千显示原数');
  assert(fmtTokens(5500) === '5.5k', 'fmtTokens 5.5k');
  assert(fmtTokens(1000) === '1.0k', 'fmtTokens 整千带一位小数');
  assert(fmtTokens(1e6) === '1.0M', 'fmtTokens 1.0M');
  assert(fmtTokens(1e9) === '1.0B', 'fmtTokens 1.0B');
});

// 1 + 3 的 DOM 部分：假 DOM 跑真实 scan，验区间归属与注入内容
run('scan', () => {
  if (!fmtSrc || !rowTimeTsSrc || !findRowsSrc || !curSidSrc || !injectRowSrc || !scanSrc) return;
  const fdoc = makeDoc();
  let bun = null;
  try {
    bun = makeTurnBundle()(fdoc, tStub, () => zhState.zh, iconStub, tickStub);
  } catch (err) {
    assert(false, '装配 turn-usage 测试函数失败: ' + (err && err.message));
    return;
  }
  zhState.zh = true;

  // 回答行：复制按钮 + 赞踩按钮 + 时间文本；按钮的父元素是行
  const makeRow = (timeText) => {
    const row = new FakeEl('div');
    const copy = new FakeEl('button');
    copy.setAttribute('data-testid', 'v4-copy-1');
    const fb = new FakeEl('button');
    fb.setAttribute('data-testid', 'v4-feedback-1');
    const time = new FakeEl('span');
    time.textContent = timeText;
    row.append(copy, fb, time);
    return row;
  };
  const makeTaskRow = (key, selected) => {
    const el = new FakeEl('div');
    el.setAttribute('data-task-item-key', key);
    if (selected) el.className = 'bg-selected';
    return el;
  };
  const dayTs = (dayOffset, h, m) => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  };
  const bucket = (at, inTok, outTok, cacheRead = 0) => ({ at, in: inTok, out: outTok, cacheRead, genMs: 0, tpsOut: 0 });
  const spansOf = (row) => row.querySelectorAll('[data-zcodepro-turn-span]');
  const htmlOf = (row) => spansOf(row).map((s) => s.innerHTML).join('');

  const taskA = makeTaskRow('/home/me/proj:sess_A', true);
  const row1 = makeRow('10:00');
  const row2 = makeRow('10:05');
  const row3 = makeRow('10:20');
  // DOM 顺序故意打乱，看 scan 按时间排
  fdoc.roots = [taskA, row3, row1, row2];

  bun.scan(); // 首次扫描认会话，桶清空
  const baseBuckets = [
    bucket(dayTs(0, 9, 59), 999999, 1, 0),    // 比最早的行还早：丢弃
    bucket(dayTs(0, 10, 0), 5000, 300, 1000), // 自己的提问时刻等于完成时刻：归 10:00 行
    bucket(dayTs(0, 10, 4), 7000, 255, 500),  // 下一条提问（10:05）之前：归 10:00 行
    bucket(dayTs(0, 10, 5), 101, 11, 0),      // 完成时刻正好是 10:05 行的提问时刻：归 10:05 行
    bucket(dayTs(0, 10, 19), 202, 22, 0),     // 归 10:05 行
    bucket(dayTs(0, 10, 20), 303, 33, 0),     // 归 10:20 行
    bucket(dayTs(0, 10, 45), 404, 44, 0),     // 最后一条之后：全归 10:20 行
  ];
  bun.setRounds(baseBuckets);
  bun.scan();

  assert(spansOf(row1).length === 1 && spansOf(row2).length === 1 && spansOf(row3).length === 1, '每个有用量的行注入一段标注');
  const h1 = htmlOf(row1);
  assert(h1.includes('IN</em>1.2万') && h1.includes('OUT</em>555'), '10:00 行拿到 10:00-10:05 的两个桶求和');
  assert(h1.includes('CACHE</em>12.50%'), '缓存命中率保留两位小数（1500/12000）');
  const h2 = htmlOf(row2);
  assert(h2.includes('IN</em>303') && h2.includes('OUT</em>33'), '完成时刻落在 10:05 的桶归 10:05 行（边界含自身）');
  assert(!h2.includes('CACHE'), '无缓存时不渲染缓存段');
  const h3 = htmlOf(row3);
  assert(h3.includes('IN</em>707') && h3.includes('OUT</em>77'), '最后一条回答收到 10:20 之后的桶');
  assert(!h1.includes('100万') && !h2.includes('100万') && !h3.includes('100万'), '比最早行还早的桶不归属任何行');

  // 重扫：进行中的轮数值增长，旧标注被替换
  bun.setRounds(baseBuckets.map((b) => (b.at === dayTs(0, 10, 45) ? bucket(b.at, 404, 144, 0) : b)));
  bun.scan();
  assert(spansOf(row3).length === 1, '重扫后每行只留一段标注');
  assert(htmlOf(row3).includes('OUT</em>177'), '重扫后数值更新（33+144）');

  // 三段全隐藏：不注入，行标记也撤掉
  bun.setTurnCfg([{ id: 'turnIn', on: false }, { id: 'turnOut', on: false }, { id: 'turnCache', on: false }]);
  bun.scan();
  assert(spansOf(row1).length === 0 && row1.getAttribute('data-zcodepro-turn') == null, '三段全隐藏时不注入且撤掉行标记');
  bun.setTurnCfg([{ id: 'turnIn', on: true }, { id: 'turnOut', on: true }, { id: 'turnCache', on: true }]);

  // 页面隐藏：清理后不注入
  fdoc.hidden = true;
  bun.scan();
  assert(spansOf(row1).length === 0 && spansOf(row3).length === 0, '页面隐藏时不注入');
  fdoc.hidden = false;
  bun.scan();
  assert(spansOf(row1).length === 1 && spansOf(row3).length === 1, '回到前台重新注入');

  // 统计开关关掉：清标注不注入；打开恢复
  bun.setEnabled(false);
  bun.scan();
  assert(spansOf(row1).length === 0 && spansOf(row2).length === 0, '开关关掉时清掉标注');
  bun.setEnabled(true);
  bun.scan();
  assert(spansOf(row1).length === 1, '开关打开后恢复注入');

  // in+out 全为 0 的行不注入（哪怕有缓存读）
  const zrow = makeRow('10:00');
  fdoc.roots = [taskA, zrow];
  bun.setRounds([bucket(dayTs(0, 10, 3), 0, 0, 9)]);
  bun.scan();
  assert(spansOf(zrow).length === 0 && zrow.getAttribute('data-zcodepro-turn') == null, 'in+out 全为 0 的行不注入');

  // 命中率 100% 也保留两位小数（长上下文会话普遍 99%+，取整会全显示 100%）
  const crow = makeRow('10:00');
  fdoc.roots = [taskA, crow];
  bun.setRounds([bucket(dayTs(0, 10, 3), 1000, 1, 1000)]);
  bun.scan();
  assert(htmlOf(crow).includes('CACHE</em>100.00%'), '命中率 100% 显示 100.00%');

  // TPS 段：输出 ÷ 净生成秒数（官方口径）；一轮多请求按总输出/总净生成时长
  const trow = makeRow('10:00');
  fdoc.roots = [taskA, trow];
  bun.setTurnCfg([{ id: 'turnIn', on: true }, { id: 'turnOut', on: true }, { id: 'turnTps', on: true }, { id: 'turnCache', on: true }]);
  bun.setRounds([{ at: dayTs(0, 10, 3), in: 1000, out: 100, cacheRead: 0, genMs: 2000, tpsOut: 100 }]);
  bun.scan();
  assert(htmlOf(trow).includes('OUT</em>50 tok/s'), '输出速度段按官方公式渲染（100 输出 ÷ 2 秒）');
  bun.setRounds([{ at: dayTs(0, 10, 3), in: 1000, out: 100, cacheRead: 0, genMs: 0, tpsOut: 0 }]);
  bun.scan();
  assert(!htmlOf(trow).includes('tok/s'), '无净生成时长时不渲染输出速度段');

  // 同日约束：昨天的行不吞今天的调用
  const y1 = makeRow('昨天 10:00');
  const y2 = makeRow('昨天 10:20');
  fdoc.roots = [taskA, y1, y2];
  bun.scan();
  bun.setRounds([
    bucket(dayTs(-1, 10, 5), 111, 1, 0),    // 昨天：正常归属
    bucket(dayTs(-1, 10, 30), 222, 2, 0),   // 昨天：归 10:20 行
    bucket(dayTs(0, 0, 30), 77777, 3, 0),   // 今天 00:30：跨天丢弃
  ]);
  bun.scan();
  assert(htmlOf(y1).includes('IN</em>111') && htmlOf(y2).includes('IN</em>222'), '同日的桶正常归属');
  assert(!htmlOf(y1).includes('77.8万') && !htmlOf(y2).includes('77.8万'), '跨天的桶丢弃（昨天的行不吞今天的调用）');

  // turnMode：官方每轮汇总按起止分钟匹配回答行；后面轮次的行不在可见区时，
  // 不能把它的用量算到最后一条可见回答上（滚动时数值来回跳的根因）
  const r1 = makeRow('10:00');
  const r2 = makeRow('10:05');
  fdoc.roots = [taskA, r1, r2];
  const turn = (startH, startM, endH, endM, inTok, outTok) => ({
    startAt: dayTs(0, startH, startM), at: dayTs(0, endH, endM),
    in: inTok, out: outTok, cacheRead: 0, genMs: 1000, tpsOut: outTok,
  });
  bun.setRounds([
    turn(9, 58, 10, 4, 1000, 100),
    turn(10, 5, 10, 9, 2000, 200),
    turn(10, 20, 10, 25, 3000, 300), // 这一轮的回答行不在可见区
  ]);
  bun.scan();
  assert(htmlOf(r1).includes('OUT</em>100') && htmlOf(r2).includes('OUT</em>200'), 'turnMode 按每轮起止时间归属可见回答行');
  assert(!htmlOf(r2).includes('OUT</em>500') && !htmlOf(r2).includes('OUT</em>300'), '后面轮次不在可见区时不被最后一条回答吞掉');
  const r3 = makeRow('10:20');
  fdoc.roots = [taskA, r1, r2, r3];
  bun.scan();
  assert(htmlOf(r3).includes('OUT</em>300'), '滚出该轮回答行后重新扫描能补上（不改动其它行）');

  // 进行中的轮次还没有 turn_usage：live 挂到最新一条未占用的可见回答行
  bun.setRounds([turn(9, 58, 10, 4, 1000, 100), turn(10, 5, 10, 9, 2000, 200)]);
  bun.setLive([{ at: dayTs(0, 10, 25), in: 3000, out: 300, cacheRead: 0, genMs: 1000, tpsOut: 300 }]);
  bun.scan();
  assert(htmlOf(r3).includes('OUT</em>300') && !htmlOf(r3).includes('OUT</em>600'), 'live 用量挂到最新未占用的回答行');
  fdoc.roots = [taskA, r1, r2];
  bun.scan();
  assert(!htmlOf(r2).includes('OUT</em>500'), '最新可见行已被完成轮占用时 live 不硬塞');
  const stale = makeRow('09:00');
  fdoc.roots = [taskA, stale];
  bun.scan();
  assert(spansOf(stale).length === 0, '滚到旧消息时 live 不挂到无关旧回答上');

  // 切换会话：桶清空，只清不注，并立即补拉一次
  const taskB = makeTaskRow('/home/me/proj:sess_B', true);
  taskA.className = '';
  fdoc.roots = [taskB, y1, y2];
  const tickBefore = tickState.calls;
  bun.scan();
  assert(spansOf(y1).length === 0 && spansOf(y2).length === 0, '切换会话后先清不注（旧会话的桶不带过来）');
  assert(tickState.calls === tickBefore + 1, '切换会话后立即补拉一次数据');
  assert(bun.getRounds().length === 0, '切换会话后桶清空');
  assert(bun.getLive().length === 0, '切换会话后 live 清空');
});

// 5. currentSessionId：选中行优先，无选中回退最后一行；只认 :sess/:session 键
run('currentSessionId', () => {
  if (!curSidSrc) return;
  const fdoc = makeDoc();
  let curSid = null;
  try {
    curSid = new Function('document', curSidSrc + '\nreturn currentSessionId;')(fdoc);
  } catch (err) {
    assert(false, '装配 currentSessionId 失败: ' + (err && err.message));
    return;
  }
  const mk = (key, selected) => {
    const el = new FakeEl('div');
    el.setAttribute('data-task-item-key', key);
    if (selected) el.className = 'bg-selected';
    return el;
  };
  const r1 = mk('/w/a:sess_1', true);
  const r2 = mk('/w/b:sess_2', false);
  fdoc.roots = [r1, r2];
  assert(curSid() === 'sess_1', '有选中行取选中行的会话 id');
  r1.className = '';
  assert(curSid() === 'sess_2', '无选中行回退最后一行');
  fdoc.roots = [mk('/w/c:session_x', true)];
  assert(curSid() === 'session_x', 'session_ 前缀的键也认');
  fdoc.roots = [mk('/w/d:proj_9', true)];
  assert(curSid() === '', '非会话键返回空串');
});

// 4. spliceSubset（taskOrder.mjs）：拖动子集插回原有最小位置
run('spliceSubset', () => {
  if (!spliceSrc) return;
  let sp = null;
  try {
    sp = new Function(spliceSrc + '\nreturn spliceSubset;')();
  } catch (err) {
    assert(false, '装配 spliceSubset 失败: ' + (err && err.message));
    return;
  }
  const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  assert(eq(sp(['a', 'b', 'c', 'd'], ['c', 'a']), ['c', 'a', 'b', 'd']), '子集重排后插回原有最小位置');
  assert(eq(sp(['a', 'b', 'c', 'd'], ['c']), ['a', 'b', 'c', 'd']), '子集顺序不变时整体不动');
  assert(eq(sp(['a', 'b', 'c', 'd'], ['d', 'b']), ['a', 'd', 'b', 'c']), '未拖动的键保持相对次序');
  assert(eq(sp(['a', 'b'], ['b', 'a']), ['b', 'a']), '全部拖动就是新顺序');
  assert(eq(sp(['a', 'b', 'c'], []), ['a', 'b', 'c']), '空子集原样返回');
  // 混入不在 current 里的键会原样带进结果（调用方先过滤了外键，这里记录现状）
  assert(eq(sp(['a', 'b', 'c'], ['x', 'c']), ['a', 'b', 'x', 'c']), '子集里的外来键带进结果（现状，调用方负责过滤）');
});

// 4. session-switch.js：idOf 归一、unseen 增删、MRU 置顶与上限
run('idOf/record', () => {
  if (!idOfSrc || !recordSrc || !mruLimitSrc) return;
  let rec = null, idOf = null, MRU_LIMIT = null, handles = null;
  try {
    const f = new Function(
      idOfSrc + '\n' + mruLimitSrc + '\nlet unseen = new Set(); let current = null; let mru = [];'
      + '\n' + recordSrc
      + '\nreturn { record, idOf, MRU_LIMIT, getMru: () => mru, getUnseen: () => [...unseen], getCurrent: () => current,'
      + '\n  setUnseen: (a) => { unseen = new Set(a); }, reset: () => { unseen = new Set(); current = null; mru = []; } };'
    )();
    rec = f.record; idOf = f.idOf; MRU_LIMIT = f.MRU_LIMIT;
    handles = f;
  } catch (err) {
    assert(false, '装配 session-switch 测试函数失败: ' + (err && err.message));
    return;
  }
  assert(typeof MRU_LIMIT === 'number' && MRU_LIMIT > 0, 'MRU 上限是正数（' + MRU_LIMIT + '）');
  assert(idOf('/w/a:sess_1') === 'sess_1' && idOf('/w/a/:sess_1') === 'sess_1', 'idOf 取键最后一段（带不带尾斜杠的键形同 id）');
  assert(idOf('w:session_2') === 'session_2', 'session_ 前缀同样取最后一段');
  // 空值守卫：current 在新建任务视图（无选中行）一直是 null，运行结束判定
  // 会对它调 idOf——缺守卫时 10 秒定时器抛 TypeError，这条专抓回退
  assert(idOf(null) === '' && idOf(undefined) === '' && idOf('') === '', 'idOf 对 null/undefined/空串安全（返回空串不抛）');

  // unseen 增删按会话 id 归一：切到一种键形，另一种键形也一起删
  handles.setUnseen(['/w/a:sess_1', '/w/a/:sess_1', '/w/b:sess_2']);
  rec('/w/a/:sess_1');
  assert(handles.getUnseen().length === 1 && handles.getUnseen()[0] === '/w/b:sess_2', '切入后同 id 的两种键形一起从未查看集合删掉');

  // MRU：去重置顶
  handles.reset();
  rec('/w:sess_A');
  rec('/w:sess_B');
  rec('/w:sess_A');
  assert(handles.getMru().length === 2 && handles.getMru()[0] === '/w:sess_A', 'MRU 去重并把刚切入的放最前');
  assert(handles.getCurrent() === '/w:sess_A', '当前会话跟着切');
  rec('/w:sess_A');
  assert(handles.getMru().length === 2, '重复切入当前会话不改 MRU');
  rec('');
  assert(handles.getMru().length === 2 && handles.getCurrent() === '/w:sess_A', '空键不改 MRU 与当前');

  // 上限：超出后留最近的 MRU_LIMIT 条
  for (let i = 0; i < MRU_LIMIT + 9; i++) rec('/w:sess_' + i);
  assert(handles.getMru().length === MRU_LIMIT && handles.getMru()[0] === '/w:sess_' + (MRU_LIMIT + 8), 'MRU 超上限截尾留最近的');
});

// 4. "运行结束记 unseen" 的规则：截取 session-switch.js 真实的 collectEndedUnseen
//（从 setInterval 抽出的具名函数）跑假输入；规则断言全走真实函数，
// 不再写规范实现对照、也不做源码子串匹配
run('unseen 运行结束规则', () => {
  if (!collectEndedSrc || !idOfSrc || !unseenLimitSrc) return;
  let collect = null;
  let LIMIT = null;
  try {
    const f = new Function(
      idOfSrc + '\n' + unseenLimitSrc + '\n' + collectEndedSrc
      + '\nreturn { collectEndedUnseen, UNSEEN_LIMIT };'
    )();
    collect = f.collectEndedUnseen;
    LIMIT = f.UNSEEN_LIMIT;
  } catch (err) {
    assert(false, '装配 collectEndedUnseen 失败: ' + (err && err.message));
    return;
  }
  const ids = (set) => [...set].map((k) => k.slice(k.lastIndexOf(':') + 1)).sort().join(',');
  const none = new Set();
  assert(collect(['/w:sess_1'], ['/w/:sess_1'], '', none).size === 0, '键形切换不算运行结束（按 id 判消失）');
  const s2 = collect(['/w:sess_1', '/w:sess_2'], ['/w:sess_2'], '/w:sess_2', none);
  assert(ids(s2) === 'sess_1', `真结束的记为未查看，当前会话不记（实际 ${ids(s2)}）`);
  assert(collect(['/w:sess_3'], [], '/w:sess_3', none).size === 0, '结束时正看着的会话不记为未查看');
  const s4 = collect(['/w:sess_4', '/w:sess_5'], [], null, none);
  assert(ids(s4) === 'sess_4,sess_5', `current 为 null（新建任务视图无选中行）不抛、结束的都记下（实际 ${ids(s4)}）`);
  assert(collect(null, ['/w:sess_6'], null, none).size === 0, '首轮采样（无上一轮集合）不记');
  assert(collect(['/w:sess_6'], ['/w:sess_6'], null, none).size === 0, '还在运行的不记');
  // 超上限留最后 UNSEEN_LIMIT 条（按集合插入序取尾部），且不动入参集合
  const many = new Set(Array.from({ length: LIMIT + 3 }, (_, i) => '/w:m' + i));
  const trimmed = collect([], [], null, many);
  assert(trimmed.size === LIMIT && [...trimmed][0] === '/w:m3',
    `超上限留最后 ${LIMIT} 条（实际 ${trimmed.size} 条，首条 ${[...trimmed][0]}）`);
  assert(many.size === LIMIT + 3, '入参集合不被改动');
  assert(collect([], [], null, new Set(['/w:a1', '/w:a2'])).size === 2, '没超上限不动');
});

// 5. idle-reclaim.js：dueForReclaim 的到点判定与空闲计时维护。回收前的后台命令
// 扫描已改为只扫这批到点的工作区（不再每 30 秒全量扫），到点集合算错就直接
// 决定回收成败——截取真实函数跑假输入把边界钉住
run('dueForReclaim 到点判定', () => {
  if (!dueSrc) return;
  let due = null;
  try {
    due = new Function(dueSrc + '\nreturn dueForReclaim;')();
  } catch (err) {
    assert(false, '装配 dueForReclaim 失败: ' + (err && err.message));
    return;
  }
  const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  // 没起表的起表、不入列；已到点的入列并扣表
  let idleSince = new Map();
  let out = due(['/w/a'], new Set(), idleSince, new Map(), 1000, 60_000, false);
  assert(out.length === 0 && idleSince.get('/w/a') === 1000, '首次见到的工作区起表不入列');
  out = due(['/w/a'], new Set(), idleSince, new Map(), 30_000, 60_000, false);
  assert(out.length === 0, '没到点不入列');
  out = due(['/w/a'], new Set(), idleSince, new Map(), 61_000, 60_000, false);
  assert(eq(out, ['/w/a']) && !idleSince.has('/w/a'), '到点入列并扣表（调用方决定回收或重计）');
  // busy 的清表不入列（清表后下轮重新累计）
  idleSince = new Map([['/w/b', 0]]);
  out = due(['/w/b'], new Set(['/w/b']), idleSince, new Map(), 999_999, 60_000, false);
  assert(out.length === 0 && !idleSince.has('/w/b'), '运行中的工作区清表不入列');
  // 冷却中的不动表不入列，冷却过后到点即重试
  idleSince = new Map([['/w/c', 0]]);
  out = due(['/w/c'], new Set(), idleSince, new Map([['/w/c', 100_000]]), 61_000, 60_000, false);
  assert(out.length === 0 && idleSince.has('/w/c'), '冷却中的不入列也不扣表');
  out = due(['/w/c'], new Set(), idleSince, new Map([['/w/c', 100_000]]), 200_000, 60_000, false);
  assert(eq(out, ['/w/c']) && !idleSince.has('/w/c'), '冷却过后到点即重试');
  // 启动扫：不等空闲时长全入列，busy/冷却中的除外；与常规到点重合只入列一次
  idleSince = new Map();
  out = due(['/w/a', '/w/b', '/w/c'], new Set(['/w/b']), idleSince,
    new Map([['/w/c', 999_999]]), 1000, 60_000, true);
  assert(eq(out, ['/w/a']), `启动扫只入列非 busy 非冷却的（实际 ${out.join(',')}）`);
  idleSince = new Map([['/w/a', 0]]);
  out = due(['/w/a'], new Set(), idleSince, new Map(), 1000, 60_000, true);
  assert(eq(out, ['/w/a']), '启动扫与常规到点重合只入列一次');
  out = due(['/w/a'], new Set(), new Map(), new Map(), 1000, 60_000, false);
  assert(out.length === 0, 'startupDue=false 不做全量入列');
});

// 6. ws-running.js：listActiveIdsCached 的缓存与去重——两种尾斜杠合并成一次
// 查询、TTL 内命中不重查、查询中同键共享同一个 Promise（subagent-icon 与
// 全局扫描共用这份缓存，TTL/去重算错就白改）
run('listActiveIdsCached 缓存与去重', async () => {
  if (!cachedIdsSrc || !ttlSrc || !cacheTimeoutSrc || !idsCacheSrc) return;
  let cached = null;
  let TTL = 0;
  try {
    const f = new Function('Date', 'findServices',
      ttlSrc + '\n' + cacheTimeoutSrc + '\n' + idsCacheSrc + '\n' + cachedIdsSrc
      + '\nreturn { listActiveIdsCached, ACTIVE_IDS_TTL_MS };');
    const calls = [];
    let now = 1000;
    const fakeTs = {
      listActiveTaskIds: async ({ workspacePath }) => {
        calls.push(workspacePath);
        return workspacePath.endsWith('/') ? ['b1'] : ['a1'];
      },
    };
    const r = f({ now: () => now }, () => ({ zcodeTaskService: fakeTs }));
    cached = r.listActiveIdsCached;
    TTL = r.ACTIVE_IDS_TTL_MS;
    // 一次调用查两种尾斜杠并合并
    const ids1 = await cached('/w/x');
    assert(calls.length === 2 && calls.includes('/w/x') && calls.includes('/w/x/'),
      `一次调用查两种尾斜杠（实际 ${calls.join(',')}）`);
    assert(ids1.join(',') === 'a1,b1', `两种尾斜杠结果合并（实际 ${ids1.join(',')}）`);
    // TTL 内命中缓存，不再发查询
    now += TTL - 1;
    const ids2 = await cached('/w/x');
    assert(calls.length === 2 && ids2.join(',') === 'a1,b1', 'TTL 内命中缓存不重查');
    // 过期重查
    now += 2;
    await cached('/w/x');
    assert(calls.length === 4, 'TTL 过期重查');
    // 尾斜杠归一：/w/x/ 与 /w/x 共用同一条缓存
    await cached('/w/x/');
    assert(calls.length === 4, '带尾斜杠的键与去尾斜杠键共用缓存');
    // 查询中同键共享同一个 Promise（同时并发两次只查一轮）
    now += TTL + 1;
    const p1 = cached('/w/y');
    const p2 = cached('/w/y');
    const [y1, y2] = await Promise.all([p1, p2]);
    assert(calls.filter((c) => c.startsWith('/w/y')).length === 2, '并发同键只查一轮两种尾斜杠');
    assert(y1 === y2, '并发同键共享同一结果');
    // 服务不可用返回 null
    const f2 = new Function('Date', 'findServices',
      ttlSrc + '\n' + cacheTimeoutSrc + '\n' + idsCacheSrc + '\n' + cachedIdsSrc
      + '\nreturn listActiveIdsCached;')({ now: () => now }, () => null);
    assert(await f2('/w/z') === null, '服务不可用（≤3.15.x）返回 null');
  } catch (err) {
    assert(false, '装配 listActiveIdsCached 失败: ' + (err && err.message));
  }
});

// 5. composer-edit-model.js decodeProviderId：只解析 custom: 前缀
run('decodeProviderId', () => {
  const src = readSrc('../src/inject/features/composer-edit-model.js');
  const fnSrc = extractBinding(src, 'decodeProviderId', makeMask(src));
  if (!fnSrc) { assert(false, '截取 decodeProviderId 失败'); return; }
  let decode = null;
  try {
    decode = new Function(fnSrc + '\nreturn decodeProviderId;')();
  } catch (err) {
    assert(false, '装配 decodeProviderId 失败: ' + (err && err.message));
    return;
  }
  assert(decode('custom:p%3A1:model') === 'p:1', 'custom 值解出 provider');
  assert(decode('custom:plain') === 'plain', '无模型名时整段是 provider');
  assert(decode('deepseek-v4') === null, '非 custom 值返回 null');
});

await Promise.all(pendingRuns);
console.log(failed ? 'FAILED' : 'all ok');
process.exit(failed);
