// ZCode Pro 主流程：
// 1. 定位 ZCode 可执行文件
// 2. 若 CDP 端口不可达且 ZCode 未在运行 → 以 --remote-debugging-port 启动 ZCode
//    （若 ZCode 已在运行但没有调试端口，绝不主动杀进程，只提示用户手动重启）
// 3. 连接 CDP，向所有页面注入增强脚本（新文档自动注入 + 已加载页面立即注入）
// 4. 启动本地辅助 HTTP 服务并常驻，CDP 断开时自动重连
import { spawn, execSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { resolveZcodeExecutable, resolveDataRootDir } from './paths.mjs';
import { readZcodeVersion } from './version.mjs';
import { CdpConnection, fetchBrowserWsUrl } from './cdp.mjs';
import * as helperModule from './helper.mjs';
import { runSetup } from './setup.mjs';
import { runWallpaperCli, installWallpaperDocs, removeWallpaperDocs } from './wallpaper.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const INJECT_BUNDLE = resolve(here, '..', '..', 'dist', 'inject.js');

// Windows 控制台中文乱码适配：输出为 UTF-8 字节，旧版 conhost/cmd 的默认代码页
//（936/GBK）按 GBK 解码会显示乱码。检测到非 UTF-8 代码页时切到 65001——只影响
// 当前控制台会话（重开终端即恢复）。不能用 stdout.isTTY 单独作前提：npm 全局
// 入口（bin/zcode-pro.mjs）spawn ZCode 运行时跑 cli.mjs，子进程 stdout 经
// stdio:'inherit' 是管道（isTTY=false），但控制台乱码照样发生（0.18/0.19 用户
// 实拍）；此时 stdin 仍连着终端，故用 stdout 或 stdin 任一 isTTY 判定。真正的
// 重定向场景（stdout 与 stdin 都不是 TTY）不干预。
// 放在模块顶层：cli.mjs 经 import main.mjs 进入，setup 等子命令的输出同样受益。
if (process.platform === 'win32' && (process.stdout.isTTY || process.stdin.isTTY)) {
  try {
    const cp = execSync('chcp.com', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).match(/(\d+)/)?.[1];
    if (cp && cp !== '65001') execSync('chcp.com 65001', { stdio: 'ignore', windowsHide: true });
  } catch { /* 无控制台或 chcp 不可用时保持原样 */ }
}

function usage() {
  return `ZCode Pro — ZCode 桌面版增强启动器（壁纸引擎与界面增强）

用法: zcode-pro [选项]

选项:
  --cdp-port <端口>      CDP 调试端口 (默认 9333)
  --helper-port <端口>   本地辅助服务端口 (默认 47889)
  --zcode-path <路径>    ZCode 可执行文件路径
  --inject-only          只注入已运行的实例（要求其带调试端口），不启动新实例
  --no-launch            同 --inject-only
  --verbose, -v          输出详细日志
  -h, --help             显示帮助

子命令:
  setup                  安装本机集成（快捷方式：Linux 应用菜单 / Windows 开始菜单 / macOS 应用）
  setup --desktop        同时在桌面创建快捷方式
  setup --uninstall      移除由 setup 安装的集成（含桌面）
  wallpaper <操作>       壁纸引擎控制：list/set/rotate/params/upload/delete（wallpaper -h 详览）

环境变量:
  ZCODEPRO_ZCODE_PATH     ZCode 可执行文件路径（同 --zcode-path）
  ZCODEPRO_CDP_PORT       CDP 端口
  ZCODEPRO_HELPER_PORT    辅助服务端口
  ZCODE_DATA_BASE_DIR    ZCode 数据根目录（与 ZCode 自身语义一致）
  ZCODEPRO_DEV           设为 1 开启开发模式（设置弹窗出现“调试”标签页）
  RTK_DIR                rtk 插件状态目录（默认 ~/.zcode-rtk）
`;
}

function parseArgs(argv) {
  const out = { cdpPort: 0, helperPort: 0, zcodePath: '', injectOnly: false, verbose: false, help: false, bad: false };
  const portArg = (name, raw) => {
    const n = Number(raw);
    if (!raw || !Number.isInteger(n) || n < 1 || n > 65535) {
      console.error(`${name} 需要 1-65535 的端口数字，收到: ${raw}`);
      out.bad = true;
      return 0;
    }
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cdp-port') out.cdpPort = portArg('--cdp-port', argv[++i]);
    else if (a === '--helper-port') out.helperPort = portArg('--helper-port', argv[++i]);
    else if (a === '--zcode-path') out.zcodePath = argv[++i];
    else if (a === '--inject-only' || a === '--no-launch') out.injectOnly = true;
    else if (a === '--verbose' || a === '-v') out.verbose = true;
    else if (a === '-h' || a === '--help') out.help = true;
    else if (a === 'setup') out.setup = true;
    else if (a === '--uninstall') out.setupUninstall = true;
    else if (a === '--desktop') out.setupDesktop = true;
    else { console.error('未知参数: ' + a); out.help = true; out.bad = true; }
  }
  out.cdpPort = out.cdpPort || Number(process.env.ZCODEPRO_CDP_PORT) || 9333;
  out.helperPort = out.helperPort || Number(process.env.ZCODEPRO_HELPER_PORT) || 47889;
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 桌面快捷方式启动（Terminal=false）时 stderr 不可见，致命错误用桌面通知兜底；
// 终端运行或有通知服务缺失时静默退回纯 stderr。
function guiNotify(title, body) {
  if (process.platform !== 'linux' || process.stderr.isTTY) return;
  try {
    spawnSync('notify-send', ['-a', 'ZCode Pro', '-i', 'zcode', title, body], { stdio: 'ignore', timeout: 4000 });
  } catch { /* ignore */ }
}

// Windows 快捷方式静默启动时控制台与桌面通知都不可见（guiNotify 仅 linux 有渠道），
// 关键启动阶段与致命错误落盘 ~/.zcode/zcodepro.log，便于排查“双击没反应”（issue #1）。
// 日志超 512KB 时轮转为 .old（zcode-pro.cmd 失败分支有同款轮转，需同步维护）。
let winLogRotated = false;
function winLog(line) {
  if (process.platform !== 'win32') return;
  try {
    const dir = resolveDataRootDir();
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'zcodepro.log');
    if (!winLogRotated) {
      winLogRotated = true;
      try {
        if (existsSync(file) && statSync(file).size > 512 * 1024) renameSync(file, `${file}.old`);
      } catch { /* ignore */ }
    }
    // 行尾 \r\n：Windows 记事本对纯 \n 的老日志显示成一行（winLog 只在 win32 写文件）
    appendFileSync(file, `[${new Date().toISOString()}] ${line}\r\n`);
  } catch { /* ignore */ }
}

async function cdpAlive(port) {
  try { await fetchBrowserWsUrl(port, 1200); return true; } catch { return false; }
}

// 只检测 ZCode 应用进程是否存在，绝不干预。
// 注意：zcodepro 自身可能以 ELECTRON_RUN_AS_NODE 方式复用 zcode 二进制运行，
// 进程名同为 zcode，因此要排除自己的 pid。
function zcodeAppProcessExists() {
  try {
    if (process.platform === 'win32') {
      // 不用 find 管道只看命中：要拿到 PID 列才能排除自己（启动器以 ELECTRON_RUN_AS_NODE
      // 跑在 ZCode.exe 镜像下时进程名同为 ZCode.exe，不排除会恒判“已在运行”）
      const out = execSync('tasklist /FI "IMAGENAME eq ZCode.exe" /NH', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      return out.split(/\r?\n/).some((line) => {
        const m = /^\S+\s+(\d+)/.exec(line.trim());
        return !!m && Number(m[1]) !== process.pid;
      });
    }
    const out = execSync('pgrep -x zcode 2>/dev/null || true', { encoding: 'utf8' });
    const pids = out.split('\n').map((s) => s.trim()).filter((s) => /^\d+$/.test(s));
      // 排除自身（zcodepro 以 ELECTRON_RUN_AS_NODE 运行时进程名也是 zcode）
    return pids.some((pid) => Number(pid) !== process.pid);
  } catch {
    return false;
  }
}

function launchZcode(exe, cdpPort, verbose) {
  // 启动器自身可能以 ELECTRON_RUN_AS_NODE=1 复用 zcode 二进制运行（无系统 node 时的回退），
  // 该变量绝不能带给拉起的 ZCode——否则新实例同样以纯 Node 模式启动，窗口永远不出现。
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(exe, [`--remote-debugging-port=${cdpPort}`], {
    detached: true,
    stdio: 'ignore',
    env,
  });
  // spawn 失败（可执行文件损坏/无权限等）走 error 事件：不监听会变成未处理错误把启动器炸掉
  child.on('error', (err) => {
    winLog('启动 ZCode 失败: ' + err.message);
    console.error('[zcodepro] 启动 ZCode 失败: ' + err.message);
  });
  child.unref();
  if (verbose) console.log(`[zcodepro] 已启动 ZCode (pid=${child.pid})，调试端口 ${cdpPort}`);
}

async function waitForCdp(port, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await cdpAlive(port)) return true;
    await sleep(400);
  }
  return false;
}

