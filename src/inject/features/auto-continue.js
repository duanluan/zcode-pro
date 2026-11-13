// 回合失败自动继续：回合因请求故障直接死亡（turn.failed）时，ZCode 会话流末尾渲染
// chat-error-banner 错误横幅（"An error occurred ... Please try again." /
// "Turn execution failed"）。这条失败路径不触发插件钩子（Stop 只在正常回合结束时跑），
// auto-continue 插件的自动继续够不着，由本特性补上：发现会话流收尾处的失败横幅就往
// 输入框写入继续指令并发送，让任务接着跑——正在跑的失败当场接上，重开会话（含
// 重启 ZCode 后）留着尾巴的任务也接上；认证、余额、模型不存在等永久性错误和
// 用户手动停止（cancelled）不打扰。开关与文案走 ~/.zcode/auto-continue.json
// （与插件共用一份配置）。
import { rpc, isZhLocale } from '../core.js';

const SCAN_MS = 2000;
const BANNER_SEL = '[data-testid="chat-error-banner"]';
const STOP_SEL = '[data-testid="v4-stop"]';
const INPUT_SEL = '[data-testid="v4-composer-input"]';
const SEND_SEL = '[data-testid="v4-composer-send"]';

// 默认继续提示词按界面语言取值，与设置页显示的默认值一致
const DEFAULT_CONTINUE_TEXT = isZhLocale() ? '继续' : 'continue';
const DEFAULT_TRUNCATION_CONTINUE_TEXT_ZH =
  '上一条回复疑似在输出中途被截断。请接着已生成的内容继续输出，从中断处往下写，不要重复任何已经生成的内容。';
const DEFAULT_TRUNCATION_CONTINUE_TEXT_EN =
  'The previous reply appears to have been cut off. Continue from where it stopped, without repeating anything already generated.';
const DEFAULT_TRUNCATION_CONTINUE_TEXT = isZhLocale()
  ? DEFAULT_TRUNCATION_CONTINUE_TEXT_ZH
  : DEFAULT_TRUNCATION_CONTINUE_TEXT_EN;
// 配置里存的是内置默认文案（旧版固定中文）时按当前语言重取；用户自己改过的不动
const truncationTextFor = (value) => {
  const text = String(value || '').trim();
  return !text || text === DEFAULT_TRUNCATION_CONTINUE_TEXT_ZH || text === DEFAULT_TRUNCATION_CONTINUE_TEXT_EN
    ? DEFAULT_TRUNCATION_CONTINUE_TEXT
    : value;
};

const DEFAULTS = {
  enabled: true,
  continueText: DEFAULT_CONTINUE_TEXT,
  maxRetries: 8,
  cooldownBaseSec: 10,
  cooldownFactor: 2,
  cooldownMaxSec: 60,
  stuckAfterMin: 30,
  failedAfterMin: 3,
  truncationContinueText: DEFAULT_TRUNCATION_CONTINUE_TEXT,
  // 永久性错误关键词（正则，命中不自动继续），与插件引擎同一份配置可覆盖
  permanentPatterns: [
    '\\b40[123]\\b',
    'unauthorized', 'forbidden', 'authentication', 'invalid[_ -]?api[_ -]?key', 'api[_ -]?key',
    'credential', '鉴权', '认证失败', '凭证', '无效的密钥',
    'insufficient (balance|funds|quota)', '余额不足', '欠费',
    'billing', 'payment required', 'quota exceeded', '配额(不足|已用|用尽)', '免费额度',
    '使用上限', '每周.{0,4}上限', '每月.{0,4}上限', 'usage limit', 'rate limit reached',
    'model not found', 'unknown model', 'no such model', '模型不存在', '无可用模型',
    'access denied', 'permission denied',
    'context[_ -]length', 'prompt (is )?too long', '上下文(超|过|长度)', '输入过长', 'token limit',
    'exceeded the provider context window',
    'param incorrect', 'invalid[_ -]?request', 'invalid[_ -]?parameter', '参数(错误|不正确|无效)',
  ],
};

