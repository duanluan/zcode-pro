// 任务名提示词（自动起名）：官方在新会话首轮后自动起名的提示词写死在运行时
// 里、不可配置，起出的名字常不合适。本功能在“新会话”出现后，把会话区的
// 用户消息交给 helper（/title-gen/run），用设置弹窗里选择的供应商与提示词
// 重新生成标题，并按“手动重命名”写入任务索引（title_overridden=1）：
// - 触发信号 = 侧栏出现一个全新的任务行（本页面生命周期内没见过的
//   data-task-item-key）且它是当前选中会话——项目展开/滚动复现的旧行、切换
//   到老会话、后台建的任务都不会触发；
// - 生成时机 = 模型开始作答（会话区出现用户消息以外的内容变动）。提问阶段
//   的全部用户消息都会进入标题——新建任务连问两次、第一次还没得到回答的
//   场景，两次提问都算数；迟迟没有作答时按静默时长兜底生成；
// - 官方自动起名从此不会再覆盖索引里的名字（索引层尊重重命名标记），界面
//   层偶发的覆盖显示由 title-lock 按锁定表钉回；写库成功后立即更新侧栏行
//   并刷新锁定表，新名即刻上屏；
// - 失败静默（一次生成失败不打扰用户），每个会话只尝试一次。
// 扫描事件驱动（任务行相关变动去抖 300ms）+ 低频兜底轮询，选法同 title-lock。
import { rpc, getConfig } from '../core.js';
import { setRowTitle, refreshPinnedTitles } from './title-lock.js';

const CONV = '[class*="@md/conversation"]';
const USER_ROW = '[class*="user-row"]';
const SCAN_DEBOUNCE_MS = 300;    // 任务行相关 DOM 变动后的去抖
const SCAN_FALLBACK_MS = 5000;   // 兜底轮询周期（补观察器覆盖不到的路径）
const SELECT_WAIT_MS = 2000;     // 新行出现后等它成为当前会话的时间
const MSG_WAIT_MS = 10000;       // 任务行先于消息上屏时，等首条消息的最长时间
const QUIET_FALLBACK_MS = 120000; // 迟迟没有作答时的静默兜底（期间追加的提问也会带上）
const COLLECT_MAX_MS = 600000;   // 收集期上限（10 分钟内始终没等到作答就放弃）

let installed = false;
const knownKeys = new Set(); // 页面生命周期内见过的任务键（含启动时已在侧栏的）
const attempted = new Set(); // 已处理过（成功或失败）的会话 id，防重复

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sessIdOf(key) {
  // 会话键格式 <workspace_path>:<sess_id>；sess 段固定以 "sess_" 开头（见 session-switch.js）
  const i = key.indexOf(':sess_');
  return i > 0 ? key.slice(i + 1) : '';
}

function currentKey() {
  for (const el of document.querySelectorAll('[data-task-item-key]')) {
    if ((el.className + '').includes('bg-selected')) return el.getAttribute('data-task-item-key') || '';
  }
  return '';
}

// 会话区全部用户消息文本（按 DOM 顺序）；没有用户消息时返回空数组
function userTexts() {
  return [...document.querySelectorAll(`${CONV} ${USER_ROW}`)]
    .map((r) => {
      const el = r.querySelector('.whitespace-pre-wrap');
      return ((el ? el.textContent : r.innerText) || '').trim();
    })
    .filter(Boolean);
}

// 会话区当前的助手回答文本（最后一条，截头去尾）：链接占比高的提问场景下，
// 用户消息里几乎只有 URL，起名模型无从概括；首轮回答必然复述了真实任务。
// URL 正则与 linkDominant 共用一份（排除 CJK 字符作边界，中文紧随链接不被吞）
const URL_RE = /https?:\/\/[^\s\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]+/g;
function assistantText() {
  // 只取非流式中的回答——流式里的半截文本不是完整任务描述；取最后一条
  // 完整的（等待窗口内若已有多轮，最新回答最能概括任务）
  const els = [...document.querySelectorAll('[class*="@md/conversation"] [class*="assistant-row"]')]
    .filter((e) => !e.querySelector('[data-is-streaming]'));
  const last = els[els.length - 1];
  if (!last) return '';
  const text = (last.innerText || '').replace(URL_RE, '').trim();
  return text.slice(0, 600);
}

// 提问文本是否“链接为主”（去链接后剩余内容不足三分之一）——决定要不要
// 把助手回答补充进取名素材
function linkDominant(t) {
  const raw = t.replace(/\s+/g, '');
  if (!raw) return true;
  // URL 结束边界不能只用 \S：中文紧随链接时会被一并吞掉（“链接和说明”被整段删）
  const stripped = raw.replace(URL_RE, '');
  return stripped.length < raw.length / 3;
}

