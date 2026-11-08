// 每轮回答的 token 用量：在回答末尾操作按钮（复制/赞/踩/分叉/钩子）行的时间
// 后面追加“竖线 + 输入/输出/TPS/缓存”标注（段顺序与显隐可在设置里调）。
// 数据来自官方 model_usage（Token 调试同源，含首 token 时机），按“本条提问到
// 下一条提问”的区间归属到回答行；只统计主轮请求，辅助小调用不计。
import { t, rpc, getConfig, isZhLocale } from '../core.js';

let enabled = true;
let rounds = []; // 官方主轮请求 [{idx, at, in, out, cacheRead, genMs, tps…}] 按完成时间升序
let scanTimer = 0;
// 四段（输入/输出/TPS/缓存）的显隐与顺序：设置 → 样式 → 状态栏 → 每轮统计
let turnCfg = [
  { id: 'turnIn', on: true },
  { id: 'turnOut', on: true },
  { id: 'turnTps', on: true },
  { id: 'turnCache', on: true },
];
const refreshTurnItems = () => {
  void getConfig().then((cfg) => {
    const saved = cfg.statusBar && Array.isArray(cfg.statusBar.turnItems) ? cfg.statusBar.turnItems : null;
    if (!saved) return;
    const known = new Set(turnCfg.map((x) => x.id));
    const list = saved.filter((x) => x && known.has(x.id)).map((x) => ({ id: x.id, on: x.on !== false }));
    for (const d of turnCfg) if (!list.some((x) => x.id === d.id)) list.push({ ...d });
    turnCfg = list;
  }).catch(() => {});
};

