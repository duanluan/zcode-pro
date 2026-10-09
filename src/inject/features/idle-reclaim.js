// 空闲项目进程回收：ZCode 为每个打开过的项目常驻一个会话进程（含其 MCP 子进程），
// 应用自身不回收这类进程（回收能力只接给了内部的 MCP 状态探测进程）。本功能对
// “长时间无活动”的项目调用应用自身的 releaseWorkspacePreparation 接口主动释放：
// 会话记录不受影响，下次点开该项目的会话时进程自动重建，仅第一条消息有几秒冷启动。
//
// 不回收（任一命中即跳过）：
// 1) 当前选中的项目；
// 2) 有运行中会话的项目（含子智能体/工作流，它们都在会话回合内运行）——先用
//    折叠项目运行检测（ws-running）的现场记录，回收前再无感展开复核一次兜底；
// 3) 有仍在运行的后台命令的项目——helper 扫描会话进程的子进程（/idle-busy，
//    Linux/macOS/Windows 各走系统自带工具），插件/MCP 基础设施子进程除外，
//    剩余视为用户命令；扫描不可用时整个功能停用，不做盲回收。
// 定时/闲时任务由宿主进程调度、触发时自动重建会话进程，无需排除。
//
// 开关：features.idleReclaim（默认开）。
// 两个时长：idleReclaimMinutes 常规空闲判定（默认 30，1–1440）；
// idleReclaimStartupMinutes 启动一次性回收的延后分钟（默认 5，0–1440，0 = 启动后
// 尽快收一次，不受常规空闲时长限制——应用启动会为每个恢复的项目预热进程，这次
// 回收专治启动瞬间的内存高峰）。
import { rpc, getConfig } from '../core.js';
import { wsRunningSnapshot, verifyWorkspaceNotRunning } from './ws-running.js';

const CHECK_MS = 30_000;      // 巡检周期
const WS_SEL = '[data-testid^="workspace-item-"]';
const MIN_MINUTES = 1;
const MAX_MINUTES = 1440;

const idleSince = new Map();   // 项目路径 → 首次判定空闲的时刻
const blockUntil = new Map();  // 项目路径 → 此前不得再次回收的时刻（回收/复核失败后的冷却）
let scanDisabledLogged = false;
const bootAt = Date.now();     // 注入时刻 ≈ 应用启动时刻
let startupSweepDone = false;  // 启动一次性回收是否已执行

// 应用内部服务对象（含 zcodeTaskService.releaseWorkspacePreparation）：从 React
// fiber 树上找持有它的组件（file-menu.js 同款取 fiber 的思路），找到后缓存
let servicesRef = null;
function findServices() {
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

function sidebarWorkspaces() {
  const out = new Set();
  for (const el of document.querySelectorAll(WS_SEL)) {
    out.add(el.getAttribute('data-testid').slice('workspace-item-'.length));
  }
  return out;
}

async function reclaim(ws) {
  const services = findServices();
  if (!services) return false;
  try {
    // 应用内部的工作区键带尾分隔符（宿主日志可见），不带则键对不上、调用成空操作
    await services.zcodeTaskService.releaseWorkspacePreparation({
      workspacePath: ws.endsWith('/') ? ws : ws + '/',
    });
    console.info('[zcodepro] idle-reclaim: 已释放空闲项目进程 ' + ws);
    return true;
  } catch (err) {
    console.warn('[zcodepro] idle-reclaim: 释放失败 ' + ws, err);
    return false;
  }
}

// 回收单个项目：回收前复核运行状态与当前归属，未通过则冷却后由后续周期重试
async function tryReclaim(ws, cooldownMs) {
  // 回收前最后复核：折叠项目的运行状态可能没被现场捕获到，无感展开读取再收起；
  // 复核没做成（窗口隐藏/行不可达）也按忙处理，不回收
  const verifiedIdle = await verifyWorkspaceNotRunning(ws);
  if (!verifiedIdle) { blockUntil.set(ws, Date.now() + cooldownMs); return; }
  // 复核要展开读行、网络请求也有耗时：期间用户可能已切到该项目，回收前再确认一次归属
  const currentNow = wsRunningSnapshot().current;
  if (!currentNow || currentNow === ws) { blockUntil.set(ws, Date.now() + cooldownMs); return; }
  await reclaim(ws);
  // 无论成败都冷却：失败退避重试；成功后用户再点开则进程重建、重新计时
  blockUntil.set(ws, Date.now() + cooldownMs);
}

async function tick() {
  const cfg = await getConfig();
  if ((cfg.features || {}).idleReclaim === false) {
    idleSince.clear();
    return;
  }
  const minutes = Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Number(cfg.idleReclaimMinutes) || 30));
  const threshold = minutes * 60_000;
  let startupMinutes = Number(cfg.idleReclaimStartupMinutes);
  if (!Number.isFinite(startupMinutes)) startupMinutes = 5;
  startupMinutes = Math.min(MAX_MINUTES, Math.max(0, startupMinutes));

  const snap = wsRunningSnapshot();
  // 当前项目无法定位（新建任务输入态等没有选中会话行的状态）：无法保证不误回收
  // 用户正在使用的项目，本轮跳过回收，空闲计时作废重新累计
  if (!snap.current) {
    idleSince.clear();
    return;
  }
  const busy = new Set(snap.running);
  busy.add(snap.current);

  const workspaces = sidebarWorkspaces();
  for (const ws of [...idleSince.keys(), ...blockUntil.keys()]) {
    if (!workspaces.has(ws)) { idleSince.delete(ws); blockUntil.delete(ws); }
  }

  const candidates = [...workspaces].filter((ws) => !busy.has(ws));
  const res = candidates.length
    ? await rpc('/idle-busy', { method: 'POST', body: { paths: candidates } })
    : { ok: true, scan: true, busy: [] };
  if (!res.ok || res.scan === false) {
    // 无法确认后台命令状态（系统工具缺失 / helper 旧版）：整体停用
    if (!scanDisabledLogged) {
      scanDisabledLogged = true;
      console.info('[zcodepro] idle-reclaim: 后台命令扫描不可用，空闲回收停用');
    }
    idleSince.clear();
    return;
  }
  const procBusy = new Set(res.busy || []);
  const idleCandidates = candidates.filter((ws) => !procBusy.has(ws));

  const now = Date.now();
  // 启动一次性回收：应用启动会为每个恢复的项目预热会话进程，这次回收不等空闲
  // 时长，到点把当时符合条件的项目一次收掉（0 = 启动后尽快回收一次；当前项目
  // 定位不到时顺延到下一周期）。之后回归常规空闲计时
  if (!startupSweepDone && now - bootAt >= startupMinutes * 60_000) {
    startupSweepDone = true;
    for (const ws of idleCandidates) {
      if ((blockUntil.get(ws) || 0) > now) continue;
      await tryReclaim(ws, threshold);
    }
  }
  for (const ws of workspaces) {
    if (busy.has(ws) || procBusy.has(ws)) { idleSince.delete(ws); continue; }
    if (!idleSince.has(ws)) { idleSince.set(ws, now); continue; }
    if (now - idleSince.get(ws) < threshold) continue;
    if ((blockUntil.get(ws) || 0) > now) continue;
    idleSince.delete(ws);
    await tryReclaim(ws, threshold);
  }
}

export function startIdleReclaim() {
  const loop = () => { tick().catch(() => { /* 单次巡检失败不影响后续 */ }); };
  loop();
  setInterval(loop, CHECK_MS);
}
