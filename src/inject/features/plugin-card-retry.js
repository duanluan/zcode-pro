// 插件卡片自动重试：宿主对插件交互卡片（沙箱）有全局 64 个名额，重度会话打开时
// 注册洪峰会撞上限，一部分卡片显示"插件界面数量已达上限/加载失败"并带"重新加载"
// 按钮。名额由宿主缓慢回收（或沙箱回收功能主动释放），空出后重试即成——但手动
// 蹲守空窗不现实（真机实测：名额约一小时只腾出两个，每次腾出恰好能救一张卡）。
// 本功能定期找出失败卡片的"重新加载"按钮自动点按：名额一空卡片自动复活。
// 匹配规则：按钮文字恰为"重新加载"，且四层祖先内含"插件界面/已达上限/加载失败"
// 字样，避免误点其他"重新加载"。
// 开关：features.pluginCardRetry（默认开）。
import { getConfig } from '../core.js';

const SCAN_MS = 15_000;            // 巡检周期
const CLICK_INTERVAL_MS = 30_000;  // 两次点按的最小间隔（全局节流）
// 宿主两种失败文案（"插件界面加载失败""插件界面数量已达上限"）都含"插件界面"，
// 只认这一个词足够精确，也避免误点其他"重新加载"按钮
const MARKERS = ['插件界面'];

let lastClickAt = 0; // 全局节流：按按钮元素记冷却会被宿主重建的新元素绕过

function failedRetryButtons() {
  const out = [];
  for (const btn of document.querySelectorAll('button')) {
    if ((btn.textContent || '').trim() !== '重新加载') continue;
    let anc = btn;
    for (let i = 0; i < 4 && anc.parentElement; i++) {
      anc = anc.parentElement;
      const ctx = anc.textContent || '';
      if (MARKERS.some((m) => ctx.includes(m))) { out.push(btn); break; }
    }
  }
  return out;
}

async function tick() {
  const cfg = await getConfig();
  if ((cfg.features || {}).pluginCardRetry === false) return;
  const now = Date.now();
  if (now - lastClickAt < CLICK_INTERVAL_MS) return;
  for (const btn of failedRetryButtons()) {
    lastClickAt = now;
    btn.click();
    // 一轮只点一个：名额通常一次只空一个，排队恢复，避免齐发再撞上限
    break;
  }
}

export function startPluginCardRetry() {
  setInterval(() => { tick().catch(() => { /* 单次巡检失败不影响后续 */ }); }, SCAN_MS);
}
