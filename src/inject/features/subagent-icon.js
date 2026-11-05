// 子代理运行提示：任务行图标位空着（没有错误/加载图标）时挂机器人图标，
// 折叠的项目行把 folder 换成同款机器人——表示该会话/项目里有子代理在跑。侧栏
// 只显示会话级的运行状态，后台子代理跑着的时候会话行一片安静，看不出还在执行。
// 后台跑的是终端命令（不是子代理）时挂终端图标；两者同时在跑优先机器人。
// 未读圆点不跟"还在跑"抢位：圆点让位到行尾常显（归档/自动重命名等悬浮操作区
// 之前），行首留给机器人（回合空闲但子代理在跑）或转圈（回合运行中）。应用自身
// 的图标优先级是 错误 > 未读 > 加载（fat()），未读会把运行中的转圈盖成圆点——
// 这里在"未读盖住运行中"时补回转圈（克隆官方 loader），保证运行中恒为转圈。
// 后台任务清单来自 helper 的 /background-bash（进程握着的任务日志文件反查会话，
// 纯文件系统扫描）。不能用会话快照（getTaskSnapshot）：出快照会把会话 resume
// 起来，逐会话轮询快照曾造成整夜 6600 次/小时 resume、会话内存暴涨。
// 信号：子代理子会话写入 CLI 会话库的活动时间（/subagent-children，含嵌套子代理，
// 由 host 查库）。不用应用 zcodeAgentService 的运行列表判活——它两头都不可靠：
// 长跑子代理跑着跑着会被误记为失败/结束（实测 48 分钟、60 分钟的都中过招），
// 崩溃/中断残留的又永远挂"运行中"（实测残留数月）。子代理运行时消息不断写入
// 会话库，超过 60 分钟无动静视为僵死不亮（单个长工具调用可静默 20 分钟上下，
// 取 60 分钟留足余量）；应用的"结束"记录不早于最后活动时可信，用来让刚结束的
// 图标立刻熄灭，被误记结束但还在写的照常亮。
// 折叠项目的会话清单从任务索引反查（/workspace-sessions，最近更新的 30 个、
// 7 天内有动静）；任务行在场时直接用行键里的会话 id。项目行的根路径优先按
// data-project-id 从 /projects-v2 反查（多目录项目全部 root 都算；页面重载后
// 行键缓存为空也能拿到），拿不到再退回行键里记住的那条路径。
// 查询卡死防护：单个工作区的进程被回收后重启时，服务调用可能挂住很久——
// 每个调用都加超时，tick 整体另有兜底解锁，一个卡住的查询不再堵死后续刷新
//（曾致图标整段不亮）。
// ws-running 的旋转 loader 优先：项目行在转就是会话级的运行，机器人不抢位。
// 开关：helper subagentIcon（默认 true）。
import { rpc, getConfig, t } from '../core.js';
import { findServices, iconHolderOf, wsHead } from './ws-running.js';
import { projectRows, rowPath } from './ws-rows.js';

let installed = false;
let enabled = true;

const POLL_MS = 20_000;          // 全量刷新周期
const ACTIVITY_FRESH_MS = 60 * 60_000; // 子会话无活动超过此时长视为僵死
const WS_CANDIDATES_TTL_MS = 5 * 60_000; // 折叠项目会话清单 / 项目根路径缓存
const APPLY_DEBOUNCE_MS = 300;   // DOM 变动后按已知状态补上图标的去抖
const CALL_TIMEOUT_MS = 6_000;   // 单个服务/rpc 调用超时
const TICK_GUARD_MS = 30_000;    // tick 兜底解锁：超过此时长强制放行下一轮

const TASK_SEL = '[data-task-item-key]';
const ROBOT_CLASS = 'zcodepro-subagent-icon';
const TERMINAL_CLASS = 'zcodepro-terminal-icon';
const ROBOT_ON_CLASS = 'zcodepro-subagent-on';
const UNREAD_MOVED_CLASS = 'zcodepro-subagent-unread-moved';
const UNREAD_TAIL_CLASS = 'zcodepro-subagent-unread-tail';
const UNREAD_IGNORE_CLASS = 'zcodepro-unread-error-only';
const BUSY_LOADER_CLASS = 'zcodepro-busy-loader';

