// 会话名锁定：手动重命名过的会话（任务索引 title_overridden=1），侧栏始终显示
// 重命名后的名字。背景：ZCode 的任务索引层尊重重命名标记（自动标题不会写库），
// 但界面层收到运行时推送的自动标题（会话有新回答后生成）会直接覆盖显示——
// 重启后从库读又恢复重命名名，表现为名字反复变化。本功能把侧栏行标题钉回
// 索引库中的重命名值：
// - 标题表来自 helper /pinned-titles（读任务索引，响应带 titleLock 开关），
//   按需拉取：启动、失配复核、设置开关切换（广播事件）、行内重命名提交，
//   以及任务行变动后至多一次的 60 秒延迟刷新——兜住首次重命名（此前不在
//   表里的会话改名对旧表不产生失配，纯按需会漏掉）；空闲时零请求零定时器；
// - 发现行标题与表不符时先延迟复核：重新拉最新表，仍不符才回写 DOM——
//   用户刚完成的重命名（新名先上屏、写库在毫秒级）此时表已更新成新名，
//   不会把新名改回旧名；拉表失败则本轮不干预（缓存可能过时）；
// - 行内有输入框（正在重命名）不干预；回写后再复核一次，纠正数据库写入
//   导致的误回写；
// - 右键“重命名任务”的弹窗预填应用内部状态里的标题（被自动标题覆盖过的
//   会话即旧名），在弹窗里直接点确认会把旧名写回成手动重命名、撤销锁定——
//   点中重命名菜单项后把预填值换成锁定名兜住这个口子（见 prefillRenameDialog）。
// 扫描事件驱动（任务行相关变动去抖 150ms；characterData 必须订阅——React
// 改标题文本走 nodeValue，只产生 characterData 变动）+ 低频兜底轮询。
import { rpc } from '../core.js';

const TASK_SEL = '[data-task-item-key]';
const SCAN_DEBOUNCE_MS = 150;    // 相关 DOM 变动后的去抖，合并连续变动
const SCAN_FALLBACK_MS = 5000;   // 兜底轮询周期：仅补观察器覆盖不到的路径（纯 DOM 扫描，无请求）
const BOOT_RETRY_MS = 5000;      // 启动取表失败时的重试周期（成功后停）
const RECHECK_DELAY_MS = 1000;   // 失配后延迟复核：给刚提交的重命名留写库时间
const REVERIFY_MS = 3000;        // 回写后的再复核：纠正数据库写入极慢导致的误回写
const MAP_REFRESH_MS = 60000;    // 任务行变动后至多一次的延迟表刷新：让新重命名会话进入锁定范围

let installed = false;
const seenRows = new WeakSet(); // 已见过的任务行；新上屏的行立即钉回（不等复核）
let enabled = true;       // titleLock 开关（/pinned-titles 响应带来）
let pinned = null;        // Map(task_id → 重命名标题)；null = 尚未取到/功能关闭
let resolved = false;     // 首次成功通信（无论开关状态）后不再重试启动拉取
let fetching = null;      // 进行中的取表请求（去重并发：批量失配只发一次）
const pendingKeys = new Set(); // 已排期复核的会话键

function sessIdOf(key) {
  // 会话键格式 <workspace_path>:<sess_id>；sess 段固定以 "sess_" 开头（见 session-switch.js）
  const i = key.indexOf(':sess_');
  return i > 0 ? key.slice(i + 1) : key;
}

// 行标题元素组：当前应用为跑马灯结构（p.task-title-marquee 内若干份相同文本的
// data-task-title-copy，滚动动画用副本），读第一份、写时全份同改；
// 旧版/其他区域的截断类结构退回单元素
function titleElsOf(item) {
  const copies = item.querySelectorAll('[data-task-title-copy]');
  if (copies.length) return [...copies];
  const t = item.querySelector('[class*="truncate"]');
  return t ? [t] : [];
}

// 按键找全部匹配行：同一会话理论上可能多处呈现（如置顶区与项目列表），
// 单查询会漏掉其余行——漏掉的行每次扫描都排期、每次复核都被首行挡回，
// 永远钉不回；全量匹配逐行执行
function findRows(key) {
  return [...document.querySelectorAll(`${TASK_SEL}[data-task-item-key="${CSS.escape(key)}"]`)];
}

