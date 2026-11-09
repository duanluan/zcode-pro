// 启动时检查 duanluan-zcode-plugins 市场的插件更新：
// 有新版本 → 开了“自动更新插件”直接更新，否则 toast 提醒一次（同一批更新只提醒一次）。
// 实际的 marketplace 同步与安装/更新都由 helper 的 /plugins/* 端点执行。
import { rpc, getConfig, t } from '../core.js';
import { showToast } from '../ui.js';

const NOTIFIED_KEY = 'zcodepro-plugin-updates-notified';
const AUTO_UPDATE_LAUNCH_KEY = 'zcodepro-plugin-autoupdate-launch';
const AUTO_UPDATE_SESSION_KEY = 'zcodepro-plugin-autoupdate-session-claim';

// 当前 ZCode 启动批次的标记：页面 URL 的 zcodeLaunchMarks 带本次启动时间戳，
// 页面刷新不变、关掉重开变新值。取不到时退回 sessionStorage（刷新还在，
// 应用重启后失效），两条路都取不到时用本模块内存标记兜底。
function autoUpdateLaunchMark() {
  try {
    const raw = new URLSearchParams(location.search).get('zcodeLaunchMarks');
    if (raw) {
      const createdAt = JSON.parse(raw)?.createdAt;
      if (createdAt != null) return `launch:${createdAt}`;
    }
  } catch { /* ignore */ }
  try {
    let id = sessionStorage.getItem('zcodepro-plugin-autoupdate-session');
    if (!id) {
      id = `session:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem('zcodepro-plugin-autoupdate-session', id);
    }
    return id;
  } catch { return `memory:${Date.now()}:${Math.random().toString(36).slice(2)}`; }
}

let memoryClaimed = false;

// 注入脚本通常在页面文档开始时执行，URL 上的启动标记还在；若 Pro 后接入已加载
// 页面、URL 已被应用改写，退回 sessionStorage（即按窗口计）。只读一次并缓存，
// 应用内路由后面再改 URL 也不影响同一批次的判断。
const LAUNCH_MARK = autoUpdateLaunchMark();

// 在一个存储里领取：返回 true/false，存储不可用返回 null。localStorage 写失败
// （配额/权限）时不直接掉到内存标记，先试 sessionStorage，页面刷新后仍能记住。
function claimIn(storage, key, mark) {
  try {
    if (storage.getItem(key) === mark) return false;
    storage.setItem(key, mark);
    return true;
  } catch { return null; }
}

// 领取本次启动的自动更新机会：同一启动批次只有第一次返回 true。
// 只在真要执行更新前调用——只检查没更新不占名额；更新一旦发起，本次启动不再
// 自动重试，失败请手动点“检查更新”或重启 ZCode。
export function claimAutoUpdateRun() {
  const mark = LAUNCH_MARK;
  const local = typeof localStorage === 'undefined' ? null : localStorage;
  const viaLocal = local ? claimIn(local, AUTO_UPDATE_LAUNCH_KEY, mark) : null;
  if (viaLocal !== null) return viaLocal;
  const session = typeof sessionStorage === 'undefined' ? null : sessionStorage;
  const viaSession = session ? claimIn(session, AUTO_UPDATE_SESSION_KEY, mark) : null;
  if (viaSession !== null) return viaSession;
  if (memoryClaimed) return false;
  memoryClaimed = true;
  return true;
}

export async function startPluginUpdateCheck() {
  const status = await rpc('/plugins/status');
  if (!status.ok || !Array.isArray(status.updates)) return;
  const L = t();
  if (status.updates.length === 0) return;

  const config = await getConfig();
  if ((config.features || {}).autoUpdatePlugins === true) {
    // 每次 ZCode 启动只自动更新一次：启动检查没更新过、设置弹窗先到，谁先谁占名额
    if (!claimAutoUpdateRun()) return;
    const res = await rpc('/plugins/update', { method: 'POST', body: {} });
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
