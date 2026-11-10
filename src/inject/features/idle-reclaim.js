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
import { wsRunningSnapshot, verifyWorkspaceNotRunning, findServices, authoritativeIdle } from './ws-running.js';

const CHECK_MS = 30_000;      // 巡检周期
const MIN_MINUTES = 1;
const MAX_MINUTES = 1440;

const idleSince = new Map();   // 项目路径 → 首次判定空闲的时刻
const blockUntil = new Map();  // 项目路径 → 此前不得再次回收的时刻（回收/复核失败后的冷却）
let scanDisabledLogged = false;
const bootAt = Date.now();     // 注入时刻 ≈ 应用启动时刻
let startupSweepDone = false;  // 启动一次性回收是否已执行
// 功能开关缓存成模块变量（config-changed 时更新）：关闭时巡检早退，
// 不再每个周期发一次 getConfig，也不扫系统进程
let enabled = true;

// 项目路径比较前统一去掉尾部分隔符：wsRunningSnapshot().current 是行键原始
// 前缀（可带尾斜杠），候选路径已去尾分隔符，写法不同会被当成两个项目
const normP = (v) => String(v || '').replace(/[\\/]+$/, '');


// 项目清单改读 helper 的 /projects-v2（官方任务索引 projects/project_roots）：
// 含多目录项目的每个目录（每个目录都可能有会话进程），且不依赖侧栏展开状态
async function sidebarWorkspaces() {
  const out = new Set();
  const res = await rpc('/projects-v2').catch(() => null);
  if (res && res.ok && res.available) {
    for (const proj of res.projects || []) {
      for (const r of proj.roots || []) {
        const p = normP(r.path);
        if (p) out.add(p);
      }
    }
  }
  return out;
}

async function reclaim(ws) {
  const services = findServices();
  if (!services) {
    console.info('[zcodepro] idle-reclaim: 会话服务不可用，本轮不回收 ' + ws);
    return false;
  }
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
  // 回收前最后复核。优先官方权威判定（listActiveTaskIds）；接口不可用
  // （≤3.15.x）时退回 DOM 复核链。任何“未知”都按忙处理，不回收
  const auth = await authoritativeIdle(ws);
  if (auth === null) {
    const verifiedIdle = await verifyWorkspaceNotRunning(ws);
    if (!verifiedIdle) { blockUntil.set(ws, Date.now() + cooldownMs); return; }
  } else if (!auth) {
    blockUntil.set(ws, Date.now() + cooldownMs); return;
  }
  // 复核要展开读行、网络请求也有耗时：期间用户可能已切到该项目，回收前再确认一次归属
  const currentNow = normP(wsRunningSnapshot().current);
  if (!currentNow || currentNow === normP(ws)) { blockUntil.set(ws, Date.now() + cooldownMs); return; }
  await reclaim(ws);
  // 无论成败都冷却：失败退避重试；成功后用户再点开则进程重建、重新计时
  blockUntil.set(ws, Date.now() + cooldownMs);
}

// 挑出本轮到点的工作区并顺带维护空闲计时：启动扫（不等空闲时长）+ 空闲时长
// 到点的入列（入列即扣表，等调用方扫完后台命令后决定回收或重新累计）。
// busy 的清表、没起表的起表、冷却中的不动表只跳过（冷却过后到点即重试，与
// 原先每轮全量扫的节奏一致）
function dueForReclaim(workspaces, busy, idleSince, blockUntil, now, threshold, startupDue) {
  const due = [];
  const seen = new Set();
  const add = (ws) => { if (!seen.has(ws)) { seen.add(ws); due.push(ws); } };
  if (startupDue) {
    for (const ws of workspaces) {
      if (busy.has(ws) || (blockUntil.get(ws) || 0) > now) continue;
      add(ws);
    }
  }
  for (const ws of workspaces) {
    if (busy.has(ws)) { idleSince.delete(ws); continue; }
    if (!idleSince.has(ws)) { idleSince.set(ws, now); continue; }
    if (now - idleSince.get(ws) < threshold) continue;
    if ((blockUntil.get(ws) || 0) > now) continue;
    if (seen.has(ws)) continue; // 启动扫已入列：不动表，回收失败后到点再试
    idleSince.delete(ws);
    add(ws);
  }
  return due;
}

async function tick() {
  if (!enabled) {
    idleSince.clear();
    return;
  }
  const cfg = await getConfig();
  enabled = !cfg.features || cfg.features.idleReclaim !== false;
  if (!enabled) {
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
  const busy = new Set(snap.running.map(normP));
  busy.add(normP(snap.current));

  const workspaces = await sidebarWorkspaces();
  for (const ws of [...idleSince.keys(), ...blockUntil.keys()]) {
    if (!workspaces.has(ws)) { idleSince.delete(ws); blockUntil.delete(ws); }
  }

  const now = Date.now();
  // 启动一次性回收：应用启动会为每个恢复的项目预热会话进程，这次回收不等空闲
  // 时长，到点把当时符合条件的项目一次收掉（0 = 启动后尽快回收一次；当前项目
  // 定位不到时顺延到下一周期）。之后回归常规空闲计时
  const startupDue = !startupSweepDone && now - bootAt >= startupMinutes * 60_000;
  const due = dueForReclaim(workspaces, busy, idleSince, blockUntil, now, threshold, startupDue);
  if (!due.length) {
    if (startupDue) startupSweepDone = true;
    return;
  }
  // 后台命令扫描（/idle-busy，Windows 上是 PowerShell 全进程枚举）只对本轮到点
  // 的工作区做一次，不随巡检每轮全量扫——每 30 秒扫全部候选是常驻卡顿源。
  // 有后台命令在跑的工作区跳过回收、重新累计空闲时长；回收前照样确认没有
  // 用户命令在跑，回收语义不变
  const res = await rpc('/idle-busy', { method: 'POST', body: { paths: due } });
  if (!res.ok || res.scan === false) {
    // 无法确认后台命令状态（系统工具缺失 / helper 旧版）：整体停用
    if (!scanDisabledLogged) {
      scanDisabledLogged = true;
      console.info('[zcodepro] idle-reclaim: 后台命令扫描不可用，空闲回收停用');
    }
    // 启动扫不因失败反复重试：否则每个巡检周期（30 秒）都重新扫——扫描不可用
    // 还每 30 秒拉一次 PowerShell 全进程枚举，正是要消除的常驻开销。下一次
    // 尝试回到空闲阈值节奏（默认 30 分钟），扫描恢复后仍能自动接上
    if (startupDue) startupSweepDone = true;
    idleSince.clear();
    return;
  }
  if (startupDue) startupSweepDone = true;
  const procBusy = new Set(res.busy || []);
  for (const ws of due) {
    if (procBusy.has(ws)) { idleSince.delete(ws); continue; }
    await tryReclaim(ws, threshold);
  }
}

export function startIdleReclaim() {
  // 开关经设置弹窗改动时更新缓存（外部直接改配置文件不走这条路，靠下一轮
  // tick 里的 getConfig 兜——但那要功能开着才会走到）
  window.addEventListener('zcodepro:config-changed', () => {
    void getConfig(true).then((cfg) => {
      enabled = !cfg.features || cfg.features.idleReclaim !== false;
      if (!enabled) idleSince.clear();
    }).catch(() => {});
  });
  const loop = () => { tick().catch(() => { /* 单次巡检失败不影响后续 */ }); };
  loop();
  setInterval(loop, CHECK_MS);
}
