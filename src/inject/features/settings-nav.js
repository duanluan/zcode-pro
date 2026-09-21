// 功能零：ZCode 设置页左侧导航底部新增「ZCode Pro」入口，点击打开增强设置弹窗。
// 设置页是 React（SettingsPage.tsx）渲染的 nav 列表；克隆原生「引导」按钮（虚线边框样式）
// 保证视觉一致。克隆节点不带 React fiber，原生 onClick 不会被应用接管，只走我们自己的监听。
// 旧版 ZCode 无此设置页时自动不注入（右上角窗口菜单入口已随应用改版移除）。
import { openSettingsDialog } from './settings-dialog.js';

// 用应用自身多语言文案识别设置页导航：命中任一已知分区标签即认定
const SECTION_LABELS = [
  '常规', '外观', '模型设置', '键盘快捷键', '使用统计',
  'General', 'Appearance', 'Model Provider', 'Keyboard Shortcuts', 'Usage stats',
];

export function handleSettingsNav() {
  let nav = null;
  for (const btn of document.querySelectorAll('nav button[aria-label]')) {
    if (SECTION_LABELS.includes((btn.getAttribute('aria-label') || '').trim())) {
      nav = btn.closest('nav');
      break;
    }
  }
  if (!nav || !nav.isConnected) return;
  if (nav.querySelector('[data-zcodepro-item="settings-nav"]')) return;
  // 模板取「引导」按钮（nav 内唯一的虚线边框按钮），保证分组外独立项的间距与外观一致
  const model = nav.querySelector('button.border-dashed') || nav.querySelector('button[aria-label]');
  if (!model) return;

  const item = model.cloneNode(true);
  item.removeAttribute('data-testid');
  item.removeAttribute('aria-current');
  item.removeAttribute('aria-describedby');
  item.setAttribute('data-zcodepro-item', 'settings-nav');
  // 图标换成齿轮（lucide Settings），沿用原 svg 的类名与描边属性
  const oldIcon = item.querySelector('svg');
  if (oldIcon) {
    const ns = 'http://www.w3.org/2000/svg';
    const icon = document.createElementNS(ns, 'svg');
    for (const attr of ['class', 'width', 'height', 'viewBox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin']) {
      const v = oldIcon.getAttribute(attr);
      if (v !== null) icon.setAttribute(attr, v);
    }
    const gear = document.createElementNS(ns, 'path');
    gear.setAttribute('d', 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z');
    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '3');
    icon.append(gear, circle);
    oldIcon.replaceWith(icon);
  }
  // 文本换成 ZCode Pro（品牌名，多语言同形）：标签是最内层文本 span（外层是带 sr-only 变体的包装），
  // 不能按类名找——各按钮的 span 类组合不一，按「文本=原标签且不含图标」取最后一个匹配
  const modelLabel = (model.getAttribute('aria-label') || '').trim();
  let labelSpan = null;
  for (const span of item.querySelectorAll('span')) {
    if (!span.querySelector('svg') && span.textContent.trim() === modelLabel) labelSpan = span;
  }
  if (labelSpan) labelSpan.textContent = 'ZCode Pro';
  item.setAttribute('aria-label', 'ZCode Pro');
  item.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openSettingsDialog();
  });
  const onboarding = nav.querySelector('button.border-dashed');
  if (onboarding) onboarding.before(item);
  else nav.append(item);
}

// 设置页随路由挂载/卸载：观察 DOM 变化，出现导航就补注入（按帧合并扫描，避免会话流式输出时高频扫描）
export function startSettingsNavWatcher() {
  let scheduled = false;
  const tryInject = () => {
    try { handleSettingsNav(); } catch { /* ignore */ }
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      tryInject();
    });
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  tryInject();
}
