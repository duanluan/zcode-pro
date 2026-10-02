// 启动时检查 duanluan-zcode-plugins 市场的插件更新：
// 有新版本 → 开了「自动更新插件」直接更新，否则 toast 提醒一次（同一批更新只提醒一次）。
// 实际的 marketplace 同步与安装/更新都由 helper 的 /plugins/* 端点执行。
import { rpc, getConfig, t } from '../core.js';
import { showToast } from '../ui.js';

const NOTIFIED_KEY = 'zcodepro-plugin-updates-notified';

export async function startPluginUpdateCheck() {
  const status = await rpc('/plugins/status');
  if (!status.ok || !Array.isArray(status.updates)) return;
  const L = t();
  if (status.updates.length === 0) return;

  const config = await getConfig();
  if ((config.features || {}).autoUpdatePlugins === true) {
    const res = await rpc('/plugins/update', { method: 'POST', body: { installMissing: true } });
    if (res.ok) showToast(L.pluginsAutoUpdated, 'success');
    else showToast(L.pluginsUpdateFailed + ': ' + (res.error || ''), 'error');
    return;
  }
  const sig = status.updates.map((u) => `${u.name}:${u.installed}>${u.latest}`).join(',');
  let seen = '';
  try { seen = window.localStorage.getItem(NOTIFIED_KEY) || ''; } catch { /* ignore */ }
  if (seen === sig) return;
  try { window.localStorage.setItem(NOTIFIED_KEY, sig); } catch { /* ignore */ }
  showToast(L.pluginsUpdatesAvailable.replaceAll('{n}', String(status.updates.length)), 'info');
}
