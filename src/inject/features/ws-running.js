// 折叠项目运行提示：项目折叠后，若其中仍有会话在运行，项目图标旋转提示，
// 全部结束或项目展开后恢复静止。应用本身没有跨折叠的运行信号——运行状态只
// 体现在侧栏已挂载会话行的 loader 图标上，项目一折叠这些行就被卸载
// （任务索引库、窗口标题、window.zcode 桥均不实时，实测确认），因此分三层：
// 1) 扫描在场的会话行，维护“工作区 → 运行中会话键”；
// 2) 折叠瞬间从 MutationObserver 的 removedNodes 读各行 loader（已移除的节点
//    仍可查询），把最后状态并入表：折叠保留、展开着的移除视为任务被删；
// 3) 对标记运行中的折叠项目做“无感探查”复核：点项目行展开（应用的该点击会
//    把主视图切到该项目，故点完立刻同帧点回当前会话行，两次提交都在绘制前
//    完成、视图与选中不受影响），新增的会话行由 style 元素按会话键前缀
//    display:none（挂载当帧即生效，不依赖观察器时序与列表容器结构——应用
//    3.14.4 已无旧代码依赖的 empty:hidden 容器），原项目行用 position:fixed
//    冻结克隆盖住，读完后收起、等行真正卸载再撤隐藏（收起后行有数百毫秒的
//    卸载延迟，提前撤隐藏会让行在收起瞬间闪现）。单次约 0.3 秒。
// 探查调度：只在“捕获到运行中”后复核（20 秒首查、其后每 60 秒）。不做启动
// 普查：应用重启后所有会话本就处于停止状态，无运行可发现；且启动期界面还在
// 恢复，探查会打扰（实测首启会出现项目逐个展开又收起的干扰）。
// alt+r“运行中”列表另有一路权威来源：全局扫描（globalAnyActive）确认的活跃
// 会话直接并入运行键集合（wsRunningKeys）——折叠期间启动、刷新后仍折叠的
// 会话行从未在场，上面的 DOM 三层机制都看不到它们。
// 开关：helper wsRunningSpin（默认 true）。
import { rpc } from '../core.js';
import { projectRows, findProjectRow, rowPath, projectRowSelector } from './ws-rows.js';

let installed = false;
let enabled = true;

const SCAN_DEBOUNCE_MS = 150;   // 相关 DOM 变动后的去抖
const SCAN_FALLBACK_MS = 5000;  // 兜底轮询周期（观察器覆盖不到的路径）
const PEEK_FIRST_MS = 20000;    // 折叠捕获到运行后的首次复核
const PEEK_REPEAT_MS = 60000;   // 仍运行中的复核间隔
const PEEK_SETTLE_MS = 160;     // 行数连续两次采样相同视为渲染完成
const PEEK_MAX_MS = 1500;       // 单次探查兜底（行始终没出现 = 项目无会话）
const PEEK_UNMOUNT_WAIT_MS = 800; // 收起后等行真正卸载的最长时间（实测约 0.4 秒）

const CONFIG_POLL_MIN_MS = 5000;   // 配置未变化时逐次拉长轮询间隔，减轻常驻开销
const CONFIG_POLL_MAX_MS = 60000;

const TASK_SEL = '[data-task-item-key]';
// 项目行选择器双结构（3.15.x 旧 testid 行 / 3.16.1 起 section[data-project-id]）
const WS_SEL = () => projectRowSelector();

function findWsRow(ws) {
  return findProjectRow(ws);
}

