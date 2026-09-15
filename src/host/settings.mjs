// 读取 ZCode 的 setting.json（~/.zcode/v2/setting.json）。
// 仅用于 helper 的 /projects 端点（最近项目列表 + 是否已在工作区打开）；
// 本项目不写该文件——目录重命名功能已移除，只保留零风险的“自定义别名”。

import { existsSync, readFileSync } from 'node:fs';

export function readSettings(settingsFile) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      if (!existsSync(settingsFile)) return {};
      return JSON.parse(readFileSync(settingsFile, 'utf8'));
    } catch (err) {
      if (attempt === 4) throw new Error('读取 setting.json 失败: ' + err.message);
      // 可能正被原子重命名，稍候重试
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40);
    }
  }
}

export function isProjectOpenInTabs(settings, projectPath) {
  const norm = (p) => (typeof p === 'string' ? p.replace(/[\\/]+$/, '') : '');
  const target = norm(projectPath);
  const tabs = Array.isArray(settings.lastWorkspaceSession) ? settings.lastWorkspaceSession : [];
  return tabs.some((entry) => entry && norm(entry.workspacePath) === target);
}
