// 功能零：右键 ZCode 设置按钮（侧边栏底部齿轮）弹出增强设置窗口。
// 左键保留应用原生行为（打开 ZCode 设置页）。监听委托到 document 捕获阶段，
// React 重渲染替换按钮节点也不失效；testid 随应用改版变动时需同步此处。
import { openSettingsDialog } from './settings-dialog.js';

const SETTINGS_BUTTON_TESTID = 'task-settings-button';

export function handleSettingsContextmenu(e) {
  const target = e.target;
  if (!(target instanceof Element)) return;
  if (!target.closest(`[data-testid="${SETTINGS_BUTTON_TESTID}"]`)) return;
  e.preventDefault();
  e.stopPropagation();
  // 增强弹窗已打开时忽略，避免叠开（openDialog 无防重入）
  if (document.getElementById('zcodepro-overlay')) return;
  openSettingsDialog();
}

export function startSettingsEntry() {
  document.addEventListener('contextmenu', handleSettingsContextmenu, true);
}
