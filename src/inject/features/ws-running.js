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
const LOADER_PATH = 'M21 12a9 9 0 1 1-6.219-8.56';
function setRunningIcon(holder, on) {
  if (!holder) return;
  if (on) {
    // folder 的隐藏由 CSS 完成（span.zcodepro-ws-running 类稳定，React 重建的
    // folder 也会被规则罩住）；这里只负责确保 loader 在场
    if (holder.querySelector(':scope > svg.zcodepro-ws-loader')) return;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const orig0 = holder.querySelector(':scope > svg:not(.zcodepro-ws-loader)');
    const base = orig0 ? (orig0.getAttribute('class') || '') : 'size-4';
    svg.setAttribute('class', (base.replace(/lucide-folder[a-z-]*/g, '').trim() + ' animate-spin zcodepro-ws-loader').trim());
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', LOADER_PATH);
    svg.append(path);
    holder.append(svg);
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
    if (Array.isArray(a) && Array.isArray(b)) return a.length === 0 && b.length === 0;
    return null;
  } catch {
    return null; // 方法不存在（≤3.15.x 的服务对象）或查询失败：一律按忙
  }
}


function workspaceOf(key) {
  // 会话键格式 <workspace_path>:<sess_id>；sess 段固定以 "sess_" 开头，
  // 按它定位分隔符（Windows 盘符路径里也有冒号，不能按第一个 ':' 切）
  const i = key.indexOf(':sess_');
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
    const running = !!(enabled && collapsed && runningByWs.get(path) && runningByWs.get(path).size);
    // 换同款 loader 图标（类标记仅作调试/样式锚点）
    const icon = iconHolderOf(row);
    icon?.classList.toggle('zcodepro-ws-running', running);
    setRunningIcon(icon, running);
  }
  // 侧栏里已不存在的项目清掉状态
  for (const ws of [...runningByWs.keys()]) if (!seen.has(ws)) runningByWs.delete(ws);
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
        set.add(ws + ':active'); // 占位键：apply 只看集合大小
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
