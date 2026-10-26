// 输入框模型名前显示供应商名：3.16.0 起官方触发器只显示模型名（如 glm-5.3），
// 同名模型在不同供应商下无法区分。按钮的 aria-label 本就带全名
//（"BigModel-Max1/glm-5.3 最高"），从那里取 “/” 前的供应商段补到显示文本前，
// 显示为 “BigModel-Max1 / glm-5.3”。不监听点击、不改官方状态，纯显示增强；
// 应用重渲染会冲掉文本，MutationObserver 维持。
import { t, getConfig } from '../core.js';

let installed = false;
let enabled = true; // helper features.composerProvider（默认开）

// 从 aria-label 提取 “供应商 / 模型” 显示文本。
// label 形态："<供应商>/<模型名> <附加说明（如 最高）>"；有的供应商名本身
// 不含 /、有的官方项可能没有 /（旧版内置项），没有 / 时返回 null 不改
function labelToDisplay(label) {
  const i = label.indexOf('/');
  if (i <= 0) return null;
  const provider = label.slice(0, i).trim();
  const rest = label.slice(i + 1);
  const model = rest.trim().split(/\s+/)[0];
  if (!provider || !model) return null;
  return `${provider} / ${model}`;
}

function apply() {
  if (!enabled) {
    // 关闭时把此前改写的文本还原为官方模型名（aria-label 的 “/” 后段），
    // 不必等应用重渲染
    for (const btn of document.querySelectorAll('[data-testid="chat-model-select-trigger"]')) {
      if (!btn.dataset.zcodeproProviderShown) continue;
      const label = btn.getAttribute('aria-label') || '';
      const i = label.indexOf('/');
      if (i <= 0) continue;
      const model = label.slice(i + 1).trim().split(/\s+/)[0];
      if (!model) continue;
      for (const sp of btn.querySelectorAll('span[title]')) sp.setAttribute('title', model);
      for (const el of btn.querySelectorAll('span[title] span:not([title])')) {
        if (!el.querySelector('span') && el.textContent.includes('/')) el.textContent = model;
      }
      delete btn.dataset.zcodeproProviderShown;
    }
    return;
  }
  for (const btn of document.querySelectorAll('[data-testid="chat-model-select-trigger"]')) {
    // 只处理 a[data-composer-combined-model] 主触发器；aria-label 缺失时跳过
    const label = btn.getAttribute('aria-label') || '';
    const display = labelToDisplay(label);
    if (!display) continue;
    // 显示 span 是嵌套两层的 title 结构（外层裁剪容器 + 内层相对定位层），
    // 文本都在最内层 span；只改文本与 title，不动结构
    // 官方结构：外层 title 容器 > 内层 title 层 > 纯文本 span（模型名）。
    // 只改 title 链内的文本——按“祖先带 title”识别模型名文本；同级的
    // “最高/开启”说明 span（无 title 祖先链上的 title 层）不属于模型名，
    // 不能碰（首版误把它也替换成全名）
    const titleSpans = [...btn.querySelectorAll('span[title]')];
    if (!titleSpans.length) continue;
    const innermost = titleSpans.filter((sp) => !sp.querySelector('span[title]'));
    if (!innermost.length) continue;
    const holders = [];
    for (const sp of innermost) {
      sp.querySelectorAll('span:not([title])').forEach((el) => {
        if (!el.querySelector('span') && el.textContent.trim() && !el.textContent.includes('/')) holders.push(el);
      });
    }
    if (!holders.length) continue;
    for (const sp of titleSpans) {
      if (sp.getAttribute('title') !== display) sp.setAttribute('title', display);
    }
    for (const el of holders) el.textContent = display;
    btn.dataset.zcodeproProviderShown = '1';
  }
}

export function startComposerProvider() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  // 先过滤再调度：变更不在输入框工具栏子树（composer 容器）内的批次直接忽略，
  // 连去抖定时器都不排——流式输出的高频文本变更不会叫醒本模块
  const COMPOSER_SEL = '[data-composer-layout], [data-composer-leading-content], [data-testid="chat-model-select-trigger"]';
  const relevant = (muts) => {
    for (const m of muts) {
      if (m.type === 'childList') {
        for (const n of [...m.addedNodes, ...m.removedNodes]) {
          if (n instanceof Element && (n.matches?.(COMPOSER_SEL) || n.querySelector?.(COMPOSER_SEL))) return true;
        }
      } else if (m.type === 'characterData') {
        let el = m.target.parentElement;
        while (el && el !== document.body) {
          if (el.matches?.('[data-composer-layout], [data-composer-leading-actions], [data-composer-leading-content]')) return true;
          el = el.parentElement;
        }
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
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  apply();
}