// 与状态栏同款的小图标（上/下箭头、层叠缓存）
const ICONS = {
  up: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  cache: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  // 与状态栏“输出”同款（gauge）：计数段与速度段共用
  // 墨迹在 24 格视图里垂直居中且不出框（旧字形 U 弧画到框底，描边被裁看着偏下）
  out: '<path d="m12 11 4-4"/><path d="M3.34 16a10 10 0 1 1 17.32 0"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px;opacity:.6">${ICONS[name]}</svg>`;

// 与状态栏同款：中文用 万/亿，其它语言 k/M 缩写
function fmt(n) {
  if (!isZhLocale()) {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
    return String(n);
  }
  if (n >= 1e8) return (n / 1e8).toFixed(1) + '亿';
  if (n >= 1e4) {
    const wan = Math.round((n / 1e4) * 10) / 10;
    if (wan >= 10000) return (Math.round((n / 1e8) * 10) / 10) + '亿'; // 万位四舍五入进到 1 万万 → 显示亿
    return (wan % 1 === 0 ? String(wan) : wan.toFixed(1)) + '万';
  }
  return String(n);
}

// 回答操作行：按结构特征识别——回答行有赞/踩按钮（v4-feedback-），用户消息行
// 没有（只有复制/编辑），比时间文本稳（官方改时间格式不影响识别）。
// 行内时间文本只用于解析该轮的提问时刻
function findRows() {
  const rows = [];
  const seen = new Set();
  for (const btn of document.querySelectorAll('[data-testid^="v4-copy-"]')) {
    const row = btn.parentElement;
    // 一行有多个复制按钮时只收一次（桶归属按行算，重了会把一份用量算多遍）
    if (!row || seen.has(row)) continue;
    seen.add(row);
    if (!row.querySelector('[data-testid^="v4-feedback-"]')) continue;
    const timeEl = [...row.querySelectorAll('span')].find((s) => /\d{1,2}:\d{2}$/.test((s.textContent || '').trim()));
    if (timeEl) { const ts = rowTimeTs((timeEl.textContent || '').trim()); if (ts != null) rows.push({ row, ts }); }
  }
  return rows;
}

// 当前会话 id：优先读会话面板自身的 data-session-id（官方属性，跟着对话视图
// 走——侧栏项目折叠后选中行会卸载，只认行会让每轮标注整组消失），
// 再回退选中行/侧栏最新一行。只认 :sess/:session 形态的键；
// 状态栏用自己的严格版（selectedSessionId，不回退侧栏最新一行）
export function currentSessionId() {
  const pane = document.querySelector('[data-session-id]');
  const pid = pane ? pane.getAttribute('data-session-id') : '';
  if (pid && /^(?:sess|session)_/.test(pid)) return pid;
  const rows = [...document.querySelectorAll('[data-task-item-key]')];
  const cur = rows.find((e) => (e.className + '').includes('bg-selected')) || rows[rows.length - 1];
  const key = cur ? cur.getAttribute('data-task-item-key') : '';
  const i = key.lastIndexOf(':sess');
  return i > 0 ? key.slice(i + 1) : '';
}

function injectRow(row, bucket) {
  if (!bucket || bucket.in + bucket.out <= 0) return;
  const L = t();
  // 与状态栏同款：图标 + 文字 + 数据；缓存有量时给命中率
  // 保留两位小数：长上下文会话命中率普遍 99%+，取整会全部显示 100% 失真
  const cachePct = bucket.in > 0 && bucket.cacheRead > 0
    ? (bucket.cacheRead / bucket.in * 100).toFixed(2) : '';
  // TPS = 输出 ÷ 净生成秒数（官方口径）；一轮多个请求按总输出/总净生成时长
  const tps = bucket.genMs > 0 ? bucket.tpsOut / (bucket.genMs / 1000) : null;
  const group = (html) => `<span style="display:inline-flex;align-items:center;gap:2px">${html}</span>`;
  const em = (text) => `<em style="font-style:normal;opacity:.75">${text}</em>`;
  const DOT = '<span style="opacity:.45">·</span>'; // 与状态栏同款分隔
  // 段按设置保存的顺序渲染，段间用 ·；首段左侧竖线与底部状态栏的组分隔同款；
  // 全部隐藏时不注入（连竖线一起没有）
  const sections = [];
  for (const s of turnCfg) {
    if (!s.on) continue;
    if (s.id === 'turnIn') sections.push(group(icon('up') + em(L.sbLabelIn) + fmt(bucket.in)));
    else if (s.id === 'turnOut') sections.push(group(icon('out') + em(L.sbLabelOut) + fmt(bucket.out)));
    else if (s.id === 'turnTps' && tps != null) sections.push(group(icon('out') + em(L.sbLabelOut) + (Math.round(tps * 10) / 10) + ' tok/s'));
    else if (s.id === 'turnCache' && cachePct) sections.push(group(icon('cache') + em(L.sbLabelCache) + cachePct + '%'));
  }
  const old = row.querySelector('[data-zcodepro-turn-span]');
  if (!sections.length) {
    // 全隐藏：撤掉行里已有的标注与行标记（不注入）
    if (old) old.remove();
    delete row.dataset.zcodeproTurn;
    return;
  }
  const VBAR = '<span style="display:inline-block;width:1px;height:10px;background:currentColor;opacity:.3;margin:0 5px"></span>';
  const html = VBAR + sections.join(DOT);
  // 数据没变就不动 DOM（含段的显隐顺序）：每轮全删全注会在流式期反复触发布局
  if (old && old.innerHTML === html) { row.dataset.zcodeproTurn = '1'; return; }
  if (old) old.remove();
  const el = document.createElement('span');
  el.dataset.zcodeproTurnSpan = '1';
  el.className = 'select-none text-ui-sm text-foreground-subtlest';
  // 按钮行是 flex 容器：本元素作为子项会被压缩导致内容折行，锁成单行
  el.style.whiteSpace = 'nowrap';
  el.style.display = 'inline-flex';
  el.style.alignItems = 'center';
  el.style.gap = '4px'; // 组与 · 分隔之间的间距
  el.style.marginLeft = '10px'; // 与左侧时间拉开
  el.innerHTML = html;
  el.title = `${L.turnUsageTitle}${isZhLocale() ? '：' : ': '}${L.sbLabelIn} ${bucket.in.toLocaleString()} / ${L.sbLabelOut} ${bucket.out.toLocaleString()}`
    + (tps != null ? ` / ${L.sbLabelOut} ${Math.round(tps * 10) / 10} tok/s` : '')
    + (bucket.cacheRead > 0 ? ` / ${L.sbLabelCache} ${bucket.cacheRead.toLocaleString()}` : '');
  row.dataset.zcodeproTurn = '1';
  row.append(el); // 追加在按钮行末尾（时间之后）
}

// 回答行时间文本 → 当年本地时间的时间戳（毫秒）。
// 官方三种形态：今天“18:16”、昨天“昨天 18:16”/“Yesterday 18:16”、更早“10/21 17:41”。
// 行时间是提问时刻，调用桶是完成时刻——一轮的用量按“本条提问到下一条
// 提问之间”的区间归属（见 scan），因此这里只取可比时间戳
function rowTimeTs(text) {
  const now = new Date();
  let m = text.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return new Date(now.getFullYear(), now.getMonth(), now.getDate(), +m[1], +m[2]).getTime();
  m = text.match(/^(昨天|Yesterday)\s*(\d{1,2}):(\d{2})$/);
  if (m) { const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1); return new Date(y.getFullYear(), y.getMonth(), y.getDate(), +m[2], +m[3]).getTime(); }
  m = text.match(/^(\d{1,2})\/(\d{1,2})\s*(\d{1,2}):(\d{2})$/);
  if (m) {
    // 月日形态不带年份：算出来在未来的按上一年（1 月看到 12 月的行）
    let ts = new Date(now.getFullYear(), +m[1] - 1, +m[2], +m[3], +m[4]).getTime();
    if (ts > now.getTime()) ts = new Date(now.getFullYear() - 1, +m[1] - 1, +m[2], +m[3], +m[4]).getTime();
    return ts;
  }
  return null;
}

