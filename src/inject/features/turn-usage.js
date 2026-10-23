// 每轮回答的 token 用量：在回答末尾操作按钮（复制/赞/踩/分叉/钩子）行的时间
// 后面追加“竖线 + 输入/输出/缓存”标注（段顺序与显隐可在设置里调）。
// 数据来自本地模型调用记录（helper 按本地分钟分桶），按“本条提问到下一条
// 提问”的区间归属到回答行；本地记录只保留最近一段，覆盖不到的旧回答不标注。
import { t, rpc, getConfig, isZhLocale } from '../core.js';

let enabled = true;
let recentTurns = []; // [{hm, in, out, cacheRead, ts}] 按时间倒序
let scanTimer = 0;
// 三段（输入/输出/缓存）的显隐与顺序：设置 → 样式 → 状态栏 → 每轮统计
let turnCfg = [
  { id: 'turnIn', on: true },
  { id: 'turnOut', on: true },
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
  down: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  cache: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px;vertical-align:-1.5px;opacity:.6">${ICONS[name]}</svg>`;

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
    return (wan % 1 === 0 ? String(wan) : wan.toFixed(1)) + '万';
  }
  return String(n);
}

// 回答操作行：按结构特征识别——回答行有赞/踩按钮（v4-feedback-），用户消息行
// 没有（只有复制/编辑），比时间文本稳（官方改时间格式不影响识别）。
// 行内时间文本只用于解析该轮的提问时刻
function findRows() {
  const rows = [];
  for (const btn of document.querySelectorAll('[data-testid^="v4-copy-"]')) {
    const row = btn.parentElement;
    if (!row || row.dataset.zcodeproTurn) continue;
    if (!row.querySelector('[data-testid^="v4-feedback-"]')) continue;
    const timeEl = [...row.querySelectorAll('span')].find((s) => /\d{1,2}:\d{2}$/.test((s.textContent || '').trim()));
    if (timeEl) { const ts = rowTimeTs((timeEl.textContent || '').trim()); if (ts != null) rows.push({ row, ts }); }
  }
  return rows;
}

// 当前会话 id：优先选中行，回退侧栏最新一行（与状态栏同口径）
function currentSessionId() {
  const rows = [...document.querySelectorAll('[data-task-item-key]')];
  const cur = rows.find((e) => (e.className + '').includes('bg-selected')) || rows[rows.length - 1];
  const key = cur ? cur.getAttribute('data-task-item-key') : '';
  const i = key.lastIndexOf(':sess');
  return i > 0 ? key.slice(i + 1) : '';
}

function injectRow(row, bucket) {
  row.dataset.zcodeproTurn = '1';
  if (!bucket || bucket.in + bucket.out <= 0) return;
  const L = t();
  const el = document.createElement('span');
  el.dataset.zcodeproTurnSpan = '1';
  el.className = 'select-none text-ui-sm text-foreground-subtlest';
  // 按钮行是 flex 容器：本元素作为子项会被压缩导致内容折行，锁成单行
  el.style.whiteSpace = 'nowrap';
  el.style.display = 'inline-flex';
  el.style.alignItems = 'center';
  el.style.gap = '4px'; // 组与 · 分隔之间的间距
  el.style.marginLeft = '10px'; // 与左侧时间拉开
  // 与状态栏同款：图标 + 文字 + 数据；缓存有量时给命中率
  // 保留两位小数：长上下文会话命中率普遍 99%+，取整会全部显示 100% 失真
  const cachePct = bucket.in > 0 && bucket.cacheRead > 0
    ? (bucket.cacheRead / bucket.in * 100).toFixed(2) : '';
  const group = (html) => `<span style="display:inline-flex;align-items:center;gap:2px">${html}</span>`;
  const em = (text) => `<em style="font-style:normal;opacity:.75">${text}</em>`;
  const DOT = '<span style="opacity:.45">·</span>'; // 与状态栏同款分隔
  // 段按设置保存的顺序渲染，段间用 ·；首段左侧竖线与底部状态栏的组分隔同款；
  // 全部隐藏时不注入（连竖线一起没有）
  const sections = [];
  for (const s of turnCfg) {
    if (!s.on) continue;
    if (s.id === 'turnIn') sections.push(group(icon('up') + em(L.sbLabelIn) + fmt(bucket.in)));
    else if (s.id === 'turnOut') sections.push(group(icon('down') + em(L.sbLabelOut) + fmt(bucket.out)));
    else if (s.id === 'turnCache' && cachePct) sections.push(group(icon('cache') + em(L.sbLabelCache) + cachePct + '%'));
  }
  if (!sections.length) { delete row.dataset.zcodeproTurn; el.remove(); return; }
  const VBAR = '<span style="display:inline-block;width:1px;height:10px;background:currentColor;opacity:.3;margin:0 5px"></span>';
  el.innerHTML = VBAR + sections.join(DOT);
  el.title = `${L.turnUsageTitle}：${L.sbLabelIn} ${bucket.in.toLocaleString()} / ${L.sbLabelOut} ${bucket.out.toLocaleString()}`
    + (bucket.cacheRead > 0 ? ` / ${L.sbLabelCache} ${bucket.cacheRead.toLocaleString()}` : '');
  row.append(el); // 追加在按钮行末尾（时间之后）
}

