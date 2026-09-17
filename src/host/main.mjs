// ZCode Pro 主流程：
// 1. 定位 ZCode 可执行文件
// 2. 若 CDP 端口不可达且 ZCode 未在运行 → 以 --remote-debugging-port 启动 ZCode
//    （若 ZCode 已在运行但没有调试端口，绝不主动杀进程，只提示用户手动重启）
// 3. 连接 CDP，向所有页面注入增强脚本（新文档自动注入 + 已加载页面立即注入）
// 4. 启动本地辅助 HTTP 服务并常驻，CDP 断开时自动重连
import { spawn, execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { resolveZcodeExecutable, resolveDataRootDir } from './paths.mjs';
import { CdpConnection, fetchBrowserWsUrl } from './cdp.mjs';
import { startHelper } from './helper.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const INJECT_BUNDLE = resolve(here, '..', '..', 'dist', 'inject.js');

function usage() {
  return `ZCode Pro — ZCode 桌面版界面增强启动器

用法: zcode-pro [选项]

选项:
  --cdp-port <端口>      CDP 调试端口 (默认 9333)
  --helper-port <端口>   本地辅助服务端口 (默认 47889)
  --zcode-path <路径>    ZCode 可执行文件路径
  --inject-only          只注入已运行的实例（要求其带调试端口），不启动新实例
  --verbose              输出详细日志
  -h, --help             显示帮助

环境变量:
  ZCODEPRO_ZCODE_PATH     ZCode 可执行文件路径（同 --zcode-path）
  ZCODEPRO_CDP_PORT       CDP 端口
  ZCODEPRO_HELPER_PORT    辅助服务端口
  ZCODE_DATA_BASE_DIR    ZCode 数据根目录（与 ZCode 自身语义一致）
`;
}

function parseArgs(argv) {
  const out = { cdpPort: 0, helperPort: 0, zcodePath: '', injectOnly: false, verbose: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cdp-port') out.cdpPort = Number(argv[++i]);
    else if (a === '--helper-port') out.helperPort = Number(argv[++i]);
    else if (a === '--zcode-path') out.zcodePath = argv[++i];
    else if (a === '--inject-only' || a === '--no-launch') out.injectOnly = true;
    else if (a === '--verbose' || a === '-v') out.verbose = true;
    else if (a === '-h' || a === '--help') out.help = true;
    else { console.error('未知参数: ' + a); out.help = true; }
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

async function cdpAlive(port) {
  try { await fetchBrowserWsUrl(port, 1200); return true; } catch { return false; }
}

// 只检测 ZCode 应用进程是否存在，绝不干预。
// 注意：zcodepro 自身可能以 ELECTRON_RUN_AS_NODE 方式复用 zcode 二进制运行，
// 进程名同为 zcode，因此要排除自己的 pid。
function zcodeAppProcessExists() {
  try {
    if (process.platform === 'win32') {
      execSync('tasklist /FI "IMAGENAME eq ZCode.exe" /NH | find /I "ZCode.exe"', { stdio: 'ignore' });
      return true;
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

async function buildInjectSource(token, helperPort, features) {
  if (!existsSync(INJECT_BUNDLE)) {
    throw new Error('缺少注入脚本 dist/inject.js，请先运行 npm run build');
  }
  const bundle = readFileSync(INJECT_BUNDLE, 'utf8');
  const bootstrap = `window.__ZCODEPRO__={helperUrl:'http://127.0.0.1:${helperPort}',token:${JSON.stringify(token)},features:${JSON.stringify(features)}};`;
  return bootstrap + '\n' + bundle;
}

export async function run(argv) {
  const args = parseArgs(argv);
  if (args.help) { console.log(usage()); return; }
  const log = (...a) => { if (args.verbose) console.log('[zcodepro]', ...a); };

  let exe;
  try {
    exe = resolveZcodeExecutable(args.zcodePath);
  } catch (err) {
    if (err.code === 'ZCODE_NOT_FOUND') guiNotify('ZCode Pro 启动失败', '未找到 ZCode 可执行文件，详见终端输出。');
    throw err;
  }
  const dataRoot = resolveDataRootDir();
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
        console.error('[zcodepro] 检测到 ZCode 已在运行，但未开启调试端口，无法注入。');
        console.error('[zcodepro] 请手动退出当前 ZCode（zcodepro 不会替你关闭正在运行的实例），然后重新运行 zcodepro。');
        guiNotify('ZCode Pro 暂无法注入', 'ZCode 已在运行但未开启调试端口，请退出 ZCode 后重新打开 ZCode Pro。');
      } else {
        guiNotify('ZCode Pro 启动失败', `等待 ZCode 调试端口 ${args.cdpPort} 超时。`);
      }
      process.exit(1);
    }
  } else {
    log(`复用已在监听的 CDP 端口 ${args.cdpPort}`);
  }

  // 2. 启动辅助服务
  const server = await startHelper({ port: args.helperPort, token, dataRoot, state });
  console.log(`[zcodepro] 辅助服务已就绪: http://127.0.0.1:${args.helperPort} (数据目录 ${dataRoot})`);

  // 3. 连接 CDP 并注入（断线自动重连）
  const injectedTargets = new Map(); // targetId -> sessionId
  let stopping = false;

  let healthRes;
  try {
    healthRes = await fetch(`http://127.0.0.1:${args.helperPort}/health`, { headers: { 'X-ZCodePro-Token': token } }).then((r) => r.json());
  } catch (err) {
    console.error(`[zcodepro] 辅助服务健康检查失败: ${err.message}`);
    server.close();
    process.exit(1);
  }
  const source = await buildInjectSource(token, args.helperPort, healthRes.features || {});

  async function attachConnection() {
    const conn = new CdpConnection(await fetchBrowserWsUrl(args.cdpPort));
    await conn.connect();
    injectedTargets.clear();

    const handleAttach = async (sessionId, targetInfo) => {
      const targetId = targetInfo?.targetId;
      if (!targetId || targetInfo?.type !== 'page') return;
      // 安全护栏：引导脚本内含 helper 鉴权 token，只能注入 ZCode 应用自身的页面。
      // 外部网站若以内嵌浏览器/网页形式成为 page target，拿到 token 即可调用本地
      // helper（改写增强配置/别名表等）。规则：放行非 http(s)（file://、应用自有协议）与
      // 本机回环地址，拦截其余外部网页。代价是 http(s) 非 localhost 的自有页面不注入。
      const pageUrl = String(targetInfo?.url || '');
      const isExternalWeb = /^https?:\/\//i.test(pageUrl) && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(pageUrl);
      if (isExternalWeb) {
        log('跳过外部页面注入（防止 token 泄露）: ' + pageUrl.slice(0, 120));
        return;
      }
      try {
        await conn.send('Page.enable', {}, sessionId);
        await conn.send('Page.addScriptToEvaluateOnNewDocument', { source, runImmediately: true }, sessionId);
        const res = await conn.send('Runtime.evaluate', { expression: source, silent: true }, sessionId);
        if (res?.exceptionDetails) log('注入执行异常: ' + String(res.exceptionDetails.exception?.description || '').slice(0, 200));
        injectedTargets.set(targetId, sessionId);
        state.injectedPages = injectedTargets.size;
        conn.onSession(sessionId, (m) => {
          if (m.type === 'detached') {
            injectedTargets.delete(targetId);
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
    server.close();
    process.exit(1);
  }
  console.log('[zcodepro] 已连接 CDP 并开始注入。保持本进程运行以维持增强；Ctrl+C 退出（不影响 ZCode）。');

  process.on('SIGINT', () => { stopping = true; try { conn.close(); } catch {} server.close(); process.exit(0); });
  process.on('SIGTERM', () => { stopping = true; try { conn.close(); } catch {} server.close(); process.exit(0); });

  while (!stopping) {
    await sleep(3000);
    if (stopping) break;
    if (!conn.closed) continue;
    // 连接断开：ZCode 退出则一并退出，否则重连
    if (!(await cdpAlive(args.cdpPort))) {
      console.log('[zcodepro] ZCode 已退出，zcodepro 一并退出。');
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