// —— 图标 ——

// lucide bot（取自应用自带图标集）；优先克隆页面上官方 bot 图标（形状/粗细
// 自动跟随应用版本），找不到再用内置图形
const BOT_FALLBACK = [
  ['path', { d: 'M12 8V4H8' }],
  ['rect', { width: '16', height: '12', x: '4', y: '8', rx: '2' }],
  ['path', { d: 'M2 14h2' }],
  ['path', { d: 'M20 14h2' }],
  ['path', { d: 'M15 13v2' }],
  ['path', { d: 'M9 13v2' }],
];
function makeBotSvg(baseClass) {
  const ns = 'http://www.w3.org/2000/svg';
  const proto = document.querySelector(`svg.lucide-bot:not(.${ROBOT_CLASS})`);
  if (proto) {
    const clone = proto.cloneNode(true);
    const orig = proto.getAttribute('class') || '';
    // 保留尺寸/颜色类，其余（动画等）不带
    const keep = orig.split(/\s+/).filter((c) => /^(size-|text-)/.test(c)).join(' ');
    clone.setAttribute('class', ((keep || baseClass || 'size-4') + ' ' + ROBOT_CLASS).trim());
    clone.setAttribute('title', t().subagentRobotTip);
    return clone;
  }
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', ((baseClass || 'size-4') + ' ' + ROBOT_CLASS).trim());
  svg.setAttribute('title', t().subagentRobotTip);
  for (const [tag, attrs] of BOT_FALLBACK) {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.append(el);
  }
  return svg;
}

// —— 应用到行 ——

// 任务行图标位（li 首个 div 里的 span[aria-hidden]，与 ws-running 的 isRunningRow
// 同一假设）：错误/未读/加载图标是应用渲染的，机器人只补空位
function rowIconSlot(row) {
  return row.firstElementChild && row.firstElementChild.querySelector(':scope > span[aria-hidden]');
}

// 补挂的转圈（未读把官方转圈盖住时用）：克隆页面上官方 loader，找不到用内置
// lucide loader 多段短辐条图形；样式同官方 size-4，自带 animate-spin
const LOADER_FALLBACK_PATHS = [
  'M12 2v4', 'm16.2 7.8 2.9-2.9', 'M18 12h4', 'm19.8 16.2-2.9 2.9',
  'M12 18v4', 'm7.8 19.8-2.9-2.9', 'M6 12H2', 'm4.2 7.8 2.9-2.9',
];
// 终端图标（lucide terminal）：优先克隆页面上官方图标，找不到用内置图形
const TERMINAL_FALLBACK = [
  ['path', { d: 'm4 17 6-6-6-6' }],
  ['path', { d: 'M12 19h8' }],
];
function makeTerminalIcon() {
  const ns = 'http://www.w3.org/2000/svg';
  const proto = document.querySelector(`svg.lucide-terminal:not(.${TERMINAL_CLASS}), svg.lucide-square-terminal:not(.${TERMINAL_CLASS})`);
  if (proto) {
    const clone = proto.cloneNode(true);
    const orig = proto.getAttribute('class') || '';
    const keep = orig.split(/\s+/).filter((c) => /^(size-|text-)/.test(c)).join(' ');
    clone.setAttribute('class', ((keep || 'size-4 text-foreground-subtle') + ' ' + TERMINAL_CLASS).trim());
    clone.setAttribute('title', t().subagentTermTip);
    return clone;
  }
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', `size-4 text-foreground-subtle ${TERMINAL_CLASS}`);
  svg.setAttribute('title', t().subagentTermTip);
  for (const [tag, attrs] of TERMINAL_FALLBACK) {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.append(el);
  }
  return svg;
}