// 折叠且运行中时，项目图标换成与任务行运行中同款的 loader（lucide 圆弧 +
// 应用自带的 animate-spin 类，旋转速度与任务行完全一致）；结束后还原 folder。
// React 重渲染会重建 folder svg，apply 周期（观察器 + 兜底轮询）会重新换上
// 与任务行同款 loader：优先克隆页面上官方 loader 图标（形状/粗细/段数自动跟随
// 应用版本），找不到再用内置的 lucide loader 多段短辐条图形（不是单圆弧）
const LOADER_FALLBACK_PATHS = [
  'M12 2v4', 'm16.2 7.8 2.9-2.9', 'M18 12h4', 'm19.8 16.2-2.9 2.9',
  'M12 18v4', 'm7.8 19.8-2.9-2.9', 'M6 12H2', 'm4.2 7.8 2.9-2.9',
];
function makeLoaderSvg(baseClass) {
  const ns = 'http://www.w3.org/2000/svg';
  const proto = document.querySelector('svg.lucide-loader');
  if (proto) {
    const clone = proto.cloneNode(true);
    const origClass = proto.getAttribute('class') || '';
    // 保留尺寸/颜色类，去掉官方动画（显隐由我们控制，animate 统一自己加）
    const keep = origClass.split(/\s+/).filter((c) => /^(size-|text-)/.test(c)).join(' ');
    clone.setAttribute('class', ((keep || baseClass) + ' animate-spin zcodepro-ws-loader').trim());
    return clone;
  }
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', (baseClass + ' animate-spin zcodepro-ws-loader').trim());
  for (const d of LOADER_FALLBACK_PATHS) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
function setRunningIcon(holder, on) {
  if (!holder) return;
  if (on) {
    // folder 的隐藏由 CSS 完成（span.zcodepro-ws-running 类稳定，React 重建的
    // folder 也会被规则罩住）；这里只负责确保 loader 在场
    if (holder.querySelector(':scope > svg.zcodepro-ws-loader')) return;
    const orig0 = holder.querySelector(':scope > svg:not(.zcodepro-ws-loader)');
    const base = (orig0 ? (orig0.getAttribute('class') || '') : 'size-4').replace(/lucide-[a-z-]*/g, '').trim() || 'size-4';
    holder.append(makeLoaderSvg(base));
  } else {
    holder.querySelectorAll(':scope > svg.zcodepro-ws-loader').forEach((el) => el.remove());
  }
}

// 行首图标容器（旋转图标的挂点）：
// 旧结构：行.firstElementChild 里的 span；新结构：virtual-project-toggle 的首个 span（folder 图标容器）
function iconHolderOf(row) {
  if (row.hasAttribute && row.hasAttribute('data-project-id')) {
    const toggle = row.querySelector('[data-testid="virtual-project-toggle"]');
    return toggle ? toggle.querySelector(':scope > span') : null;
  }
  return row.firstElementChild && row.firstElementChild.querySelector(':scope > span');
}

// 运行中的行首图标是 loader；空闲行该位置为空或错误/未读圆点。只认行首图标位
// （旧结构为 span>svg 嵌套，新结构槽 span 直接含 svg，两者都在 firstElementChild 子树内）
function isRunningRow(el) {
  const scope = el.firstElementChild;
  if (!scope) return false;
  const svg = scope.querySelector('svg[class*="lucide-loader"]');
  return !!svg;
}

const runningByWs = new Map(); // 工作区路径（原样，来自会话键）→ Set(会话键)
const peekTimers = new Map();  // 工作区 → 复核定时器
const activePeeks = new Set(); // 正在探查的工作区
const peekedWs = new Set();    // 已探查过的项目：之后统一按复查节奏（探查自身的收起动作
                               // 也会触发一次折叠捕获，避免把节奏重置回首查间隔）
let wsWithRows = new Set();    // 最近一次扫描时仍有会话行在 DOM 的工作区

// —— 工具 ——

// 应用内部服务对象（含 zcodeTaskService.releaseWorkspacePreparation）：从 React
// fiber 树上找持有它的组件（file-menu.js 同款取 fiber 的思路），找到后缓存
let servicesRef = null;
export function findServices() {
  if (servicesRef) return servicesRef;
  try {
    const rootEl = document.getElementById('root');
    const containerKey = rootEl && Object.keys(rootEl).find((k) => k.startsWith('__reactContainer$'));
    if (!containerKey) return null;
    const seen = new Set();
    let found = null;
    const scanObj = (o) => {
      if (!o || typeof o !== 'object' || seen.has(o) || found) return;
      seen.add(o);
      const ts = o.zcodeTaskService;
      if (ts && typeof ts === 'object' && typeof ts.releaseWorkspacePreparation === 'function') found = o;
    };
    let visited = 0;
    const visit = (f) => {
      if (!f || found || visited > 60000) return;
      visited++;
      for (const holder of [f.memoizedProps, f.memoizedState]) {
        if (!holder || typeof holder !== 'object') continue;
        scanObj(holder);
        for (const v of Object.values(holder)) {
          if (v && typeof v === 'object') scanObj(v);
        }
      }
      visit(f.child);
      visit(f.sibling);
    };
    visit(rootEl[containerKey]);
    if (found) servicesRef = found;
    return found;
  } catch {
    return null;
  }
}

// 权威空闲判定：官方 zcodeTaskService.listActiveTaskIds 返回该工作区仍处非终态
// （运行/创建/流式等）的会话，来自 CLI 实时活动集合——比侧栏 DOM 的 loader 可靠
// （DOM 有“提交消息到 loader 渲染”与页面刷新后折叠项目的盲区，曾致误杀）。
// workspacePath 的尾斜杠形式必须与订阅时一致（roots 两种都有），两种各查一次。
// 返回 true=确认空闲、false=仍在运行、null=接口不可用或查询失败（按忙处理）
export async function authoritativeIdle(ws) {
  const services = findServices();
  const ts = services && services.zcodeTaskService;
  if (!ts || typeof ts.listActiveTaskIds !== 'function') return null;
  try {
    const base = String(ws).replace(/[\\/]+$/, '');
    const a = await ts.listActiveTaskIds({ workspacePath: base });
    const b = await ts.listActiveTaskIds({ workspacePath: base + '/' });
    const ids = [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].map(String);
    if (!Array.isArray(a) || !Array.isArray(b)) return null;
    if (!ids.length) return true;
    // 终态过滤与 globalAnyActive 同一判据：syncer 卡滞的已完成会话不算运行
    //（DB status 终态且近 5 分钟无更新 = 卡滞；有更新 = 复活在跑）
    const st = await rpc('/task-statuses?ids=' + encodeURIComponent(ids.join(','))).catch(() => null);
    const TERMINAL = new Set(['completed', 'error', 'interrupted']);
    const live = (id) => {
      const rec = st && st.ok && st.available ? st.statuses[id] : undefined;
      if (rec === undefined) return true;
      if (!TERMINAL.has(rec.status)) return true;
      return Date.now() - rec.updatedAt < 300_000;
    };
    return !ids.some(live);
  } catch {
    return null; // 方法不存在（≤3.15.x 的服务对象）或查询失败：一律按忙
  }
}


function workspaceOf(key) {
  // 会话键格式 <workspace_path>:<task_id>；task_id 有 sess_ 与 session_ 两种
  // 前缀（新版应用为 session_），不能按 ':sess_' 定位分隔符——取最后一个 ':'
  // （Windows 盘符路径的 ':' 在最前，id 段在最后且自身不含 ':'）
  const i = key.lastIndexOf(':');
  return i > 0 ? key.slice(0, i) : key;
}

function wsHead(row) {
  // 旧结构行容器自身带 aria-expanded；新结构在 virtual-project-toggle 按钮上
  return row.matches('[aria-expanded]') ? row : row.querySelector('[aria-expanded]');
}

function domRowsOf(ws) {
  return [...document.querySelectorAll(TASK_SEL)]
    .filter((e) => workspaceOf(e.getAttribute('data-task-item-key') || '') === ws);
}

// 当前选中的会话行（bg-selected 类，session-switch.js 同款标记）
function currentTaskRow() {
  for (const el of document.querySelectorAll(TASK_SEL)) {
    if ((el.className + '').includes('bg-selected')) return el;
  }
  return null;
}

const synthClick = (el) => {
  try { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); } catch { /* ignore */ }
};

