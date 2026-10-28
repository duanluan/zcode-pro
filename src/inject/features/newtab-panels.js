// 新标签页插件面板入口：ZCode 3.16.1 的“新标签页”只列官方面板（文件/终端/
// 辅助对话/浏览器/审查）与云端推荐的官方插件，第三方市场（duanluan/zcode-plugins
// 等）的面板（headroom、rtk……）注册正常（listSurfaces 有返回）却没有任何入口。
// 本功能检测新标签页的模块网格，把非官方市场的面板注入成同款卡片；点击走官方
// openSidePane（App 层注入 Context Provider 的 handleOpenPluginUi，从 React
// fiber 里按函数源码特征串挖出）在侧边面板打开 tab——与插件市场页“打开”同一条
// 调用路径，不绕开官方逻辑。
import { t, getConfig, isZhLocale } from '../core.js';
import { ensureStyle, showToast } from '../ui.js';

// 官方“新标签页”终端模块的描述片段（界面中英文），作为网格识别特征
const GRID_HINTS = ['运行命令和查看输出', 'Run commands and view output'];
// 官方市场的 pluginId 后缀：这些面板已有云端推荐入口，不注入
const OFFICIAL_SUFFIX = '@zcode-plugins-official';
// handleOpenPluginUi（useCallback 产物）源码里的 logger 字符串，压缩不改动
// 字面量，以此从多个 Context Provider 中精确挑出打开面板的函数
const OPEN_FN_MARK = '打开插件 UI';

let enabled = true;
let injectTimer = 0;

// —— 从 React fiber 取应用内部对象（ws-running.js findServices 同款遍历） ——

function eachFiber(visit) {
  const rootEl = document.getElementById('root');
  const key = rootEl && Object.keys(rootEl).find((k) => k.startsWith('__reactContainer$'));
  if (!key) return;
  let visited = 0;
  const walk = (f) => {
    if (!f || visited > 200000) return;
    visited++;
    if (visit(f)) return true;
    return walk(f.child) || walk(f.sibling);
  };
  walk(rootEl[key]);
}

// Context Provider 的 value 里找打开插件面板的函数（特征：源码含 logger 字符串）
function findOpenSidePane() {
  let found = null;
  eachFiber((f) => {
    const et = f.elementType;
    if (et && typeof et === 'object' && typeof et.$$typeof === 'symbol'
      && String(et.$$typeof).includes('react.context')) {
      const val = f.memoizedProps && f.memoizedProps.value;
      if (typeof val === 'function' && val.toString().includes(OPEN_FN_MARK)) {
        found = val;
        return true;
      }
    }
    return false;
  });
  return found;
}

// pluginUiBridgeService（listSurfaces 数据源）
function findBridge() {
  let holder = null;
  const seen = new Set();
  const scan = (o) => {
    if (!o || typeof o !== 'object' || seen.has(o) || holder) return;
    seen.add(o);
    if (typeof o.pluginUiBridgeService === 'object' && o.pluginUiBridgeService) {
      holder = o.pluginUiBridgeService;
      return;
    }
    for (const v of Object.values(o)) if (v && typeof v === 'object') scan(v);
  };
  eachFiber((f) => {
    for (const h of [f.memoizedProps, f.memoizedState]) {
      if (!h || typeof h !== 'object') continue;
      scan(h);
      if (holder) return true;
    }
    return false;
  });
  return holder;
}

// —— 会话与面板清单 ——

// 打开面板必须挂在某个会话上（availability: session）：优先当前选中会话，
// 其次侧栏最新一行（新会话更可能已随启动拉起插件的 UI server，老会话的
// server 目录里没有该插件时会卡在“正在加载插件界面”）；一个都没有返回 null
function sessionScope() {
  const rows = [...document.querySelectorAll('[data-task-item-key]')];
  const cur = rows.find((e) => (e.className + '').includes('bg-selected')) || rows[rows.length - 1];
  const key = cur ? cur.getAttribute('data-task-item-key') : '';
  if (!key) return null;
  // task_id 有 sess_ 与 session_ 两种前缀，按最后一个 ':' 切（Windows 盘符的
  // ':' 在最前，id 段在最后且自身不含 ':'）
  const i = key.lastIndexOf(':');
  return i > 0 ? { workspacePath: key.slice(0, i), sessionId: key.slice(i + 1) } : null;
}

async function thirdPartySurfaces(bridge, workspacePath) {
  try {
    const list = await bridge.listSurfaces({ workspacePath });
    return (list || []).filter((s) => !String(s.pluginId || '').endsWith(OFFICIAL_SUFFIX));
  } catch {
    return [];
  }
}