let cachedCfg = null;
let cachedAt = 0;

async function getConfig() {
  const now = Date.now();
  if (cachedCfg && now - cachedAt < 30000) return cachedCfg;
  const res = await rpc('/auto-continue');
  const raw = res.ok && res.config && typeof res.config === 'object' ? res.config : {};
  cachedCfg = { ...DEFAULTS, ...raw };
  cachedAt = now;
  return cachedCfg;
}

function compile(patterns) {
  return (Array.isArray(patterns) ? patterns : [])
    .map((src) => { try { return new RegExp(src, 'i'); } catch { return null; } })
    .filter(Boolean);
}

function isPermanent(text, cfg) {
  return compile(cfg.permanentPatterns).some((re) => re.test(text));
}

// 用户手动停止 / 系统取消的失败横幅（如 “Model request was cancelled.”）不自动继续
function isCancelled(text) {
  return /\bcancel+ed?\b|已取消|已停止|手动停止/i.test(text);
}

// 会话流收尾处的失败横幅：横幅所在的行是最后一行（任务死在收尾上）才算数；
// 排在中间的历史横幅（用户已在后面说过话）不动
function trailingBanner() {
  const banners = [...document.querySelectorAll(`${BANNER_SEL}:not([data-zcodepro-ac])`)];
  if (!banners.length) return null;
  const rows = [...document.querySelectorAll('[data-testid^="v4-row-"]')];
  const lastRow = rows.length ? rows[rows.length - 1] : null;
  for (const b of banners) {
    const row = b.closest('[data-testid^="v4-row-"]');
    if (!row || !lastRow || row === lastRow) return b;
  }
  return null;
}