// 无副作用的展开/收起：应用把项目行点击当作“切换到该项目”（实测当前会话会被
// 取消选中、主视图跳进该项目的新建任务）。点完项目行后立刻点回当前会话行，
// 两次提交都在浏览器绘制前完成——折叠照常生效，视图与选中状态不被带走。
// 还原行必须在点项目行之前就记住：点击会把当前行取消选中，事后再按选中标记
// 找就找不到了（3.14.4 实测，回点落空会把用户留在该项目的新会话页）；
// 元素被 React 重挂载时按记住的会话键重找
function toggleNavSafe(head) {
  const cur = currentTaskRow();
  const backKey = cur ? cur.getAttribute('data-task-item-key') : '';
  synthClick(head);
  if (!backKey) return;
  const back = (cur && cur.isConnected)
    ? cur
    : document.querySelector(`${TASK_SEL}[data-task-item-key="${CSS.escape(backKey)}"]`);
  if (back) synthClick(back);
}

// —— 状态维护 ——

function scan() {
  wsWithRows = new Set();
  for (const el of document.querySelectorAll(TASK_SEL)) {
    const key = el.getAttribute('data-task-item-key') || '';
    const ws = workspaceOf(key);
    if (!ws) continue;
    wsWithRows.add(ws);
    const run = isRunningRow(el);
    let set = runningByWs.get(ws);
    if (run) {
      if (!set) { set = new Set(); runningByWs.set(ws, set); }
      set.add(key);
    } else if (set) {
      set.delete(key);
    }
  }
  // 无条件复核探查调度：行从有到无（折叠/卸载）时 scan 本身看不到变化，
  // 但 wsWithRows 已更新，正是需要（重新）排复核的时机
  syncPeeks();
  apply();
}

// 折叠/收起移除会话行时，从被移除节点读最后状态（removedNodes 子树仍可查询）
function handleRemovals(muts) {
  const removed = [];
  for (const m of muts) {
    if (m.type !== 'childList') continue;
    for (const n of m.removedNodes) {
      if (!(n instanceof Element)) continue;
      if (n.matches(TASK_SEL)) removed.push(n);
      else for (const r of n.querySelectorAll(TASK_SEL)) removed.push(r);
    }
  }
  if (!removed.length) return;
  const infos = removed
    .map((el) => {
      const key = el.getAttribute('data-task-item-key') || '';
      const ws = workspaceOf(key);
      return key && ws ? { key, ws, run: isRunningRow(el) } : null;
    })
    .filter(Boolean);
  if (!infos.length) return;
  // 展开态判定等本批渲染全部完成后再做（aria-expanded 可能与行移除分两次提交）
  setTimeout(() => {
    for (const info of infos) {
      const row = findWsRow(info.ws);
      const head = row && wsHead(row);
      const collapsed = !row || !head || head.getAttribute('aria-expanded') === 'false';
      let set = runningByWs.get(info.ws);
      if (collapsed && info.run) {
        if (!set) { set = new Set(); runningByWs.set(info.ws, set); }
        set.add(info.key);
      } else if (set) {
        set.delete(info.key); // 展开着却被移除 = 任务被删/归档；折叠但已结束 = 清除
      }
    }
    syncPeeks();
    apply();
  }, 0);
}

// —— 应用到项目行 ——

function apply() {
  const seen = new Set();
  for (const row of document.querySelectorAll(WS_SEL())) {
    const path = rowPath(row);
    if (!path) continue;
    seen.add(path);
    const head = wsHead(row);
    const collapsed = !head || head.getAttribute('aria-expanded') === 'false';
    // 折叠态优先权威扫描结果（多目录项目的行匹配在 DOM 侧不可靠）；
    // 权威不可用（≤3.15.x）时回退 DOM 运行记录
    const domRunning = !!(runningByWs.get(path) && runningByWs.get(path).size);
    // 路径两侧都去尾分隔符再比（任务键前缀可能带尾斜杠，权威集合不带）
    const normP = (v) => String(v || '').replace(/[\\/]+$/, '');
    const running = enabled && collapsed && (activeProjectPaths.size ? [...activeProjectPaths].some((p2) => normP(p2) === normP(path)) : domRunning);
    // 换同款 loader 图标（类标记仅用于 CSS 隐藏 folder）
    const icon = iconHolderOf(row);
    icon?.classList.toggle('zcodepro-ws-running', running);
    setRunningIcon(icon, running);
  }
  // 分区头（“任务”“项目”官方分区按钮与“已置顶”标题）：分区内有任务在跑时
  // 头部行首挂同款 loader（分区折叠后任务行不在场，检测不到自然熄灭）
  applySectionSpin();
  // 侧栏里已不存在的项目清掉状态
  for (const ws of [...runningByWs.keys()]) if (!seen.has(ws)) runningByWs.delete(ws);
}

