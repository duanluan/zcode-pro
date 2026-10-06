// 折叠项目运行提示：项目折叠后，若其中仍有会话在运行，项目图标旋转提示，
// 全部结束或项目展开后恢复静止。应用本身没有跨折叠的运行信号——运行状态只
// 体现在侧栏已挂载会话行的 loader 图标上，项目一折叠这些行就被卸载
// （任务索引库、窗口标题、window.zcode 桥均不实时，实测确认），因此分三层：
// 1) 扫描在场的会话行，维护「工作区 → 运行中会话键」；
// 2) 折叠瞬间从 MutationObserver 的 removedNodes 读各行 loader（已移除的节点
//    仍可查询），把最后状态并入表：折叠保留、展开着的移除视为任务被删；
// 3) 对标记运行中的折叠项目做「无感探查」复核：点项目行展开（应用的该点击会
//    把主视图切到该项目，故点完立刻同帧点回当前会话行，两次提交都在绘制前
//    完成、视图与选中不受影响），新增行在本观察器回调里 display:none 冻结布局，
//    原项目行用 position:fixed 冻结克隆盖住，读完后收起、清理。单次约 0.3 秒。
// 探查调度：只在「捕获到运行中」后复核（20 秒首查、其后每 60 秒）。不做启动
// 普查：应用重启后所有会话本就处于停止状态，无运行可发现；且启动期界面还在
// 恢复，探查会打扰（实测首启会出现项目逐个展开又收起的干扰）。
// 开关：helper wsRunningSpin（默认 true）。
import { rpc } from '../core.js';

let installed = false;
let enabled = true;

const SCAN_DEBOUNCE_MS = 150;   // 相关 DOM 变动后的去抖
const SCAN_FALLBACK_MS = 5000;  // 兜底轮询周期（观察器覆盖不到的路径）
const PEEK_FIRST_MS = 20000;    // 折叠捕获到运行后的首次复核
const PEEK_REPEAT_MS = 60000;   // 仍运行中的复核间隔
const PEEK_SETTLE_MS = 160;     // 行数连续两次采样相同视为渲染完成
const PEEK_MAX_MS = 1500;       // 单次探查兜底（行始终没出现 = 项目无会话）

const CONFIG_POLL_MIN_MS = 5000;   // 配置未变化时逐次拉长轮询间隔，减轻常驻开销
const CONFIG_POLL_MAX_MS = 60000;

const TASK_SEL = '[data-task-item-key]';
const WS_SEL = '[data-testid^="workspace-item-"]';

const runningByWs = new Map(); // 工作区路径（原样，来自会话键）→ Set(会话键)
const peekTimers = new Map();  // 工作区 → 复核定时器
const activePeeks = new Set(); // 正在探查的工作区
const peekedWs = new Set();    // 已探查过的项目：之后统一按复查节奏（探查自身的收起动作
                               // 也会触发一次折叠捕获，避免把节奏重置回首查间隔）
let peekHidden = new Map();     // 探查期间被 display:none 的元素（行/列表/容器），按工作区分组
let wsWithRows = new Set();    // 最近一次扫描时仍有会话行在 DOM 的工作区

// —— 工具 ——

function workspaceOf(key) {
  // 会话键格式 <workspace_path>:<sess_id>；sess 段固定以 "sess_" 开头，
  // 按它定位分隔符（Windows 盘符路径里也有冒号，不能按第一个 ':' 切）
  const i = key.indexOf(':sess_');
  return i > 0 ? key.slice(0, i) : key;
}

function findWsRow(ws) {
  return document.querySelector(`[data-testid="workspace-item-${CSS.escape(ws)}"]`);
}

function wsHead(row) {
  return row.matches('[aria-expanded]') ? row : row.querySelector('[aria-expanded]');
}

