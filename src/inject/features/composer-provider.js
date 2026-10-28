// 输入框模型名前显示供应商名：3.16.0 起官方触发器只显示模型名（如 glm-5.3），
// 同名模型在不同供应商下无法区分。按钮的 aria-label 本就带全名
//（"BigModel-Max1/glm-5.3 最高"），从那里取 “/” 前的供应商段补到显示文本前，
// 显示为 “BigModel-Max1 / glm-5.3”。不监听点击、不改官方状态，纯显示增强；
// 应用重渲染会冲掉文本，MutationObserver 维持。
import { t, getConfig } from '../core.js';

let installed = false;
let enabled = true; // helper features.composerProvider（默认开）

const TRIGGER_SEL = '[data-testid="chat-model-select-trigger"]';

// 从 aria-label 拆出 “供应商 / 模型”。label 形态：
// "<供应商>/<模型名> <附加说明（如 最高）>"；有的供应商名本身不含 /、
// 有的官方项整条没有 /（旧版内置项）——没有 / 时 provider 为 null：
// 补名没得补（调用方跳过），但还原还认得出模型名
function labelParts(label) {
  const text = (label || '').trim();
  if (!text) return null;
  const i = text.indexOf('/');
  if (i > 0) {
    const provider = text.slice(0, i).trim();
    const model = text.slice(i + 1).trim().split(/\s+/)[0];
    return provider && model ? { provider, model } : null;
  }
  return { provider: null, model: text.split(/\s+/)[0] };
}

// 模型名文本 span：官方结构是 外层 title 容器 > 内层 title 层 > 纯文本 span，
// 按“在最内层 title 层里、自己不带 title、没有子元素”识别；同级的
// “最高/开启”说明 span 不在 title 层里，不能碰（首版误把它也替换成全名）。
// 换模型时旧文本可能还在退场动画里没摘掉，按文本内容认目标：等于模型名
//（官方原文）、或以 “ / 模型名” 结尾（此前补过供应商名的文本）才算
function holdersOf(btn, model) {
  const innermost = [...btn.querySelectorAll('span[title]')].filter((sp) => !sp.querySelector('span[title]'));
  const holders = [];
  for (const sp of innermost) {
    for (const el of sp.querySelectorAll('span:not([title])')) {
      if (el.querySelector('span')) continue;
      const text = el.textContent.trim();
      if (!text) continue;
      if (text === model || text.endsWith(` / ${model}`)) holders.push(el);
    }
  }
  return holders;
}

// 改文本优先改文本节点本身：直接 textContent 覆盖会把应用持有的文本节点换成
// 新节点，它后续的更新就落不到可见文本上了
function setText(el, text) {
  const node = el.firstChild;
  if (node && node.nodeType === 3 && !node.nextSibling) node.nodeValue = text;
  else el.textContent = text;
}

function apply() {
  for (const btn of document.querySelectorAll(TRIGGER_SEL)) {
    const parts = labelParts(btn.getAttribute('aria-label') || '');
    if (!parts) continue;
    const holders = holdersOf(btn, parts.model);
    if (enabled) {
      if (!parts.provider || !holders.length) continue;
      const target = `${parts.provider} / ${parts.model}`;
      for (const el of holders) {
        if (el.textContent.trim() !== target) setText(el, target);
      }
      // title 跟显示文本一致，悬停可见全名
      for (const sp of btn.querySelectorAll('span[title]')) {
        if (sp.getAttribute('title') !== target) sp.setAttribute('title', target);
      }
      btn.dataset.zcodeproProviderShown = '1';
    } else if (btn.dataset.zcodeproProviderShown) {
      // 关闭时把补过的文本与 title 还原为官方模型名，不必等应用重渲染
      for (const el of holders) {
        if (el.textContent.trim() !== parts.model) setText(el, parts.model);
      }
      for (const sp of btn.querySelectorAll('span[title]')) sp.setAttribute('title', parts.model);
      delete btn.dataset.zcodeproProviderShown;
    }
  }
}

export function startComposerProvider() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  // 先过滤再调度：无关变更直接忽略，连去抖定时器都不排——流式输出的高频
  // 文本变更不会叫醒本模块
  const COMPOSER_SEL = '[data-composer-layout], [data-composer-leading-actions], [data-composer-leading-content], [data-testid="chat-model-select-trigger"]';
  const relevant = (muts) => {
    for (const m of muts) {
      if (m.type === 'childList') {
        for (const n of [...m.addedNodes, ...m.removedNodes]) {
          // 触发器内部的节点增删也算：换模型、开合下拉都把整段标签换成新节点，
          // 那一批次里没有别的动静，漏掉就等不到下次补名
          if (n instanceof Element && (n.matches?.(COMPOSER_SEL) || n.querySelector?.(COMPOSER_SEL) || n.closest?.(TRIGGER_SEL))) return true;
        }
      } else if (m.type === 'attributes') {
        // 只认触发器按钮身上的属性（换模型就改它的 aria-label /
        // data-model-current-value）；同名模型换供应商时文本一动不动，全靠这里
        if (m.target instanceof Element && m.target.closest?.(TRIGGER_SEL)) return true;
      } else if (m.type === 'characterData') {
        const el = m.target.parentElement?.closest?.(COMPOSER_SEL);
        if (el) return true;
      }
    }
    return false;
  };
  const schedule = () => {
    clearTimeout(schedule.t);
    schedule.t = setTimeout(apply, 120);
  };
  void getConfig().then((cfg) => { enabled = cfg.features ? cfg.features.composerProvider !== false : true; }).catch(() => {});
  window.addEventListener('zcodepro:config-changed', () => {
    void getConfig(true).then((cfg) => {
      const next = cfg.features ? cfg.features.composerProvider !== false : true;
      if (next !== enabled) {
        enabled = next;
        apply(); // 开关切换即时生效：关时还原官方文本，开时补供应商名
      }
    }).catch(() => {});
  });
  const observer = new MutationObserver((muts) => { if (enabled && relevant(muts)) schedule(); });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['aria-label', 'data-model-current-value'], // 这两个只有应用会写，不认 title，避免自己改 title 叫醒自己
  });
  apply();
}