// 分区头识别：官方分区头按钮（含 chevron svg）与“已置顶”标题（h3）。
// 归属（project/task）与容器引用只在分区展开时解析一次并缓存（WeakMap）：
// 分区折叠后其容器整体卸载，向上重解析会落到别的分区容器（如展开着的
// “任务”分区），把“项目”头误判成 task——折叠期间一律用缓存的归属，
// 不再重解析；React 重建头部元素时缓存失效，展开态会重新解析补上
const headInfoCache = new WeakMap(); // head → { cont, kind }
// 文本兜底：分区头按钮被界面重建且其分区正折叠（自有容器已卸载、无法结构
// 解析）时，按分区名定归属——向外层猜会落到含项目行的容器，把“任务”头
// 误判成“项目”（实测）。分区名跟随界面语言，zh/en 双语覆盖
// 官方分区标题（i18n 键 project.projects / project.tasks 的实际文案，随界面
// 语言）：zh 项目/任务、en Projects/Tasks。语言包再加语言时同步此处
const PROJECT_HEAD_TEXTS = new Set(['项目', 'projects']);
const TASK_HEAD_TEXTS = new Set(['任务', 'tasks']);
function kindFromHeadText(head) {
  const text = (head.textContent || '').trim().toLowerCase();
  if (PROJECT_HEAD_TEXTS.has(text)) return 'project';
  if (TASK_HEAD_TEXTS.has(text)) return 'task';
  return null;
}
function sectionHeads() {
  const heads = [];
  for (const sv of document.querySelectorAll('svg[data-purpose-section-chevron]')) {
    const btn = sv.closest('button');
    if (btn) heads.push(btn);
  }
  for (const h3 of document.querySelectorAll('h3')) heads.push(h3);
  return heads.map((head) => {
    const cached = headInfoCache.get(head);
    if (cached) return { head, cont: cached.cont, kind: cached.kind };
    // 官方分区头（BUTTON）的归属以分区名为准（“项目”/“任务”是官方固定分区，
    // 文本即真值）；结构解析只在文本不认识时兜底。已置顶标题（h3）恒属 task。
    const textKind = head.tagName === 'BUTTON' ? kindFromHeadText(head) : 'task';
    let cont = head.parentElement;
    while (cont && !cont.querySelector('li[data-task-item-key]') && cont !== document.body) cont = cont.parentElement;
    const contOk = cont && cont !== document.body;
    const kind = textKind || (contOk ? (cont.querySelector('section[data-project-id]') ? 'project' : 'task') : null);
    headInfoCache.set(head, { cont: contOk ? cont : null, kind });
    return { head, cont: contOk ? cont : null, kind };
  }).filter((x) => x.head);
}

const SEC_SPIN_CLASS = 'zcodepro-ws-sec-spin';

