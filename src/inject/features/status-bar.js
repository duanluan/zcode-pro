// 状态栏统计：主界面底部右下角一行小字，按用户配置的顺序显示统计项。
// 会话项（上下文占用 / 提问次数）跟随当前会话，无选中会话时自动隐藏；
// 全局项（今日 / 累计 token、任务总数）优先取官方使用统计（云端，5 分钟刷新），
// 回退本地聚合。数据 2 秒刷新一次；上下文占用读官方输入框工具栏的窗口显示
//（“已用 497,101 / 总量 1,000,000”），按官方同款格式渲染。
import { t, rpc, getConfig, isZhLocale, DEFAULT_STATUS_ITEMS } from '../core.js';
import { ensureStyle } from '../ui.js';

let enabled = true;
let items = DEFAULT_STATUS_ITEMS.map((x) => ({ ...x }));
let barEl = null;
let lastStats = null; // /stats/usage 响应缓存（失败保旧值）
let lastRenderedHtml = null; // renderBar 去重：内容没变不重写 DOM

// —— 工具 ——

// 官方输入框工具栏的上下文显示：title 形如“上下文已用 61,400 / 总量 1,000,000”，
// 解析出已用与总量；读不到返回 null（ctx 项回退按会话记录估算 token 数）。
// 直接在全文档找（该显示全局唯一），排除自己渲染的 title
function readCtx() {
  for (const el of document.querySelectorAll('[title], [aria-label]')) {
    if (el.closest('.zcodepro-statusbar')) continue;
    const text = el.getAttribute('title') || el.getAttribute('aria-label') || '';
    if (!/上下文|context/i.test(text)) continue;
    // 格式为“已用 497,101 / 总量 1,000,000”：斜杠后可能带“总量”等文字再接数字
    const m = text.match(/([\d][\d,]*)\s*\/[^0-9]*([\d][\d,]*)/);
    if (!m) continue;
    const used = Number(m[1].replace(/,/g, ''));
    const size = Number(m[2].replace(/,/g, ''));
    if (used > 0 && size > used) return { used, size };
  }
  return null;
}

// 官方使用统计（设置 → 数据与统计 → 使用统计 的同款服务）：真累计/今日/任务数，
// 比本地 rollout 聚合完整。云端接口低频刷新（5 分钟一次），失败静默回退本地数据
let usageSvc = null;
let official = null; // { todayTokens, totalTokens, totalSessions }
let officialAt = 0;
// 从 React fiber 树遍历（newtab-panels.js 同款）
function eachFiber(visit) {
  const rootEl = document.getElementById('root');
  const key = rootEl && Object.keys(rootEl).find((k) => k.startsWith('__reactContainer$'));
  if (!key) return;
  let visited = 0;
  const walk = (f) => {
    if (!f || visited > 200000) return false;
    visited++;
    if (visit(f)) return true;
    return walk(f.child) || walk(f.sibling);
  };
  walk(rootEl[key]);
}

function findUsageService() {
  let found = null;
  const seen = new Set();
  const scan = (o) => {
    if (!o || typeof o !== 'object' || seen.has(o) || found) return;
    seen.add(o);
    if (typeof o.usageStatsService === 'object' && o.usageStatsService) { found = o.usageStatsService; return; }
    for (const v of Object.values(o)) if (v && typeof v === 'object') scan(v);
  };
  eachFiber((f) => {
    for (const h of [f.memoizedProps, f.memoizedState]) {
      if (!h || typeof h !== 'object') continue;
      scan(h);
      if (found) return true;
    }
    return false;
  });
  return found;
}
function refreshOfficial() {
  // 成功后 5 分钟刷新一次；尚未成功（页面刚加载服务未就绪等）30 秒重试，
  // 避免首次失败吃满冷却期
  const period = official ? 5 * 60_000 : 30_000;
  if (Date.now() - officialAt < period) return;
  officialAt = Date.now();
  void (async () => {
    try {
      if (!usageSvc) usageSvc = findUsageService();
      if (!usageSvc || typeof usageSvc.getAppUsageSnapshot !== 'function') return;
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const [all, d7] = await Promise.all([
        usageSvc.getAppUsageSnapshot({ range: 'all', timeZone }),
        usageSvc.getAppUsageSnapshot({ range: '7d', timeZone }),
      ]);
      const now = new Date();
      const key = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
      let todayTokens = 0;
      const day = ((d7 && Array.isArray(d7.dailyModelUsage)) ? d7.dailyModelUsage : []).find((d) => d.date === key);
      if (day) for (const m of day.models || []) todayTokens += Number(m.totalTokens) || 0;
      official = {
        todayTokens,
        totalTokens: Number(all && all.summary && all.summary.totalTokens) || 0,
        totalSessions: Number(all && all.summary && all.summary.totalSessions) || 0,
      };
      renderBar();
    } catch {
      usageSvc = null; // 服务失效（页面重载等），下个周期重挖
    }
  })();
}