// 取表（总是最新，rpc 内部已捕获网络错误不会 reject）：
// 失败返回 null = 本轮不干预且保持可重试；成功时顺带更新开关
async function fetchPinned() {
  if (fetching) return fetching;
  const p = (async () => {
    const res = await rpc('/pinned-titles');
    if (!res || !res.ok) return null;
    resolved = true;
    enabled = res.enabled !== false;
    if (!enabled) { pinned = null; return null; }
    pinned = new Map(Object.entries(res.titles || {}));
    return pinned;
  })();
  fetching = p;
  try { return await p; } finally { if (fetching === p) fetching = null; }
}

// 失配判定：返回会话键（失配）或 null（无需干预）。非重命名会话在查表处
// 即返回，不付 DOM 查询成本
function isMismatch(item) {
  if (!enabled || !pinned) return null;
  const key = item.getAttribute('data-task-item-key') || '';
  const want = pinned.get(sessIdOf(key));
  if (want === undefined) return null;
  const els = titleElsOf(item);
  if (!els.length) return null;
  if ((els[0].textContent || '').trim() === String(want).trim()) return null;
  // 行内有输入框 = 正在重命名，不干预
  if (item.querySelector('input, textarea, [contenteditable="true"]')) return null;
  return key;
}

// 写标题：每个目标元素优先原位改 nodeValue（React 缓存的正是该文本节点，
// 其后续标题更新仍走原节点，互不破坏）；多文本节点/无文本时整体替换
// （原位改首个会把残留节点拼在后面，且比较永远失配、越写越长）
function writeTitle(el, text) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const first = walker.nextNode();
  if (first && !walker.nextNode()) first.nodeValue = text;
  else el.textContent = text;
}

// 失配 → 排期复核；到期后行可能已被 React 重挂载，按键重新定位
function scheduleEnforce(key, { immediate = false } = {}) {
  if (immediate) {
    // 新上屏的行（项目展开/滚动复现）带着旧名出现，用户此刻正看着列表——
    // 立即用缓存表钉回，不等复核（编辑中的行不会到这：isMismatch 已排除 input）
    if (enabled && pinned) {
      const want = pinned.get(sessIdOf(key));
      if (want !== undefined) {
        for (const item of findRows(key)) {
          for (const el of titleElsOf(item)) writeTitle(el, want);
        }
      }
    }
  }
  if (pendingKeys.has(key)) return;
  pendingKeys.add(key);
  setTimeout(() => {
    pendingKeys.delete(key);
    void (async () => {
      const map = await fetchPinned();
      if (!map) return; // 拉表失败/功能关闭：缓存可能过时，宁可不干预
      const want = map.get(sessIdOf(key));
      if (want === undefined) return;
      let wrote = false;
      for (const item of findRows(key)) {
        if (isMismatch(item) !== key) continue;
        for (const el of titleElsOf(item)) writeTitle(el, want);
        wrote = true;
      }
      // 数据库写入极慢于复核时，上面的回写会把用户新改名改回旧名；写入完成
      // 后再复核一次纠正（届时表为新名、行仍显旧名，重写回新名）
      if (wrote) setTimeout(() => { void enforceKey(key); }, REVERIFY_MS);
    })();
  }, RECHECK_DELAY_MS);
}

async function enforceKey(key) {
  const map = await fetchPinned();
  if (!map) return;
  const want = map.get(sessIdOf(key));
  if (want === undefined) return;
  for (const item of findRows(key)) {
    if (isMismatch(item) !== key) continue;
    for (const el of titleElsOf(item)) writeTitle(el, want);
  }
}

function scan() {
  if (!enabled || !pinned || pinned.size === 0) return;
  for (const item of document.querySelectorAll(TASK_SEL)) {
    const key = isMismatch(item);
    if (!key) { seenRows.add(item); continue; }
    // 新上屏的失配行立即钉回（项目展开时旧名闪现 1 秒+，用户不知道点哪个）；
    // 已在屏上的失配走原路径（复核后写，避免把刚提交的重命名改回旧名）
    const fresh = !seenRows.has(item);
    seenRows.add(item);
    scheduleEnforce(key, { immediate: fresh });
  }
}

