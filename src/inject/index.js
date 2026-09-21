// ZCode Pro 注入脚本入口（由 esbuild 打包为 dist/inject.js，launcher 拼上启动参数后注入页面）。
// 幂等守卫：页面刷新/重复注入时只初始化一次。
import { observeRadixPopups } from './core.js';
import { handleProjectMenu } from './features/project-menu.js';
import { handleFileMenu } from './features/file-menu.js';
import { startSettingsEntry } from './features/settings-entry.js';
import { startAliasWatcher } from './features/alias.js';
import { startTaskOrderWatcher } from './features/task-order.js';
import { startPinnedExpandSuppression } from './features/pinned-expand.js';
import { startStyleAdjustments } from './features/styles.js';
import { ensureStyle } from './ui.js';

(function zcodeproInject() {
  if (typeof window === 'undefined') return;
  if (window.__zcodeproInjected) return;
  window.__zcodeproInjected = true;

  // 注意：本脚本可能在 document start 阶段执行（head 尚未就绪），
  // 因此所有 DOM 操作都推迟到 DOMContentLoaded 之后。
  const start = () => {
    ensureStyle();
    observeRadixPopups((content) => {
      try { handleProjectMenu(content); } catch { /* 单个功能失败不影响其他 */ }
      try { handleFileMenu(content); } catch { /* ignore */ }
    });
    try { void startAliasWatcher(); } catch { /* ignore */ }
    try { startTaskOrderWatcher(); } catch { /* ignore */ }
    try { startPinnedExpandSuppression(); } catch { /* ignore */ }
    try { startStyleAdjustments(); } catch { /* ignore */ }
    try { startSettingsEntry(); } catch { /* ignore */ }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => start(), { once: true });
  } else {
    start();
  }
})();
