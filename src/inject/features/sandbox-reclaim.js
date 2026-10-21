// 插件界面沙箱回收：宿主为每个插件交互卡片（识图卡片、压缩记录、评审面板等）
// 保留一个沙箱，全局上限 64 个（主进程注册表与窗口页面管理器各一道闸），已卸下
// 的名额默认要等 6 小时 TTL 才自动回收——多卡片会话很快把名额耗尽，之后所有新
// 卡片报“插件界面数量已达上限”。本功能平时不动作，只在沙箱数量达到上限
//（sandboxReclaimBudget，默认 60，8–64；留少量余量，避免新卡片抢名额时恰好撞上
// 64 硬上限）时，调用官方桥 window.zcodePluginSandbox.disposeSandbox 释放最早
// 创建的沙箱，把数量压回上限以下：被释放的卡片位置退回占位（可能显示已停止
// 提示），重新打开所在会话即恢复，会话文本内容不受影响。
//
// 驱逐顺序：最早创建的优先，但可见的（正在查看的卡片）排最后——先在不可见
// 沙箱里挑最早的；全部可见时才动最早创建的可见沙箱。
//
// 观察手段均为宿主稳定标识，不依赖压缩后的内部变量名：
// 1) window 消息 zcode:plugin-sandbox-ports：沙箱端口建立时广播 {sandboxId, initId}；
// 2) webview[data-zcode-retained-sandbox]：src 含 /instance/<sandboxId>/；
// 3) 可见性：webview 所在页根 div[data-sandbox-page-root] 的 opacity——展示中的
//    页根 opacity:1 且按卡片占位几何摆放；卡片切走/滚下后宿主把页根收进停靠区
//   （[data-sandbox-page-parking] 下，opacity:0.001 + inert 或 display:none）。
//    页根是固定定位、DOM 挂载点与视觉位置解耦，不能按父容器判断可见性。
//
// 窗口最小化/后台不改变布局尺寸，可见性判定不受影响（最小化期间不驱逐）。
// 开关：features.sandboxReclaim（默认开）。
import { getConfig } from '../core.js';

const CHECK_MS = 30_000;       // 巡检周期
const MIN_BUDGET = 8;
const MAX_BUDGET = 64;
const RETRY_COOLDOWN_MS = 10 * 60_000;  // 同一沙箱释放失败后的重试冷却

const seen = new Map();     // sandboxId → { initId, firstSeen }
const cooldown = new Map(); // sandboxId → 释放失败冷却截止时刻
let disabledLogged = false;

function onPortsMessage(e) {
  const d = e.data;
  if (!d || d.type !== 'zcode:plugin-sandbox-ports' || typeof d.sandboxId !== 'string') return;
  // 端口广播≈沙箱创建时刻；页面刷新后宿主按幂等键复用同一沙箱并再次广播，
  // 创建时刻随之刷新（视作新名额重新排队）
  seen.set(d.sandboxId, { initId: Number(d.initId) || 0, firstSeen: Date.now() });
}

function extractSandboxId(wv) {
  const m = /instance\/(sb-[0-9a-f]+)\//.exec(wv.getAttribute('src') || '');
  return m ? m[1] : null;
}

// 展示中的页根 opacity:1 且按卡片占位几何摆放；停靠保活的页根 opacity:0.001 +
// inert（或 display:none）。宿主用固定定位按占位几何摆放页根，DOM 挂载点不代表
// 视觉位置（可见卡片的页根也可能挂在停靠容器下），因此按 opacity 与布局判定
function isVisible(wv) {
  const root = wv.closest('[data-sandbox-page-root]');
  if (!root) return wv.getClientRects().length > 0;
  if (!root.getClientRects().length) return false;
  return Number(getComputedStyle(root).opacity) > 0.5;
}

async function tick() {
  const cfg = await getConfig();
  if ((cfg.features || {}).sandboxReclaim === false) {
    seen.clear();
    return;
  }
  // 沙箱桥只在宿主主窗口存在（guest 沙箱页与旧版宿主没有）：不在时静默跳过
  const bridge = window.zcodePluginSandbox;
  if (!bridge || typeof bridge.disposeSandbox !== 'function') {
    if (!disabledLogged) {
      disabledLogged = true;
      console.info('[zcodepro] sandbox-reclaim: 当前窗口无 zcodePluginSandbox 桥，沙箱回收跳过');
    }
    return;
  }
  let budget = Number(cfg.sandboxReclaimBudget);
  if (!Number.isFinite(budget)) budget = 60;
  budget = Math.min(MAX_BUDGET, Math.max(MIN_BUDGET, budget));

  const now = Date.now();
  const live = new Map(); // sandboxId → 是否可见
  for (const wv of document.querySelectorAll('webview[data-zcode-retained-sandbox]')) {
    const id = extractSandboxId(wv);
    if (id) live.set(id, isVisible(wv));
  }
  // 端口广播登记过但 DOM 已无对应 webview 的条目（guest 已销毁）：清掉，防 Map 无限增长
  for (const id of [...seen.keys()]) {
    if (!live.has(id)) seen.delete(id);
  }
  // 重注入后端口广播没赶上（Map 为空）的兜底：首次观察到时按现在起算创建时刻
  for (const id of live.keys()) {
    if (!seen.has(id)) seen.set(id, { initId: undefined, firstSeen: now });
  }

  while (live.size > budget) {
    // 驱逐顺序：不可见的按创建时间最早的 → 全可见时最早的可见沙箱
    const candidates = [...live.entries()]
      .filter(([id]) => (cooldown.get(id) || 0) <= now)
      .sort((a, b) => (a[1] - b[1]) || ((seen.get(a[0]) || {}).firstSeen || 0) - ((seen.get(b[0]) || {}).firstSeen || 0));
    if (!candidates.length) break;
    const [id] = candidates[0];
    const entry = seen.get(id);
    try {
      await bridge.disposeSandbox(id, entry && entry.initId);
      console.info('[zcodepro] sandbox-reclaim: 沙箱满 ' + live.size + ' 个，已驱逐最早的 ' + id);
    } catch (err) {
      console.warn('[zcodepro] sandbox-reclaim: 释放失败 ' + id, err);
    }
    seen.delete(id);
    live.delete(id);
    cooldown.set(id, now + RETRY_COOLDOWN_MS);
  }
  if (cooldown.size > 256) {
    for (const [k, v] of cooldown) {
      if (v <= now) cooldown.delete(k);
    }
  }
}

export function startSandboxReclaim() {
  window.addEventListener('message', onPortsMessage);
  const loop = () => { tick().catch(() => { /* 单次巡检失败不影响后续 */ }); };
  loop();
  setInterval(loop, CHECK_MS);
}