// 只有任务条目相关变动才重扫（选法同 session-switch.js）；
// 本功能自己的回写也会经过这里，回写后文本与表一致，自然空转
const inTaskRow = (node) => !!(node instanceof Element && node.closest && node.closest(TASK_SEL));
function taskRowMutations(muts) {
  for (const m of muts) {
    if (m.type === 'attributes') {
      if (inTaskRow(m.target)) return true;
    } else if (m.type === 'characterData') {
      if (m.target.parentElement && inTaskRow(m.target.parentElement)) return true;
    } else if (inTaskRow(m.target)) {
      return true;
    } else {
      for (const n of m.addedNodes) {
        if (n instanceof Element && (n.matches(TASK_SEL) || !!n.querySelector(TASK_SEL))) return true;
      }
    }
  }
  return false;
}

let scanDebounce = 0;
function scheduleScan() {
  if (scanDebounce) return;
  scanDebounce = setTimeout(() => { scanDebounce = 0; scan(); }, SCAN_DEBOUNCE_MS);
}

// 变动后至多一次的延迟表刷新：重命名提交对旧表不一定产生失配——从未重命名过的
// 会话第一次改名时不在表里，查表即返回，不会触发按需拉取；没有这一层，新改名
// 要等到下次失配或页面重载才进入保护。空闲时（无侧栏变动）不挂任何定时器。
// 每个变动窗口只刷新一次（窗口内后续变动不再重置定时器），页面隐藏时延迟重试。
let mapRefreshTimer = 0;
function refreshMapSoon() {
  if (mapRefreshTimer) return;
  const tick = () => {
    if (document.hidden) { mapRefreshTimer = setTimeout(tick, 10000); return; }
    mapRefreshTimer = 0;
    if (enabled && resolved) void fetchPinned().then((m) => { if (m) scan(); });
  };
  mapRefreshTimer = setTimeout(tick, MAP_REFRESH_MS);
}

// 行内重命名提交的即时感知：任务行内编辑器聚焦→失焦 = 一次重命名提交（或取消，
// 多拉一次表无害），立即刷新让新名即刻进入锁定范围；对话框式重命名（输入框不在
// 行内）感知不到，由 refreshMapSoon 兜底
let editingKey = null;

// 启动取表失败的重试：间隔逐次翻倍、封顶 60 秒，成功即停——helper 长期异常时
// 退为约每分钟一次，不维持 5 秒高频
let bootDelay = 0;
function scheduleBootRetry() {
  bootDelay = bootDelay ? Math.min(bootDelay * 2, MAP_REFRESH_MS) : BOOT_RETRY_MS;
  setTimeout(() => {
    if (resolved) return;
    if (!document.hidden) void bootstrap();
    scheduleBootRetry();
  }, bootDelay);
}

async function bootstrap() {
  const map = await fetchPinned();
  if (map) scan();
}

// 供智能起名（title-gen.js）复用：把指定会话键的所有侧栏行标题改为 text
// （同一会话可能多行呈现，与失配回写共用同一套元素定位与写法）
export function setRowTitle(key, text) {
  for (const item of findRows(key)) {
    for (const el of titleElsOf(item)) writeTitle(el, text);
  }
}

// 供智能起名在写库成功后立即刷新锁定表（拉最新标题表并全量复核一次），
// 之后官方推送的自动标题由本功能按新表钉回
export function refreshPinnedTitles() {
  return fetchPinned().then((m) => { if (m) scan(); });
}

