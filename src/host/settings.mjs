// 读写 ZCode 的 setting.json（~/.zcode/v2/setting.json）。
// 读用于 helper 的 /projects 端点；写仅用于“切换文件夹”后的路径引用同步，
// 采用原子写并保留备份。

import { copyFileSync, existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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

export function writeSettingsAtomic(settingsFile, next) {
  const dir = join(settingsFile, '..');
  const backup = join(dir, 'setting.json.zcodepro-backup');
  if (existsSync(settingsFile)) {
    try { copyFileSync(settingsFile, backup); } catch { /* 备份失败不阻塞 */ }
  }
  const tmp = `${settingsFile}.${process.pid}.${Date.now().toString(36)}.tmp`; // 防多写者共用同一 .tmp 撕裂
  writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
  renameSync(tmp, settingsFile);
}

// 读改写 setting.json 的路径引用同步：应用本体也在写这个文件，写回前核对文件
// mtime，期间被写过就重读重算再写（最多重算一次），别用旧快照覆盖应用刚写的条目
export function remapSettingsPathsAtomic(settingsFile, oldPath, newPath) {
  const mtimeOf = () => { try { return statSync(settingsFile).mtimeMs; } catch { return 0; } };
  for (let attempt = 0; attempt < 2; attempt++) {
    const stamp = mtimeOf();
    const next = remapSettingsPaths(readSettings(settingsFile), oldPath, newPath);
    if (attempt === 0 && mtimeOf() !== stamp) continue; // 期间被写过：重读重算再写
    writeSettingsAtomic(settingsFile, next);
    return;
  }
}

// 将 setting.json 中所有引用旧路径的字段映射到新路径，返回新 settings 对象。
// 替换时保留原值的尾分隔符风格（ZCode 自身多写带 / 的路径），减少与宿主写入的差异。
export function remapSettingsPaths(settings, oldPath, newPath) {
  const next = JSON.parse(JSON.stringify(settings));
  const norm = (p) => (typeof p === 'string' ? p.replace(/[\\/]+$/, '') : '');
  const swap = (p) => {
    if (typeof p !== 'string' || norm(p) !== norm(oldPath)) return p;
    return newPath + p.slice(norm(oldPath).length); // 保留原尾分隔符（可为空）
  };
  if (Array.isArray(next.recentProjects)) {
    next.recentProjects = next.recentProjects.map(swap);
  }
  if (Array.isArray(next.lastWorkspaceSession)) {
    next.lastWorkspaceSession = next.lastWorkspaceSession.map((entry) => {
      if (entry) entry.workspacePath = swap(entry.workspacePath);
      return entry;
    });
  }
  if (next.webRemoteControlLastEnabledContext) {
    next.webRemoteControlLastEnabledContext.workspacePath = swap(next.webRemoteControlLastEnabledContext.workspacePath);
  }
  return next;
}

export function isProjectOpenInTabs(settings, projectPath) {
  const norm = (p) => (typeof p === 'string' ? p.replace(/[\\/]+$/, '') : '');
  const target = norm(projectPath);
  const tabs = Array.isArray(settings.lastWorkspaceSession) ? settings.lastWorkspaceSession : [];
  return tabs.some((entry) => entry && norm(entry.workspacePath) === target);
}