// 全局权威扫描：listActiveTaskIds 遍历侧栏全部项目（/projects-v2 提供路径，
// 尾斜杠两种形式各查一次），任一非终态会话即“有任务在跑”。10 秒节流缓存；
// 接口不可用（≤3.15.x）时无缓存，分区头退回 DOM 检测
let anyActiveCache = { at: 0, value: null, busy: false };
// 活跃按分区归属：task = “任务”分区（非项目工作区），project = “项目”分区，
// pinned = “已置顶”标题（置顶区任务，需单独判定——不与 task/project 混用，
// 否则别的分区有活跃时已置顶头也会亮）
const sectionActive = { task: false, project: false, pinned: false };
// 权威扫描发现的有活跃任务的项目路径集合（全部 root）；项目行折叠态判定用
let activeProjectPaths = new Set();
// 权威扫描确认的活跃会话（工作区路径 → 通过终态过滤的会话 id）：alt+r 弹窗的
// 运行中列表以此补 DOM 之外的盲区——折叠期间启动、页面刷新后仍折叠的会话行
// 从未在场，runningByWs 里没有它们的键，三层 DOM 机制都看不到
let authActiveByWs = new Map();
// 周期复查：缓存到期就无条件重扫（不看当前值）——只在 true 时扫会有两个缺口：
// 空闲后新任务启动无人触发（折叠分区头不亮）；任务结束但数据库完成状态尚未
// 写入的过渡窗口里旧值一直被沿用。每 10 秒全量一次，扫描本身是内存级过滤
setInterval(() => {
  if (!anyActiveCache.busy && Date.now() - anyActiveCache.at >= 10_000) globalAnyActive();
}, 10_000);
function globalAnyActive() {
  if (anyActiveCache.value !== null && Date.now() - anyActiveCache.at < 10_000) return anyActiveCache.value;
  if (anyActiveCache.busy) return anyActiveCache.value === true;
  anyActiveCache.busy = true;
  sectionActive.task = false;
  sectionActive.project = false;
  sectionActive.pinned = false;
  activeProjectPaths = new Set();
  authActiveByWs = new Map();
  void (async () => {
    let hit = null;
    try {
      const res = await rpc('/projects-v2').catch(() => null);
      const services = findServices();
      const ts = services && services.zcodeTaskService;
      if (res && res.ok && res.available && ts && typeof ts.listActiveTaskIds === 'function') {
        hit = false;
        // 项目路径集合（任一 root）：活跃任务命中即属“项目”分区；非项目工作区
        //（draft/独立任务）的活跃属“任务”分区——两个分区头分别提示
        const projPaths = new Set();
        for (const proj of res.projects || []) {
          for (const r of proj.roots || []) {
            const b = String(r.path || '').replace(/[\\/]+$/, '');
            if (b) projPaths.add(b);
          }
        }
        // 非项目工作区清单收紧：任务索引的 workspace_path 含历史残留（旧机器/
        // 已删目录），syncer 可能在其上误报活跃；只认“任务”分区实际会显示的——
        // 即侧栏当前可见的任务行所在工作区（从 DOM 任务行键取，分区展开时可靠）
        const taskSidePaths = new Set();
        for (const el of document.querySelectorAll('[data-task-item-key]')) {
          const sec = el.closest('section[data-project-id]');
          if (sec) continue; // 项目内任务的运行由项目侧覆盖
          const k = el.getAttribute('data-task-item-key') || '';
          const cut = k.lastIndexOf(':');
          if (cut > 1) taskSidePaths.add(k.slice(0, cut).replace(/[\\/]+$/, ''));
        }
        const scanPaths = new Set([...projPaths, ...taskSidePaths]);
        const byKind = { task: new Set(), project: new Set() };
        const byKindByPath = new Map(); // base → 活跃 id 数组
        const rootToProject = new Map(); // root 路径 → 项目名
        const projectPaths = new Map(); // 项目名 → 全部 root 路径
        for (const proj of res.projects || []) {
          const names = [];
          for (const r of proj.roots || []) {
            const b = String(r.path || '').replace(/[\\/]+$/, '');
            if (b) { rootToProject.set(b, proj.name); names.push(b); }
          }
          projectPaths.set(proj.name, names);
        }
        for (const base of scanPaths) {
          const a = await ts.listActiveTaskIds({ workspacePath: base });
          const b = await ts.listActiveTaskIds({ workspacePath: base + '/' });
          const ids = [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].map(String);
          if (!ids.length) continue;
          byKindByPath.set(base, ids);
          const kind = projPaths.has(base) ? 'project' : 'task';
          for (const id of ids) byKind[kind].add(id);
        }
        const allIds = [...byKind.task, ...byKind.project];
        // 终态过滤：官方 syncer 可能卡滞（已完成仍报活跃，任务行 loader 卡转），
        // 到任务索引核对，已终态的不计
        const st = allIds.length ? await rpc('/task-statuses?ids=' + encodeURIComponent(allIds.join(','))).catch(() => null) : null;
        // 终态判据须加新近度：DB 的 status 是“最后结局”，会话被复活继续用时
        // 不回滚（实测本会话 interrupted 后复跑）——终态但 updated_at 近 5 分钟内
        // 有动静的按真活跃；长期不动的才是 syncer 卡滞误报
        const TERMINAL = new Set(['completed', 'error', 'interrupted']);
        const recOf = (id) => (st && st.ok && st.available ? st.statuses[id] : undefined);
        const live = (id) => {
          const rec = recOf(id);
          if (rec === undefined) return true;
          if (!TERMINAL.has(rec.status)) return true;
          return Date.now() - rec.updatedAt < 300_000;
        };
        // 权威活跃会话（按工作区）：alt+r 弹窗从这里补折叠项目的真实会话键。
        // 只收“确认是会话”的 id——任务索引认识的、或侧栏行在场的；两者都不
        // 满足的（listActiveTaskIds 混入的非会话标识、索引尚未记录的新会话）
        // 不进弹窗，否则会出现点了切不过去的幽灵行
        const liveSession = (id) => {
          const rec = recOf(id);
          if (rec === undefined) return !!domRowKeyOf(id);
          if (!TERMINAL.has(rec.status)) return true;
          return Date.now() - rec.updatedAt < 300_000;
        };
        authActiveByWs = new Map();
        for (const [base, ids] of byKindByPath) {
          const liveIds = ids.filter(liveSession);
          if (liveIds.length) authActiveByWs.set(base, liveIds);
        }
        // 活跃的项目路径集合（项目行折叠态判定用）：按 root→项目聚合，
        // 该项目任一 root 上有活跃任务即记入
        activeProjectPaths = new Set();
        for (const [base, ids] of byKindByPath) {
          if (!projPaths.has(base)) continue;
          if (ids.some(live)) {
            const projName = rootToProject.get(base);
            if (projName) for (const p2 of projectPaths.get(projName) || []) activeProjectPaths.add(p2);
          }
        }
        // 任务侧加一道 DOM 确认：非项目任务行上真有 loader 在转才亮——侧栏
        // 显示的就是真相，syncer 报告的活跃（尤其历史残留工作区）不足为凭。
        // 但“任务”分区折叠后行整体卸载（DOM 检测失效），此时退回只信权威扫描
        //（否则分区折叠后头永远不亮——用户实测回归）
        const taskDomRunning = !!document.querySelector('[data-task-item-key]:not(section[data-project-id] *) svg[class*="lucide-loader"]');
        const taskLive = [...byKind.task].some(live);
        const projLive = [...byKind.project].some(live);
        // 分区头亮灯各管各的：任务头只看非项目工作区，项目头只看项目工作区。
        // 折叠后行不在场（DOM 检测失效），只信权威扫描；DOM 确认仅在非项目
        // 任务行在场（分区展开着）时用来否决 syncer 卡滞误报
        if (taskLive) sectionActive.task = true;
        if (projLive) sectionActive.project = true;
        if (!taskDomRunning && taskLive
          && document.querySelector('[data-task-item-key]:not(section[data-project-id] *)')) {
          // 非项目任务行在场但全没 loader（分区展开着）→ syncer 卡滞误报
          sectionActive.task = false;
        }
        // 已置顶区单独判定：取“已置顶”标题（h3）旁边列表容器内的任务行
        // （不在任何 data-project-id 分区里），它们的 id 有活跃才亮已置顶头
        // ——跟 task/project 分区的活跃无关
        for (const h3 of document.querySelectorAll('h3')) {
          const list = h3.nextElementSibling;
          if (!list) continue;
          for (const el of list.querySelectorAll('[data-task-item-key]')) {
            if (el.closest('section[data-project-id]')) continue;
            const k = el.getAttribute('data-task-item-key') || '';
            const id = k.slice(k.lastIndexOf(':') + 1);
            const base = k.slice(0, k.lastIndexOf(':')).replace(/[\/]+$/, '');
            const ids = byKindByPath.get(base) || [];
            if (ids.map(String).includes(id) && ids.some(live)) {
              sectionActive.pinned = true;
              break;
            }
          }
          if (sectionActive.pinned) break;
        }
        hit = sectionActive.task || sectionActive.project;
      }
    } catch { /* 查询失败保持旧值 */ }
    if (hit !== null) anyActiveCache = { at: Date.now(), value: hit, busy: false };
    else anyActiveCache.busy = false;
    apply();
  })();
  return anyActiveCache.value === true;
}
function applySectionSpin() {
  if (!enabled) {
    document.querySelectorAll('.' + SEC_SPIN_CLASS).forEach((el) => el.remove());
    return;
  }
  for (const { head, cont, kind } of sectionHeads()) {
    const running = !!(cont && cont.querySelector('li[data-task-item-key] svg[class*="lucide-loader"]'));
    // “任务”分区与“已置顶”标题：展开时任务行的 loader 直接可见，头部不再重复
    // 提示，仅在分区折叠时挂。“项目”分区头（容器含项目行 section）不受此限——
    // 折叠的单个项目仍由项目行的权威复核提示。
    // 仅分区折叠时显示：展开时任务行的 loader 直接可见，头部不重复。
    // 分区折叠会把内容行全部卸载（DOM 检测失效），改看权威扫描按归属分类的活跃：
    // “项目”分区头看项目侧，“任务”分区与“已置顶”标题看非项目工作区（draft 等）
    let expanded = true;
    if (head.tagName === 'BUTTON') expanded = head.getAttribute('aria-expanded') !== 'false';
    else {
      // 已置顶标题（h3）：折叠是藏起任务列表，按列表实际显示判定
      const list = head.nextElementSibling;
      expanded = !list || list.offsetHeight > 0;
    }
    if (!kind) return; // 折叠后解析不到归属且无缓存：跳过（不动现有图标）
    // 已置顶标题（h3）单独看 pinned scope，不复用 task 的
    const scoped = head.tagName === 'H3' ? sectionActive.pinned
      : kind === 'project' ? sectionActive.project : sectionActive.task;
    // 折叠态一律只信权威扫描：DOM 检测在折叠后不可靠（容器卸载后解析会落到
    // 别的分区，多目录项目的行匹配也套不上），且权威扫描周期覆盖刷新
    const want = !expanded && scoped;
    const existing = head.querySelector(':scope > .' + SEC_SPIN_CLASS);
    if (want && !existing) {
      const span = document.createElement('span');
      span.className = 'flex size-4 shrink-0 items-center justify-center ' + SEC_SPIN_CLASS;
      span.append(makeLoaderSvg('size-4'));
      head.prepend(span);
    } else if (!want && existing) {
      existing.remove();
    }
  }
}