let lastSid = '';
function scan() {
  // 清理只在回答行内做（原来全档删标注再重注，长会话白扫白写）：
  // 行内旧标注与旧版本格式（标题前缀“本轮/”Turn“）的标注一并清
  const clearRow = (row) => {
    for (const el of row.querySelectorAll('[data-zcodepro-turn-span], span[title^="本轮"], span[title^="Turn"]')) el.remove();
    delete row.dataset.zcodeproTurn;
  };
  const rows = findRows().sort((a, b) => a.ts - b.ts); // 可见行按时间升序
  // 清理放在 enabled 判定之前：关闭统计开关后残留的标注也能被清掉
  if (!enabled) {
    for (const r of rows) clearRow(r.row);
    return;
  }
  // 会话切换瞬间：旧会话的桶还留在 recentTurns 里，若继续归属会把别的会话
  // 的调用安到新视图的旧回答上——先清掉并立即重拉（拉到前只清不注）
  const sid = currentSessionId();
  if (sid !== lastSid) {
    lastSid = sid;
    rounds = [];
    for (const r of rows) clearRow(r.row);
    void tick();
    return;
  }
  if (document.hidden || !rounds.length) {
    for (const r of rows) clearRow(r.row);
    return;
  }
  // 区间归属：每条回答拥有“自己的提问时刻 ≤ 桶完成时刻 < 下一条提问时刻”
  // 的全部调用（一轮可能跨多个分钟）；最后一条收到其后所有桶（进行中的轮）。
  // 行集是虚拟列表的可见窗口，同一条回答的邻居行在场时归属稳定
  const agg = rows.map(() => ({ in: 0, out: 0, cacheRead: 0, tpsOut: 0, genMs: 0 }));
  const dayOf = (t) => { const d = new Date(t); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };
  for (const b of rounds) {
    let owner = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].ts <= b.at) owner = i;
      else break;
    }
    if (owner < 0) continue; // 比窗口里最早的行还早：不属于可见任何一条
    // 同日约束：跨天的请求不归属（昨天的旧行不吞今天的调用——今天的提问
    // 行可能只是不在当前虚拟列表窗口里）
    if (dayOf(rows[owner].ts) !== dayOf(b.at)) continue;
    agg[owner].in += b.in;
    agg[owner].out += b.out;
    agg[owner].cacheRead += b.cacheRead;
    if (b.genMs) { agg[owner].tpsOut += b.out; agg[owner].genMs += b.genMs; }
  }
  for (let i = 0; i < rows.length; i++) {
    if (agg[i].in + agg[i].out > 0) injectRow(rows[i].row, agg[i]);
    else clearRow(rows[i].row); // 归属变空（窗口移动等）：撤掉旧标注
  }
}

let tickSeq = 0;
async function tick() {
  if (!enabled || document.hidden) return;
  const sid = currentSessionId();
  const seq = ++tickSeq;
  const res = await rpc('/stats/turns' + (sid ? '?session=' + encodeURIComponent(sid) : '')).catch(() => null);
  if (res && res.ok && Array.isArray(res.rounds)) {
    // 乱序的在途响应不采纳，且取数期间换了会话就丢弃（旧会话的请求
    // 不能安到新视图的回答行上）——与 status-bar 的 tickSeq 守卫同款
    if (seq !== tickSeq || sid !== currentSessionId()) return;
    // 官方明细随请求完成增长，全量替换
    rounds = res.rounds;
    scan();
  }
}

export function startTurnUsage() {
  void getConfig().then((cfg) => { enabled = cfg.features ? cfg.features.statusBar !== false : true; }).catch(() => {});
  refreshTurnItems();
  window.addEventListener('zcodepro:config-changed', () => {
    void getConfig().then((cfg) => {
      enabled = cfg.features ? cfg.features.statusBar !== false : true;
      scan(); // 开关变化后立即重扫：关掉时清残留标注
    }).catch(() => {});
    refreshTurnItems();
  });
  // 回答行出现即注入（去抖）；数据 5 秒刷新一次
  const observer = new MutationObserver(() => {
    if (scanTimer) return;
    scanTimer = setTimeout(() => { scanTimer = 0; scan(); }, 1200); // 滚动/复用渲染稳定后再注
  });
  observer.observe(document.body, { childList: true, subtree: true });
  setInterval(() => { void tick(); }, 5000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void tick(); });
}