function makeBusyLoader() {
  const ns = 'http://www.w3.org/2000/svg';
  const proto = document.querySelector(`svg.lucide-loader:not(.${BUSY_LOADER_CLASS})`);
  if (proto) {
    const clone = proto.cloneNode(true);
    const orig = proto.getAttribute('class') || '';
    const keep = orig.split(/\s+/).filter((c) => /^(size-|text-)/.test(c)).join(' ');
    clone.setAttribute('class', ((keep || 'size-4 text-foreground-subtle') + ` animate-spin ${BUSY_LOADER_CLASS}`).trim());
    return clone;
  }
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', `size-4 text-foreground-subtle animate-spin ${BUSY_LOADER_CLASS}`);
  for (const d of LOADER_FALLBACK_PATHS) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

function updateRow(row, sub, busy, term) {
  const slot = rowIconSlot(row);
  if (!slot) return;
  const unread = !!slot.querySelector('[data-unread-indicator]');
  // 槽位里除未读圆点外的官方图标（错误点/官方转圈）在位时不干预
  const hasBlocking = [...slot.children].some(
    (c) => !c.classList.contains(ROBOT_CLASS) && !c.classList.contains(BUSY_LOADER_CLASS)
      && !c.classList.contains(TERMINAL_CLASS) && !c.hasAttribute('data-unread-indicator'));
  // 官方把槽位藏起来的场景（置顶行 hover 显示图钉、移动中高亮）不挂
  const hidden = slot.classList.contains('hidden') || slot.classList.contains('invisible');
  const ok = !hasBlocking && !hidden;
  // 图标优先级：运行中恒转圈 > 子代理机器人 > 后台终端
  const wantLoader = ok && busy && unread;
  const wantRobot = ok && sub && !busy;
  const wantTerm = ok && term && !busy && !wantRobot;
  const curRobot = slot.querySelector(`:scope > svg.${ROBOT_CLASS}`);
  if (wantRobot && !curRobot) slot.append(makeBotSvg('size-4 text-foreground-subtle'));
  else if (!wantRobot && curRobot) curRobot.remove();
  const curTerm = slot.querySelector(`:scope > svg.${TERMINAL_CLASS}`);
  if (wantTerm && !curTerm) slot.append(makeTerminalIcon());
  else if (!wantTerm && curTerm) curTerm.remove();
  const curLoader = slot.querySelector(`:scope > svg.${BUSY_LOADER_CLASS}`);
  if (wantLoader && !curLoader) slot.append(makeBusyLoader());
  else if (!wantLoader && curLoader) curLoader.remove();
  // 蓝点搬家：机器人/终端/补挂转圈在场时原点隐藏（CSS），行尾挂常显复制品
  const moveUnread = (wantRobot || wantLoader || wantTerm) && unread;
  row.classList.toggle(UNREAD_MOVED_CLASS, moveUnread);
  let tail = row.querySelector(`:scope > .${UNREAD_TAIL_CLASS}`);
  if (moveUnread) {
    if (!tail) {
      tail = document.createElement('span');
      tail.className = UNREAD_TAIL_CLASS;
      tail.setAttribute('aria-hidden', 'true');
      const dot = document.createElement('span');
      dot.className = 'size-[7px] rounded-full bg-icon-blue';
      tail.append(dot);
    }
    // 悬浮操作区（归档/自动重命名）是悬停才渲染的，插在它前面（没有就挂行尾），
    // 悬停后操作区追加在点后面，顺序不变
    row.insertBefore(tail, row.querySelector(':scope > [data-task-row-actions]') || null);
  } else if (tail) {
    tail.remove();
  }
}

// 折叠项目行：folder 换机器人/终端（folder 的隐藏由 CSS 完成，React 重建 folder
// 也被规则罩住）。ws-running 的 loader 在转时不挂，两个图标不挤一个位置；机器人优先
function setProjectIcon(row, robotOn, termOn) {
  const icon = iconHolderOf(row);
  if (!icon) return;
  const loaderSpins = icon.classList.contains('zcodepro-ws-running')
    || !!icon.querySelector(':scope > svg.zcodepro-ws-loader');
  const wantRobot = robotOn && !loaderSpins;
  const wantTerm = termOn && !loaderSpins && !wantRobot;
  icon.classList.toggle(ROBOT_ON_CLASS, wantRobot || wantTerm);
  const curRobot = icon.querySelector(`:scope > svg.${ROBOT_CLASS}`);
  if (wantRobot && !curRobot) icon.append(makeBotSvg());
  else if (!wantRobot && curRobot) curRobot.remove();
  const curTerm = icon.querySelector(`:scope > svg.${TERMINAL_CLASS}`);
  if (wantTerm && !curTerm) icon.append(makeTerminalIcon());
  else if (!wantTerm && curTerm) curTerm.remove();
}

// —— 状态维护 ——

let ticking = false;
let liveSessions = new Set();   // 有子代理在跑的会话 id
let liveByWs = new Set();       // 同上会话所在工作区（归一后），项目行聚合用
let busySessions = new Set();   // 回合运行中（应用活跃列表）的会话 id
let liveTermSessions = new Set(); // 有后台终端命令在跑的会话 id
let liveTermByWs = new Set();     // 同上会话所在工作区（归一后），项目行聚合用
let projectTrueUnread = new Map(); // 项目 id → 真未读任务数（未读但排除错误态）
const wsCandidatesCache = new Map(); // 工作区路径 → { at, ids }
let projRootsCache = { at: 0, map: null }; // 项目 id → [根路径]

function normWs(v) {
  return String(v || '').replace(/[\\/]+$/, '');
}

// 超时包装：慢调用按 fallback 放行，迟到的错误不冒泡
function withTimeout(p, ms, fallback) {
  const guarded = Promise.resolve(p).catch(() => fallback);
  return Promise.race([guarded, new Promise((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

// 项目 id → 全部根路径（/projects-v2）：折叠项目行拿不到行键路径时按 id 反查，
// 多目录项目每个 root 都查
async function projRoots() {
  if (projRootsCache.map && Date.now() - projRootsCache.at < WS_CANDIDATES_TTL_MS) return projRootsCache.map;
  const res = await withTimeout(rpc('/projects-v2'), CALL_TIMEOUT_MS, null);
  const map = new Map();
  if (res && res.ok && res.available !== false && Array.isArray(res.projects)) {
    for (const proj of res.projects) {
      const id = String(proj.id || '');
      const paths = (proj.roots || []).map((r) => String(r.path || '')).filter(Boolean);
      if (id && paths.length) map.set(id, paths);
    }
  }
  projRootsCache = { at: Date.now(), map };
  return map;
}

function projectPathsOf(row, roots) {
  const id = row.getAttribute && row.getAttribute('data-project-id');
  const byId = id && roots && roots.get(id);
  if (byId && byId.length) return byId;
  const p = rowPath(row);
  return p ? [p] : [];
}

// 折叠项目的会话清单：行折叠后会话 id 不在 DOM 里，从任务索引反查
async function wsCandidates(ws) {
  const c = wsCandidatesCache.get(ws);
  if (c && Date.now() - c.at < WS_CANDIDATES_TTL_MS) return c.ids;
  const res = await withTimeout(rpc('/workspace-sessions?path=' + encodeURIComponent(ws)), CALL_TIMEOUT_MS, null);
  const ids = res && res.ok && Array.isArray(res.ids) ? res.ids : [];
  wsCandidatesCache.set(ws, { at: Date.now(), ids });
  return ids;
}

async function tick() {
  if (!enabled || document.hidden || ticking) return;
  ticking = true;
  // 兜底解锁：卡死的查询不让后续刷新永远排队
  const guard = setTimeout(() => { ticking = false; }, TICK_GUARD_MS);
  try {
    const services = findServices();
    const ag = services && services.zcodeAgentService;
    if (!ag) return;
    // 候选会话：在场任务行（行键 <工作区路径>:<会话 id>）+ 折叠项目的会话清单
    const candidates = new Map(); // 会话 id → 工作区路径
    for (const el of document.querySelectorAll(TASK_SEL)) {
      const key = el.getAttribute('data-task-item-key') || '';
      const cut = key.lastIndexOf(':');
      if (cut > 1) candidates.set(key.slice(cut + 1), key.slice(0, cut));
    }
    const roots = await projRoots();
    const collapsedRows = projectRows().filter((row) => {
      const head = wsHead(row);
      return !!head && head.getAttribute('aria-expanded') === 'false';
    });
    const wsPaths = collapsedRows.flatMap((row) => projectPathsOf(row, roots));
    const wsLists = await Promise.all(wsPaths.map((p) => wsCandidates(p)));
    wsLists.forEach((ids, i) => {
      for (const id of ids) {
        if (!candidates.has(id)) candidates.set(id, wsPaths[i]);
      }
    });
    // 子代理清单（含嵌套，根归属原会话）与会话库里的最近活动时间：判活的主信号。
    // 应用自己的运行记录两头都不可靠（长跑子代理被误记为结束、崩溃残留的挂
    // "运行中"），只借它的"结束"记录尽快收掉刚结束的图标——结束记录不早于
    // 最后活动才采信，被误记结束但还在写的子代理照常亮（晚亮不早灭）
    const childRes = await withTimeout(
      rpc('/subagent-children?ids=' + encodeURIComponent([...candidates.keys()].join(','))),
      CALL_TIMEOUT_MS, null);
    // 结束记录只对"名下真有子代理"的会话有意义（收刚结束的图标），没子代理的
    // 会话不必逐个查——这是每轮 × 全部会话的主要调用量
    const rootsWithKids = new Set(((childRes && childRes.children) || []).map((c) => c.root));
    const endedLists = await Promise.all([...candidates].filter(([sid]) => rootsWithKids.has(sid)).map(async ([sid, ws]) => {
      const r = await withTimeout(
        ag.listSessionSubagents({ workspacePath: ws, sessionId: sid, endedLimit: 20 }),
        CALL_TIMEOUT_MS, null);
      return (r && r.ended && r.ended.items) || [];
    }));
    const endedAt = new Map(); // 子会话 id → 最新结束时间
    for (const items of endedLists) {
      for (const e of items) {
        const id = e && e.childSessionId;
        if (id) endedAt.set(id, Math.max(endedAt.get(id) || 0, Number(e.endedAt) || 0));
      }
    }
    const now = Date.now();
    const live = new Set();
    const liveWs = new Set();
    for (const c of (childRes && childRes.children) || []) {
      const at = Number(c.at) || 0;
      if (!(at > 0 && now - at <= ACTIVITY_FRESH_MS)) continue;
      const end = endedAt.get(c.id) || 0;
      if (end && end >= at) continue; // 结束记录不早于最后活动 = 真结束了
      live.add(c.root);
      const ws = candidates.get(c.root);
      if (ws) liveWs.add(normWs(ws));
    }
    liveSessions = live;
    liveByWs = liveWs;
    // 运行中判定（运行中恒转圈用）：只查"有子代理或未读圆点"的行所在工作区，
    // 会话在应用的活跃列表里（阶段非终态）就算运行中；两种尾分隔符都查
    const ts = services && services.zcodeTaskService;
    const busy = new Set();
    if (ts && typeof ts.listActiveTaskIds === 'function') {
      const needBusyWs = new Set();
      for (const el of document.querySelectorAll(TASK_SEL)) {
        const key = el.getAttribute('data-task-item-key') || '';
        const cut = key.lastIndexOf(':');
        const sid = cut > 1 ? key.slice(cut + 1) : '';
        const slot = rowIconSlot(el);
        const unread = slot && slot.querySelector('[data-unread-indicator]');
        if (live.has(sid) || unread) needBusyWs.add(normWs(key.slice(0, cut)));
      }
      await Promise.all([...needBusyWs].flatMap((ws) => [ws, ws + '/'].map(async (w) => {
        const r = await withTimeout(ts.listActiveTaskIds({ workspacePath: w }), CALL_TIMEOUT_MS, null);
        if (Array.isArray(r)) for (const id of r) busy.add(String(id));
      })));
    }
    busySessions = busy;
    // 后台任务判定（终端图标）：helper 一次文件系统扫描（/background-bash）给出
    // 在跑的后台 bash 任务及其会话，bash 任务在跑才算终端（agent 任务归机器人管）。
    // 这里绝不能用会话快照——出快照会把会话 resume 起来（内存暴涨的元凶）
    const term = new Set();
    const termWs = new Set();
    const bbRes = await withTimeout(rpc('/background-bash'), CALL_TIMEOUT_MS, null);
    for (const j of (bbRes && bbRes.jobs) || []) {
      const sid = j && j.sessionId;
      if (!sid || !candidates.has(sid)) continue;
      term.add(sid);
      const ws = candidates.get(sid);
      if (ws) termWs.add(normWs(ws));
    }
    liveTermSessions = term;
    liveTermByWs = termWs;
    // 项目"真未读"（未读但排除错误态）：错误行显示红色错误点，它的未读不该再
    // 把项目行的蓝色未读徽标点亮（要忽略红色圆点）；查不到（ok=false）不干预
    const projIds = [...new Set(projectRows()
      .map((r) => r.getAttribute('data-project-id')).filter(Boolean))];
    if (projIds.length) {
      const pu = await withTimeout(
        rpc('/project-unread?ids=' + encodeURIComponent(projIds.join(','))),
        CALL_TIMEOUT_MS, null);
      if (pu && pu.ok && pu.unread) projectTrueUnread = new Map(Object.entries(pu.unread));
    }
    apply();
  } finally {
    clearTimeout(guard);
    ticking = false;
  }
}

function apply() {
  for (const el of document.querySelectorAll(TASK_SEL)) {
    const key = el.getAttribute('data-task-item-key') || '';
    const cut = key.lastIndexOf(':');
    const sid = cut > 1 ? key.slice(cut + 1) : '';
    updateRow(el, enabled && liveSessions.has(sid), busySessions.has(sid), enabled && liveTermSessions.has(sid));
  }
  const roots = projRootsCache.map;
  for (const row of projectRows()) {
    const head = wsHead(row);
    const collapsed = !!head && head.getAttribute('aria-expanded') === 'false';
    const paths = projectPathsOf(row, roots);
    setProjectIcon(row,
      enabled && collapsed && paths.some((p) => liveByWs.has(normWs(p))),
      enabled && collapsed && paths.some((p) => liveTermByWs.has(normWs(p))));
    // 项目蓝色未读徽标忽略错误行：未读全是错误态（真未读=0）时藏掉徽标
    const pid = row.getAttribute('data-project-id');
    row.classList.toggle(UNREAD_IGNORE_CLASS, enabled && pid !== null && projectTrueUnread.get(pid) === 0);
  }
}

// —— 配置与入口 ——

async function refreshConfig() {
  try {
    const cfg = await getConfig();
    const next = !!(cfg && cfg.features && cfg.features.subagentIcon !== false);
    if (next !== enabled) {
      enabled = next;
      apply(); // 关闭时把已挂的机器人清掉
    }
  } catch { /* helper 未就绪时保持现状 */ }
}

let applyDebounce = 0;
let tickThrottle = 0;

export function startSubagentIcon() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  void refreshConfig();
  void tick();
  setInterval(() => { void refreshConfig(); void tick(); }, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { void refreshConfig(); void tick(); } });
  // 行挂载/React 重建后按已知状态补上图标（不重查，重查留给周期 tick）；
  // 行内图标变动（未读圆点出现/消失、转圈切换）时 5 秒节流补一次重查，
  // 把状态切换的滞后从一个刷新周期压到几秒
  const observer = new MutationObserver((muts) => {
    let rowHit = false;
    let rowAdded = false;
    for (const m of muts) {
      if (m.type !== 'childList') continue;
      const t = m.target instanceof Element ? m.target : null;
      const added = [...m.addedNodes].filter((n) => n instanceof Element);
      if (added.some((n) => n.matches(TASK_SEL) || n.querySelector(TASK_SEL))) rowAdded = true;
      const touched = (t && t.closest(TASK_SEL))
        || added.some((n) => n.matches(TASK_SEL) || n.querySelector(TASK_SEL))
        || [...m.removedNodes].some((n) => n instanceof Element
          && (n.matches(TASK_SEL) || n.querySelector(TASK_SEL)));
      if (touched) rowHit = true;
    }
    // 行被 React 重建（点击换行序、重排等）时当场同帧补挂——回调先于绘制，
    // 图标不闪；否则要等去抖窗口，重建行会先露出应用自己的未读圆点
    if (rowAdded) apply();
    if (rowHit && !tickThrottle) {
      tickThrottle = setTimeout(() => { tickThrottle = 0; void tick(); }, 5_000);
    }
    if (applyDebounce) return;
    applyDebounce = setTimeout(() => { applyDebounce = 0; apply(); }, APPLY_DEBOUNCE_MS);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
