// 注入脚本公共工具：与 helper 通信、DOM 构建、多语言文案。
export const BOOT = typeof window !== 'undefined' ? (window.__ZCODEPRO__ || {}) : {};
export const HELPER_URL = BOOT.helperUrl || 'http://127.0.0.1:47889';
const TOKEN = BOOT.token || '';

export function rpc(path, options = {}) {
  return fetch(HELPER_URL + path, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-ZCodePro-Token': TOKEN,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
    .then((r) => r.json())
    .catch((err) => ({ ok: false, error: String(err && err.message || err) }));
}

// 配置缓存：菜单每次打开时拉取，保证设置弹窗里的开关即时生效
let configCache = { value: null, at: 0 };
export async function getConfig(force = false) {
  const now = Date.now();
  if (!force && configCache.value && now - configCache.at < 3000) return configCache.value;
  const res = await rpc('/config');
  if (res.ok && res.config) {
    configCache = { value: res.config, at: now };
    return res.config;
  }
  return configCache.value || { features: {} };
}
export function clearConfigCache() { configCache = { value: null, at: 0 }; }

const zh = {
  settingsEntry: 'ZCode Pro 设置',
  settingsTitle: 'ZCode Pro 增强设置',
  settingsSubtitle: '界面增强随 ZCode Pro 启动自动生效，不修改 ZCode 应用文件。',
  featureAlias: '项目“更多”菜单 · 自定义别名',
  featureAliasDesc: '为项目设置仅界面显示的别名：侧边栏显示别名，磁盘目录与所有数据不变。',
  featureRelocate: '项目“更多”菜单 · 切换文件夹',
  featureRelocateDesc: '将项目指向另一个文件夹：侧边栏、标签页与任务历史一并迁移，目录本身不动。',
  featureEntry: '右上角菜单 · 设置入口',
  featureEntryDesc: '在右上角下拉菜单中显示“ZCode Pro 设置”。',
  statusOk: '辅助服务运行中',
  statusDown: '辅助服务不可用',
  injectedPages: '已增强页面',
  version: '版本',
  close: '关闭',
  cancel: '取消',
  pathLabel: '路径',
  aliasItem: '自定义别名',
  aliasTitle: '自定义项目别名',
  aliasDesc: '仅在 ZCode 界面中显示该别名，不修改磁盘目录与任何数据，随时可清除恢复。',
  aliasLabel: '别名',
  aliasPlaceholder: '留空并保存 = 恢复真实名称',
  aliasConfirm: '保存',
  aliasClear: '恢复真实名称',
  aliasSaved: '别名已更新',
  aliasCleared: '已恢复真实名称',
  aliasHint: '磁盘目录名不变：终端、文件管理器与其他引用真实路径的界面仍显示原名。',
  browse: '浏览',
  relocateItem: '切换文件夹',
  relocateTitle: '切换文件夹',
  relocateDesc: '将该项目指向另一个文件夹：侧边栏、已打开标签页与本地任务历史一并迁移，目录本身不会被移动，会话记录不会丢失。',
  relocateNewPathLabel: '新文件夹',
  relocateConfirm: '移动',
  relocateHint: '目标文件夹需已存在，可输入路径或点击「浏览」选择；完成后界面将自动刷新。',
  relocateSuccess: '已切换文件夹，正在刷新界面…',
  relocateIndexSkipped: '已切换文件夹；任务历史未能同步（本机缺少 SQLite 支持），旧任务条目可能仍指向旧路径。',
  relocateSame: '新文件夹与当前文件夹相同',
  relocateNotFound: '目标文件夹不存在',
  relocateProtected: '拒绝指向 ZCode 数据目录内部路径',
  relocateIndexBusy: '任务索引正被 ZCode 占用，请稍后重试。',
  failed: '操作失败',
  retryHint: '请重试',
};

const en = {
  settingsEntry: 'ZCode Pro Settings',
  settingsTitle: 'ZCode Pro Enhancements',
  settingsSubtitle: 'Enhancements load automatically with ZCode Pro; no app files are modified.',
  featureAlias: 'Project "More" menu · Custom alias',
  featureAliasDesc: 'A UI-only alias: the sidebar shows your custom name while the directory and all data stay untouched.',
  featureRelocate: 'Project "More" menu · Switch folder',
  featureRelocateDesc: 'Points a project at another folder; the sidebar, tabs and task history follow. The directory stays untouched.',
  featureEntry: 'Header menu · Settings entry',
  featureEntryDesc: 'Show "ZCode Pro Settings" in the top-right dropdown menu.',
  statusOk: 'Helper running',
  statusDown: 'Helper unavailable',
  injectedPages: 'Pages enhanced',
  version: 'Version',
  close: 'Close',
  cancel: 'Cancel',
  pathLabel: 'Path',
  aliasItem: 'Custom alias',
  aliasTitle: 'Custom alias',
  aliasDesc: 'Shown in the ZCode UI only. The directory on disk and all data stay untouched; revert anytime.',
  aliasLabel: 'Alias',
  aliasPlaceholder: 'Leave empty and save to restore the real name',
  aliasConfirm: 'Save',
  aliasClear: 'Restore real name',
  aliasSaved: 'Alias updated.',
  aliasCleared: 'Real name restored.',
  aliasHint: 'The directory name on disk is unchanged: terminals, file managers and other path-based UI still show the real name.',
  browse: 'Browse',
  relocateItem: 'Switch folder',
  relocateTitle: 'Switch folder',
  relocateDesc: 'Points this project at another folder: the sidebar, open tabs and local task history move along. The directory itself is not moved and no sessions are lost.',
  relocateNewPathLabel: 'New folder',
  relocateConfirm: 'Move',
  relocateHint: 'The target folder must already exist. Enter a path or use Browse; the UI refreshes automatically afterwards.',
  relocateSuccess: 'Folder switched. Refreshing…',
  relocateIndexSkipped: 'Folder switched, but the task history was not synced (SQLite support missing); old entries may still point to the old path.',
  relocateSame: 'The new folder is the same as the current one.',
  relocateNotFound: 'The target folder does not exist.',
  relocateProtected: 'Refusing to point inside the ZCode data directory.',
  relocateIndexBusy: 'The task index is busy (ZCode may be writing). Please retry shortly.',
  failed: 'Operation failed',
  retryHint: 'Please retry',
};

export function t() {
  return /^zh/i.test(navigator.language || 'zh-CN') ? zh : en;
}

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') el.className = v;
      else if (k === 'style') el.setAttribute('style', v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, '');
      else if (v !== false && v !== undefined && v !== null) el.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c === undefined || c === null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function closeRadixMenu(contentEl) {
  try {
    contentEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
  } catch { /* ignore */ }
}

// 观察 Radix 弹层（下拉菜单/弹出框）出现，回调 content 元素
export function observeRadixPopups(onPopup) {
  const seen = new WeakSet();
  const check = (node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.hasAttribute('data-radix-popper-content-wrapper')) {
      // wrapper 先出现，content 在下一帧内插入
      requestAnimationFrame(() => {
        const content = node.firstElementChild;
        if (content && !seen.has(content)) {
          seen.add(content);
          onPopup(content);
        }
      });
    }
    // 兜底：直接观察 role=menu 的 content
    if (node.getAttribute && node.getAttribute('role') === 'menu' && !seen.has(node)) {
      seen.add(node);
      onPopup(node);
    }
  };
  const process = (mutations) => {
    for (const m of mutations) for (const n of m.addedNodes) check(n);
  };
  const observer = new MutationObserver(process);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  return observer;
}

export function itemsOf(menuEl) {
  return [...menuEl.querySelectorAll('[role="menuitem"]')];
}

export function itemText(item) {
  return (item.textContent || '').trim();
}