// —— 重命名弹窗预填锁定名 ——
// 官方“重命名任务”弹窗（[role=dialog] 内的输入框）预填应用内部状态里的标题，
// 被自动标题覆盖过的会话即旧名；用户在弹窗里不做修改直接确认，会把旧名当成
// 手动重命名写库、悄悄撤销锁定。右键任务行记下会话、点到“重命名”菜单项后才
// 武装预填（右键菜单里“分组”“反馈问题”等也会弹输入框，只按右键窗口判定会
// 误写它们）；且只改已有预填值的输入框——官方重命名弹窗必带当前标题，反馈、
// 新建分组这类空白输入框不碰
const RENAME_CTX_VALID_MS = 15000; // 点中重命名菜单项到弹窗出现的有效窗口
let renameCtx = null;              // { key, at, armed } 最近右键的任务行
const renamePrefilled = new WeakSet(); // 已预填过的输入框，不重复处理、不与输入争抢

// 原位写值并让 React 受控输入接住：直接 el.value = x 不派发事件，框架状态
// 会把值改回原样；用原型 setter 写入再派发 input 事件（实测有效）
function setNativeValue(el, text) {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, text);
  } else {
    el.textContent = text;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function prefillRenameDialog() {
  if (!renameCtx || !renameCtx.armed || Date.now() - renameCtx.at > RENAME_CTX_VALID_MS) { renameCtx = null; return; }
  if (!enabled || !pinned) return;
  const want = pinned.get(sessIdOf(renameCtx.key));
  if (want === undefined) return; // 该会话没重命名过：弹窗显示的就是官方值，不动
  for (const el of document.querySelectorAll('[role="dialog"] input, [role="dialog"] textarea, [role="dialog"] [contenteditable="true"]')) {
    if (renamePrefilled.has(el) || !el.getClientRects().length) continue;
    if (el.closest(TASK_SEL) || el.closest('.zcodepro-overlay')) continue;
    const cur = String((el.value ?? el.textContent) ?? '').trim();
    if (!cur) continue; // 空白输入框不是重命名弹窗（反馈/新建分组等），不碰
    renamePrefilled.add(el);
    if (cur !== String(want).trim()) setNativeValue(el, String(want));
    renameCtx = null; // 一次重命名只预填最先出现的非空输入框
    return;
  }
}

export function startTitleLock() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  void bootstrap();

  new MutationObserver((muts) => {
    if (renameCtx) prefillRenameDialog();
    if (!taskRowMutations(muts)) return;
    refreshMapSoon();
    scheduleScan();
  })
    .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'], characterData: true });

  // 右键记下目标会话（捕获阶段，菜单未弹出前）；点中“重命名”菜单项才武装预填
  //（从点菜单项起重新计有效窗口）。右键空白处则清掉，避免误改无关弹窗
  document.addEventListener('contextmenu', (e) => {
    const row = e.target instanceof Element && e.target.closest(TASK_SEL);
    renameCtx = row ? { key: row.getAttribute('data-task-item-key') || '', at: 0, armed: false } : null;
  }, true);
  document.addEventListener('click', (e) => {
    if (!renameCtx || renameCtx.armed) return;
    const item = e.target instanceof Element && e.target.closest('[role="menuitem"], [data-radix-collection-item]');
    if (item && /重命名|rename/i.test(item.textContent || '')) {
      renameCtx.armed = true;
      renameCtx.at = Date.now();
    }
  }, true);

  // 启动期取表失败（helper 未就绪/索引暂不可读）时退避重试，成功即停
  scheduleBootRetry();

  // 低频兜底：纯 DOM 扫描补观察器覆盖不到的路径（无可锁定会话时零成本早退）
  setInterval(() => { if (!document.hidden) scan(); }, SCAN_FALLBACK_MS);

  // 回到前台补扫（隐藏期间后台推送的自动标题在此追上）
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scan(); });

  // 设置弹窗保存开关后立即生效（settings-dialog.js 派发；响应带新开关与标题表）
  window.addEventListener('zcodepro:config-changed', () => { void bootstrap(); });

  // 行内重命名提交检测（见 editingKey 注释）：失焦即拉最新表
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!(el instanceof Element)) return;
    if (!el.matches('input, textarea, [contenteditable="true"]')) return;
    const row = el.closest(TASK_SEL);
    editingKey = row ? (row.getAttribute('data-task-item-key') || '') : null;
  });
  document.addEventListener('focusout', () => {
    if (editingKey === null) return;
    editingKey = null;
    void fetchPinned().then((m) => { if (m) scan(); });
  });
}
