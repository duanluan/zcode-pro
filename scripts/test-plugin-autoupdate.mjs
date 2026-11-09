// 自动更新“每次 ZCode 启动只跑一次”的守护测试：按页面 URL 的
// zcodeLaunchMarks.createdAt 区分启动批次，同一批次第二次领取必须失败；
// 取不到启动标记时退回 sessionStorage；localStorage 不可用时先退 sessionStorage，
// 都不可用才用内存标记。
// 零依赖，node scripts/test-plugin-autoupdate.mjs（或 npm test）直接跑，全绿退出码 0。
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'src', 'inject', 'features', 'plugin-updates.js'), 'utf8');
const start = src.indexOf('const AUTO_UPDATE_LAUNCH_KEY');
const end = src.indexOf('export async function startPluginUpdateCheck');
if (start < 0 || end < 0) {
  console.error('FAIL: plugin-updates.js 里找不到自动更新标记代码');
  process.exit(1);
}
const code = src.slice(start, end).replace(/export /g, '');

const makeStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
  };
};
const launchUrl = (ms) => `?restoreSession=true&zcodeLaunchMarks=${encodeURIComponent(JSON.stringify({ createdAt: ms }))}`;

const load = (location, localStorage, sessionStorage) => new Function(
  'location', 'localStorage', 'sessionStorage',
  `${code}; return { claimAutoUpdateRun };`,
)(location, localStorage, sessionStorage).claimAutoUpdateRun;

let failed = 0;
const check = (cond, msg) => {
  if (!cond) { console.error('FAIL: ' + msg); failed = 1; }
};

// 1. 同一启动批次只成功一次；新启动脚本实例 + 新时间戳（关掉重开）后重新放行
{
  const store = makeStorage();
  const first = load({ search: launchUrl(111) }, store, makeStorage());
  check(first() === true, '同一启动批次第一次领取应成功');
  check(first() === false, '同一启动批次第二次领取应被拒绝');
  const second = load({ search: launchUrl(222) }, store, makeStorage());
  check(second() === true, '关闭重开（新启动时间戳）后应重新放行');
}

// 1b. 启动标记在脚本加载时缓存：应用内路由改了 URL 也不能在同一次启动里再领一次
{
  const location = { search: launchUrl(333) };
  const claim = load(location, makeStorage(), makeStorage());
  check(claim() === true, '缓存启动标记：第一次领取应成功');
  location.search = launchUrl(444);
  check(claim() === false, 'URL 变化不应绕过同一次启动的限制');
}

// 2. 没有启动标记时用 sessionStorage 区分：同一会话只成功一次
{
  const session = makeStorage();
  const claim = load({ search: '' }, makeStorage(), session);
  check(claim() === true, '无启动标记时同一会话第一次领取应成功');
  check(claim() === false, '无启动标记时同一会话第二次领取应被拒绝');
}

// 2b. 页面刷新 = 新的注入实例、同一启动标记：localStorage 里的记录应拦住
{
  const store = makeStorage();
  const first = load({ search: launchUrl(555) }, store, makeStorage());
  check(first() === true, '页面刷新前第一次领取应成功');
  const reloaded = load({ search: launchUrl(555) }, store, makeStorage());
  check(reloaded() === false, '页面刷新（新注入实例，同一启动标记）不应再次更新');
}

// 3. localStorage 不可用时先退 sessionStorage：同一会话刷新后仍拒绝
{
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const session = makeStorage();
  const first = load({ search: launchUrl(666) }, broken, session);
  check(first() === true, 'localStorage 不可用时第一次领取应成功');
  const reloaded = load({ search: launchUrl(666) }, broken, session);
  check(reloaded() === false, 'localStorage 不可用但 sessionStorage 可用时，刷新后仍应拒绝');
}

// 4. 两个存储都不可用才退回内存标记：同一页面加载内也只成功一次
{
  const brokenA = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const brokenB = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const claim = load({ search: launchUrl(1) }, brokenA, brokenB);
  check(claim() === true, '两个存储都不可用时第一次领取应成功');
  check(claim() === false, '两个存储都不可用时第二次领取应被拒绝');
}

if (!failed) console.log('ok: 自动更新每次 ZCode 启动只执行一次');
process.exit(failed);
