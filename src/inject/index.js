// ZCode Pro 注入脚本入口（由 esbuild 打包为 dist/inject.js，launcher 拼上启动参数后注入页面）。
// 幂等守卫：页面刷新/重复注入时只初始化一次。
import { observeRadixPopups, startLocaleResolver } from './core.js';
import { handleProjectMenu } from './features/project-menu.js';
import { handleFileMenu } from './features/file-menu.js';
import { startImageMenu } from './features/image-menu.js';
import { startSettingsEntry } from './features/settings-entry.js';
import { startAliasWatcher } from './features/alias.js';
import { startTaskOrderWatcher } from './features/task-order.js';
import { startSessionSwitch } from './features/session-switch.js';
import { startTitleLock } from './features/title-lock.js';
import { startPinnedExpandSuppression } from './features/pinned-expand.js';
import { startWsRunningSpin } from './features/ws-running.js';
import { startIdleReclaim } from './features/idle-reclaim.js';
import { startToolbarIcons } from './features/toolbar-icons.js';
import { startPinnedCollapse } from './features/pinned-collapse.js';
import { startStyleAdjustments } from './features/styles.js';
import { startPluginUpdateCheck } from './features/plugin-updates.js';
import { ensureStyle } from './ui.js';

(function zcodeproInject() {
  if (typeof window === 'undefined') return;
  if (window.__zcodeproInjected) return;
  window.__zcodeproInjected = true;

  // 尽早取回系统语言（异步 IPC）：system 偏好下 macOS 的 navigator.language 可能与
  // 实际不符；start() 里会再调一次，覆盖 preload 桥未就绪的情况
  try { startLocaleResolver(); } catch { /* ignore */ }

  // 注意：本脚本可能在 document start 阶段执行（head 尚未就绪），
  // 因此所有 DOM 操作都推迟到 DOMContentLoaded 之后。
  const start = () => {
    ensureStyle();
    try { startLocaleResolver(); } catch { /* ignore */ }
    observeRadixPopups((content) => {
      try { handleProjectMenu(content); } catch { /* 单个功能失败不影响其他 */ }
      try { handleFileMenu(content); } catch { /* ignore */ }
    });
    try { void startAliasWatcher(); } catch { /* ignore */ }
    try { startTaskOrderWatcher(); } catch { /* ignore */ }
    try { startSessionSwitch(); } catch { /* ignore */ }
    try { startTitleLock(); } catch { /* ignore */ }
    try { startImageMenu(); } catch { /* ignore */ }
    try { startPinnedExpandSuppression(); } catch { /* ignore */ }
    try { startWsRunningSpin(); } catch { /* ignore */ }
    try { startIdleReclaim(); } catch { /* ignore */ }
    try { startToolbarIcons(); } catch { /* ignore */ }
    try { startPinnedCollapse(); } catch { /* ignore */ }
    try { startStyleAdjustments(); } catch { /* ignore */ }
    try { startSettingsEntry(); } catch { /* ignore */ }
    // 插件更新检查慢（可能 git pull），异步进行，不阻塞其他功能
    try { void startPluginUpdateCheck(); } catch { /* ignore */ }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => start(), { once: true });
  } else {
    start();
  }
})();