// 全局组统计项（会话组之外的都算会话级）：两组之间渲染竖线分隔
const GLOBAL_GROUP = new Set(['todayTokens', 'totalTokens', 'tasks']);

// 各统计项的 lucide 图标（12px 内联，描边风格与官方一致）
const SB_ICONS = {
  ctx: '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
  asks: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  today: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  total: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
  tasks: '<rect x="3" y="5" width="6" height="6" rx="1"/><path d="m3 17 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
};
const sbIcon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="zcodepro-sb-icon">${SB_ICONS[name]}</svg>`;

function fmtTokens(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
}

// 数值格式与官方“上下文容量”显示一致：中文界面按数量级用“万/亿”
//（48.4万、900万、3.5亿），不足一万显示原数；其它语言沿用 k/M 缩写
function fmtNum(n) {
  if (!isZhLocale()) return fmtTokens(n);
  if (n < 10000) return String(n);
  if (n >= 100000000) {
    const yi = Math.round((n / 100000000) * 10) / 10;
    return (yi % 1 === 0 ? String(yi) : yi.toFixed(1)) + '亿';
  }
  const wan = Math.round((n / 10000) * 10) / 10;
  return (wan % 1 === 0 ? String(wan) : wan.toFixed(1)) + '万';
}

// —— 渲染 ——

// 生成一项的 { html, title, tone }；数据不可得返回 null（该项隐藏）。
// 每项 = 图标 + 短标签 + 数值（标签跟随界面语言），悬停 title 给全名与明细
function itemContent(id, L) {
  const g = lastStats && lastStats.global;
  const label = (text) => `<em>${text}</em>`;
  switch (id) {
    case 'ctx': {
      const dom = readCtx();
      if (dom) {
        const pct = Math.round((dom.used / dom.size) * 1000) / 10;
        const tone = pct >= 95 ? 'danger' : pct >= 80 ? 'warn' : '';
        return {
          html: sbIcon('ctx') + label(L.sbLabelCtx) + `<b>${fmtNum(dom.used)}/${fmtNum(dom.size)}${isZhLocale() ? '（' : '('}${pct}%${isZhLocale() ? '）' : ')'}</b>`,
          title: `${L.sbItemCtx}：${dom.used.toLocaleString()} / ${dom.size.toLocaleString()}`,
          tone,
        };
      }
      return null; // 官方窗口数据不在（视图切换间隙等）时该项隐藏
    }
    case 'questions': {
      // 官方“对话问题导航”的真实计数（当前会话的问题总数）
      const nav = document.querySelector('[data-testid="v4-turn-navigator"]');
      const n = nav ? Number(nav.getAttribute('data-item-count')) : 0;
      return n > 0 ? { html: sbIcon('asks') + label(L.sbLabelQuestions) + String(n), title: L.sbItemQuestions } : null;
    }
    case 'todayTokens': {
      const n = official ? official.todayTokens : (g ? g.todayTokens : 0);
      return n > 0 ? { html: sbIcon('today') + label(L.sbLabelToday) + fmtNum(n), title: L.sbItemTodayTokens } : null;
    }
    case 'totalTokens': {
      const n = official ? official.totalTokens : (g ? g.totalTokens : 0);
      return n > 0 ? { html: sbIcon('total') + label(L.sbLabelTotal) + fmtNum(n), title: L.sbItemTotalTokens } : null;
    }
    case 'tasks': {
      const n = official ? official.totalSessions : (g ? g.tasks : 0);
      return n > 0 ? { html: sbIcon('tasks') + label(L.sbLabelTasks) + String(n), title: L.sbItemTasks } : null;
    }
    default:
      return null;
  }
}

function renderBar() {
  // 3.16.1 的输入框是 contenteditable（旧版是 textarea），两种都认
  const ta = document.querySelector('textarea, [contenteditable=true]');
  const host = ta && (ta.closest('form') || ta.parentElement);
  if (!enabled || !host || !host.parentElement) {
    if (barEl) barEl.remove();
    barEl = null;
    lastRenderedHtml = null; // 元素没了，去重基线同步清空，重建后首渲染不被跳过
    return;
  }
  if (!barEl || !barEl.isConnected) {
    if (!barEl) {
      barEl = document.createElement('div');
      barEl.className = 'zcodepro-statusbar';
      lastRenderedHtml = null; // 新元素：内容基线作废
    }
    host.parentElement.insertBefore(barEl, host.nextSibling);
  }
  // 新建会话视图（无选中会话）下方是官方的功能按钮区，不能往下压：上下对称
  // 留 7px；普通会话视图下方是窗口底的官方留白，压进去贴底（同为约 7px）。
  // 按选中会话判定视图（按钮区与状态条不在同一父容器，兄弟判断不可用）
  const hasSession = !![...document.querySelectorAll('[data-task-item-key]')]
    .find((e) => (e.className + '').includes('bg-selected'));
  barEl.style.marginBottom = hasSession ? '-14px' : '0';
  barEl.style.paddingBottom = hasSession ? '0' : '7px';
  const L = t();
  const parts = [];
  let lastGroup = '';
  for (const it of items) {
    if (!it.on) continue;
    const c = itemContent(it.id, L);
    if (!c) continue;
    const group = GLOBAL_GROUP.has(it.id) ? 'g' : 's';
    // 会话项与全局项之间用竖线分隔（比项间的 · 更强的分界）
    if (lastGroup && group !== lastGroup) parts.push('<span class="zcodepro-statusbar-groupsep"></span>');
    lastGroup = group;
    parts.push(`<span title="${c.title.replace(/"/g, '&quot;')}"${c.tone ? ` data-tone="${c.tone}"` : ''}>${c.html}</span>`);
  }
  // 组内项之间用 ·，跨组竖线两侧不再叠加 ·
  const SEP = '<span class="zcodepro-statusbar-sep">·</span>';
  const GROUPSEP = '<span class="zcodepro-statusbar-groupsep"></span>';
  // 数值没变就不重写 DOM：每 2 秒 tick 全量重建会在流式渲染期持续触发布局
  //（CPU 剖析中 renderBar 是我们唯一上榜的函数）
  const html = parts.reduce((acc, p, i) => {
    if (i === 0) return p;
    if (p === GROUPSEP || parts[i - 1] === GROUPSEP) return acc + p;
    return acc + SEP + p;
  }, '');
  barEl.style.display = parts.length ? '' : 'none';
  if (html === lastRenderedHtml) return;
  lastRenderedHtml = html;
  barEl.innerHTML = html;
}