function surfaceTitle(s, locale) {
  const title = s.title;
  const pick = (obj) => {
    const lang = (locale || '').split('-')[0];
    return obj[locale] || (lang && obj[lang])
      || Object.entries(obj).find(([k]) => k.toLowerCase().startsWith(lang || '\0'))?.[1]
      || obj.en || Object.values(obj)[0] || '';
  };
  if (typeof title === 'string') return title;
  if (title && typeof title === 'object') {
    return pick(title) || s.pluginName || s.id;
  }
  return s.pluginName || s.id;
}

// —— 卡片注入 ——

// 通用面板图标（lucide layout-dashboard 同款路径），替换模板卡片原图标
const PANEL_ICON_PATHS = ['<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>'];

// 找“新标签页”的模块网格：官方卡片按钮带 data-side-pane-open-tab-item
// （3.16.1 实测标识），其父容器即网格；文本特征兜底校验（终端模块描述）
function findNewTabGrid() {
  const item = document.querySelector('[data-side-pane-open-tab-item]');
  if (!item || item.offsetParent === null) return null;
  const grid = item.parentElement;
  if (!grid || grid === document.body) return null;
  const text = grid.textContent || '';
  return GRID_HINTS.some((h) => text.includes(h)) ? grid : null;
}

async function injectPanels(grid) {
  if (grid.dataset.zcodeproPanels) return;
  const template = grid.querySelector('[data-side-pane-open-tab-item]');
  if (!template) return;
  const scope = sessionScope();
  if (!scope) return; // 没有任何会话时暂不注入，下次 DOM 变动再试
  const bridge = findBridge();
  if (!bridge) return;
  const surfaces = await thirdPartySurfaces(bridge, scope.workspacePath);
  if (!surfaces.length) { grid.dataset.zcodeproPanels = '1'; return; }
  grid.dataset.zcodeproPanels = '1';
  const L = t();
  const locale = isZhLocale() ? 'zh-CN' : 'en-US';
  for (const s of surfaces) {
    // 官方卡片整卡即 button：克隆同款，去掉官方标识，挂我们的标识与点击
    const card = template.cloneNode(true);
    card.removeAttribute('data-side-pane-open-tab-item');
    card.setAttribute('data-zcodepro-panel', s.id);
    card.setAttribute('data-zcodepro-panel-name', s.pluginName || '');
    const title = surfaceTitle(s, locale);
    const desc = (s.pluginName || '') + ' · ' + L.ntpDescSuffix;
    const titleEl = card.querySelector('span.font-semibold');
    if (titleEl) titleEl.textContent = title;
    const descEl = card.querySelector('span[title]');
    if (descEl) { descEl.textContent = desc; descEl.setAttribute('title', desc); }
    // 图标换通用面板图形（模板 svg 的描边样式保留）
    const svg = card.querySelector('svg');
    if (svg) {
      svg.innerHTML = PANEL_ICON_PATHS[0];
      svg.setAttribute('viewBox', '0 0 24 24');
    }
    card.addEventListener('click', (ev) => {
      // 克隆卡片会冒泡到官方“新标签页”容器的点击处理（被当成再开一个新标签页），
      // 这里拦下冒泡只走面板打开
      ev.stopPropagation();
      const sc = sessionScope();
      const open = findOpenSidePane();
      if (!sc || !open) {
        showToast(L.ntpNeedSession, 'warning');
        return;
      }
      try {
        // 字段与官方市场页 selectSurface 的请求一致；serverName（资源的 MCP
        // server 归属）缺失会让沙箱准备一直停在“正在加载插件界面…”
        open({
          parentSessionId: sc.sessionId,
          pluginId: s.pluginId,
          surfaceId: s.id,
          serverName: s.server,
          resourceUri: s.resourceUri,
          remoteSessionId: null,
          title,
          workspacePath: sc.workspacePath,
        });
      } catch (e) {
        console.warn('[zcodepro] 打开插件面板失败', e);
        showToast(L.ntpNeedSession, 'warning');
      }
    });
    grid.append(card);
  }
}

function tryInject() {
  if (!enabled || document.hidden) return;
  const grid = findNewTabGrid();
  if (!grid) return;
  // React 重渲染可能冲掉注入的卡片：标记还在但卡片没了时清标记重注
  if (grid.dataset.zcodeproPanels && !grid.querySelector('[data-zcodepro-panel]')) {
    delete grid.dataset.zcodeproPanels;
  }
  void injectPanels(grid);
}

export function startNewtabPanels() {
  ensureStyle();
  const refreshEnabled = () => {
    void getConfig().then((cfg) => {
      enabled = cfg.features ? cfg.features.newtabPanels !== false : true;
    }).catch(() => {});
  };
  refreshEnabled();
  // 设置里开关变化即时生效（保存时会派发 config-changed）
  window.addEventListener('zcodepro:config-changed', refreshEnabled);
  const observer = new MutationObserver(() => {
    if (injectTimer) return;
    injectTimer = setTimeout(() => { injectTimer = 0; tryInject(); }, 300);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  setInterval(tryInject, 5000);
}