// 沙箱透明样式：插件卡片（zcode-sandbox 壳/插件页）注入的唯一内容。
// 不含 token、不碰宿主接口，只是把页面自带的实色 body 背景顶成透明，
// 让壁纸从卡片透出（与注入层的 webview.insertCSS 双保险）
const SANDBOX_STYLE_SCRIPT = `(() => {
  const s = document.createElement('style');
  s.textContent = 'html,body{background:transparent !important}';
  (document.head || document.documentElement).append(s);
})();`;

// file:// 页面的注入范围：只放行 ZCode 安装目录下的页面，防止含 helper token 的
// 引导脚本进任意本地 HTML。允许的前缀有三个来源：启动 exe 所在目录；exe 真实
// 路径所在目录（经符号链接启动时应用 UI 走真实路径）；macOS 应用包的
// Contents/Resources（exe 在 Contents/MacOS 里、UI 在 Resources 里，不同目录）。
// 前缀归一成 file URL 的 pathname 形式做比较（盘符路径补前导 /、反斜杠换 /），
// exe 路径带盘符（Windows）时大小写不敏感。
// 取舍：从源码目录直接跑的 ZCode（dev 布局）不在这些前缀下会失去注入，届时再加配置。
function installDirFromExe(exePath) {
  const prefixes = [];
  const add = (dir) => {
    const norm = /^[A-Za-z]:[\\/]/.test(dir) ? '/' + dir.replace(/\\/g, '/') : dir;
    if (!prefixes.includes(norm)) prefixes.push(norm);
  };
  const dir = dirname(resolve(exePath));
  add(dir);
  try { add(dirname(realpathSync(exePath))); } catch { /* 路径不可解析就只用字面前缀 */ }
  for (let d = dir, i = 0; i < 4; i++) {
    if (/\.app$/i.test(d)) { add(join(d, 'Contents', 'Resources')); break; }
    const up = dirname(d);
    if (up === d) break;
    d = up;
  }
  // macOS 的 APFS 默认大小写不敏感，前缀比较同样放宽大小写
  return { prefixes, ci: process.platform === 'darwin' || prefixes.some((p) => /^\/[A-Za-z]:/.test(p)) };
}