// —— 无感探查 ——

function schedulePeek(ws, delay) {
  clearTimeout(peekTimers.get(ws));
  peekTimers.set(ws, setTimeout(() => {
    peekTimers.delete(ws);
    void peek(ws);
  }, delay));
}

function clearPeek(ws) {
  const t = peekTimers.get(ws);
  if (t) { clearTimeout(t); peekTimers.delete(ws); }
}

function syncPeeks() {
  for (const [ws, set] of runningByWs) {
    if (!enabled || !set.size) { clearPeek(ws); continue; }
    const row = findWsRow(ws);
    const head = row && wsHead(row);
    // 项目展开着、或它的会话行在别处可见（置顶区）：现场信号已足够，不探查
    if (!row || !head || head.getAttribute('aria-expanded') !== 'false' || wsWithRows.has(ws)) {
      clearPeek(ws);
      continue;
    }
    if (!peekTimers.has(ws) && !activePeeks.has(ws)) schedulePeek(ws, peekedWs.has(ws) ? PEEK_REPEAT_MS : PEEK_FIRST_MS);
  }
}

// 探查串行链：同一时间最多一个探查在跑（多项复核同时到期时，重叠会互相干扰）
let peekChain = Promise.resolve();

async function peek(ws, opts) {
  // 折叠期间的周期复核（非 manual）优先走官方权威判定：不展开项目、没有
  // “先展开再缩起”的高度起伏；接口不可用（≤3.15.x）时走原 DOM 无感探查
  if (!opts?.manual) {
    const auth = await authoritativeIdle(ws);
    if (auth !== null) {
      if (auth) {
        runningByWs.delete(ws); // 空闲：熄灭旋转
      } else {
        let set = runningByWs.get(ws);
        if (!set) { set = new Set(); runningByWs.set(ws, set); }
        set.add(ws + ':active'); // 占位键：apply 只看集合大小；真实会话键由
                                 // wsRunningKeys 从权威扫描集合补，占位键不进弹窗
        schedulePeek(ws, PEEK_REPEAT_MS);
      }
      apply();
      return true;
    }
  }
  const run = () => peekInner(ws, opts);
  const p = peekChain.then(run, run);
  peekChain = p.catch(() => {});
  return p;
}