async function onNewTaskRow(key) {
  // 新任务行创建时选中标记可能晚一拍；短暂等待它成为当前会话，
  // 期间没选中（其他入口建的任务）就不处理
  const selDeadline = Date.now() + SELECT_WAIT_MS;
  while (currentKey() !== key && Date.now() < selDeadline) await sleep(200);
  if (currentKey() !== key) return;

  const cfg = await getConfig().catch(() => null);
  if (!cfg || !cfg.titleGen || cfg.titleGen.enabled !== true) return;

  const sessId = sessIdOf(key);
  if (!sessId || attempted.has(sessId)) return;
  attempted.add(sessId);

  // 任务行可能先于消息渲染出现：等首条用户消息上屏
  let texts = [];
  const msgDeadline = Date.now() + MSG_WAIT_MS;
  while (Date.now() < msgDeadline) {
    texts = userTexts();
    if (texts.length) break;
    await sleep(400);
  }
  if (!texts.length) return;

  // 收集期：会话区出现用户消息以外的内容变动 = 模型开始作答，提问阶段结束，
  // 立即生成；期间追加的用户消息会刷新收集与静默计时。切到别的会话时暂停
  // 收集（不把别的会话的内容混进来），切回来继续
  let assistantSeen = false;
  const convObserver = new MutationObserver((muts) => {
    if (currentKey() !== key) return;
    for (const m of muts) {
      const t = m.type === 'characterData' ? m.target.parentElement : m.target;
      if (t instanceof Element && t.closest(USER_ROW)) continue; // 用户消息自身的变动不算作答
      for (const n of [t, ...m.addedNodes]) {
        if (n instanceof Element && n.closest && n.closest(CONV)) { assistantSeen = true; return; }
      }
    }
  });
  convObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  const startAt = Date.now();
  let lastCount = texts.length;
  let lastChange = Date.now();
  try {
    while (Date.now() - startAt < COLLECT_MAX_MS) {
      await sleep(500);
      if (currentKey() !== key) { lastChange = Date.now(); continue; } // 切走：暂停收集
      texts = userTexts();
      if (texts.length !== lastCount) {
        lastCount = texts.length;
        lastChange = Date.now();
      }
      if (assistantSeen) break;
      if (Date.now() - lastChange >= QUIET_FALLBACK_MS) break;
    }
  } finally { convObserver.disconnect(); }
  if (!texts.length) return;

  // 链接为主的提问（如“实现 <链接> 需求”）对起名模型无从概括：等首轮回答
  // 落定，把回答摘要（去链接、截断）一并作为素材。最多等 60 秒——回答太慢
  // 或没触发识别时按原素材走，不因此丢标题
  if (linkDominant(texts.join('\n'))) {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      await sleep(2000);
      if (currentKey() !== key) continue;
      const a = assistantText();
      if (a && a.length > 80) {
        texts.push(`（首轮回答摘要）${a}`);
        break;
      }
    }
  }

  // 失败静默但重试（模型调用偶发失败不应让本次会话永远失去标题）：5 秒一次
  // 错开瞬时抖动；20 秒一次兜住“会话刚建的几秒内索引模型信息未写定”
  //（实测新会话 8 秒时解析到的模型不存在，稍后即正常）
  const callTitleGen = () => rpc('/title-gen/run', { method: 'POST', body: { sessId, text: texts.join('\n') } }).catch(() => null);
  let res = await callTitleGen();
  for (const delay of [5000, 20000]) {
    if (res && res.ok) break;
    await sleep(delay);
    res = await callTitleGen();
  }
  // written=false 常见于用户已抢先手动重命名——尊重手动命名，不提示
  if (res && res.ok && res.written && res.title) {
    setRowTitle(key, res.title);
    void refreshPinnedTitles();
  }
}

function scanForNewRows() {
  for (const el of document.querySelectorAll('[data-task-item-key]')) {
    const key = el.getAttribute('data-task-item-key') || '';
    if (!key || knownKeys.has(key)) continue;
    knownKeys.add(key);
    void onNewTaskRow(key);
  }
}

// 只有任务条目相关变动才重扫（选法同 title-lock.js）；聊天区流式输出等
// 高频变动在此滤掉
const TASK_SEL = '[data-task-item-key]';
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
  scanDebounce = setTimeout(() => { scanDebounce = 0; scanForNewRows(); }, SCAN_DEBOUNCE_MS);
}

export function startTitleGen() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  // 启动先记下已在侧栏的任务键：此后出现的才是新会话
  scanForNewRows();

  new MutationObserver((muts) => { if (taskRowMutations(muts)) scheduleScan(); })
    .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'], characterData: true });

  setInterval(() => { if (!document.hidden) scanForNewRows(); }, SCAN_FALLBACK_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scanForNewRows(); });
}