async function tick() {
  if (!enabled || document.hidden) return;
  refreshOfficial();
  // 全局项优先取官方快照（5 分钟一更）：就绪后不再每 2 秒拉本地聚合——
  // helper 侧聚合每次都要遍历全部 rollout 记录（稳态实测约 13ms/次），
  // 官方不可用（刚启动/接口失败）时才回退本地轮询
  if (!official) {
    const res = await rpc('/stats/usage').catch(() => null);
    if (res && res.ok) lastStats = res;
  }
  renderBar();
}

export function startStatusBar() {
  ensureStyle();
  const refreshCfg = () => {
    void getConfig().then((cfg) => {
      enabled = cfg.features ? cfg.features.statusBar !== false : true;
      const saved = cfg.statusBar && Array.isArray(cfg.statusBar.items) ? cfg.statusBar.items : null;
      if (saved) {
        // 保存的顺序为准（会话组在前已由设置保存时归一化；这里再归一化一次
        // 防御旧版本保存的交错顺序）；新版本新增的默认项按默认组位补齐
        const byId = new Map(saved.map((x) => [x.id, x]));
        const list = saved.filter((x) => DEFAULT_STATUS_ITEMS.some((d) => d.id === x.id)).map((x) => ({ ...x }));
        const known = new Set(list.map((x) => x.id));
        for (const d of DEFAULT_STATUS_ITEMS) {
          if (!known.has(d.id)) list.push({ ...d });
        }
        items = [
          ...list.filter((x) => !GLOBAL_GROUP.has(x.id)),
          ...list.filter((x) => GLOBAL_GROUP.has(x.id)),
        ];
      } else {
        items = DEFAULT_STATUS_ITEMS.map((x) => ({ ...x }));
      }
      renderBar();
    }).catch(() => {});
  };
  refreshCfg();
  window.addEventListener('zcodepro:config-changed', refreshCfg);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void tick(); });
  setInterval(() => { void tick(); }, 2000);
  // 视图切换（进新建会话、换会话等）时 DOM 变动立即重渲染（去抖 300ms）：
  // 否则状态条要等下一个 2 秒周期，期间残留上一个视图的统计项与间距
  let rerenderTimer = 0;
  new MutationObserver(() => {
    if (rerenderTimer) return;
    rerenderTimer = setTimeout(() => { rerenderTimer = 0; renderBar(); }, 300);
  }).observe(document.body, { childList: true, subtree: true });
}