// 自动继续时间戳（页面存活期内）：30 分钟窗口计总数（防故障反复时无限继续），
// 2 分钟窗口计密集程度（只对密集失败退避，单次失败不等待）
let continueTimes = [];
function pruneTimes() {
  const cutoff = Date.now() - 30 * 60 * 1000;
  continueTimes = continueTimes.filter((t) => t >= cutoff);
}
function recentWithin(ms) {
  const cutoff = Date.now() - ms;
  return continueTimes.filter((t) => t >= cutoff).length;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 往 Lexical 输入框写入文本：execCommand 走原生输入路径，Lexical 会把文本纳入
// 自己的模型。注意 Windows 的 Chromium 上 execCommand 返回 true 但提交是异步的
//（实测立即读长度为 0，约 300ms 后才出现）——判定必须轮询等待，同步读会误判
// “没写进去”而追加事件派发，造成双份文本。写入前先全选清空，保证内容恰好一份；
// 事件派发只作为 execCommand 确认无产出后的兜底。
async function fillComposer(text) {
  const input = document.querySelector(INPUT_SEL);
  if (!input) return false;
  input.focus();
  // 全选清空（选区套在输入框上，Lexical 顺着删除事件走自己的模型）
  const range = document.createRange();
  range.selectNodeContents(input);
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  try { document.execCommand('delete'); } catch { /* 下一步全选插入会整体替换 */ }
  for (let i = 0; i < 10 && (input.textContent || '').length > 0; i += 1) await sleep(50);
  try { document.execCommand('insertText', false, text); } catch { /* 走兜底 */ }
  // 等异步提交（Windows 上约 300ms）
  for (let i = 0; i < 12; i += 1) {
    const cur = input.textContent || '';
    if (cur.includes(text)) return true; // 恰好一份（清空后插入，不会更多）
    await sleep(50);
  }
  // 兜底：派发 beforeinput/input（Lexical 处理 beforeinput）
  input.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  for (let i = 0; i < 10; i += 1) {
    if ((input.textContent || '').includes(text)) return true;
    await sleep(50);
  }
  return false;
}

// 发送按钮的可用状态由界面在文本写入后异步渲染（写完立刻查会读到旧的禁用状态），
// 轮询等它启用再点；每轮重新查按钮（元素可能被重建）；慢机器上按钮渲染可达数秒，等足 6 秒
async function clickSend() {
  for (let i = 0; i < 15; i += 1) {
    const send = document.querySelector(SEND_SEL);
    if (send && !send.disabled) {
      send.click();
      return true;
    }
    await sleep(400);
  }
  return false;
}

// 单次失败不等待（任务等着接上，只留 3 秒界面稳定时间）；2 分钟内已继续过
// 则视为密集失败，按 2 倍递增退避
function delayFor(dense, cfg) {
  if (dense <= 1) return 3000;
  const secs = Math.min(cfg.cooldownBaseSec * Math.pow(cfg.cooldownFactor || 2, dense - 2), cfg.cooldownMaxSec);
  return Math.round(secs * 1000);
}

// 回合正常结束但收尾内容坏了（原插件 Stop 钩子角色的 DOM 版）：最后一行是长回复且
// 代码围栏未闭合或以省略号收尾，多半是输出中途被掐断。只看可见会话最后一行，
// 阈值沿用插件引擎（长度 300、围栏奇偶）；空回复不在 DOM 判（伪空行太多，误报高）。
function brokenTail() {
  const rows = [...document.querySelectorAll('[data-testid^="v4-row-"]')];
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  if (!last.className.includes('assistant') || last.dataset.zcodeproAc) return null;
  const text = (last.innerText || '').trim();
  if (text.length < 300) return null;
  const fences = (text.match(/```/g) || []).length;
  if (fences % 2 === 1) return { el: last, kind: 'truncation' };
  if (/(\.\.\.|…)\s*$/.test(text)) return { el: last, kind: 'truncation' };
  return null;
}

let inflight = false;

async function tick() {
  if (inflight || document.querySelector(STOP_SEL) || Date.now() < rescueUntil) return;
  const banner = trailingBanner();
  const target = banner ? { el: banner, kind: 'banner' } : brokenTail();
  if (!target) return;
  const el = target.el;
  inflight = true;
  try {
    const cfg = await getConfig();
    if (cfg.enabled === false) return;

    if (target.kind === 'banner') {
      const text = (banner.innerText || '');
      if (isPermanent(text, cfg) || isCancelled(text)) {
        el.dataset.zcodeproAc = 'skip';
        return;
      }
    }
    // 有人重新发起回合、或用户已在输入框起草：不打扰
    if (document.querySelector(STOP_SEL)) return;
    const input = document.querySelector(INPUT_SEL);
    if (!input || (input.textContent || '').trim()) return;

    pruneTimes();
    if (continueTimes.length >= (cfg.maxRetries || DEFAULTS.maxRetries)) {
      el.dataset.zcodeproAc = 'cap';
      return;
    }
    el.dataset.zcodeproAc = 'pending';
    await sleep(delayFor(recentWithin(2 * 60 * 1000), cfg));
    // 等待期间状态可能变化（用户手动继续、切走会话、目标行消失），重新校验后再发
    if (!el.isConnected || document.querySelector(STOP_SEL)) {
      el.dataset.zcodeproAc = 'skip';
      return;
    }
    const input2 = document.querySelector(INPUT_SEL);
    const want = target.kind === 'truncation'
      ? truncationTextFor(cfg.truncationContinueText)
      : (cfg.continueText || DEFAULT_CONTINUE_TEXT);
    const current = ((input2 && input2.textContent) || '').trim();
    // 输入框有内容：是上次没发出去的继续提示词就只重试发送（不重复插入，
    // 同一目标重渲染再次触发也走到这里）；是用户起草的内容就不打扰
    if (current && !current.includes(want.slice(0, 10))) {
      el.dataset.zcodeproAc = 'skip';
      return;
    }
    if (!current && !(await fillComposer(want))) {
      el.dataset.zcodeproAc = 'fail';
      return;
    }
    if (!(await clickSend())) {
      el.dataset.zcodeproAc = 'fail';
      return;
    }
    el.dataset.zcodeproAc = '1';
    continueTimes.push(Date.now());
  } finally {
    inflight = false;
  }
}

// —— 卡死看门狗 ——
// 回合卡死（工具执行器悬死）没有任何失败横幅，上面的横幅路径覆盖不到。这类卡死在
// ZCode 运行日志里的形态：background_task.tracking.started 之后永远等不到
// background_task.tracking.terminal（实测案例：TaskOutput 等一个早已死掉的后台
// 构建任务，悬了 1 小时）。定期向宿主要悬空任务清单，超阈值入队提示，一张卡
// 处理完再弹下一张。只提示不动自动手：长时间后台构建（如打包）与卡死同形态。
const STUCK_POLL_MS = 60 * 1000;
const stuckShown = new Set();
const failedShown = new Set();
const rescueTimes = new Map(); // sessionId -> 无头救援时间戳（30 分钟窗口内限 3 次）
const stuckQueue = [];
let stuckCardEl = null;
// 救援进行中Until：期间横幅规则暂停，避免它和救援动作同时往输入框写“继续”
let rescueUntil = 0;

// 把卡死的任务续上（无头）：能切到目标会话就先停掉它悬着的回合，再走宿主的
// 无头续接（--resume -p）——全程不碰输入框，不会和别的续接动作叠“继续”。
async function rescueStuck(task) {
  rescueUntil = Date.now() + 30000;
  const switched = switchToTask(task.sessionId);
  if (switched) {
    await sleep(800);
    const stop = document.querySelector(STOP_SEL);
    if (stop) {
      stop.click();
      await sleep(3000);
    }
  }
  const cfg = await getConfig();
  const r = await rpc('/ac-continue', { method: 'POST', body: { sessionId: task.sessionId, text: cfg.continueText || DEFAULT_CONTINUE_TEXT } });
  if (!r.ok) rescueUntil = 0;
  return r.ok;
}

// 切到任务所在的会话：侧栏行直接点；虚拟列表没渲染出该行时返回 false（留在当前视图）
function switchToTask(sessionId) {
  const row = document.querySelector(`[data-testid="task-item-${sessionId}"]`);
  if (!row) return false;
  row.click();
  return true;
}

// 任务的人类可读名字：侧栏行文本（标题 + 相对时间）；行没渲染时退回会话号
function taskTitle(sessionId) {
  const row = document.querySelector(`[data-testid="task-item-${sessionId}"]`);
  const text = row ? (row.textContent || '').trim() : '';
  return text ? text.split('\n')[0].slice(0, 30) : String(sessionId).slice(0, 20) + '…';
}

function dequeueStuck(task) {
  const i = stuckQueue.indexOf(task);
  if (i >= 0) stuckQueue.splice(i, 1);
}

// 队列条目按会话合并；任务数据变了就更新，全部任务都已终结（或会话恢复活跃）
// 的条目直接丢弃。返回是否丢掉了正在显示的那一条。
function pruneStuckQueue(scan, threshold) {
  const alive = new Map(); // sessionId -> 仍满足阈值的任务
  for (const t of (Array.isArray(scan?.tasks) ? scan.tasks : [])) {
    if (t.ageSec < threshold || (t.silenceSec ?? 0) < threshold) continue;
    const arr = alive.get(t.sessionId) || [];
    arr.push(t);
    alive.set(t.sessionId, arr);
  }
  const failedAlive = new Set((Array.isArray(scan?.failed) ? scan.failed : []).map((f) => `${f.sessionId}:${f.failedAt}`));
  let removedCurrent = false;
  for (let i = stuckQueue.length - 1; i >= 0; i -= 1) {
    const q = stuckQueue[i];
    let keep = false;
    if (q.failedMsg) {
      keep = failedAlive.has(`${q.sessionId}:${q.failedAt}`);
    } else {
      const remain = (alive.get(q.sessionId) || []).filter((t) => q.taskIds.includes(t.taskId));
      if (remain.length) {
        q.tasks = remain;
        q.kinds = [...new Set(remain.map((t) => t.kind || 'terminal'))];
        q.ageSec = Math.max(...remain.map((t) => t.ageSec));
        keep = true;
      }
    }
    if (!keep) {
      if (i === 0 && stuckCardEl) removedCurrent = true;
      stuckQueue.splice(i, 1);
    }
  }
  return removedCurrent;
}

function closeStuckCard() {
  if (stuckCardEl) { stuckCardEl.remove(); stuckCardEl = null; }
  if (!stuckQueue.length) return;
  // 队列是扫描快照：弹下一张前重新拉一次，任务已经结束的卡不再弹出来
  setTimeout(() => {
    void (async () => {
      try {
        const res = await rpc('/ac-stuck');
        const cfg = await getConfig();
        if (res.ok) pruneStuckQueue(res, (cfg.stuckAfterMin || DEFAULTS.stuckAfterMin) * 60);
      } catch { /* 复核失败就按现有队列继续弹 */ }
      showNextStuckCard();
    })();
  }, 500);
}

function kindLabel(kind, zh) {
  if (kind === 'subagent') return zh ? '子代理卡死' : 'Subagent stuck';
  if (kind === 'turn') return zh ? '主轮卡死' : 'Main turn stuck';
  return zh ? '终端卡死' : 'Terminal stuck';
}

function stuckDesc(task, zh, mins) {
  const title = taskTitle(task.sessionId);
  const count = task.tasks ? task.tasks.length : 1;
  const parts = [];
  if (task.kinds.includes('terminal')) {
    parts.push(zh
      ? `${count > 1 ? `${count} 个` : '1 个'}后台终端任务已 ${mins} 分钟没有回报`
      : `${count} background terminal task(s) silent for ${mins} min`);
  }
  if (task.kinds.includes('subagent')) {
    parts.push(zh
      ? `${count > 1 ? `${count} 个` : ''}子代理已 ${mins} 分钟没有回报`
      : `a subagent silent for ${mins} min`);
  }
  if (task.kinds.includes('turn')) {
    parts.push(zh ? `主回合已 ${mins} 分钟没有进展` : `the main turn stalled for ${mins} min`);
  }
  return zh
    ? `任务“${title}”：${parts.join('；')}。确实在跑的长任务（如打包）点“知道了”即可。`
    : `Task “${title}”: ${parts.join('; ')}. Dismiss for long-running builds.`;
}

function showNextStuckCard() {
  // 卡片可能被界面整体重建时从 DOM 移走而引用还在（实测会卡死队列）：引用失效就当作没卡
  if (stuckCardEl) {
    if (stuckCardEl.isConnected) return;
    stuckCardEl = null;
  }
  if (!stuckQueue.length) return;
  const task = stuckQueue[0];
  const zh = isZhLocale();
  const mins = Math.round(task.ageSec / 60);
  const kinds = task.kinds && task.kinds.length ? task.kinds : ['terminal'];
  const more = stuckQueue.length > 1;
  const card = document.createElement('div');
  card.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483000;max-width:360px;padding:12px;border-radius:12px;border:1px solid var(--color-border, #666);background:var(--color-surface, #222);color:var(--color-foreground, #eee);font-size:13px;line-height:1.5;box-shadow:0 4px 24px rgba(0,0,0,.4)';
  const title = document.createElement('div');
  title.style.cssText = 'font-weight:600;margin-bottom:4px';
  title.textContent = (task.failedMsg
    ? (zh ? '回合失败未续上' : 'Turn failed, not continued')
    : kinds.map((k) => kindLabel(k, zh)).join(zh ? '、' : ', '))
    + (more ? (zh ? `（队列中还有 ${stuckQueue.length - 1} 个）` : ` (${stuckQueue.length - 1} more queued)`) : '');
  const desc = document.createElement('div');
  desc.style.cssText = 'opacity:.85';
  desc.textContent = task.failedMsg
    ? (zh
      ? `任务“${taskTitle(task.sessionId)}”${mins} 分钟前回合失败（${String(task.failedMsg).slice(0, 60)}），一直没人续上。`
      : `Task “${taskTitle(task.sessionId)}” failed ${mins} min ago (${String(task.failedMsg).slice(0, 60)}) and was never continued.`)
    : stuckDesc(task, zh, mins);
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;margin-top:10px';
  const mkBtn = (label, primary) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText = primary
      ? 'cursor:pointer;border:none;border-radius:8px;padding:5px 12px;background:var(--color-brand, #4a7cf7);color:#fff;font-size:12px'
      : 'cursor:pointer;border-radius:8px;padding:5px 12px;background:transparent;border:1px solid var(--color-border, #666);color:inherit;font-size:12px';
    return b;
  };
  const jump = mkBtn(zh ? '跳转任务' : 'Go to task', false);
  jump.addEventListener('click', () => {
    switchToTask(task.sessionId);
    // 卡片留着：看完任务再决定“继续”还是“知道了”
  });
  const fix = mkBtn(zh ? '继续' : 'Continue', true);
  fix.addEventListener('click', () => {
    fix.disabled = true;
    if (task.failedMsg) {
      // 失败会话：走无头续接，不切界面
      void (async () => {
        const cfg = await getConfig();
        const r = await rpc('/ac-continue', { method: 'POST', body: { sessionId: task.sessionId, text: cfg.continueText || DEFAULT_CONTINUE_TEXT } });
        if (r.ok) {
          dequeueStuck(task);
          closeStuckCard();
        } else {
          fix.disabled = false;
          desc.textContent = (zh ? '续接启动失败：' : 'Failed to start continue: ') + (r.error || 'unknown');
        }
      })();
      return;
    }
    void (async () => {
      const ok = await rescueStuck(task);
      if (ok) {
        dequeueStuck(task);
        closeStuckCard();
      } else {
        fix.disabled = false;
        desc.textContent = zh ? '无头续接启动失败，请稍后再试或手动处理。' : 'Failed to start headless continue; retry or handle manually.';
      }
    })();
  });
  const dismiss = mkBtn(zh ? '知道了' : 'Dismiss', false);
  dismiss.addEventListener('click', () => {
    dequeueStuck(task);
    closeStuckCard();
  });
  row.append(jump, fix, dismiss);
  card.append(title, desc, row);
  (document.body || document.documentElement).append(card);
  stuckCardEl = card;
}

async function stuckTick() {
  const res = await rpc('/ac-stuck');
  // 调试钩子（临时）：记录每轮扫描的决策，排查无头续接不触发的问题
  const dbg = (m) => { const a = (window.__acDebug ||= []); a.push(`${new Date().toISOString().slice(11, 19)} ${m}`); if (a.length > 50) a.splice(0, a.length - 50); };
  dbg(`scan ok=${res.ok} tasks=${Array.isArray(res.tasks) ? res.tasks.length : 'x'} failed=${Array.isArray(res.failed) ? res.failed.length : 'x'}`);
  if (!res.ok || !Array.isArray(res.tasks)) return;
  const cfg = await getConfig();
  if (cfg.enabled === false) return;
  const threshold = (cfg.stuckAfterMin || DEFAULTS.stuckAfterMin) * 60;
  for (const task of res.tasks) {
    // 任务悬空够久、且会话也确实没动静才算卡死（会话在动 = 已救活/在跑，过滤诈尸）
    dbg(`task tid=${String(task.taskId).slice(0, 16)} kind=${task.kind} age=${task.ageSec} sil=${task.silenceSec} thr=${threshold} shown=${stuckShown.has(task.taskId)}`);
    if (task.ageSec < threshold || (task.silenceSec ?? 0) < threshold || stuckShown.has(task.taskId)) continue;
    stuckShown.add(task.taskId);
    const kind = task.kind || 'terminal';
    // 同一会话的任务合并进一张卡：一个会话只需要用户做一个决定
    let entry = stuckQueue.find((q) => !q.failedMsg && q.sessionId === task.sessionId);
    if (!entry) {
      entry = { sessionId: task.sessionId, taskIds: [], tasks: [], kinds: [], ageSec: 0 };
      stuckQueue.push(entry);
    }
    entry.taskIds.push(task.taskId);
    entry.tasks.push(task);
    if (!entry.kinds.includes(kind)) entry.kinds.push(kind);
    entry.ageSec = Math.max(entry.ageSec, task.ageSec);
  }
  // 失败会话：失败后没人续、静默超过阈值就接手——走宿主的无头续接（--resume -p），
  // 不碰桌面界面，手机端/后台等视图外会话同样适用。子代理会话由父会话自己善后，不碰。
  // 单会话救援限额：永久失败的会话每次失败都会产生新时间戳、绕开“同一次失败只救一次”，
  // 不限额会每轮扫描拉起一次、无限循环；超过限额改为弹卡交还用户。
  const failedThreshold = ((cfg.failedAfterMin ?? DEFAULTS.failedAfterMin)) * 60;
  for (const f of (Array.isArray(res.failed) ? res.failed : [])) {
    const key = `${f.sessionId}:${f.failedAt}`;
    dbg(`entry sid=${String(f.sessionId).slice(0, 20)} age=${f.ageSec} thr=${failedThreshold} shown=${failedShown.has(key)} perm=${isPermanent(f.message || '', cfg)} canc=${isCancelled(f.message || '')}`);
    if (f.ageSec < failedThreshold || failedShown.has(key)) continue;
    if (isPermanent(f.message || '', cfg) || isCancelled(f.message || '')) continue;
    if (String(f.sessionId).includes('subagent')) continue;
    failedShown.add(key);
    const times = (rescueTimes.get(f.sessionId) || []).filter((t) => t >= Date.now() - 30 * 60 * 1000);
    dbg(`pass sid=${String(f.sessionId).slice(0, 20)} times=${times.length} autoFix=${cfg.failedAutoFix}`);
    if (cfg.failedAutoFix !== false && times.length < 3) {
      let r;
      try {
        r = await rpc('/ac-continue', { method: 'POST', body: { sessionId: f.sessionId, text: cfg.continueText || DEFAULT_CONTINUE_TEXT } });
      } catch (e) {
        dbg(`rpc threw ${String(e).slice(0, 80)}`);
        r = null;
      }
      dbg(`rpc done ok=${r ? r.ok : 'null'} err=${r && r.error ? String(r.error).slice(0, 60) : '-'}`);
      if (r && r.ok) { times.push(Date.now()); rescueTimes.set(f.sessionId, times); continue; } // 无头续接已启动；成败由下一轮扫描的活跃度验证
    }
    stuckQueue.push({ ...f, taskId: key, failedMsg: f.message || '' });
  }
  stuckQueue.sort((a, b) => b.ageSec - a.ageSec); // 悬得最久的先处理
  // 每轮复核：任务已终结（比如刚被手动停掉）或会话恢复活跃的条目丢掉；
  // 正在显示的那张卡如果已过期，先关掉再弹下一张
  const removedCurrent = pruneStuckQueue(res, threshold);
  if (removedCurrent && stuckCardEl) {
    stuckCardEl.remove();
    stuckCardEl = null;
  }
  showNextStuckCard();
}

export function startAutoContinue() {
  if (typeof document === 'undefined') return;
  window.addEventListener('zcodepro:config-changed', () => { cachedAt = 0; });
  setInterval(() => { tick().catch(() => { /* 单次巡检失败不影响后续 */ }); }, SCAN_MS);
  setInterval(() => { stuckTick().catch((e) => { (window.__acDebug ||= []).push(`stuckTick threw ${String(e).slice(0, 100)}`); }); }, STUCK_POLL_MS);
}