async function peekInner(ws, opts) {
  // manual：idle-reclaim 的复核调用，不受本功能开关限制（调度侧已按 enabled 过滤）。
  // 返回 true = 完成了一次真实读取（结果已并入 runningByWs）；false/undefined = 未验证
  if ((!opts?.manual && !enabled) || document.hidden || activePeeks.has(ws)) return false;
  const row = findWsRow(ws);
  const head = row && wsHead(row);
  if (!row || !head || head.getAttribute('aria-expanded') !== 'false') return false;
  // 无可还原的当前会话时放弃本次探查（点了项目行会把主视图切到该项目的新会话
  // 页，没有可回点的行就还原不回来——新建任务视图同样不放行），60 秒后再试——
  // 探查绝不能把用户的当前视图带走
  if (!currentTaskRow()) {
    schedulePeek(ws, PEEK_REPEAT_MS);
    return false;
  }

  activePeeks.add(ws);
  peekedWs.add(ws);
  // 冻结克隆盖住项目行：探查期间图标（folder↔folder-open）等重渲染不可见；
  // 克隆保留 zcodepro-ws-running 类，转圈不中断
  const rect = row.getBoundingClientRect();
  const frozen = row.cloneNode(true);
  frozen.classList.add('zcodepro-ws-frozen');
  frozen.style.left = rect.left + 'px';
  frozen.style.top = rect.top + 'px';
  frozen.style.width = rect.width + 'px';
  frozen.style.height = rect.height + 'px';
  document.body.append(frozen);
  row.style.visibility = 'hidden';
  // 会话行隐藏改走 style 元素（见 installPeekHider）：挂载当帧即 display:none，
  // 与观察器回调时序、列表容器结构均无关
  const hider = installPeekHider(ws);
  let readOk = false;
  try {
    toggleNavSafe(head);
    readOk = await settleAndRead(ws);
    // 读完后收起；用户在探查期间点了项目行就不再干预
    const rowNow = findWsRow(ws) || row;
    const headNow = wsHead(rowNow);
    if (headNow && headNow.getAttribute('aria-expanded') === 'true' && !userTouched(rowNow)) {
      toggleNavSafe(headNow);
      // 收起后行并非立刻卸载（有数百毫秒延迟），期间保持隐藏再撤，
      // 否则行会在收起瞬间闪现——即“项目先展开再缩起”被看见的原因
      await waitForRowsGone(ws);
    }
  } finally {
    removePeekHider(hider);
    row.style.visibility = '';
    frozen.remove();
    activePeeks.delete(ws);
  }
  apply();
  const set = runningByWs.get(ws);
  if (set && set.size && enabled) schedulePeek(ws, PEEK_REPEAT_MS);
  // 一个任务行都没读到（展开没生效/行未渲染）= 未验证成，调用方按“忙”处理
  return readOk;
}

// —— 供 idle-reclaim 复用 ——

// 当前运行状态快照：running 为仍有运行中会话的工作区列表，current 为当前选中会话的工作区
export function wsRunningSnapshot() {
  const curKey = currentTaskRow()?.getAttribute('data-task-item-key') || '';
  return {
    running: [...runningByWs.entries()].filter(([, set]) => set.size > 0).map(([ws]) => ws),
    current: curKey ? (workspaceOf(curKey) || null) : null,
  };
}

// 按会话 id 找在场任务行并返回它的行键：行键的工作区前缀可能带尾斜杠，权威
// 拼出的键与 DOM 实际键可能不同形——行在场时一律用 DOM 的真实键，弹窗里同
// 一会话不会出现两行，切换与读标题也按真实键命中（会话 id 全局唯一，后缀
// 匹配不会撞到别的会话）
function domRowKeyOf(id) {
  if (!id) return '';
  try {
    const el = document.querySelector(`[data-task-item-key$=":${CSS.escape(id)}"]`);
    return (el && el.getAttribute('data-task-item-key')) || '';
  } catch { return ''; }
}

// 当前所有运行中会话键的集合（会话切换的 alt+r 以此筛“正在运行”的任务）：
// DOM 记录（runningByWs）+ 权威扫描确认的活跃会话两者取并集——折叠项目里
// 启动、页面刷新后仍折叠的会话行从未在场，只有权威扫描知道它们。
// peek 的 ":active" 占位键不是真实会话，不进弹窗（图标的连续性由 apply 的
// 权威路径保证，占位键只维持 runningByWs 非空这一路回退）
export function wsRunningKeys() {
  const keys = new Set();
  for (const set of runningByWs.values()) {
    for (const k of set) if (!k.endsWith(':active')) keys.add(k);
  }
  for (const [base, ids] of authActiveByWs) {
    for (const id of ids) keys.add(domRowKeyOf(id) || `${base}:${id}`);
  }
  return keys;
}

// 无感复核指定工作区当前是否仍有运行中会话（展开读行后原样收起）。
// 返回 true = 确认无运行；false = 有运行、窗口隐藏或行不可达（一律视为忙，调用方不得回收）
export async function verifyWorkspaceNotRunning(ws) {
  if (!ws || document.hidden) return false;
  const row = findWsRow(ws);
  const head = row && wsHead(row);
  if (!row || !head) return false;
  if (head.getAttribute('aria-expanded') !== 'false') {
    // 已展开：行在场，直接读
    let run = false;
    for (const el of domRowsOf(ws)) if (isRunningRow(el)) run = true;
    return !run;
  }
  let verified = false;
  try { verified = (await peek(ws, { manual: true })) === true; } catch { /* 未验证成 */ }
  if (!verified) return false;
  const set = runningByWs.get(ws);
  return !(set && set.size);
}

// 等该项目的会话行渲染稳定后读取运行状态；行始终没出现视为项目无会话，清除记录
// resolve(true)=读到行并稳定；resolve(false)=一个行都没读到（未验证成）
function settleAndRead(ws) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let lastCount = -1;
    let stableAt = 0;
    let zeroRows = false;
    const timer = setInterval(() => {
      const rows = domRowsOf(ws);
      const elapsed = Date.now() - t0;
      if (rows.length !== lastCount) { lastCount = rows.length; stableAt = Date.now(); }
      const settled = rows.length > 0 && rows.length === lastCount && Date.now() - stableAt >= PEEK_SETTLE_MS;
      if (!settled && elapsed < PEEK_MAX_MS) return;
      clearInterval(timer);
      if (lastCount === 0) {
        // 一个任务行都没读到：多半是展开没生效或行尚未渲染，不能当作“项目无
        // 会话”清掉运行记录（idle-reclaim 复核据此判空闲会误杀运行中会话）
        zeroRows = true;
      } else {
        let set = runningByWs.get(ws);
        if (!set) { set = new Set(); runningByWs.set(ws, set); }
        for (const el of rows) {
          const key = el.getAttribute('data-task-item-key') || '';
          if (isRunningRow(el)) set.add(key);
          else set.delete(key);
        }
      }
      resolve(!zeroRows);
    }, 80);
  });
}