// 运行中的行首图标是 loader；空闲行该位置为空 span（无 svg）。只认行首图标位
// （span 的直接子级），行内操作按钮等处将来即使出现 loader 也不算
function isRunningRow(el) {
  const holder = el.firstElementChild && el.firstElementChild.querySelector(':scope > span');
  if (!holder) return false;
  return [...holder.children].some((c) => c.tagName === 'svg' && (c.getAttribute('class') || '').includes('lucide-loader'));
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

// 无副作用的展开/收起：应用把项目行点击当作「切换到该项目」（实测当前会话会被
// 取消选中、主视图跳进该项目的新建任务）。点完项目行后立刻点回当前会话行，
// 两次提交都在浏览器绘制前完成——折叠照常生效，视图与选中状态不被带走。
// 还原行每次现找：React 重挂载会换元素，用户中途换会话也跟着新的走。
function toggleNavSafe(head) {
  synthClick(head);
  const cur = currentTaskRow();
  if (cur) synthClick(cur);
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
  // 展开态判定等本批渲染全部落地后再做（aria-expanded 可能与行移除分两次提交）
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
  for (const row of document.querySelectorAll(WS_SEL)) {
    const path = row.getAttribute('data-testid').slice('workspace-item-'.length);
    seen.add(path);
    const head = wsHead(row);
    const collapsed = !head || head.getAttribute('aria-expanded') === 'false';
    const running = !!(enabled && collapsed && runningByWs.get(path) && runningByWs.get(path).size);
    // 类挂在图标的外层 span 上：展开/收起时 React 会重建 svg，span 是稳定节点
    const icon = row.firstElementChild && row.firstElementChild.querySelector(':scope > span');
    if (icon) icon.classList.toggle('zcodepro-ws-running', running);
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

async function peek(ws) {
  const run = () => peekInner(ws);
  const p = peekChain.then(run, run);
  peekChain = p.catch(() => {});
  return p;
}

async function peekInner(ws) {
  if (!enabled || document.hidden || activePeeks.has(ws)) return;
  const row = findWsRow(ws);
  const head = row && wsHead(row);
  if (!row || !head || head.getAttribute('aria-expanded') !== 'false') return;
  // 无可还原的当前会话（正处新建任务态且找不到还原入口）时放弃本次探查，
  // 60 秒后再试——探查绝不能把用户的当前会话带走
  if (!currentTaskRow() && !document.querySelector('[data-testid^="conversation-new-task"]')) {
    schedulePeek(ws, PEEK_REPEAT_MS);
    return;
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
  try {
    toggleNavSafe(head);
    await settleAndRead(ws);
    // 读完后收起；用户在探查期间点了项目行就不再干预
    const rowNow = findWsRow(ws) || row;
    const headNow = wsHead(rowNow);
    if (headNow && headNow.getAttribute('aria-expanded') === 'true' && !userTouched(rowNow)) {
      toggleNavSafe(headNow);
    }
  } finally {
    cleanupPeekHidden(ws);
    row.style.visibility = '';
    frozen.remove();
    activePeeks.delete(ws);
  }
  apply();
  const set = runningByWs.get(ws);
  if (set && set.size && enabled) schedulePeek(ws, PEEK_REPEAT_MS);
}

// 等该项目的会话行渲染稳定后读取运行状态；行始终没出现视为项目无会话，清除记录
function settleAndRead(ws) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let lastCount = -1;
    let stableAt = 0;
    const timer = setInterval(() => {
      const rows = domRowsOf(ws);
      const elapsed = Date.now() - t0;
      if (rows.length !== lastCount) { lastCount = rows.length; stableAt = Date.now(); }
      const settled = rows.length > 0 && rows.length === lastCount && Date.now() - stableAt >= PEEK_SETTLE_MS;
      if (!settled && elapsed < PEEK_MAX_MS) return;
      clearInterval(timer);
      if (lastCount === 0) {
        runningByWs.delete(ws);
      } else {
        let set = runningByWs.get(ws);
        if (!set) { set = new Set(); runningByWs.set(ws, set); }
        for (const el of rows) {
          const key = el.getAttribute('data-task-item-key') || '';
          if (isRunningRow(el)) set.add(key);
          else set.delete(key);
        }
      }
      resolve();
    }, 80);
  });
}

// 观察器回调（绘制前）把探查展开新增的会话行连同列表容器 display:none，
// 不占布局、不产生一帧可见内容
function hidePeekRows(muts) {
  if (!activePeeks.size) return;
  for (const m of muts) {
    if (m.type !== 'childList') continue;
    for (const n of m.addedNodes) {
      if (!(n instanceof Element)) continue;
      const rows = n.matches(TASK_SEL) ? [n] : [...n.querySelectorAll(TASK_SEL)];
      for (const r of rows) {
        const ws = workspaceOf(r.getAttribute('data-task-item-key') || '');
        if (!activePeeks.has(ws)) continue;
        r.style.display = 'none';
        pushHidden(ws, r);
        const ul = r.closest('ul');
        if (ul && !ul.__zcodeproPeekHidden) {
          ul.__zcodeproPeekHidden = true;
          ul.style.display = 'none';
          pushHidden(ws, ul);
          const holder = ul.parentElement;
          // 会话列表容器带 empty:hidden（空时整体隐藏）：一并冻结，避免占位/间距
          if (holder && [...holder.classList].includes('empty:hidden') && !holder.__zcodeproPeekHidden) {
            holder.__zcodeproPeekHidden = true;
            holder.style.display = 'none';
            pushHidden(ws, holder);
          }
        }
      }
    }
  }
}

function pushHidden(ws, el) {
  if (!peekHidden.has(ws)) peekHidden.set(ws, []);
  peekHidden.get(ws).push(el);
}

function cleanupPeekHidden(ws) {
  const els = peekHidden.get(ws) || [];
  for (const el of els) {
    el.style.display = '';
    delete el.__zcodeproPeekHidden;
  }
  peekHidden.delete(ws);
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
    if (inSel(m.target, TASK_SEL) || inSel(m.target, WS_SEL)) return true;
    for (const n of m.addedNodes) {
      if (n instanceof Element && (n.matches(TASK_SEL) || n.matches(WS_SEL) || n.querySelector(TASK_SEL) || n.querySelector(WS_SEL))) return true;
    }
    for (const n of m.removedNodes) {
      if (n instanceof Element && (n.matches(TASK_SEL) || n.matches(WS_SEL) || n.querySelector(TASK_SEL))) return true;
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
    hidePeekRows(muts);
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
    const row = e.target instanceof Element && e.target.closest(WS_SEL);
    if (row) wsTouchAt.set(row, Date.now());
  }, true);
}