// 回答行时间文本 → 当年本地时间的时间戳（毫秒）。
// 官方三种形态：今天“18:16”、昨天“昨天 18:16”、更早“10/21 17:41”。
// 行时间是提问时刻，调用桶是完成时刻——一轮的用量按“本条提问到下一条
// 提问之间”的区间归属（见 scan），因此这里只取可比时间戳
function rowTimeTs(text) {
  const now = new Date();
  let m = text.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return new Date(now.getFullYear(), now.getMonth(), now.getDate(), +m[1], +m[2]).getTime();
  m = text.match(/^昨天\s*(\d{1,2}):(\d{2})$/);
  if (m) { const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1); return new Date(y.getFullYear(), y.getMonth(), y.getDate(), +m[1], +m[2]).getTime(); }
  m = text.match(/^(\d{1,2})\/(\d{1,2})\s*(\d{1,2}):(\d{2})$/);
  if (m) return new Date(now.getFullYear(), +m[1] - 1, +m[2], +m[3], +m[4]).getTime();
  return null;
}

let lastSid = '';
function scan() {
  if (!enabled) return;
  // 会话切换瞬间：旧会话的桶还留在 recentTurns 里，若继续归属会把别的会话
  // 的调用安到新视图的旧回答上——先清掉并立即重拉（拉到前只清不注）
  const sid = currentSessionId();
  if (sid !== lastSid) {
    lastSid = sid;
    recentTurns = [];
    void tick();
  }
  // 每轮重算：先移除上一次注入的标注并清行标记（进行中的轮数值会增长）；
  // 按标题前缀一并清掉旧版本格式的标注
  for (const el of document.querySelectorAll('[data-zcodepro-turn-span], span[title^="本轮"], span[title^="Turn"]')) el.remove();
  for (const row of document.querySelectorAll('[data-zcodepro-turn]')) delete row.dataset.zcodeproTurn;
  if (document.hidden || !recentTurns.length) return;
  const rows = findRows().sort((a, b) => a.ts - b.ts); // 可见行按时间升序
  if (!rows.length) return;
  // 区间归属：每条回答拥有“自己的提问时刻 ≤ 桶完成时刻 < 下一条提问时刻”
  // 的全部调用（一轮可能跨多个分钟）；最后一条收到其后所有桶（进行中的轮）。
  // 行集是虚拟列表的可见窗口，同一条回答的邻居行在场时归属稳定
  const agg = rows.map(() => ({ in: 0, out: 0, cacheRead: 0 }));
  const dayOf = (t) => { const d = new Date(t); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };
  for (const b of recentTurns) {
    let owner = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].ts <= b.ts) owner = i;
      else break;
    }
    if (owner < 0) continue; // 比窗口里最早的行还早：不属于可见任何一条
    // 同日约束：跨天的桶不归属（昨天的旧行不吞今天的调用——今天的提问
    // 行可能只是不在当前虚拟列表窗口里）
    if (dayOf(rows[owner].ts) !== dayOf(b.ts)) continue;
    agg[owner].in += b.in;
    agg[owner].out += b.out;
    agg[owner].cacheRead += b.cacheRead;
  }
  for (let i = 0; i < rows.length; i++) {
    if (agg[i].in + agg[i].out > 0) injectRow(rows[i].row, agg[i]);
  }
}

async function tick() {
  if (!enabled || document.hidden) return;
  const sid = currentSessionId();
  const res = await rpc('/stats/usage' + (sid ? '?session=' + encodeURIComponent(sid) : '')).catch(() => null);
  if (res && res.ok && Array.isArray(res.recentTurns)) {
    // 同分钟桶随时间增长，全量替换
    recentTurns = res.recentTurns;
    scan();
  }
}

export function startTurnUsage() {
  void getConfig().then((cfg) => { enabled = cfg.features ? cfg.features.statusBar !== false : true; }).catch(() => {});
  refreshTurnItems();
  window.addEventListener('zcodepro:config-changed', () => {
    void getConfig().then((cfg) => { enabled = cfg.features ? cfg.features.statusBar !== false : true; }).catch(() => {});
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