// file:// 路径归一（宿主侧与页面侧护栏同一算法）：decodeURI 不解码 %2f/%5c，
// 也不折叠 .. 段，先把 %2f/%5c（大小写不敏感）与字面反斜杠统一成 /，再做词法段
// 折叠（消掉 . 与 .. 段，等价 path.posix.normalize；页面侧是注入字符串，用原生
// JS 实现同一套，不引依赖），否则 ..%5c..%5c 之类编码分隔符能绕过前缀匹配
function normFileUrlPath(p) {
  const s = String(p).replace(/%2f/gi, '/').replace(/%5c/gi, '/').replace(/\\/g, '/');
  const abs = s.startsWith('/');
  const out = [];
  for (const seg of s.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (out.length && out[out.length - 1] !== '..') out.pop();
      else if (!abs) out.push('..'); // 相对路径回溯段保留，语义同 path.posix.normalize
      continue;
    }
    out.push(seg);
  }
  return (abs ? '/' : '') + out.join('/');
}

// file:// URL 是否落在任一安装目录前缀下：与页面侧护栏同款比较，比较前先解码
// URL 路径（页面侧是 decodeURI(location.pathname)）并按 normFileUrlPath 归一。
// URL 解析失败按不放行处理；
// 路径里孤立的 % 会让 decodeURI 抛错，这时退回原始路径比较——前缀不含 % 时仍能匹配
function fileUrlUnderInstall(fileUrl, installDir) {
  let p;
  try {
    const raw = new URL(fileUrl).pathname;
    try { p = decodeURI(raw); } catch { p = raw; }
  } catch { return false; }
  p = normFileUrlPath(p);
  if (installDir.ci) p = p.toLowerCase();
  return installDir.prefixes.some((raw) => {
    const pre = installDir.ci ? raw.toLowerCase() : raw;
    return p === pre || p.indexOf(pre.endsWith('/') ? pre : pre + '/') === 0;
  });
}

