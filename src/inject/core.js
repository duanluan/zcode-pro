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
  settingsTitle: 'ZCode Pro 增强设置',
  tabFeatures: '功能',
  tabStyles: '样式调整',
  tabAgents: '全局提示词',
  agentsDesc: '写入 ~/.zcode/AGENTS.md，作为默认指令注入所有项目的每次会话；保存后从新会话起生效，项目内的 AGENTS.md 可补充或覆盖。内容超过 100KB 会被应用截断。',
  agentsPlaceholder: '填写希望所有项目默认遵循的指令；清空并保存即移除全局提示词',
  agentsSave: '保存',
  agentsSaved: '全局提示词已保存',
  agentsLoadFailed: '读取全局提示词失败',
  rowGapName: '段落间距',
  rowGapDesc: '会话中段落等文本块之间的垂直间距（回合之间、答案内部）。',
  listSpacingName: '列表间距',
  listSpacingDesc: '答案中列表上下的留白。',
  listItemSpacingName: '列表项间距',
  listItemSpacingDesc: '列表中相邻列表项之间的间距。',
  quoteCodeSpacingName: '引用与代码块间距',
  quoteCodeSpacingDesc: '引用、代码块上下的留白。',
  lineHeightName: '回答行高',
  lineHeightDesc: '回答正文的行高（倍数）。',
  userLineHeightName: '提问行高',
  userLineHeightDesc: '提问内容的行高（倍数）。',
  contentWidthName: '内容宽度',
  contentWidthDesc: '会话内容的最大宽度，可输入 px 或 %（如 900px、85%）；默认显示当前实际宽度，% 相对会话区域。',
  defaultValue: '默认',
  resetDefault: '恢复默认',
  featureAlias: '项目“更多”菜单 · 自定义别名',
  featureAliasDesc: '为项目设置仅界面显示的别名：侧边栏显示别名，磁盘目录与所有数据不变。',
  featureRelocate: '项目“更多”菜单 · 切换文件夹',
  featureRelocateDesc: '将项目指向另一个文件夹：侧边栏、标签页与任务历史一并迁移，目录本身不动。',
  featureTaskOrder: '侧边栏会话拖动排序',
  featureTaskOrderDesc: '让置顶、项目与分组中的会话拖动后记住顺序，刷新后保持。',
  featureFileActions: '文件菜单增强',
  featureFileActionsDesc: '在会话中文件链接的右键菜单里新增「默认应用打开」与「打开所在目录」。',
  fileOpenDefault: '默认应用打开',
  fileReveal: '打开所在目录',
  featurePinnedExpand: '置顶会话保持项目折叠（实验性）',
  featurePinnedExpandDesc: '点击折叠项目的置顶会话后将其保持折叠。受限于应用机制，项目会先短暂展开再缩起。',
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
  taskOrderSaved: '顺序已更新',
  plugTitle: '插件推荐：duanluan-zcode-plugins',
  plugDesc: '为 ZCode 打造的插件合集：AI 代码评审、请求压缩节省 token、命令输出压缩。点击访问 GitHub 仓库。',
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
  settingsTitle: 'ZCode Pro Enhancements',
  tabFeatures: 'Features',
  tabStyles: 'Styles',
  tabAgents: 'Global Prompt',
  agentsDesc: 'Written to ~/.zcode/AGENTS.md and injected as default instructions into every session across all projects. Takes effect for new sessions; per-project AGENTS.md can extend or override it. Content over 100 KB is truncated by the app.',
  agentsPlaceholder: 'Instructions followed by all projects by default; save empty to remove the global prompt',
  agentsSave: 'Save',
  agentsSaved: 'Global prompt saved.',
  agentsLoadFailed: 'Failed to load the global prompt',
  rowGapName: 'Paragraph spacing',
  rowGapDesc: 'Vertical spacing between text blocks (turns, paragraphs inside answers).',
  listSpacingName: 'List spacing',
  listSpacingDesc: 'Space above and below lists.',
  listItemSpacingName: 'List item spacing',
  listItemSpacingDesc: 'Spacing between adjacent list items.',
  quoteCodeSpacingName: 'Quote & code spacing',
  quoteCodeSpacingDesc: 'Space above and below quotes and code blocks.',
  lineHeightName: 'Answer line height',
  lineHeightDesc: 'Line height of answer text (multiplier).',
  userLineHeightName: 'Question line height',
  userLineHeightDesc: 'Line height of question text (multiplier).',
  contentWidthName: 'Content width',
  contentWidthDesc: 'Max width of conversation content; accepts px or % (e.g. 900px, 85%).',
  defaultValue: 'default',
  resetDefault: 'Reset to default',
  featureAlias: 'Project "More" menu · Custom alias',
  featureAliasDesc: 'A UI-only alias: the sidebar shows your custom name while the directory and all data stay untouched.',
  featureRelocate: 'Project "More" menu · Switch folder',
  featureRelocateDesc: 'Points a project at another folder; the sidebar, tabs and task history follow. The directory stays untouched.',
  featureTaskOrder: 'Sidebar session drag ordering',
  featureTaskOrderDesc: 'Makes session drags in Pinned, Projects and Groups persist across refreshes.',
  featureFileActions: 'File menu actions',
  featureFileActionsDesc: 'Adds "Open with default app" and "Reveal in file manager" to the right-click menu of file links in chat.',
  fileOpenDefault: 'Open with default app',
  fileReveal: 'Reveal in file manager',
  featurePinnedExpand: 'Keep projects collapsed for pinned sessions (experimental)',
  featurePinnedExpandDesc: 'Keeps the project collapsed after clicking a pinned session. Note: it briefly expands first, then collapses.',
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
  taskOrderSaved: 'Order updated.',
  plugTitle: 'Plugin pick: duanluan-zcode-plugins',
  plugDesc: 'A plugin collection for ZCode: AI code review, request compression to save tokens, and command output compression. Click to visit the GitHub repo.',
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

// helper 错误消息的英文映射（code → 文案）：helper 原文为中文，非中文界面按 code 显示英文，
// 无映射或中文界面回退 helper 原文
const errEn = {
  'invalid-path': 'Invalid project path',
  'invalid-request': 'Invalid request',
  'invalid-content': 'content must be a string',
  'agents-read': 'Failed to read AGENTS.md',
  'agents-write': 'Failed to write AGENTS.md',
  'config-save': 'Failed to save config',
  'settings-write': 'Failed to update setting.json',
  'workspace-empty': 'Workspace not found or has no sessions',
  'order-write': 'Failed to persist ordering',
  'group-not-found': 'No group contains these sessions',
  'group-ambiguous': 'Cannot determine the group uniquely',
  'name-too-long': 'Alias too long (max 100 characters)',
  'name-invalid-chars': 'Alias must not contain newlines or control characters',
  'index-remap-failed': 'Failed to update the task index (config changes rolled back)',
  'index-error': 'Task index error',
  'index-busy': 'The task index is busy. Please retry shortly.',
};

export function errText(res) {
  if (!res) return '';
  if (!/^zh/i.test(navigator.language || 'zh-CN')) {
    const en = res.code && errEn[res.code];
    if (en) return en;
  }
  return res.error || '';
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
