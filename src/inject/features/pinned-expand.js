// 置顶会话展开抑制（v4，实验性）：
// 已知缺陷：无法真正拦截展开（store 在应用闭包内不可达，渲染层无拦截点），
// 只能在展开发生后收起，因此视觉上「先展开再缩起」，大会话期间可能闪烁。

// 点击折叠项目的置顶会话时，应用展开该项目；且会话内容加载完成（正文渲染）后还会再展开一次。
// 固定延时不可靠（会话有大有小：空白时就收起会被「内容出现后的二次展开」覆盖）。
// v4 改为事件驱动：点击后开始监听该项目的 DOM 变化，
// 以「会话区渲染出实质内容（文本节点增多/任务行出现）且短暂稳定」作为加载完成信号，
// 之后若项目仍展开则收起；最长等待 15s 兜底。
// 开关：helper pinnedKeepCollapsed（默认 true = 保持折叠，增强）。
import { rpc } from '../core.js';

let installed = false;
let keepCollapsed = false; // 默认关闭：实现为「先展开再缩起」，有闪烁（应用无拦截点，详见文件头）

async function refreshConfig() {
  try {
    const res = await rpc('/config');
    if (res && res.ok && res.config && res.config.features) {
      keepCollapsed = res.config.features.pinnedKeepCollapsed !== false;
    }
  } catch { /* helper 未就绪时保持默认 */ }
}

export function startPinnedExpandSuppression() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  void refreshConfig();
  setInterval(refreshConfig, 5000);

  document.addEventListener('click', (e) => {
    if (!keepCollapsed) return;
    const taskRow = e.target.closest && e.target.closest('[data-testid^="task-item-"]');
    if (!taskRow) return;
    const key = taskRow.getAttribute('data-task-item-key') || '';
    const sep = key.lastIndexOf(':');
    if (sep <= 0) return;
    const wsKey = key.slice(0, sep);
    const wsRow = document.querySelector(`[data-testid="workspace-item-${cssEscape(wsKey)}"]`);
    if (!wsRow || wsRow.getAttribute('aria-expanded') !== 'false') return;

    const head = wsRow.matches('[aria-expanded]') ? wsRow : wsRow.querySelector('[aria-expanded]');
    if (!head) return;
    // 等会话加载完成（内容渲染且稳定）后再收起
    collapseAfterContentLoaded(wsRow);
  }, true);

  // 用户点项目行头部 = 主动展开，永不干预（事件捕获，先于应用处理）
  document.addEventListener('click', (e) => {
    const row = e.target.closest && e.target.closest('[data-testid^="workspace-item-"]');
    if (row) row.__zcodeproUserTouched = Date.now();
  }, true);
}

// 实测时序（探针 v2）：点击后 ~6s 出现第一次自动展开并被收起；
// 正文文字在点击后 ~8-14s 才开始增长，期间应用还会再次展开项目。
// 因此收起不能是单次动作：在 25s 监听期内持续压制（发现展开即收起），
// 直到「正文出现增长且稳定 1s」（会话真正加载完成）后再做最后一次收起并结束。
function collapseAfterContentLoaded(wsRow) {
  const deadline = Date.now() + 25000;
  let lastLen = (document.querySelector('main') || document.body).innerText.length;
  let grewAt = 0;
  let settledAt = 0;

  const headOf = () => {
    const h = wsRow.matches('[aria-expanded]') ? wsRow : wsRow.querySelector('[aria-expanded]');
    return h || null;
  };
  const userTouched = () => wsRow.__zcodeproUserTouched && Date.now() - wsRow.__zcodeproUserTouched < 800;

  const tick = () => {
    if (!keepCollapsed || Date.now() > deadline || !wsRow.isConnected) return done();
    const len = (document.querySelector('main') || document.body).innerText.length;
    if (len > lastLen) grewAt = Date.now();          // 正文开始/持续增长
    if (grewAt && Date.now() - grewAt >= 1000) settledAt = settledAt || Date.now(); // 增长后稳定 1s
    lastLen = len;

    const head = headOf();
    // 持续压制：监听期内任何展开都收起（用户刚点过头部则跳过）
    if (head && head.getAttribute('aria-expanded') === 'true' && !userTouched()) {
      head.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }
    // 结束条件：正文已增长且稳定 1s（此时收起已完成）——再做最后一次确认收起
    if (settledAt && Date.now() - settledAt >= 1000) {
      const h2 = headOf();
      if (h2 && h2.getAttribute('aria-expanded') === 'true' && !userTouched()) {
        h2.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }
      return done();
    }
    setTimeout(tick, 200);
  };
  const done = () => { wsRow.__zcodeproSuppending = false; };
  wsRow.__zcodeproSuppending = true;
  setTimeout(tick, 400);
}

function cssEscape(s) {
  return String(s).replace(/(["\\\]])/g, '\\$1');
}