// 可注入判定：引导脚本内含 helper 鉴权 token，只能进 ZCode 应用自身的页面。
// 规则：http(s) 只放行本机回环地址；file:// 只放行 ZCode 安装目录下的页面
//（应用 UI 在 <安装目录>/resources/app.asar/ 里）；拦截外部网页与
// data/blob/view-source/about 子文档，沙箱页同样不带 token；应用自有协议
// 维持放行。refreshInjectScripts 重注册时目标可能已导航离开应用页，需重跑同款判定
export function isInjectableAppPage(url, installDir) {
  const u = String(url || '');
  if (/^zcode-sandbox:\/\//i.test(u)) return false;
  if (/^https?:\/\//i.test(u) && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$|\?|#)/i.test(u)) return false;
  if (/^(data|blob|view-source|about):/i.test(u)) return false;
  // file: 不带双斜杠的形态（file:/etc/…）也要过前缀校验，别落到末尾的放行
  if (/^file:/i.test(u)) return fileUrlUnderInstall(u, installDir);
  return true;
}

// token 护栏做成运行时自检：attach 时判定 URL 挡不住“空白初页 → 导航去沙箱/外网”
// 的目标（引导脚本会随 addScript 落进该会话之后的每个文档）。每文档执行时看真实
// href，沙箱/外链页面整段跳过，token 不出应用页；空白文档也跳过（真应用文档会
// 以自己的 URL 再触发一次钩子）。file:// 只放行 ZCode 安装目录下的页面（应用 UI
// 在 <安装目录>/resources/app.asar/ 里，必须继续放行），否则含 token 的引导脚本
// 会进任意本地 HTML。护栏是注入进页面的字符串，安装目录前缀（含符号链接真实
// 路径与 macOS 应用包 Resources，见 installDirFromExe）在宿主侧构造时写进下面的
// 字符串；页面侧比较前先 decodeURI(location.pathname) 并按 normFileUrlPath 同款
// 算法归一（编码分隔符与 .. 段折叠，两侧行为必须一致），exe 路径带盘符
//（Windows）时大小写不敏感
export function buildGuard(installDir) {
  return `if ((function () {
  var h = location.href;
  if (/^(zcode-sandbox|about|data|blob|view-source):/i.test(h)) return false;
  if (/^https?:\\/\\//i.test(h)) return /^https?:\\/\\/(127\\.0\\.0\\.1|localhost)(:\\d+)?(\\/|$|\\?|#)/i.test(h);
  if (/^file:\\/\\//i.test(h)) {
    var raw = location.pathname, p;
    try { p = decodeURI(raw); } catch (e) { p = raw; }
    p = p.replace(/%2f/gi, '/').replace(/%5c/gi, '/').replace(/\\\\/g, '/');
    var abs = p.charAt(0) === '/', segs = p.split('/'), out = [], j, seg;
    for (j = 0; j < segs.length; j++) {
      seg = segs[j];
      if (seg === '' || seg === '.') continue;
      if (seg === '..') {
        if (out.length && out[out.length - 1] !== '..') out.pop();
        else if (!abs) out.push('..');
        continue;
      }
      out.push(seg);
    }
    p = (abs ? '/' : '') + out.join('/');
    var pres = ${JSON.stringify(installDir.prefixes)};
    ${installDir.ci ? 'p = p.toLowerCase();' : ''}
    for (var i = 0; i < pres.length; i++) {
      var pre = ${installDir.ci ? 'pres[i].toLowerCase()' : 'pres[i]'};
      if (p === pre || p.indexOf(pre.endsWith('/') ? pre : pre + '/') === 0) return true;
    }
    return false;
  }
  return true;
})()) {`;
}

async function buildInjectSource(token, helperPort, features, zcodeVersion, installDir) {
  if (!existsSync(INJECT_BUNDLE)) {
    throw new Error('缺少注入脚本 dist/inject.js，请先运行 npm run build');
  }
  const bundle = readFileSync(INJECT_BUNDLE, 'utf8');
  const bootstrap = `window.__ZCODEPRO__={helperUrl:'http://127.0.0.1:${helperPort}',token:${JSON.stringify(token)},features:${JSON.stringify(features)},zcodeVersion:${JSON.stringify(zcodeVersion || '')}};`;
  return buildGuard(installDir) + bootstrap + '\n' + bundle + '\n}';
}

export async function run(argv) {
  // wallpaper 子命令只碰壁纸配置/图库，不启动 ZCode，先于其余参数解析处理
  if (argv[0] === 'wallpaper') {
    process.exitCode = await runWallpaperCli(argv.slice(1), resolveDataRootDir());
    return;
  }
  const args = parseArgs(argv);
  // 参数错误按失败退出（脚本调用方靠退出码判断）；单纯 --help 仍退出码 0
  if (args.help) { console.log(usage()); process.exitCode = args.bad ? 1 : 0; return; }
  // setup 不依赖 ZCode 运行（装快捷方式等本机集成），先于 ZCode 定位处理
  if (args.setup || args.setupUninstall || args.setupDesktop) {
    if (!args.setup && (args.setupUninstall || args.setupDesktop)) {
      console.error('未知用法: --uninstall / --desktop 仅可与 setup 连用');
      console.log(usage());
      process.exitCode = 1;
      return;
    }
    await runSetup({ uninstall: args.setupUninstall, desktop: args.setupDesktop });
    if (args.setupUninstall) { try { removeWallpaperDocs(resolveDataRootDir()); } catch { /* ignore */ } }
    return;
  }
  const log = (...a) => { if (args.verbose) console.log('[zcodepro]', ...a); };

  let exe;
  try {
    exe = resolveZcodeExecutable(args.zcodePath);
  } catch (err) {
    if (err.code === 'ZCODE_NOT_FOUND') {
      winLog('未找到 ZCode 可执行文件: ' + err.message);
      guiNotify('ZCode Pro 启动失败', '未找到 ZCode 可执行文件，详见终端输出。');
    }
    throw err;
  }
  const installDir = installDirFromExe(exe); // file:// 页面注入范围（见 installDirFromExe 注释）
  winLog(`启动: ZCode=${exe}, CDP 端口 ${args.cdpPort}`);
  const zcodeVersion = readZcodeVersion(exe);
  if (args.verbose) console.log(`[zcodepro] ZCode 版本: ${zcodeVersion || '未知（app.asar 读取失败）'}`);
  const dataRoot = resolveDataRootDir();
  try { installWallpaperDocs(dataRoot); } catch { /* 命令/技能文件写入失败不挡启动 */ }
  const token = randomBytes(16).toString('hex');
  const state = { injectedPages: 0 };

  // 1. 确保 ZCode 带着 CDP 端口在运行
  if (!(await cdpAlive(args.cdpPort))) {
    if (args.injectOnly) {
      console.error(`[zcodepro] --inject-only 模式：端口 ${args.cdpPort} 上没有可注入的 ZCode 实例。`);
      process.exit(1);
    }
    // 直接尝试启动；若单实例锁冲突（已有实例未开调试端口），端口不会起来
    launchZcode(exe, args.cdpPort, args.verbose);
    const ok = await waitForCdp(args.cdpPort, 30000);
    if (!ok) {
      console.error(`[zcodepro] 等待 ZCode 调试端口 ${args.cdpPort} 超时。`);
      if (zcodeAppProcessExists()) {
        winLog(`等待 CDP 端口 ${args.cdpPort} 超时：ZCode 已在运行但未开调试端口，需先退出原实例`);
        console.error('[zcodepro] 检测到 ZCode 已在运行，但未开启调试端口，无法注入。');
        console.error('[zcodepro] 请手动退出当前 ZCode（zcodepro 不会替你关闭正在运行的实例），然后重新运行 zcodepro。');
        guiNotify('ZCode Pro 暂无法注入', 'ZCode 已在运行但未开启调试端口，请退出 ZCode 后重新打开 ZCode Pro。');
      } else {
        winLog(`等待 CDP 端口 ${args.cdpPort} 超时（未见 ZCode 进程）`);
        guiNotify('ZCode Pro 启动失败', `等待 ZCode 调试端口 ${args.cdpPort} 超时。`);
      }
      process.exit(1);
    }
  } else {
    log(`复用已在监听的 CDP 端口 ${args.cdpPort}`);
  }

  // 2. 启动辅助服务
  const helperArgs = { port: args.helperPort, token, dataRoot, state, zcodeVersion };
  let helperMod = helperModule; // 当前在服的 helper 模块实例（热替换后指新实例）
  let server = await helperModule.startHelper(helperArgs);
  console.log(`[zcodepro] 辅助服务已就绪: http://127.0.0.1:${args.helperPort} (数据目录 ${dataRoot})`);

  // 3. 连接 CDP 并注入（断线自动重连）
  const injectedTargets = new Map(); // targetId -> sessionId
  const scriptIds = new Map(); // targetId -> 新文档脚本 identifier 集合（含没删掉的旧注册）
  // identifier 记录逐个增删（追加去重，删除只动命中的那个）：同一 target 一轮
  // 连接内可能二次 attached（跨进程导航、渲染进程切换），refresh 的 remove/add
  // 之间 handleAttach 也可能合进新注册——整组覆盖会把没删掉或刚合进来的
  // identifier 冲掉，那份注册就永远删不掉，页面每次刷新多跑一份注入包
  const noteScriptId = (targetId, id) => {
    const ids = scriptIds.get(targetId) || new Set();
    ids.add(id);
    scriptIds.set(targetId, ids);
  };
  let registeredSource = ''; // 已注册的注入包（内容没变不重复注册）
  let refreshPending = false; // 有页面重注册失败待重试：期间 handleAttach 不推进已注册标记
  let lastRefreshError = ''; // 重注册错误日志按内容去重
  let refreshSkip = 0; // 失败后的退避周期数：单页持续失败时别每 3 秒全量重试
  let lastTriedSource = null; // 上次尝试重注册的包：包又变了就立即重试，不受退避限制
  let stopping = false;

  let healthRes;
  try {
    healthRes = await fetch(`http://127.0.0.1:${args.helperPort}/health`, { headers: { 'X-ZCodePro-Token': token } }).then((r) => r.json());
  } catch (err) {
    console.error(`[zcodepro] 辅助服务健康检查失败: ${err.message}`);
    winLog('辅助服务健康检查失败: ' + err.message);
    server.close();
    process.exit(1);
  }
  // 注入包按 mtime+size 缓存：npm run build 之后不用重启启动器——已打开页面
  // 下次“调试-重新加载”、新页面首次注入都直接吃新构建的包。
  // shortcut: 同一毫秒内改写成相同字节数的内容检测不到，构建产物几乎不会出现，
  // 如真遇到可把缓存键换成内容哈希
  const injectCache = { mtime: 0, size: 0, source: '' };
  async function getInjectSource() {
    let mtime = -1;
    let size = -1;
    try { const st = statSync(INJECT_BUNDLE); mtime = st.mtimeMs; size = st.size; } catch { /* 缺失/读失败：沿用旧包 */ }
    // 包内容没变直接用缓存（mtime+size 双键防粗粒度文件系统漏检）；
    // 构建间隙文件暂时缺失也沿用旧包
    if (injectCache.source && (mtime < 0 || (mtime === injectCache.mtime && size === injectCache.size))) return injectCache.source;
    const built = await buildInjectSource(token, args.helperPort, healthRes.features || {}, zcodeVersion, installDir);
    // 读取前后各 stat 一次对比：esbuild 正在写文件时可能读到半截包，
    // 半截内容不能进缓存（会一直被 mtime+size 命中），沿用旧包等下一轮
    let torn = true;
    try { const st2 = statSync(INJECT_BUNDLE); torn = st2.mtimeMs !== mtime || st2.size !== size; } catch { /* 读取中被删也算撕裂 */ }
    if (torn) {
      if (injectCache.source) return injectCache.source;
      throw new Error('dist/inject.js 正在写入，本轮跳过');
    }
    injectCache.source = built;
    injectCache.mtime = mtime;
    injectCache.size = size;
    return injectCache.source;
  }
  await getInjectSource(); // 启动即构建一次：缺 dist/inject.js 尽早报错

  async function attachConnection() {
    const conn = new CdpConnection(await fetchBrowserWsUrl(args.cdpPort));
    await conn.connect();
    injectedTargets.clear();
    scriptIds.clear();
    refreshPending = false; // 失败待重试的页面随旧会话消亡，重连后 handleAttach 全量注册

    const handleAttach = async (sessionId, targetInfo) => {
      const targetId = targetInfo?.targetId;
      if (!targetId) return;
      const pageUrl = String(targetInfo?.url || '');
      // 插件卡片（zcode-sandbox 壳 + 插件页 iframe）：只注入透明背景样式，不带
      // 引导脚本——沙箱页面拿不到 token，下面的护栏不受影响。背景透明后壁纸能
      // 从卡片透出（插件页自带的实色 body 背景被这条 !important 顶掉）
      if (/^zcode-sandbox:\/\//i.test(pageUrl)) {
        // 每步独立容错：iframe 会话上 addScript 若被拒，立即执行那步不能跟着一起死，
        // 否则样式永远进不去（白底卡片的根因）
        let ok = false;
        try {
          await conn.send('Page.enable', {}, sessionId);
          await conn.send('Page.addScriptToEvaluateOnNewDocument', { source: SANDBOX_STYLE_SCRIPT, runImmediately: true }, sessionId);
          ok = true;
        } catch (err) {
          log('沙箱新文档钩子注册失败（继续立即执行）: ' + err.message);
        }
        try {
          await conn.send('Runtime.evaluate', { expression: SANDBOX_STYLE_SCRIPT, silent: true }, sessionId);
          ok = true;
        } catch (err) {
          log('沙箱立即注入失败: ' + err.message);
        }
        if (ok) log('已注入沙箱透明样式: ' + pageUrl.slice(0, 60));
        return;
      }
      if (targetInfo?.type !== 'page') return;
      // 安全护栏：只注入应用自身页面（判定规则集中在 isInjectableAppPage，
      // 重注册时会再跑一遍）
      if (!isInjectableAppPage(pageUrl, installDir)) {
        log('跳过外部页面注入（防止 token 泄露）: ' + pageUrl.slice(0, 120));
        return;
      }
      // 取包失败（构建写入中、杀软锁文件）回退上一份包：旧包比没包好，
      // 下轮 refreshInjectScripts 自然换成新包
      let source = injectCache.source;
      try {
        source = await getInjectSource();
      } catch (err) {
        if (!source) { log('注入包读取失败且无缓存，跳过本页: ' + err.message); return; }
      }
      try {
        await conn.send('Page.enable', {}, sessionId);
        const added = await conn.send('Page.addScriptToEvaluateOnNewDocument', { source, runImmediately: true }, sessionId);
        if (added && added.identifier) noteScriptId(targetId, added.identifier);
        const res = await conn.send('Runtime.evaluate', { expression: source, silent: true }, sessionId);
        if (res?.exceptionDetails) log('注入执行异常: ' + String(res.exceptionDetails.exception?.description || '').slice(0, 200));
        // 只有首个页面（没有旧页面挂着旧包）、拿到的仍是当前包、且没有待重试的
        // 重注册才记已注册标记：其余情况由 refreshInjectScripts 统一推进，
        // 避免新页面注入把标记推到新包、旧页面却永远停在旧包
        if (!refreshPending && source === injectCache.source && injectedTargets.size === 0) registeredSource = source;
        injectedTargets.set(targetId, sessionId);
        state.injectedPages = injectedTargets.size;
        conn.onSession(sessionId, (m) => {
          if (m.type === 'detached') {
            injectedTargets.delete(targetId);
            scriptIds.delete(targetId);
            state.injectedPages = injectedTargets.size;
          }
        });
        log(`已注入页面 target=${targetId}`);
      } catch (err) {
        log('注入会话失败: ' + err.message);
      }
    };

    conn.onSession('', (msg) => {
      if (msg.type === 'attached') {
        handleAttach(msg.sessionId, msg.targetInfo).catch((e) => log('attach 处理失败: ' + e.message));
      }
    });
    await conn.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
    return conn;
  }

  let conn = null;
  for (let attempt = 0; attempt < 5 && !conn; attempt++) {
    try {
      conn = await attachConnection();
    } catch (err) {
      log('CDP 连接失败: ' + err.message + '，重试…');
      await sleep(1000);
    }
  }
  if (!conn) {
    console.error('[zcodepro] 无法连接 CDP，退出。');
    winLog('无法连接 CDP，退出');
    server.close();
    process.exit(1);
  }
  console.log('[zcodepro] 已连接 CDP 并开始注入。保持本进程运行以维持增强；Ctrl+C 退出（不影响 ZCode）。');
  winLog('已连接 CDP 并开始注入');

  process.on('SIGINT', () => { stopping = true; try { conn.close(); } catch {} try { helperMod.dispose?.(); } catch {} server.close(); process.exit(0); });
  process.on('SIGTERM', () => { stopping = true; try { conn.close(); } catch {} try { helperMod.dispose?.(); } catch {} server.close(); process.exit(0); });

  // dist/inject.js 变更后把各页面的新文档脚本换成新包：已打开页面不打断，
  // 下次“调试-重新加载”即跑新代码（新页面首次注入本来就是新包）
  async function refreshInjectScripts() {
    if (!conn || conn.closed) return; // 断连时注册会失败、日志也记不准，跳过；重连后 handleAttach 全量注册
    let source;
    try {
      source = await getInjectSource();
    } catch (err) {
      // 读失败也按内容去重：构建产物损坏又没有新 mtime 时别每 3 秒刷一行
      const msg = '注入包读取失败: ' + err.message;
      if (msg !== lastRefreshError) { lastRefreshError = msg; console.error('[zcodepro] ' + msg); winLog(msg); }
      return;
    }
    if (source === registeredSource) return; // 包内容没变就不重新注册
    if (refreshSkip > 0 && source === lastTriedSource) { refreshSkip--; return; }
    lastTriedSource = source;
    let want = 0;
    let ok = 0;
    let done = true;
    // 整轮时间预算：多页半死（每次 send 各带 30 秒超时）时别把重连检测拖后几十秒
    const deadline = Date.now() + 20_000;
    for (const [targetId, sessionId] of injectedTargets) {
      if (Date.now() > deadline) { done = false; break; } // 没轮到的页面留在旧包，下轮续
      // 目标可能在注入后导航去外部页面/沙箱：重注册前重跑同款可注入判定，
      // 否则含 token 的脚本串会注册进外部页面的会话（执行层虽有护栏兜底）
      try {
        const href = await conn.send('Runtime.evaluate', { expression: 'location.href', returnByValue: true, silent: true }, sessionId);
        if (!isInjectableAppPage(String((href && href.result && href.result.value) || ''), installDir)) {
          // 踢出前尽力移除已注册脚本：别把带 token 的注册留在外部页面的会话里
          for (const id of scriptIds.get(targetId) || []) {
            try { await conn.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: id }, sessionId); } catch { /* ignore */ }
          }
          injectedTargets.delete(targetId);
          scriptIds.delete(targetId);
          state.injectedPages = injectedTargets.size;
          continue;
        }
      } catch {
        // 取不到当前 URL 就不注册（宁可少注入，不把 token 注给未知页面），但要
        // 计入 want 让重试机制接管：否则全卡在这条时空集“全部成功”会误推进标记
        want++;
        continue;
      }
      want++;
      // 旧注册逐个移除：只把移除成功的 identifier 从记录里删掉，没删掉的留下轮
      // 继续删。遍历的是快照——remove/add 之间的 await 里 handleAttach 可能合进
      // 新注册，新注册不能当旧的删。删失败不能连累 add，否则该页没有新文档脚本，
      // 增强静默消失
      const oldIds = [...(scriptIds.get(targetId) || [])];
      for (const id of oldIds) {
        try {
          await conn.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: id }, sessionId);
          scriptIds.get(targetId)?.delete(id);
        } catch { /* 删失败留记录，下轮继续删 */ }
      }
      try {
        // runImmediately: false——只对下次新文档生效，不碰当前页面（用户按需刷新）
        const added = await conn.send('Page.addScriptToEvaluateOnNewDocument', { source, runImmediately: false }, sessionId);
        if (added && added.identifier) noteScriptId(targetId, added.identifier);
        ok++;
      } catch { /* 页面已关闭/会话失效：重连后 handleAttach 会重新注册 */ }
    }
    // 全部成功才推进已注册标记：有失败或中途超预算就保留旧值，下一轮继续重试
    if (done && ok === want) {
      registeredSource = source;
      refreshPending = false;
      lastRefreshError = '';
      refreshSkip = 0;
      if (ok) console.log(`[zcodepro] 注入包已更新，${ok} 个页面下次“调试-重新加载”时生效`);
    } else {
      refreshPending = true;
      refreshSkip = 2; // 约 9 秒后再试；期间构建了新包会立即重试
      // 错误按内容去重：单页永久失败时别每 3 秒刷一行
      const msg = `注入包重注册部分失败（成功 ${ok}/${want}），下轮重试`;
      if (msg !== lastRefreshError) { lastRefreshError = msg; console.error('[zcodepro] ' + msg); winLog(msg); }
    }
  }

  // helper.mjs 变更时热替换辅助服务：先导入新模块（语法错在这里抛出、旧服务
  // 不动），再关旧起新。每次热替换都是全新模块实例，helper 模块级状态
  //（rollout 解析缓存等）从零开始。shortcut: 只覆盖 helper.mjs
  // 自身，它的依赖（settings.mjs、taskIndex.mjs 等）与 main.mjs 的改动仍需重启启动器
  const helperStamp = () => {
    try { const st = statSync(join(here, 'helper.mjs')); return st.mtimeMs + ':' + st.size; } catch { return ''; }
  };
  let helperTriedSig = helperStamp(); // 上次尝试过的文件签名（mtime+size 双键）：
  // 同一份代码只试一次，失败等保存出新签名再试——别每 3 秒掐一次服务重试同一份坏代码
  const swapRetry = { sig: '', n: 0 }; // 服务起不来时同一份代码的重试次数（上限 3）
  let swapLastError = '';
  async function maybeSwapHelper() {
    const sig = helperStamp();
    if (!sig || sig === helperTriedSig) return;
    // 有后台任务在跑就延后换：新模块实例不继承任务锁，会跟旧实例拉起的
    // 子进程（插件更新/转码等）并发；不记 triedSig，任务完成自动再试
    if (helperMod && typeof helperMod.busyJobs === 'function' && helperMod.busyJobs()) return;
    try {
      const mod = await import('./helper.mjs?mtime=' + sig);
      if (typeof mod.startHelper !== 'function') throw new Error('helper.mjs 没有导出 startHelper');
      // import 让出过事件循环，期间旧服务可能刚接到请求起了后台任务（转码等）：
      // 关旧服务前补查一次。检查与关闭之间没有 await，不会再有新任务挤进来
      if (helperMod && typeof helperMod.busyJobs === 'function' && helperMod.busyJobs()) return;
      try { helperMod.dispose?.(); } catch { /* ignore */ } // 旧实例被 ESM 缓存持有，清大块缓存省内存
      // 不等优雅关闭：渲染进程的 keep-alive/在途请求（每 2 秒轮询）会让 close
      // 回调迟迟不来，直接掐掉存量连接。热替换是开发场景，容忍个别请求中断
      //（前端轮询失败会保旧值，下个周期自动恢复）
      server.close();
      server.closeAllConnections();
      // listenTries 传小值：端口被占别把主循环卡在 startHelper 的重试里
      server = await mod.startHelper({ ...helperArgs, listenTries: 6 });
      helperMod = mod;
      helperTriedSig = sig;
      swapLastError = '';
      console.log('[zcodepro] helper.mjs 有改动，辅助服务已热替换（无需重启启动器）');
    } catch (err) {
      helperTriedSig = sig; // 失败也记签名
      // 同一错误只报一次：连续多次保存出同一个错时别刷屏
      if (err.message !== swapLastError) {
        swapLastError = err.message;
        const stateText = server.listening ? '保持旧服务，改好保存后自动重试' : '服务已中断，尝试拉回旧版';
        console.error(`[zcodepro] helper 热替换失败（${stateText}）: ` + err.message);
        winLog('helper 热替换失败: ' + err.message);
      }
      if (!server.listening) {
        // 新服务没起来（端口被占、启动抛错）：用上一个在服的模块实例把服务拉回来
        let recovered = false;
        try { server = await helperMod.startHelper({ ...helperArgs, listenTries: 6 }); recovered = true; } catch { /* 旧的也起不来 */ }
        // 没服务或端口瞬时占用才清签名下轮重试；代码本身的错等文件再变
        if (!recovered || /EADDRINUSE/.test(String(err.message))) {
          // 服务不在或端口瞬时占用才重试，同一份代码最多 3 次：每次重试都占
          // 一段 listen 重试窗口，无限重试会把主循环拖慢
          if (swapRetry.sig !== sig) { swapRetry.sig = sig; swapRetry.n = 0; }
          if (swapRetry.n < 3) { swapRetry.n += 1; helperTriedSig = ''; }
        }
      }
    }
  }

  while (!stopping) {
    await sleep(3000);
    if (stopping) break;
    await refreshInjectScripts();
    await maybeSwapHelper();
    if (!conn.closed) continue;
    // 连接断开：ZCode 退出则一并退出，否则重连
    if (!(await cdpAlive(args.cdpPort))) {
      console.log('[zcodepro] ZCode 已退出，zcodepro 一并退出。');
      winLog('ZCode 已退出，zcodepro 一并退出');
      try { helperMod.dispose?.(); } catch { /* ignore */ } // 收掉残留 ffmpeg 子进程
      server.close();
      process.exit(0);
    }
    try {
      conn = await attachConnection();
      log('CDP 已重连');
    } catch (err) {
      log('CDP 重连失败: ' + err.message);
    }
  }
}
