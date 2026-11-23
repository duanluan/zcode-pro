// headroom 供应商登记提示：headroom 插件在会话启动时对账「ZCode 供应商配置 ↔ 本地
// 压缩路由登记表」，把结果写进数据根的 hr-reconcile-notice.json。这里轮询 helper
// 拿最新一条，按 at 时间戳去重（存 sessionStorage），只在首次见到时弹右下角卡片。
//
// 为什么轮询而不是直接收推送：helper 的鉴权 token 每次启动随机生成、不落盘、不进
// 环境变量，外部进程（headroom 钩子）拿不到，没法直接调 helper 接口；写文件 + 页面
// 轮询是仓库里既有的做法（auto-continue 同款）。
//
// 开关：features.hrNotice（默认开）。
import { getConfig, rpc } from '../core.js';
import { closeCornerCard, showCornerCard } from '../ui.js';

const POLL_MS = 15_000;
const SEEN_KEY = 'zcodeproHrNoticeSeen';
// 与 headroom 侧 hr-notice.mjs 的 MAX_AGE_MS 一致：过期结果不再弹。
// 没有这道限制的话，关掉应用重开后 sessionStorage 清空，几天前的 notice 仍会弹出来。
const MAX_AGE_MS = 10 * 60 * 1000;

function seenAt() {
  try {
    return String(sessionStorage.getItem(SEEN_KEY) || '');
  } catch {
    return '';
  }
}

function markSeen(at) {
  try {
    sessionStorage.setItem(SEEN_KEY, String(at || ''));
  } catch { /* 隐私模式等写不进去：本轮会重复弹，可接受 */ }
}

// 把对账结果拼成卡片文案；没有问题返回 null
function cardOf(notice) {
  const fixed = Array.isArray(notice?.fixed) ? notice.fixed : [];
  const pending = Array.isArray(notice?.pending) ? notice.pending : [];
  if (!fixed.length && !pending.length) return null;

  const parts = [];
  if (fixed.length) {
    const items = fixed.map((x) => (x.action === 'key' ? `${x.name}：更新密钥` : `${x.name}：补登记`));
    parts.push(`已自动同步供应商登记：${items.join('；')}`);
  }
  if (pending.length) {
    parts.push(`${pending.map((x) => x.name).join('、')} 指向本地压缩路由但未登记，`
      + '且无法推断原上游地址。请运行 /hr-join 接入，否则这些供应商的请求会被拒绝。');
  }
  return {
    kind: pending.length ? 'warning' : 'success',
    title: pending.length ? 'headroom 供应商登记需要处理' : 'headroom 供应商登记已同步',
    desc: parts.join('\n\n'),
  };
}

let shownAt = null;

async function tick() {
  const cfg = await getConfig();
  if ((cfg.features || {}).hrNotice === false) return;
  const res = await rpc('/headroom/reconcile-notice');
  if (!res || res.ok === false) return;
  const notice = res.notice;
  if (!notice || !notice.at) return;
  // 过期结果不弹（与 headroom 侧 hr-notice.mjs 同一个 10 分钟窗口）
  const at = Date.parse(notice.at);
  if (!Number.isFinite(at) || Date.now() - at > MAX_AGE_MS) return;
  // 同一份结果只处理一次：本进程内 + 跨刷新（sessionStorage）
  if (notice.at === shownAt || notice.at === seenAt()) return;
  const card = cardOf(notice);
  if (!card) return;
  shownAt = notice.at;
  markSeen(notice.at);
  // 用左下角：右下角是自动继续卡的位置，两者同时出现时用不同角落避免互相遮挡
  showCornerCard({ position: 'bl', ...card, actions: [{ label: '知道了', primary: true, onClick: () => closeCornerCard('bl') }] });
}

export function startHrNotice() {
  const run = () => {
    // 首轮立即跑，之后按周期：晚开会话/刷新后不用等 15 秒
    tick().catch(() => { /* 单次失败不影响后续 */ });
  };
  run();
  setInterval(() => {
    if (document.hidden) return; // 后台标签页不轮询，回到前台由 visibilitychange 补一轮
    run();
  }, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) run(); });
}
