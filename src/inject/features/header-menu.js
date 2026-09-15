// 功能一：右上角窗口下拉菜单中新增“ZCode Pro 设置”入口。
// 菜单是 Radix DropdownMenu（门户渲染到 body），打开时动态克隆一个原生菜单项。
import { t, getConfig, closeRadixMenu, itemsOf, itemText } from '../core.js';
import { openSettingsDialog } from './settings-dialog.js';

// 用应用自身菜单文案（多语言）识别“窗口菜单”：同时命中首两项才认定
const NEW_TASK_TEXTS = ['新建任务', 'New task', 'New Task'];
const OPEN_WS_TEXTS = ['打开工作区', 'Open workspace', 'Open Workspace'];

export function handleHeaderMenu(content) {
  if (content.querySelector('[data-zcodepro-item="settings"]')) return;
  const items = itemsOf(content);
  if (items.length < 2) return;
  // 文案匹配用 startsWith：项内含快捷键角标（如“新建任务Ctrl+N”）
  const first = itemText(items[0]);
  const head = items.slice(0, 3).map(itemText).join(' ');
  const isNewTask = NEW_TASK_TEXTS.some((x) => first.startsWith(x));
  const isOpenWs = OPEN_WS_TEXTS.some((x) => head.includes(x));
  if (!(isNewTask && isOpenWs)) return;
  void (async () => {
    const config = await getConfig();
    if (config.features && config.features.headerSettingsEntry === false) return;
    appendSettingsItem(content, items[0]);
  })();
}

function appendSettingsItem(menu, firstItem) {
  const L = t();
  const item = firstItem.cloneNode(true);
  item.removeAttribute('data-testid');
  item.removeAttribute('data-highlighted');
  item.setAttribute('data-zcodepro-item', 'settings');
  // 去掉原有文字与快捷键角标，只保留自己的文字
  for (const child of [...item.childNodes]) child.remove();
  item.append(document.createTextNode(L.settingsEntry));
  item.addEventListener('mouseenter', () => {
    for (const el of menu.querySelectorAll('[role="menuitem"]')) el.removeAttribute('data-highlighted');
    item.setAttribute('data-highlighted', '');
  });
  item.addEventListener('mouseleave', () => item.removeAttribute('data-highlighted'));
  item.addEventListener('click', () => {
    closeRadixMenu(menu);
    setTimeout(() => openSettingsDialog(), 80);
  });
  menu.append(item);
}