// —— 探查期间的会话行隐藏 ——
// style 元素按会话键前缀隐藏：CSS 在节点挂载当帧即生效，不依赖观察器回调
// 时序，也与列表容器结构无关（旧代码依赖的 empty:hidden 容器在应用 3.14.4
// 已不存在；现列表容器仅 space-y 间距，行全隐时无高度，无需藏容器）。
// 探查开始前已在场的同键行（如置顶区）打豁免类，不受影响。

const PEEK_EXEMPT_CLASS = 'zcodepro-peek-exempt';
const cssAttr = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

function installPeekHider(ws) {
  const rowSel = `${TASK_SEL}[data-task-item-key^="${cssAttr(ws + ':')}"]`;
  for (const r of document.querySelectorAll(rowSel)) r.classList.add(PEEK_EXEMPT_CLASS);
  const style = document.createElement('style');
  // 只隐藏会话行本身：容器（ul/列表外壳/折叠动画层）不能藏——应用的展开动画
  // 会测量内容高度，藏容器会导致收起后行不卸载反而重新挂载（实测）
  style.textContent = `${rowSel}:not(.${PEEK_EXEMPT_CLASS}){display:none!important}`;
  document.head.append(style);
  return { style, sel: rowSel };
}

function removePeekHider(hider) {
  hider.style.remove();
  for (const r of document.querySelectorAll('.' + PEEK_EXEMPT_CLASS)) r.classList.remove(PEEK_EXEMPT_CLASS);
}

// 收起后等该项目的会话行全部离开 DOM（卸载有数百毫秒延迟），超时兜底放行
function waitForRowsGone(ws) {
  const sel = `${TASK_SEL}[data-task-item-key^="${cssAttr(ws + ':')}"]:not(.${PEEK_EXEMPT_CLASS})`;
  return new Promise((resolve) => {
    const t0 = Date.now();
    const timer = setInterval(() => {
      if (!document.querySelector(sel) || Date.now() - t0 >= PEEK_UNMOUNT_WAIT_MS) {
        clearInterval(timer);
        resolve();
      }
    }, 40);
  });
}

// —— 用户主动操作项目行的标记（探查收起前 800 毫秒内用户点过就不干预） ——
// 记录在模块内 WeakMap（不挂在元素属性上）：真实点击（isTrusted）才记录，
// 本功能自己派发的合成点击不算，React 重挂载后的新行也不带旧记录

const TOUCH_WINDOW_MS = 800;
const wsTouchAt = new WeakMap();

function userTouched(row) {
  const at = wsTouchAt.get(row);
  return !!at && Date.now() - at < TOUCH_WINDOW_MS;
}

// —— 变动过滤 ——

function inSel(node, sel) {
  return !!(node instanceof Element && node.closest && node.closest(sel));
}

function relevant(muts) {
  // 只观察 childList：本功能关心的全是结构变动（loader 图标增删、会话/项目行
  // 增删、React 重建行内元素），聊天流式输出的 characterData/class 高频变动
  // 一概不进回调（实测后台态全页 5 秒仅 5 个变动、全为非 childList）
  for (const m of muts) {
    if (inSel(m.target, TASK_SEL) || inSel(m.target, WS_SEL())) return true;
    for (const n of m.addedNodes) {
      if (n instanceof Element && (n.matches(TASK_SEL) || n.matches(WS_SEL()) || n.querySelector(TASK_SEL) || n.querySelector(WS_SEL()))) return true;
    }
    for (const n of m.removedNodes) {
      if (n instanceof Element && (n.matches(TASK_SEL) || n.matches(WS_SEL()) || n.querySelector(TASK_SEL))) return true;
    }
  }
  return false;
}

// —— 配置（自适应轮询，模式同 pinned-expand.js） ——

let pollMs = CONFIG_POLL_MIN_MS;

async function refreshConfig() {
  try {
    const res = await rpc('/config');
    if (res && res.ok && res.config && res.config.features) {
      const next = res.config.features.wsRunningSpin !== false;
      if (next !== enabled) {
        enabled = next;
        if (!next) {
          for (const ws of [...peekTimers.keys()]) clearPeek(ws);
          apply();
        }
        return true;
      }
    }
  } catch { /* helper 未就绪时保持默认 */ }
  return false;
}

function pollConfig() {
  setTimeout(async () => {
    if (document.hidden) pollMs = CONFIG_POLL_MAX_MS;
    else pollMs = (await refreshConfig()) ? CONFIG_POLL_MIN_MS : Math.min(Math.round(pollMs * 1.5), CONFIG_POLL_MAX_MS);
    pollConfig();
  }, pollMs);
}

// —— 入口 ——

let scanDebounce = 0;

export function startWsRunningSpin() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  void refreshConfig();
  pollConfig();

  const observer = new MutationObserver((muts) => {
    if (!relevant(muts)) return;
    handleRemovals(muts);
    if (!scanDebounce) {
      scanDebounce = setTimeout(() => { scanDebounce = 0; scan(); }, SCAN_DEBOUNCE_MS);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  scan();
  setInterval(() => { if (!document.hidden && enabled) scan(); }, SCAN_FALLBACK_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scan(); });

  // 用户点项目行 = 主动展开/收起，探查不与其抢操作（捕获阶段，先于应用处理）。
  // 只认真实点击：探查自己派发的合成点击（isTrusted=false）不算用户操作
  document.addEventListener('click', (e) => {
    if (!e.isTrusted) return;
    const row = e.target instanceof Element && e.target.closest(WS_SEL());
    if (row) wsTouchAt.set(row, Date.now());
  }, true);
}
