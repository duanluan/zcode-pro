// 本地辅助服务：注入到页面里的增强脚本通过 http://127.0.0.1:<port> 调用这里，
// 完成文件系统操作（页面沙箱内做不了的事）与配置持久化。
// 仅绑定 127.0.0.1，并通过每次启动随机生成的 token 鉴权。

import { createServer } from 'node:http';
import { execFile, spawn, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises'; // 注意：fs 的 mkdtemp 是回调版，await 它会把 undefined 当回调
import { basename, delimiter, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readSettings, writeSettingsAtomic, remapSettingsPaths, isProjectOpenInTabs } from './settings.mjs';
import { taskIndexPath, probeTaskIndexWritable, remapTaskIndexPaths, taskIndexDriverAvailable, listOverriddenTitles, listTaskWorkspaceMap } from './taskIndex.mjs';
import { pickFolderSystem } from './pickFolder.mjs';
import { reorderWorkspaceTasks, reorderGroupMembers } from './taskOrder.mjs';
import { webdavRequest, webdavPutWithMkcol, webdavHttpText, parseWebdavListing, findCurl } from './webdav.mjs';
import { resolveZcodeExecutable } from './paths.mjs';

const VERSION = '0.17.2';

// 全局提示词固定在用户主目录：官方加载器按 HOME/USERPROFILE 拼 .zcode/AGENTS.md，
// 不读 ZCODE_DATA_BASE_DIR（数据根迁走时全局指令仍在原位）。
function defaultAgentsFile() {
  return join(homedir(), '.zcode', 'AGENTS.md');
}

// zcode-vision 插件的配置（与 /vision-* 命令共用同一文件）
function defaultVisionFile() {
  return join(homedir(), '.zcode', 'zcode-vision.json');
}

// rtk 插件的状态目录（钩子按 ${RTK_DIR:-~/.zcode-rtk} 解析，这里保持一致）
function defaultRtkDir() {
  return process.env.RTK_DIR || join(homedir(), '.zcode-rtk');
}

// headroom 插件的配置文件（与 /hr-* 命令、钩子共用，headroom-lib.sh 按 HOME 定位）
function defaultHeadroomFile() {
  return join(homedir(), '.zcode', 'headroom.json');
}

// 本插件市场（zcode-plugins 仓库）在 ZCode CLI 数据目录里的落点。
// 市场未添加时（新机器）从这里自动补装，免得“安装”按钮因市场缺失永远失败。
const ZCODE_PLUGINS_MARKETPLACE = 'duanluan-zcode-plugins';
const ZCODE_PLUGINS_MARKETPLACE_SOURCE = 'duanluan/zcode-plugins';

function cliPluginsDir() {
  return join(homedir(), '.zcode', 'cli', 'plugins');
}

export function defaultConfig() {
  return {
    version: VERSION,
    features: {
      projectMenu: true,        // 项目菜单增强：自定义别名 + 切换文件夹 + 打开文件夹 + 复制路径（含侧栏别名渲染）
      taskOrder: true,          // 侧边栏会话拖动排序持久化
      fileActions: true,        // 文件菜单：默认应用打开 / 打开所在目录
      pinnedKeepCollapsed: false, // 点击置顶会话保持项目折叠（实验性：会先展开再缩起，有闪烁）
      autoUpdatePlugins: false,  // 启动时自动更新已装的 zcode-plugins 插件（含安装市场里新增的）
      sessionSwitch: true,     // 会话快捷切换（alt+z 上次会话；按住 alt x/c 弹窗导航，类 alt+tab）
      titleLock: true,        // 会话名锁定：手动重命名过的会话不被运行时推送的自动标题覆盖（侧栏钉回索引库中的名字）
      wsRunningSpin: true,     // 折叠项目运行提示：折叠后其中仍有会话运行时项目图标旋转
      idleReclaim: true,       // 空闲项目内存回收：长时间无活动的项目释放其会话进程（时长 idleReclaimMinutes）
      toolbarIcons: true,      // 侧栏菜单并入顶栏：新建任务/搜索/自动化/插件市场收成顶栏图标按钮（原菜单隐藏，点击转发）
      pinnedCollapse: true,    // 已置顶分区可折叠：标题可点折叠/展开任务列表（状态记 localStorage）
    },
    // 空闲项目内存回收的判定时长（分钟，1–1440）：项目无运行中会话、无后台命令
    // 且非当前选中，持续满该时长后释放其会话进程
    idleReclaimMinutes: 30,
    // 启动一次性回收的延后分钟（0–1440）：应用启动会为每个恢复的项目预热进程，
    // 到点把当时符合条件的项目一次收掉；0 = 启动后尽快回收一次
    idleReclaimStartupMinutes: 5,
    // 样式调整（设置弹窗“样式调整”标签页）。null = 不覆盖，跟随应用默认。
    styles: {
      rowGap: null,           // 段落间距：会话内各块之间的垂直间距（应用默认 20px）
      listSpacing: null,      // 列表上下留白（应用默认 12px）
      listItemSpacing: null,  // 列表项之间的间距（应用默认 6px）
      quoteCodeSpacing: null, // 引用/代码块上下留白（应用默认 16px，my-4）
      lineHeight: null,       // 回答行高，倍数（应用默认 1.75）
      thinkingLineHeight: null, // 思考行高，倍数（应用默认 1.5）
      codeLineHeight: null,    // 代码块行高，倍数（应用默认 12px 字号 × 20px 行盒，约 1.65）
      tableSpacing: null,      // 表格上下边距（未设置时跟随段落间距）
      tableCellPaddingV: null, // 单元格上下边距（应用默认 3px）
      tableCellPaddingH: null, // 单元格左右边距（应用默认 3px）
      userLineHeight: null,   // 提问行高，倍数（应用默认 1.5）
      contentWidth: null,     // 内容宽度：{ value, unit }，unit 为 'px'（320–3840）或 '%'（20–100）
      sidebarProjectSpacing: null, // 侧栏项目间距：视觉总量（行内留白+边距，应用默认 20px）
      sidebarTaskSpacing: null,    // 侧栏任务间距：行内留白+行间边距的视觉总量（应用默认 10px）
      uiFont: null,           // 界面字体：除终端外所有界面文字的字体栈（终端字体走官方设置）
      userFont: null,         // 提问字体：会话中提问内容的字体栈
      assistantFont: null,    // 回答字体：会话中回答正文的字体栈（代码块仍用等宽字体）
    },
    // 项目路径（规范化，无尾分隔符）→ 自定义别名。只影响界面渲染，不改动任何真实数据。
    aliases: {},
    // headroom 启用开关的记忆（供应商 id → { proxy, direct }）：关闭时把走 headroom 的
    // 供应商地址切回直连并记录下来，再次开启时按记录把地址切回代理
    headroomRoutes: {},
    // HTTP 代理（http(s)://host:port）：helper 发起的网络访问走它——插件市场更新/安装
    // （zcode CLI → git）、headroom/rtk 的安装与升级（pip/GitHub）。空 = 不用代理。
    proxy: '',
    // 代理生效范围（按用途开关）：plugins = 插件市场更新/安装/卸载；deps = 插件依赖
    // 软件（headroom 与 rtk）的安装、检查更新与升级；sync = WebDAV 同步。同步默认
    // 关闭——坚果云等国内网盘通常直连即可，代理停了同步会跟着失败
    proxyScopes: { plugins: true, deps: true, sync: false },
    // 开发模式（设置弹窗“调试”标签页）：开启后出现「重载」按钮，可在不重启
    // ZCode 的情况下加载新代码（构建 → 换新启动器进程 → 各窗口自动刷新重注入）
    devMode: false,
    // 设置同步（设置弹窗“同步”标签页，交互参考 Tampermonkey 的手动同步）：
    // 仅 WebDAV、仅在点击按钮时传输（type 字段预留多后端扩展，当前恒为 webdav）。
    // url 为 WebDAV 服务器地址；dir 为其下的上传目录（默认 zcode-pro，避免直接
    // 写进网盘根目录）；include 选择同步内容；凭据只存本机、不同步出去；
    // lastPushAt/lastPullAt 只记录本机操作时间。
    sync: {
      type: 'webdav',
      url: '',
      dir: 'zcode-pro',
      login: '',
      password: '',
      include: { zcodepro: true, model: true },
      lastPushAt: null,
      lastPullAt: null,
    },
    // 一次性迁移标记：migrateConfigOnce 执行过哪些纠偏（见 startHelper），
    // 有标记的迁移不再重复，用户此后手动改回的设置不再被覆盖
    migrations: {},
  };
}

export function loadConfig(configFile) {
  try {
    if (!existsSync(configFile)) return defaultConfig();
    const saved = JSON.parse(readFileSyncText(configFile));
    const minutes = Number(saved.idleReclaimMinutes);
    const startupMinutes = Number(saved.idleReclaimStartupMinutes);
    return {
      ...defaultConfig(),
      ...saved,
      idleReclaimMinutes: Number.isFinite(minutes) && minutes >= 1 ? Math.min(1440, Math.round(minutes)) : 30,
      idleReclaimStartupMinutes: Number.isFinite(startupMinutes) && startupMinutes >= 0 ? Math.min(1440, Math.round(startupMinutes)) : 5,
      features: { ...defaultConfig().features, ...(saved.features || {}) },
      styles: { ...defaultConfig().styles, ...(saved.styles && typeof saved.styles === 'object' ? saved.styles : {}) },
      aliases: { ...((saved.aliases && typeof saved.aliases === 'object') ? saved.aliases : {}) },
      headroomRoutes: { ...((saved.headroomRoutes && typeof saved.headroomRoutes === 'object' && !Array.isArray(saved.headroomRoutes)) ? saved.headroomRoutes : {}) },
      proxyScopes: mergeProxyScopes(saved.proxyScopes),
      devMode: saved.devMode === true,
      // devActive 每次读取时重算（保存时会随配置一起写入文件，但读取方不用保存的值）：
      // 开发模式生效 = 配置开关或启动器带 ZCODEPRO_DEV=1，设置弹窗据此决定是否显示“调试”标签页（普通用户不可见）
      devActive: saved.devMode === true || process.env.ZCODEPRO_DEV === '1',
      sync: mergeSyncConfig(saved.sync),
    };
  } catch {
    return defaultConfig();
  }
}

function readFileSyncText(p) {
  return readFileSync(p, 'utf8');
}

export function saveConfig(configFile, config) {
  // 原子写：先写临时文件再改名，避免崩溃留下半截 JSON
  const tmp = configFile + '.tmp';
  writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf8');
  renameSync(tmp, configFile);
}

// 一次性配置迁移：升级后对历史设置做纠偏，执行过的迁移记入 migrations 标记，
// 之后不再重复（用户手动改回的设置不会被再次覆盖）。失败静默、下次启动再试。
// - wsRunningSpinOff：“折叠项目运行提示”实验性功能会在后台周期性短暂展开
//   项目复核运行状态，新版本不再默认开启，历史开启过的用户升级后强制关闭一次
function migrateConfigOnce(configFile) {
  try {
    const config = loadConfig(configFile);
    if (config.migrations && config.migrations.wsRunningSpinOff) return;
    config.features = { ...config.features, wsRunningSpin: false };
    config.migrations = { ...(config.migrations || {}), wsRunningSpinOff: true };
    saveConfig(configFile, config);
  } catch { /* 配置不可读/不可写时跳过，下次启动再试 */ }
}

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-ZCodePro-Token',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 1 << 20) { rejectBody(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolveBody(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (e) { rejectBody(new Error('无效的 JSON 请求体')); }
    });
    req.on('error', rejectBody);
  });
}

// 软件代理（设置弹窗“代理”标签页）：helper 发起的网络访问（zcode CLI→git、pip、
// WebDAV 同步）按用途（proxyScopes）走这里；startHelper 启动时读配置，
// 保存代理地址或范围开关时即时更新
let activeProxyUrl = '';
let activeProxyScopes = { plugins: true, deps: true, sync: false };

// scope：'plugins'（插件市场）/ 'deps'（headroom、rtk）/ 'sync'（WebDAV 同步）；
// 'none' 表示这次调用与下载无关（headroom 生命周期钩子等），永不注入下载代理
function proxyEnv(extra = {}, scope = 'deps') {
  if (scope === 'none' || !activeProxyUrl || !activeProxyScopes[scope]) return extra;
  return {
    HTTP_PROXY: activeProxyUrl, HTTPS_PROXY: activeProxyUrl,
    http_proxy: activeProxyUrl, https_proxy: activeProxyUrl,
    ...extra,
  };
}

// 该用途当前是否走代理：同步按 proxyUrl 参数传给 webdav（curl 路径用，
// fetch 兜底路径不认代理环境变量）
function proxyUrlFor(scope) {
  return activeProxyScopes[scope] ? activeProxyUrl : '';
}

export function startHelper({ port, token, dataRoot, state, agentsFile = defaultAgentsFile() }) {
  const configFile = join(dataRoot, 'zcodepro.json');
  const settingsFile = join(dataRoot, 'v2', 'setting.json');
  migrateConfigOnce(configFile);
  const bootConfig = loadConfig(configFile);
  activeProxyUrl = String(bootConfig.proxy || '').trim();
  activeProxyScopes = { ...bootConfig.proxyScopes };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    try {
      // 防 DNS rebinding：只接受回环 Host。恶意页面把域名解析到 127.0.0.1 时，
      // 浏览器发出的 Host 是攻击者域名，在此拒绝。
      const host = String(req.headers.host || '');
      if (!/^127\.0\.0\.1(:|$)/.test(host) && !/^localhost(:|$)/i.test(host)) {
        json(res, 403, { ok: false, error: 'forbidden host' });
        return;
      }
      if (req.method === 'OPTIONS') {
        json(res, 204, {});
        return;
      }
      if (token && req.headers['x-zcodepro-token'] !== token) {
        json(res, 401, { ok: false, error: 'unauthorized' });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/health') {
        const config = loadConfig(configFile);
        json(res, 200, { ok: true, app: 'zcodepro-helper', version: VERSION, features: config.features, injectedPages: state.injectedPages });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/config') {
        json(res, 200, { ok: true, config: loadConfig(configFile) });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/config') {
        const body = await readBody(req);
        const current = loadConfig(configFile);
        if (body && typeof body === 'object' && typeof body.proxy === 'string') {
          const v = body.proxy.trim();
          if (v === '') current.proxy = '';
          else if (/^https?:\/\/\S+:\d+$/.test(v) && v.length <= 300) current.proxy = v;
          else {
            json(res, 400, { ok: false, code: 'proxy-invalid', error: '代理地址需形如 http://127.0.0.1:7890，或留空清除' });
            return;
          }
          activeProxyUrl = current.proxy;
        }
        if (body && typeof body === 'object' && body.proxyScopes && typeof body.proxyScopes === 'object') {
          // 代理生效范围按单项提交（每个开关只改自己那项），即时生效
          for (const k of ['plugins', 'deps', 'sync']) {
            if (typeof body.proxyScopes[k] === 'boolean') current.proxyScopes[k] = body.proxyScopes[k];
          }
          activeProxyScopes = { ...current.proxyScopes };
        }
        if (body && typeof body === 'object' && typeof body.devMode === 'boolean') {
          current.devMode = body.devMode;
        }
        if (body && typeof body === 'object' && body.features && typeof body.features === 'object') {
          applyFeaturesPartial(current.features, body.features);
        }
        if (body && typeof body === 'object' && typeof body.idleReclaimMinutes === 'number' && Number.isFinite(body.idleReclaimMinutes)) {
          current.idleReclaimMinutes = Math.min(1440, Math.max(1, Math.round(body.idleReclaimMinutes)));
        }
        if (body && typeof body === 'object' && typeof body.idleReclaimStartupMinutes === 'number' && Number.isFinite(body.idleReclaimStartupMinutes)) {
          current.idleReclaimStartupMinutes = Math.min(1440, Math.max(0, Math.round(body.idleReclaimStartupMinutes)));
        }
        if (body && typeof body === 'object' && body.styles && typeof body.styles === 'object') {
          current.styles = applyStylesPartial(current.styles, body.styles);
        }
        saveConfig(configFile, current);
        json(res, 200, { ok: true, config: current });
        return;
      }
      // 空闲项目内存回收（idle-reclaim.js）：判断各项目的会话进程（zcode-cli）是否
      // 仍挂着“运行中的用户命令”。按平台走不同适配器（Linux /proc、macOS ps+lsof、
      // Windows PowerShell）；scan=false 表示当前环境不可用，注入层据此停用整个
      // 回收功能，不做盲回收
      if (req.method === 'POST' && url.pathname === '/idle-busy') {
        const body = await readBody(req);
        const paths = Array.isArray(body?.paths)
          ? body.paths.filter((p) => typeof p === 'string' && p.length > 0 && p.length < 4096).slice(0, 500)
          : [];
        json(res, 200, await scanIdleBusy(paths, dataRoot));
        return;
      }
      // 全局提示词（~/.zcode/AGENTS.md）：设置弹窗“全局提示词”标签页读写
      if (req.method === 'GET' && url.pathname === '/agents') {
        json(res, ...readAgents(agentsFile));
        return;
      }
      // 在文件管理器中定位文件（宿主 openInFileManager 在 Linux/Windows 只是打开路径，不是定位）
      if (req.method === 'POST' && url.pathname === '/reveal-path') {
        const body = await readBody(req);
        json(res, ...await revealInFileManager(body?.path));
        return;
      }
      // 用系统默认应用打开文件（会话文件菜单的“默认应用打开”；
      // 新版 ZCode 桥已不再暴露 openExternalFile，改由 helper 代开）
      if (req.method === 'POST' && url.pathname === '/open-path') {
        const body = await readBody(req);
        json(res, ...await openWithDefaultApp(body?.path));
        return;
      }
      // 在系统文件管理器中打开文件夹（项目“更多”菜单的“打开文件夹”）
      if (req.method === 'POST' && url.pathname === '/open-folder') {
        const body = await readBody(req);
        json(res, ...await openFolder(body?.path));
        return;
      }
      if (req.method === 'POST' && url.pathname === '/agents') {
        const body = await readBody(req);
        json(res, ...writeAgents(body, agentsFile));
        return;
      }
      if (req.method === 'GET' && url.pathname === '/projects') {
        const settings = readSettings(settingsFile);
        const projects = (settings.recentProjects || []).map((p) => {
          let exists = false;
          try { exists = existsSync(p) && statSync(p).isDirectory(); } catch { /* ignore */ }
          return { path: p, name: basename(p.replace(/[\\/]+$/, '')), exists, openInTabs: isProjectOpenInTabs(settings, p) };
        });
        json(res, 200, { ok: true, projects });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/project/alias') {
        const body = await readBody(req);
        json(res, ...setAlias(body, configFile));
        return;
      }
      if (req.method === 'POST' && url.pathname === '/project/relocate') {
        const body = await readBody(req);
        json(res, ...(await relocateProject(body, dataRoot)));
        return;
      }
      // 系统原生目录选择器（弹窗式，请求保持至用户选择/取消）；start 仅作为起始目录
      if (req.method === 'GET' && url.pathname === '/pick-folder') {
        const start = url.searchParams.get('start') || '/';
        const title = (url.searchParams.get('title') || '选择文件夹').slice(0, 80);
        json(res, 200, { ok: true, ...(await pickFolderSystem(start, title)) });
        return;
      }
      // 会话拖动排序持久化：scope = workspace（置顶/项目列表，重盖 updated_at）
      // 或 group-members（分组会话，重写 members.sort_order）
      if (req.method === 'POST' && url.pathname === '/task-order') {
        const body = await readBody(req);
        const ordered = Array.isArray(body?.ordered) ? body.ordered.filter((k) => typeof k === 'string') : [];
        if (ordered.length === 0) {
          json(res, 400, { ok: false, code: 'invalid-request', error: 'ordered 不能为空' });
          return;
        }
        let result;
        if (body.scope === 'workspace') result = await reorderWorkspaceTasks(dataRoot, ordered);
        else if (body.scope === 'group-members') result = await reorderGroupMembers(dataRoot, ordered);
        else {
          json(res, 400, { ok: false, code: 'invalid-request', error: '无效的 scope' });
          return;
        }
        if (result.error) {
          json(res, 400, { ok: false, code: result.code, error: result.error });
          return;
        }
        json(res, 200, { ok: true, reload: true, ...result });
        return;
      }
      // 会话名锁定：读任务索引里重命名过的会话（title_overridden=1）标题表，
      // 注入侧据此把被自动标题覆盖的侧栏行钉回重命名值；响应带开关，
      // 注入侧按需拉取这一个端点即可（无轮询）
      if (req.method === 'GET' && url.pathname === '/pinned-titles') {
        const r = await listOverriddenTitles(dataRoot);
        if (r.error) {
          json(res, 500, { ok: false, code: r.code, error: r.error });
          return;
        }
        const config = loadConfig(configFile);
        json(res, 200, { ok: true, enabled: config.features.titleLock !== false, titles: r.titles });
        return;
      }
      // —— zcode-vision 插件（图片视觉代理）：设置弹窗“视觉代理”标签页读写 ————
      if (req.method === 'GET' && url.pathname === '/vision') {
        const file = defaultVisionFile();
        const parsed = readJsonFile(file);
        if (parsed === null && existsSync(file)) {
          json(res, 500, { ok: false, code: 'vision-read', error: 'zcode-vision.json 不是合法 JSON' });
          return;
        }
        json(res, 200, { ok: true, config: parsed, file, hook: findVisionHook(), pluginVersion: installedPluginVersion('zcode-vision') });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/vision') {
        const body = await readBody(req);
        const [cfg, err] = validateVisionConfig(body?.config);
        if (err) {
          json(res, 400, { ok: false, code: 'vision-invalid', error: err });
          return;
        }
        try {
          const file = defaultVisionFile();
          const tmp = file + '.tmp';
          writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n', 'utf-8');
          renameSync(tmp, file);
        } catch (err2) {
          json(res, 500, { ok: false, code: 'vision-write', error: '写入 zcode-vision.json 失败: ' + (err2?.message || err2) });
          return;
        }
        json(res, 200, { ok: true, config: cfg });
        return;
      }
      // 供应商下拉取数（视觉代理“供应商”组合框用）：合并两张供应商表，只回 id/名称/别名，不含密钥
      if (req.method === 'GET' && url.pathname === '/vision/providers') {
        json(res, 200, { ok: true, providers: listVisionProviders() });
        return;
      }
      // 用最近一张会话图片跑通视觉识别（zcode-vision 钩子的 --test 模式）
      if (req.method === 'POST' && url.pathname === '/vision/test') {
        const hook = findVisionHook();
        if (!hook) {
          json(res, 400, { ok: false, code: 'vision-test', error: '未找到 zcode-vision 插件（先在插件市场安装）' });
          return;
        }
        const r = await runNodeScript([hook, '--test'], 150000);
        if (!r.ok && r.code === 'ENOENT') {
          json(res, 500, { ok: false, code: 'vision-test', error: '未找到可用的 node' });
          return;
        }
        json(res, r.ok ? 200 : 500, { ok: r.ok, output: r.output, error: r.error });
        return;
      }
      // —— zcode-rtk 插件（命令输出压缩）：设置弹窗“rtk 压缩”标签页读写 ——
      // 状态目录与文件格式由 rtk 插件钩子定义：mode（hint|off）、whitelist（每行 name 或 git:name）
      if (req.method === 'GET' && url.pathname === '/rtk') {
        const dir = defaultRtkDir();
        const mode = readRtkMode(join(dir, 'mode'));
        const info = await rtkBinaryInfo();
        // 已装插件探测：新版（≥1.3.0）钩子入口是跨平台 rtk-pretooluse.mjs，旧版是 .sh
        const hook = findMarketplaceHook('rtk', join('hooks', 'rtk-pretooluse.mjs'))
          || findMarketplaceHook('rtk', join('hooks', 'rtk-pretooluse.sh'));
        // rtkBinaryInfo 走 PATH 命中时 binPath 是命令名；换绝对路径用于面板展示
        json(res, 200, {
          ok: true, mode, whitelist: readRtkWhitelist(join(dir, 'whitelist')),
          dir, hook, pluginVersion: installedPluginVersion('rtk'),
          ...readRtkBuiltinWhitelist(), ...info,
          binPath: info.binPath ? (rtkFindBin() || info.binPath) : null,
        });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/rtk/upgrade') {
        json(res, 200, { ok: true, upgrade: rtkUpgradeSnapshot() });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/rtk') {
        const body = await readBody(req);
        // —— rtk 本体（独立二进制）：检查更新 / 升级（后台任务）/ 停止 ——
        if (body && body.checkUpdate === true) {
          const bin = rtkFindBin();
          if (!bin) {
            json(res, 400, { ok: false, code: 'rtk-update', error: '未找到 rtk 程序' });
            return;
          }
          const current = await binVersionOf(bin);
          const info = await rtkLatestInfo();
          if (info.code) {
            json(res, 500, { ok: false, code: info.code, error: info.error });
            return;
          }
          json(res, 200, { ok: true, current, latest: info.tag, upToDate: current === info.tag });
          return;
        }
        if (body && body.upgrade === true) {
          json(res, 200, { ok: true, upgrade: startRtkUpgrade() });
          return;
        }
        if (body && body.cancelUpgrade === true) {
          json(res, 200, { ok: true, upgrade: cancelRtkUpgrade() });
          return;
        }
        const dir = defaultRtkDir();
        const next = { mode: readRtkMode(join(dir, 'mode')), whitelist: readRtkWhitelist(join(dir, 'whitelist')) };
        if ('mode' in body) {
          if (body.mode !== 'hint' && body.mode !== 'off') {
            json(res, 400, { ok: false, code: 'rtk-invalid', error: 'mode 只能是 hint 或 off' });
            return;
          }
          next.mode = body.mode;
        }
        if ('whitelist' in body) {
          const wl = validateRtkWhitelist(body.whitelist);
          if (wl.error) {
            json(res, 400, { ok: false, code: 'rtk-invalid', error: wl.error });
            return;
          }
          next.whitelist = wl.entries;
        }
        try {
          writeRtkState(dir, next);
        } catch (err2) {
          json(res, 500, { ok: false, code: 'rtk-write', error: '写入 rtk 配置失败: ' + (err2?.message || err2) });
          return;
        }
        json(res, 200, { ok: true, ...next });
        return;
      }
      // —— headroom 插件（本地压缩代理）：设置弹窗“Headroom 省流”标签页读写 ——
      // 配置 ~/.zcode/headroom.json 三个键（kompressBackend/powerSaveCpu/powerWatchInterval）。
      // 后端/省电切换/生命周期动作经钩子 ensure-proxy.sh 执行（写配置并立即生效，
      // 兼容 systemd 托管）；间隔直写配置即可——监视器每轮巡检重读配置。
      if (req.method === 'GET' && url.pathname === '/headroom') {
        const file = defaultHeadroomFile();
        let config = null;
        try {
          config = readHeadroomConfig(file);
        } catch (err) {
          json(res, 500, { ok: false, code: 'headroom-read', error: '读取 headroom.json 失败: ' + (err?.message || err) });
          return;
        }
        // 已安装探测：新版（≥1.2.0）钩子入口是跨平台 ensure-proxy.mjs，旧版是 ensure-proxy.sh
        const hook = findMarketplaceHook('headroom', join('hooks', 'ensure-proxy.mjs'))
          || findMarketplaceHook('headroom', join('hooks', 'ensure-proxy.sh'));
        // 插件版本取自缓存目录名（…/headroom/1.0.2/hooks/…）
        const vm = hook ? /[/\\]headroom[/\\](\d+(?:\.\d+){0,3})[/\\]/.exec(hook) : null;
        json(res, 200, {
          ok: true, config, file, hook,
          pluginVersion: vm ? vm[1] : null,
          usage: headroomUsageScan(dataRoot),
          ...(await headroomBinaryInfo()),
        });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/headroom/upgrade') {
        json(res, 200, { ok: true, upgrade: headroomUpgradeSnapshot() });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/headroom/status') {
        const r = await runHeadroomHook(['status']);
        if (r.code === 'headroom-plugin' || r.code === 'headroom-sh') {
          json(res, 400, { ok: false, code: r.code, error: r.error });
          return;
        }
        json(res, r.ok ? 200 : 500, {
          ok: r.ok, code: r.ok ? undefined : 'headroom-status',
          status: parseHeadroomStatus(r.output),
          error: r.error || null, output: r.output,
        });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/headroom') {
        const body = await readBody(req);
        const file = defaultHeadroomFile();
        let output = '';
        if (body && typeof body.action === 'string') {
          if (!['start', 'stop', 'restart', 'ensure'].includes(body.action)) {
            json(res, 400, { ok: false, code: 'headroom-invalid', error: 'action 只能是 start/stop/restart/ensure' });
            return;
          }
          const r = await runHeadroomHook([body.action]);
          if (!r.ok) {
            json(res, 500, { ok: false, code: 'headroom-action', error: r.output || r.error || '代理操作失败' });
            return;
          }
          output = r.output;
        } else if (body && typeof body.backend === 'string') {
          const v = body.backend.trim();
          if (!/^[a-z0-9_]+$/i.test(v)) {
            json(res, 400, { ok: false, code: 'headroom-invalid', error: '无效的 backend 值' });
            return;
          }
          const r = await runHeadroomHook(['backend', v]);
          if (!r.ok) {
            json(res, 500, { ok: false, code: 'headroom-action', error: r.output || r.error || '代理操作失败' });
            return;
          }
          output = r.output;
        } else if (body && typeof body.power === 'string') {
          if (!['battery', 'saver', 'off'].includes(body.power)) {
            json(res, 400, { ok: false, code: 'headroom-invalid', error: 'power 只能是 battery/saver/off' });
            return;
          }
          const r = await runHeadroomHook(['power', body.power]);
          if (!r.ok) {
            json(res, 500, { ok: false, code: 'headroom-action', error: r.output || r.error || '代理操作失败' });
            return;
          }
          output = r.output;
        } else if (body && typeof body.usage === 'boolean') {
          // 启用开关：只改 ZCode 供应商配置里的地址（走/不走本地压缩代理），不动代理进程
          const r = setHeadroomUsage(dataRoot, configFile, body.usage);
          if (!r.ok) {
            json(res, 500, { ok: false, code: r.code, error: r.error });
            return;
          }
          json(res, 200, { ok: true, usage: headroomUsageScan(dataRoot), changed: r.changed });
          return;
        } else if (body && body.cancelUpgrade === true) {
          json(res, 200, { ok: true, upgrade: cancelHeadroomUpgrade() });
          return;
        } else if (body && (body.checkUpdate === true || body.upgrade === true)) {
          // headroom 本体（pip 安装）的检查更新 / 升级，走其安装环境的 pip
          const ch = await headroomPipChannel();
          if (ch.error) {
            json(res, 400, { ok: false, code: ch.code, error: ch.error });
            return;
          }
          if (body.checkUpdate === true) {
            const r = await execCapture(ch.py, ['-m', 'pip', 'index', 'versions', ch.dist], 45000);
            if (!r.ok) {
              json(res, 500, { ok: false, code: 'headroom-update', error: '查询可用版本失败: ' + (r.output || r.error || '').split('\n').slice(-3).join(' ') });
              return;
            }
            // pip index versions 输出 "Available versions: 0.38.0, 0.37.0, …"（新版本在前）
            const m = /Available versions:\s*([^\s,]+)/.exec(r.output);
            const latest = m ? m[1] : ch.current;
            json(res, 200, { ok: true, current: ch.current, latest, upToDate: latest === ch.current, dist: ch.dist });
            return;
          }
          // 升级后台执行，立即返回快照；进度经 GET /headroom/upgrade 轮询
          json(res, 200, { ok: true, upgrade: startHeadroomUpgrade(ch) });
          return;
        } else if (body && 'interval' in body) {
          try {
            const cfg = readHeadroomConfig(file);
            cfg.powerWatchInterval = clampInt(body.interval, 10, 3600, cfg.powerWatchInterval);
            writeHeadroomConfig(file, cfg);
          } catch (err) {
            json(res, 500, { ok: false, code: 'headroom-write', error: '写入 headroom.json 失败: ' + (err?.message || err) });
            return;
          }
        } else {
          json(res, 400, { ok: false, code: 'invalid-request', error: 'body 需包含 action/backend/power/usage/interval 之一' });
          return;
        }
        let config = null;
        try { config = readHeadroomConfig(file); } catch { /* 已应用，读不回仅缺回显 */ }
        json(res, 200, { ok: true, output, config });
        return;
      }
      // —— 软件代理连通性检测：经 curl -x 走代理访问插件市场/本体升级实际要用的站点 ——
      if (req.method === 'POST' && url.pathname === '/proxy/test') {
        const body = await readBody(req);
        const proxy = typeof body?.proxy === 'string' && body.proxy.trim() ? body.proxy.trim() : activeProxyUrl;
        if (!proxy) {
          json(res, 400, { ok: false, code: 'proxy-not-set', error: '请先填写代理地址' });
          return;
        }
        if (!/^https?:\/\/\S+:\d+$/.test(proxy)) {
          json(res, 400, { ok: false, code: 'proxy-invalid', error: '代理地址需形如 http://127.0.0.1:7890' });
          return;
        }
        // PyPI 检测目标用 pip 实际使用的源（环境变量或 pip 配置的国内镜像）：
        // 直测 pypi.org 不能代表 pip 的真实连通性——镜像域名常被代理分流为直连
        // 用单包索引页而非整站 /simple/（后者约 46MB，8 秒必然超时误报）
        let pypiTarget = 'https://pypi.org/simple/pip/';
        const envIdx = String(process.env.PIP_INDEX_URL || '').trim();
        if (/^https?:\/\/\S+$/.test(envIdx)) {
          pypiTarget = envIdx;
        } else {
          try {
            const ch = await headroomPipChannel();
            if (!ch.error) {
              const r = await execCapture(ch.py, ['-m', 'pip', 'config', 'get', 'global.index-url'], 8000);
              const idx = r.output.trim().split('\n')[0] || '';
              if (r.ok && /^https?:\/\/\S+$/.test(idx)) pypiTarget = idx;
            }
          } catch { /* 探测失败保持官方源 */ }
        }
        const targets = [
          ['GitHub', 'https://github.com'],
          ['PyPI', pypiTarget],
        ];
        // Windows 精简环境 PATH 可能不含 curl：与同步功能共用 findCurl（补测 System32）
        const curlBin = findCurl();
        const results = [];
        for (const [name, targetUrl] of targets) {
          results.push(await new Promise((resolveT) => {
            const started = Date.now();
            if (!curlBin) {
              resolveT({ name, httpCode: null, ms: null, ok: false, error: '未找到 curl 命令' });
              return;
            }
            // -I 只取响应头：连通性检测不必下载整页（github 主页数百 KB，
            // 经慢代理节点 8 秒必然超时误报）。-o 丢弃输出用各平台的空设备
            // （Windows 上 /dev/null 是普通路径且目录不存在，必须用 NUL）
            const nullDev = process.platform === 'win32' ? 'NUL' : '/dev/null';
            execFile(curlBin, ['-sI', '-o', nullDev, '-w', '%{http_code}', '--max-time', '8', '-x', proxy, targetUrl],
              { timeout: 10000, windowsHide: true }, (err, stdout) => {
                if (err && err.code === 'ENOENT') {
                  resolveT({ name, httpCode: null, ms: null, ok: false, error: '未找到 curl' });
                  return;
                }
                const code = Number(stdout);
                // curl 退出码 → 人话（err.message 是整条命令行，对用户没有信息量）
                const CURL_FAIL = { 5: '无法解析代理地址', 7: '无法连接代理', 22: 'HTTP 错误', 28: '超时', 35: 'SSL 握手失败', 56: '连接被重置' };
                const fail = err ? (err.signal === 'SIGTERM' ? '超时' : (CURL_FAIL[err.code] || `curl 退出码 ${err.code ?? '?'}`)) : null;
                resolveT({
                  name,
                  httpCode: err || !code ? null : code,
                  ms: err ? null : Date.now() - started,
                  ok: !err && code >= 200 && code < 400,
                  error: fail,
                });
              });
          }));
        }
        json(res, 200, { ok: true, proxy, targets: results });
        return;
      }
      // —— 设置同步（设置弹窗“同步”标签页）：配置读写 + 手动上传/下载 ——
      if (req.method === 'GET' && url.pathname === '/sync') {
        json(res, 200, { ok: true, sync: loadConfig(configFile).sync });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/sync') {
        const body = await readBody(req);
        const current = loadConfig(configFile);
        // 表单（类型/URL/登录/密码）与同步内容开关分开提交：表单全量替换，开关只改单项
        if (body && typeof body === 'object' && body.sync && typeof body.sync === 'object') {
          const v = validateSyncForm(body.sync);
          if (v.error) {
            json(res, 400, { ok: false, code: 'sync-invalid', error: v.error });
            return;
          }
          Object.assign(current.sync, v.sync);
        }
        if (body && typeof body === 'object' && body.include && typeof body.include === 'object') {
          if (typeof body.include.zcodepro === 'boolean') current.sync.include.zcodepro = body.include.zcodepro;
          if (typeof body.include.model === 'boolean') current.sync.include.model = body.include.model;
        }
        saveConfig(configFile, current);
        json(res, 200, { ok: true, sync: current.sync });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/sync/run') {
        const body = await readBody(req);
        const direction = body?.direction === 'pull' ? 'pull' : body?.direction === 'push' ? 'push' : '';
        if (!direction) {
          json(res, 400, { ok: false, code: 'invalid-request', error: 'direction 只能是 push 或 pull' });
          return;
        }
        const config = loadConfig(configFile);
        const r = await runSettingsSync({ direction, dataRoot, configFile, config, proxyUrl: proxyUrlFor('sync') });
        if (r.error) {
          json(res, r.status || 500, { ok: false, code: r.code || 'sync-run', error: r.error });
          return;
        }
        json(res, 200, { ok: true, direction, applied: r.applied, sync: loadConfig(configFile).sync });
        return;
      }
      // —— 同步连通性测试（“测试”按钮）：用表单当前值逐步验证（可先测再存），不写入配置文件 ——
      if (req.method === 'POST' && url.pathname === '/sync/test') {
        const body = await readBody(req);
        const v = validateSyncForm(body?.sync || {});
        if (v.error) {
          json(res, 400, { ok: false, code: 'sync-invalid', error: v.error });
          return;
        }
        // dir 缺省时沿用已保存的值
        const sync = { ...loadConfig(configFile).sync, ...v.sync };
        const r = await runSyncTest({ sync, proxyUrl: proxyUrlFor('sync') });
        if (r.error) {
          json(res, r.status || 500, { ok: false, code: r.code || 'sync-test', error: r.error });
          return;
        }
        json(res, 200, { ok: true, targets: r.targets, fileCount: r.fileCount });
        return;
      }
      // —— 云端版本列表（“从云端下载”先弹文件选择，任选一个版本恢复）——
      if (req.method === 'POST' && url.pathname === '/sync/versions') {
        const config = loadConfig(configFile);
        const sync = config.sync;
        if (!sync.url || !/^https?:\/\/\S+$/.test(sync.url)) {
          json(res, 400, { ok: false, code: 'sync-not-configured', error: '请先填写 WebDAV URL 并保存' });
          return;
        }
        const r = await listSyncVersions(sync, proxyUrlFor('sync'));
        if (r.error) {
          json(res, r.status || 500, { ok: false, code: r.code || 'sync-request', error: r.error });
          return;
        }
        json(res, 200, { ok: true, files: r.files });
        return;
      }
      // —— 按文件操作（文件名必须整串匹配 SYNC_VERSION_RE）：apply 导入 / delete 删除 / export 保存到磁盘 ——
      if (req.method === 'POST' && url.pathname.startsWith('/sync/version/')) {
        const action = url.pathname.slice('/sync/version/'.length);
        if (!['apply', 'delete', 'export'].includes(action)) {
          json(res, 404, { ok: false, error: 'not found' });
          return;
        }
        const body = await readBody(req);
        const file = typeof body?.file === 'string' ? body.file : '';
        if (!SYNC_VERSION_RE.test(file)) {
          json(res, 400, { ok: false, code: 'sync-file-invalid', error: '文件名不合法（只能是同步目录里的 zcode-pro 备份文件）' });
          return;
        }
        const config = loadConfig(configFile);
        const sync = config.sync;
        if (!sync.url || !/^https?:\/\/\S+$/.test(sync.url)) {
          json(res, 400, { ok: false, code: 'sync-not-configured', error: '请先填写 WebDAV URL 并保存' });
          return;
        }
        const remoteMissing = () => json(res, 404, { ok: false, code: 'sync-remote-missing', error: `云端文件 ${file} 不存在（可能已被删除）` });
        if (action === 'apply') {
          const remote = await fetchSyncNamedDoc(sync, proxyUrlFor('sync'), file);
          if (remote.error) {
            json(res, remote.status || 500, { ok: false, code: remote.code, error: remote.error });
            return;
          }
          if (remote.missing) {
            remoteMissing();
            return;
          }
          const kind = file.startsWith('model') ? 'model' : 'zcodepro';
          sync.lastPullAt = Date.now();
          const r = applySyncDocs({ docs: { [kind]: remote.doc.data }, dataRoot, configFile, config, sync });
          json(res, 200, { ok: true, applied: r.applied, sync: loadConfig(configFile).sync });
          return;
        }
        if (action === 'delete') {
          const r = await webdavRequest({ method: 'DELETE', url: syncFileUrlByName(sync, file), login: sync.login, password: sync.password, proxyUrl: proxyUrlFor('sync'), timeoutMs: 30000 });
          if (!r.ok) {
            json(res, 502, { ok: false, code: 'sync-request', error: r.error });
            return;
          }
          if (r.httpCode === 404) {
            remoteMissing();
            return;
          }
          if (r.httpCode < 200 || r.httpCode >= 300) {
            json(res, 502, { ok: false, code: 'sync-request', error: webdavHttpText(r.httpCode) });
            return;
          }
          json(res, 200, { ok: true });
          return;
        }
        // export：把云端文件原样保存到本机（不做信封校验，取回什么存什么）
        const r = await webdavRequest({ method: 'GET', url: syncFileUrlByName(sync, file), login: sync.login, password: sync.password, proxyUrl: proxyUrlFor('sync'), timeoutMs: 60000 });
        if (!r.ok) {
          json(res, 502, { ok: false, code: 'sync-request', error: r.error });
          return;
        }
        if (r.httpCode === 404 || r.httpCode === 409) {
          remoteMissing();
          return;
        }
        if (r.httpCode < 200 || r.httpCode >= 300) {
          json(res, 502, { ok: false, code: 'sync-request', error: webdavHttpText(r.httpCode) });
          return;
        }
        if (r.body.length > 8 * 1024 * 1024) {
          json(res, 400, { ok: false, code: 'sync-remote-invalid', error: `云端 ${file} 超过 8MB，已拒绝保存` });
          return;
        }
        // 系统目录选择器选保存位置；环境没有选择器时退回用户主目录，用户取消则中止
        const picked = await pickFolderSystem(homedir(), '选择保存位置');
        let target = '';
        if (picked && typeof picked.path === 'string' && picked.path) target = join(picked.path, file);
        else if (picked && picked.unavailable) target = join(homedir(), file);
        else {
          json(res, 200, { ok: false, code: 'export-cancelled', error: '已取消' });
          return;
        }
        try {
          writeFileSync(target, r.body, 'utf8');
        } catch (err) {
          json(res, 500, { ok: false, code: 'sync-export', error: `写入 ${target} 失败: ${err?.message || err}` });
          return;
        }
        json(res, 200, { ok: true, path: target });
        return;
      }
      // —— zcode-plugins 市场更新：读状态（带 30 分钟节流的市场同步）与执行更新 ————
      if (req.method === 'GET' && url.pathname === '/plugins/status') {
        await ensureZcodePluginsMarketplace();
        if (Date.now() - lastMarketplaceSync > 30 * 60 * 1000) {
          await runZcodeCli(['plugins', 'marketplace', 'update', ZCODE_PLUGINS_MARKETPLACE], 60000);
          lastMarketplaceSync = Date.now();
        }
        const status = pluginUpdateStatus();
        if (!status) {
          json(res, 500, { ok: false, code: 'plugins-status', error: '读取插件清单失败（未安装过 zcode-plugins 市场？）' });
          return;
        }
        json(res, 200, { ok: true, ...status });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/plugins/update') {
        const body = await readBody(req);
        // name 指定时只处理该插件：已装且有更新则更新，未装则安装（各插件面板的单插件操作）
        const only = typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : null;
        const steps = [];
        const added = await ensureZcodePluginsMarketplace();
        if (added) steps.push({ step: 'marketplace add', ok: added.ok, output: added.output || added.error });
        const sync = await runZcodeCli(['plugins', 'marketplace', 'update', ZCODE_PLUGINS_MARKETPLACE], 60000);
        lastMarketplaceSync = Date.now();
        steps.push({ step: 'marketplace update', ok: sync.ok, output: sync.output });
        if (!sync.ok && sync.code !== 'cli-not-found') {
          json(res, 500, { ok: false, code: 'plugins-update', error: sync.error || sync.output || 'marketplace update 失败', steps });
          return;
        }
        const status = pluginUpdateStatus();
        if (status) {
          let updated = 0;
          for (const p of status.plugins) {
            if (only && p.name !== only) continue;
            if (p.installed && p.hasUpdate) {
              const r = await runZcodeCli(['plugins', 'update', `${p.name}@${ZCODE_PLUGINS_MARKETPLACE}`], 120000);
              steps.push({ step: `update ${p.name}`, ok: r.ok, output: r.output });
              if (r.ok) updated += 1;
            } else if (!p.installed && only) {
              // 安装只走单插件入口（name 指定＝各面板的安装卡）：
              // 全量「检查并更新」/启动自动更新只升级已装插件——卸载必须被尊重，
              // 未装插件一律由用户在各 tab 显式点安装
              const r = await runZcodeCli(['plugins', 'install', `${p.name}@${ZCODE_PLUGINS_MARKETPLACE}`], 120000);
              steps.push({ step: `install ${p.name}`, ok: r.ok, output: r.output });
              if (r.ok) updated += 1;
            }
          }
          json(res, 200, { ok: steps.every((s) => s.ok), updated, steps, ...pluginUpdateStatus() });
          return;
        }
        json(res, 200, { ok: sync.ok, updated: 0, steps });
        return;
      }
      json(res, 404, { ok: false, error: 'not found' });
    } catch (err) {
      json(res, 500, { ok: false, error: String(err?.message || err) });
    }
  });

  return new Promise((resolveStarted, rejectStarted) => {
    server.once('error', rejectStarted);
    server.listen(port, '127.0.0.1', () => resolveStarted(server));
  });
}

// 市场快照同步节流：helper 进程内 30 分钟最多主动 git pull 一次
let lastMarketplaceSync = 0;

function readJsonFile(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

function clampInt(v, min, max, dflt) {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, Math.round(n)));
}

// —— 设置同步（“同步”标签页）的实现 ——

// loadConfig 时把磁盘上的 proxyScopes 按默认值归一（只收布尔，缺的补默认：
// 插件市场/依赖软件开、同步关）
function mergeProxyScopes(saved) {
  const d = defaultConfig().proxyScopes;
  const s = (saved && typeof saved === 'object') ? saved : {};
  return {
    plugins: typeof s.plugins === 'boolean' ? s.plugins : d.plugins,
    deps: typeof s.deps === 'boolean' ? s.deps : d.deps,
    sync: typeof s.sync === 'boolean' ? s.sync : d.sync,
  };
}

// loadConfig 时把磁盘上的 sync 段按默认值归一（长度限幅、时间戳只收数字）。
// 当前唯一后端是 WebDAV，type 一律归为 webdav（不做“禁用”态：同步本就仅手动触发）
function mergeSyncConfig(saved) {
  const d = defaultConfig().sync;
  if (!saved || typeof saved !== 'object') return d;
  const inc = (saved.include && typeof saved.include === 'object') ? saved.include : {};
  return {
    type: 'webdav',
    url: typeof saved.url === 'string' ? saved.url.slice(0, 500) : '',
    dir: typeof saved.dir === 'string' ? saved.dir.trim().replace(/^\/+|\/+$/g, '').slice(0, 200) : defaultConfig().sync.dir,
    login: typeof saved.login === 'string' ? saved.login.slice(0, 300) : '',
    password: typeof saved.password === 'string' ? saved.password.slice(0, 300) : '',
    include: { zcodepro: inc.zcodepro !== false, model: inc.model !== false },
    lastPushAt: Number.isFinite(saved.lastPushAt) ? saved.lastPushAt : null,
    lastPullAt: Number.isFinite(saved.lastPullAt) ? saved.lastPullAt : null,
  };
}

// POST /sync 表单校验：url/login/password/dir 全量替换（dir 缺省时不动已有值）。
// URL 必填，指向 WebDAV 服务器（可含路径前缀）；dir 为其下的上传目录，可多级
function validateSyncForm(raw) {
  const url = typeof raw.url === 'string' ? raw.url.trim() : '';
  const login = typeof raw.login === 'string' ? raw.login.trim() : '';
  const password = typeof raw.password === 'string' ? raw.password : '';
  if (!url) return { error: '请先填写 URL（如 https://dav.jianguoyun.com/dav/）' };
  if (!/^https?:\/\/\S+$/.test(url)) return { error: 'URL 需为 WebDAV 服务器地址，如 https://dav.example.com/dav/' };
  if (url.length > 500) return { error: 'URL 过长（最多 500 字符）' };
  if (login.length > 300 || password.length > 300) return { error: '登录名或密码过长（最多 300 字符）' };
  const out = { type: 'webdav', url, login, password };
  if (typeof raw.dir === 'string') {
    // 留空 = 不用子目录，直接存到 URL 路径下（用户显式清空时允许）
    const dir = raw.dir.trim().replace(/^\/+|\/+$/g, '');
    if (dir.length > 200) return { error: '上传目录过长（最多 200 字符）' };
    for (const seg of dir ? dir.split('/') : []) {
      if (!seg || seg === '.' || seg === '..' || /[\r\n\0]/.test(seg)) {
        return { error: '上传目录需为文件夹名（可多级，如 backup/zcode-pro），不能包含 . / .. 或特殊字符' };
      }
    }
    out.dir = dir;
  }
  return { sync: out };
}

// —— 同步内容在云端目录里的文件名：ZCode Pro 设置与模型设置各一个文件，
// 上传/下载按勾选逐文件进行，可单独覆盖其中一项 ——
const SYNC_FILES = { zcodepro: 'zcodepro.json', model: 'model.json' };

// 云端版本文件名的合法形态：固定名（zcodepro.json / model.json，始终是最新一版）
// 或组名 + ISO 时间戳（冒号换成 -，部分网盘文件名不允许冒号），如
// zcodepro-2025-10-25T14-59-53-169Z.json。按文件操作的端点（导入/删除/导出）
// 都先整串匹配该正则，杜绝 ../ 之类的路径注入
const SYNC_VERSION_RE = /^(zcodepro|model)(?:-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)?\.json$/;

// 历史版本文件名（同一次上传的各组共用同一时间戳，像“一次备份”而不是两个时刻）
function syncVersionName(kind, ts) {
  const iso = ts.toISOString(); // 2025-10-25T14:59:53.169Z
  return `${kind}-${iso.slice(0, 19).replace(/:/g, '-')}-${iso.slice(20, 23)}Z.json`;
}

// 云端目录 = URL（服务器地址，容忍尾斜杠）+ 上传目录（默认 zcode-pro，可多级）。
// 目录段逐段编码，中文/空格等文件夹名也能正确落到地址里
function syncBaseDir(sync) {
  const base = sync.url.replace(/\/+$/, '');
  const segs = String(sync.dir || '').split('/').map((s) => s.trim()).filter((s) => s && s !== '.' && s !== '..');
  if (!segs.length) return base;
  return base + '/' + segs.map(encodeURIComponent).join('/');
}

// 拼出各组同步文件（zcodepro.json / model.json）的完整地址
function syncFileUrl(sync, kind) {
  return syncBaseDir(sync) + '/' + SYNC_FILES[kind];
}

// 拼出云端目录里某个已校验文件名（固定名或历史版本）的完整地址
function syncFileUrlByName(sync, fileName) {
  return syncBaseDir(sync) + '/' + encodeURIComponent(fileName);
}

// 信封校验：云端文件必须是 { app: 'zcode-pro', kind, format, data } 且组别与文件名
// 前缀一致；4MB 上限挡住异常大文件
function parseSyncEnvelope(body, kind, label) {
  if (body.length > 4 * 1024 * 1024) {
    return { error: `云端 ${label} 超过 4MB，已拒绝应用`, code: 'sync-remote-invalid', status: 400 };
  }
  let doc = null;
  try { doc = JSON.parse(body); } catch { /* 落到统一报错 */ }
  if (!doc || typeof doc !== 'object' || doc.app !== 'zcode-pro' || doc.kind !== kind || !doc.data || typeof doc.data !== 'object') {
    return { error: `云端 ${label} 不是 zcode-pro 的同步数据（可能被其他内容占用），请删除该文件或换一个目录`, code: 'sync-remote-invalid', status: 409 };
  }
  return { doc };
}

// 读云端某个同步文件：{ doc } 成功 | { missing } 云端没有该组数据 | { error, code, status } 失败。
// 文件里已是其他内容（或组别不符）时拒绝覆盖；4MB 上限挡住异常大文件。
async function fetchSyncDoc(sync, proxyUrl, kind) {
  const r = await webdavRequest({ method: 'GET', url: syncFileUrl(sync, kind), login: sync.login, password: sync.password, proxyUrl });
  if (!r.ok) return { error: r.error, code: 'sync-request', status: 502 };
  // 404 之外，坚果云对父目录不存在的路径返回 409（AncestorsNotFound）——都视为云端没有数据，
  // 让上传继续走 PUT（自动建目录）而不是误报失败
  if (r.httpCode === 404 || r.httpCode === 409) return { missing: true };
  if (r.httpCode < 200 || r.httpCode >= 300) return { error: webdavHttpText(r.httpCode), code: 'sync-request', status: 502 };
  if (!r.body.trim()) return { missing: true }; // 个别网盘对不存在的文件返回 200 空内容
  return parseSyncEnvelope(r.body, kind, SYNC_FILES[kind]);
}

// 读云端某个版本文件（固定名或带时间戳的历史版本，文件名需已过 SYNC_VERSION_RE）。
// 返回值约定与 fetchSyncDoc 相同；kind 由文件名前缀决定
async function fetchSyncNamedDoc(sync, proxyUrl, fileName) {
  const kind = fileName.startsWith('model') ? 'model' : 'zcodepro';
  const r = await webdavRequest({ method: 'GET', url: syncFileUrlByName(sync, fileName), login: sync.login, password: sync.password, proxyUrl });
  if (!r.ok) return { error: r.error, code: 'sync-request', status: 502 };
  if (r.httpCode === 404 || r.httpCode === 409) return { missing: true };
  if (r.httpCode < 200 || r.httpCode >= 300) return { error: webdavHttpText(r.httpCode), code: 'sync-request', status: 502 };
  if (!r.body.trim()) return { missing: true };
  return parseSyncEnvelope(r.body, kind, fileName);
}

async function runSettingsSync({ direction, dataRoot, configFile, config, proxyUrl }) {
  const sync = config.sync;
  if (!sync.url || !/^https?:\/\/\S+$/.test(sync.url)) {
    return { code: 'sync-not-configured', status: 400, error: '请先填写 WebDAV URL 并保存' };
  }
  if (!sync.include.zcodepro && !sync.include.model) {
    return { code: 'sync-not-configured', status: 400, error: '请至少选择一项同步内容' };
  }
  return direction === 'push'
    ? runSyncPush({ dataRoot, configFile, config, sync, proxyUrl })
    : runSyncPull({ dataRoot, configFile, config, sync, proxyUrl });
}

// 上传：每组独立一个云端文件（zcodepro.json / model.json，始终最新一版），勾选几组
// 写几个；写前预读云端内容，别名与本机的合并后再写（合并规则见 mergeAliases），
// 其余内容整份覆盖。同一份内容再写一个带时间戳的历史版本文件，供下载时任选版本
// 恢复（旧版 zcode-pro 仍读固定名）
async function runSyncPush({ dataRoot, configFile, config, sync, proxyUrl }) {
  const docs = {};
  if (sync.include.zcodepro) {
    // sync（本机的同步配置与凭据）与 version（本机 helper 版本）不外发
    const { sync: _s, version: _v, ...rest } = config;
    docs.zcodepro = rest;
  }
  if (sync.include.model) {
    const v2conf = readJsonFile(join(dataRoot, 'v2', 'config.json'));
    if (v2conf && typeof v2conf.provider === 'object' && v2conf.provider) {
      docs.model = { provider: v2conf.provider };
      const pc = readJsonFile(join(dataRoot, 'v2', 'provider_config.json'));
      if (pc && typeof pc === 'object') docs.model.providerConfig = pc;
      // 注意：v2/credentials.json 不参与同步——里面是账号登录态（BigModel OAuth、
      // JWT、Coding Plan 账号 key）与应用自身数据，各机器用各自账号登录；
      // 自定义模型的 API Key 存在 config.json 的 provider.options.apiKey，随 provider 同步
    }
  }
  if (!Object.keys(docs).length) {
    return { code: 'sync-run', status: 400, error: '本机没有可同步的内容' };
  }
  const pushed = [];
  const stamp = new Date(); // 各组共用同一时间戳，对应“一次备份”
  const dir = await mkdtemp(join(tmpdir(), 'zcodepro-sync-'));
  try {
    for (const kind of Object.keys(docs)) {
      const remote = await fetchSyncDoc(sync, proxyUrl, kind);
      if (remote.error) return remote;
      // 别名先与云端合并：本机没配过的条目从云端带上，别让这次上传把别的机器配的别名顶掉
      if (kind === 'zcodepro' && remote.doc) {
        const remoteAliases = sanitizeAliases(remote.doc.data?.aliases);
        if (remoteAliases) docs.zcodepro.aliases = mergeAliases(docs.zcodepro.aliases, remoteAliases);
      }
      const doc = { app: 'zcode-pro', kind, format: 1, savedAt: stamp.toISOString(), data: docs[kind] };
      const docPath = join(dir, SYNC_FILES[kind]);
      writeFileSync(docPath, JSON.stringify(doc, null, 2), 'utf8');
      const putUrl = (name) => webdavPutWithMkcol({
        url: syncFileUrlByName(sync, name), login: sync.login, password: sync.password,
        uploadFile: docPath, proxyUrl, timeoutMs: 60000,
      });
      const put = await putUrl(SYNC_FILES[kind]);
      if (!put.ok) return { code: 'sync-request', status: 502, error: put.error };
      if (put.httpCode < 200 || put.httpCode >= 300) {
        return { code: 'sync-request', status: 502, error: webdavHttpText(put.httpCode) };
      }
      const putVersion = await putUrl(syncVersionName(kind, stamp));
      if (!putVersion.ok) return { code: 'sync-request', status: 502, error: putVersion.error };
      if (putVersion.httpCode < 200 || putVersion.httpCode >= 300) {
        return { code: 'sync-request', status: 502, error: webdavHttpText(putVersion.httpCode) };
      }
      pushed.push(kind);
    }
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  sync.lastPushAt = Date.now();
  saveConfig(configFile, config);
  return { applied: pushed };
}

// 下载：把云端所选组应用到本机（各组独立文件，勾选几组读几组，可只覆盖模型设置）。
// 覆盖前留 .zcodepro-backup 备份；zcodepro 组覆盖功能/样式/代理，别名与本机的
// 合并（合并规则见 mergeAliases）；sync 配置与凭据始终保留本机的
async function runSyncPull({ dataRoot, configFile, config, sync, proxyUrl }) {
  // 先把勾选组的云端数据全部读到（任何一组读取失败都不动本机文件），再逐组应用
  const docs = {};
  for (const kind of ['zcodepro', 'model']) {
    if (!sync.include[kind]) continue;
    const remote = await fetchSyncDoc(sync, proxyUrl, kind);
    if (remote.error) return remote;
    if (remote.doc) docs[kind] = remote.doc.data;
  }
  if (!Object.keys(docs).length) {
    return { code: 'sync-remote-missing', status: 404, error: '云端没有同步数据，请先在其他电脑上传' };
  }
  sync.lastPullAt = Date.now();
  return applySyncDocs({ docs, dataRoot, configFile, config, sync });
}

// 把云端读到的各组数据落到本机（runSyncPull 与按文件的历史版本导入共用）：
// zcodepro 组覆盖功能/样式/代理（sync 配置与凭据保留本机的），别名与本机的合并，
// model 组覆盖 v2/config.json 的 provider 与 provider_config.json；覆盖前都留备份
function applySyncDocs({ docs, dataRoot, configFile, config, sync }) {
  const applied = [];
  const backupFile = (p) => {
    try { if (existsSync(p)) copyFileSync(p, p + '.zcodepro-backup'); } catch { /* 备份失败不阻塞 */ }
  };
  const atomicWrite = (p, obj) => {
    const tmp = p + '.zcodepro-tmp';
    writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
    renameSync(tmp, p);
  };

  if (docs.zcodepro) {
    const rz = docs.zcodepro;
    const next = loadConfig(configFile);
    applyFeaturesPartial(next.features, rz.features);
    next.styles = applyStylesPartial(next.styles, rz.styles);
    // 别名与本机的合并（本机配过的优先），不再整份替换——各机器项目路径不同，
    // 合并后两边的别名都在，谁也不会被对方的同步顶掉
    const remoteAliases = sanitizeAliases(rz.aliases);
    if (remoteAliases) next.aliases = mergeAliases(next.aliases, remoteAliases);
    if (typeof rz.proxy === 'string') {
      const v = rz.proxy.trim();
      if (v === '' || /^https?:\/\/\S+:\d+$/.test(v)) next.proxy = v;
    }
    next.sync = sync;
    backupFile(configFile);
    saveConfig(configFile, next);
    applied.push('zcodepro');
  }
  if (docs.model) {
    const provider = docs.model.provider;
    if (provider && typeof provider === 'object' && !Array.isArray(provider)) {
      const v2confFile = join(dataRoot, 'v2', 'config.json');
      const localDoc = readJsonFile(v2confFile) || {};
      backupFile(v2confFile);
      atomicWrite(v2confFile, { ...localDoc, provider });
    }
    const pc = docs.model.providerConfig;
    if (pc && typeof pc === 'object' && !Array.isArray(pc)) {
      const pcFile = join(dataRoot, 'v2', 'provider_config.json');
      backupFile(pcFile);
      atomicWrite(pcFile, pc);
    }
    applied.push('model');
  }
  // 没动 zcodepro.json 时，lastPullAt 也要写入配置文件（动了则已随 next 一起保存）
  if (!applied.includes('zcodepro')) saveConfig(configFile, config);
  return { applied };
}

// 同步“测试”按钮的实现：分三步验证，任一步失败即止（后续步骤没有意义）。
// ① 连接与凭据：PROPFIND 上传目录——404/409 只说明目录还没建，能拿到 HTTP 响应
// 且不是 401/403 即证明服务器可达、凭据可用（坚果云的应用密码可限定目录，
// 探服务器根会误报）；② 上传目录：不存在时逐段 MKCOL 建出来再验（顺带验证写
// 权限，与上传时的自动建目录一致）；③ 文件列表：PROPFIND Depth 1 数备份文件。
// targets 的 step 供前端映射本地化步骤名（connect/dir/list）
async function runSyncTest({ sync, proxyUrl }) {
  const auth = { login: sync.login, password: sync.password, proxyUrl };
  const targets = [];
  const probe = async (step, run) => {
    const started = Date.now();
    const resp = await run();
    const ok = resp.ok && resp.httpCode >= 200 && resp.httpCode < 300;
    targets.push({
      step, ok,
      ms: Date.now() - started,
      httpCode: resp.ok ? resp.httpCode : null,
      error: ok ? '' : (resp.ok ? webdavHttpText(resp.httpCode) : resp.error),
    });
    return { ok, resp };
  };
  const baseDir = syncBaseDir(sync);
  // ① 只要拿到响应且不是凭据问题就算连通（404/409 = 目录还没建，交给第②步处理）
  const connect = await probe('connect', () => webdavRequest({ method: 'PROPFIND', url: baseDir, ...auth, timeoutMs: 20000, headers: ['Depth: 0'] }));
  if (!connect.ok && connect.resp.ok && (connect.resp.httpCode === 404 || connect.resp.httpCode === 409)) {
    // 目录缺失不算连接失败：改写第一步结果，继续建目录
    targets[targets.length - 1] = { ...targets[targets.length - 1], ok: true, error: '' };
  } else if (!connect.ok) {
    return { targets };
  }
  // ② 目录不存在则逐段 MKCOL（已存在段 MKCOL 多半回 405，忽略），再 PROPFIND 验证
  const dir = await probe('dir', async () => {
    let r = connect.resp;
    if (r.httpCode === 404 || r.httpCode === 409) {
      try {
        const u = new URL(baseDir);
        let cur = u.origin;
        for (const s of u.pathname.split('/').filter(Boolean)) {
          cur += '/' + s;
          await webdavRequest({ method: 'MKCOL', url: cur, ...auth, timeoutMs: 15000 });
        }
      } catch { /* URL 解析失败：交给下面的 PROPFIND 报错 */ }
      r = await webdavRequest({ method: 'PROPFIND', url: baseDir, ...auth, timeoutMs: 20000, headers: ['Depth: 0'] });
    }
    return r;
  });
  if (!dir.ok) return { targets };
  // ③ 列文件（Depth 1），数出同步目录里的备份文件个数
  const list = await probe('list', () => webdavRequest({ method: 'PROPFIND', url: baseDir, ...auth, timeoutMs: 30000, headers: ['Depth: 1'] }));
  if (!list.ok) return { targets };
  const fileCount = parseWebdavListing(list.resp.body).filter((e) => SYNC_VERSION_RE.test(e.name)).length;
  return { targets, fileCount };
}

// PROPFIND 云端同步目录，列出全部备份版本（固定名 + 带时间戳的历史）：
// 按修改时间从新到旧（时间缺失的按文件名排后）；目录还不存在视为空列表
async function listSyncVersions(sync, proxyUrl) {
  const r = await webdavRequest({ method: 'PROPFIND', url: syncBaseDir(sync), login: sync.login, password: sync.password, proxyUrl, timeoutMs: 30000, headers: ['Depth: 1'] });
  if (!r.ok) return { error: r.error, code: 'sync-request', status: 502 };
  if (r.httpCode === 404 || r.httpCode === 409) return { files: [] };
  if (r.httpCode < 200 || r.httpCode >= 300) return { error: webdavHttpText(r.httpCode), code: 'sync-request', status: 502 };
  const files = parseWebdavListing(r.body)
    .filter((e) => SYNC_VERSION_RE.test(e.name))
    .map((e) => ({ name: e.name, size: e.size, lastModified: e.lastModified }));
  files.sort((a, b) => ((b.lastModified || 0) - (a.lastModified || 0)) || b.name.localeCompare(a.name));
  return { files };
}

// 别名表清洗（同步下载用）：只收 路径字符串 → 短字符串 的条目，数量限幅
function sanitizeAliases(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  let n = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k !== 'string' || k.length > 500 || k.includes('\0')) continue;
    if (typeof v !== 'string' || v.length > 200 || /[\r\n\0]/.test(v)) continue;
    out[k] = v;
    if (++n >= 2000) break;
  }
  return out;
}

// 别名表合并（同步上传/下载共用）：取两边的并集，配过别名的条目优先——同一路径
// 两边都配了别名时用本机的；只有一边配过时保留配过的那个。所以在一台机器上清除
// 别名后，只要别的机器还配着，下次同步还会把这条带回来，两边都清掉才会真正消失。
// 导出以便测试脚本直接驱动。
export function mergeAliases(localRaw, remoteRaw) {
  const out = {};
  const put = (k, v) => {
    if (typeof k !== 'string' || k.length > 500 || k.includes('\0')) return;
    if (typeof v !== 'string' || !v || v.length > 200 || /[\r\n\0]/.test(v)) return;
    out[k] = v;
  };
  const entries = (raw) => (raw && typeof raw === 'object' && !Array.isArray(raw)) ? Object.entries(raw) : [];
  for (const [k, v] of entries(remoteRaw)) put(k, v);
  for (const [k, v] of entries(localRaw)) {
    // 本机配过的覆盖云端同路径条目；本机是空值（视为没配过）时不覆盖，云端配过的留下
    if (v) put(k, v);
  }
  return out;
}

// features 部分更新（POST /config 与同步下载共用）：只收已知开关的布尔值
function applyFeaturesPartial(base, partial) {
  const out = (base && typeof base === 'object') ? base : {};
  if (!partial || typeof partial !== 'object') return out;
  for (const key of Object.keys(defaultConfig().features)) {
    if (typeof partial[key] === 'boolean') out[key] = partial[key];
  }
  return out;
}

// 空闲回收的后台命令判定：项目会话进程（zcode-cli）的子进程里，插件/MCP 与应用
// 自身的基础设施不算活动；其余（应用的 shell 包装 exec/、用户直接启动的进程）
// 一律视为仍在运行的后台命令。
// 匹配前把命令行的反斜杠统一为正斜杠，一份模式通吃三平台。
const IDLE_INFRA_CMDLINE = [
  '/.zcode/cli/plugins/',    // 插件市场安装的 MCP/hooks（vision、headroom、rtk 等）
  '/.zcode/cli/image-cache', // 会话图片缓存的本地 http 服务
  'node-repl',               // 内置 node-repl MCP（进程改过名，命令行只剩标题）
  '/opt/ZCode/',             // 应用自带组件（Linux）
  '/Applications/ZCode.app', // 应用自带组件（macOS）
  'Programs/ZCode',          // 应用自带组件（Windows）
  'crashpad',                // 崩溃收集
  'conhost',                 // Windows 控制台宿主：每个控制台进程标配的子进程（实测捕获）
];

const SCAN_OFF = { ok: true, scan: false, busy: [] };

function normCmdline(s) {
  return String(s || '').replace(/\\/g, '/');
}

function isInfraCmdline(cmdline) {
  return IDLE_INFRA_CMDLINE.some((pat) => cmdline.includes(pat));
}

// 执行外部命令（macOS/Windows 适配器用）：失败返回 err，不抛
function runCmd(cmd, args, timeoutMs = 15000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8', windowsHide: true },
      (err, stdout, stderr) => {
        resolve({ err: err ? String(err.message || err) : null, stdout: String(stdout || ''), stderr: String(stderr || '') });
      });
  });
}

// 请求路径 → 进程 cwd 的匹配表：cwd → 命中的请求路径列表。
// 符号链接打开的项目 cwd 是解析后的真实路径，两种形态都登记，命中任一即算该项目；
// 多个请求路径落到同一 cwd 时全部标记（宁可多判忙，不漏保护）
function buildWantedByCwd(paths) {
  const map = new Map();
  const add = (cwd, req) => {
    const arr = map.get(cwd);
    if (arr) { if (!arr.includes(req)) arr.push(req); }
    else map.set(cwd, [req]);
  };
  for (const p of paths) {
    const plain = p.replace(/[\\/]+$/, '');
    add(plain, plain);
    try {
      const real = realpathSync(plain);
      if (real !== plain) add(real, plain);
    } catch { /* 目录不存在：也不会有对应进程 */ }
  }
  return map;
}

export async function scanIdleBusy(paths, dataRoot) {
  if (process.platform === 'linux') return scanIdleBusyLinux(paths);
  if (process.platform === 'darwin') return scanIdleBusyDarwin(paths);
  if (process.platform === 'win32') return scanIdleBusyWindows(paths, dataRoot);
  return SCAN_OFF;
}

// Linux：/proc 直读（comm 定位 CLI、cwd 定位项目、task/<pid>/children 拿子进程）
function scanIdleBusyLinux(paths) {
  let pids;
  try { pids = readdirSync('/proc').filter((d) => /^\d+$/.test(d)); }
  catch { return SCAN_OFF; }
  const wantedByCwd = buildWantedByCwd(paths);
  const cliPidByCwd = new Map();
  for (const pid of pids) {
    try {
      if (readFileSync(`/proc/${pid}/comm`, 'utf8').trim() !== 'zcode-cli') continue;
      cliPidByCwd.set(readlinkSync(`/proc/${pid}/cwd`), pid);
    } catch { /* 进程退出/权限：跳过 */ }
  }
  const busy = new Set();
  for (const [cwd, pid] of cliPidByCwd) {
    const wantedPaths = wantedByCwd.get(cwd);
    if (!wantedPaths) continue;
    let children = '';
    try { children = readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8'); }
    catch { continue; }
    for (const childPidStr of children.split(/\s+/)) {
      const childPid = Number(childPidStr);
      if (!Number.isFinite(childPid)) continue;
      let cmdline = '';
      let zombie = false;
      try {
        cmdline = normCmdline(readFileSync(`/proc/${childPid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim());
        const stat = readFileSync(`/proc/${childPid}/stat`, 'utf8');
        zombie = /\) Z /.test(stat);
      } catch { continue; }
      if (zombie) continue;
      if (!cmdline || !isInfraCmdline(cmdline)) {
        for (const wp of wantedPaths) busy.add(wp); // 认不出的进程宁可误判为忙，也不回收可能在跑命令的项目
        break;
      }
    }
  }
  return { ok: true, scan: true, busy: [...busy] };
}

// macOS：ps 拿进程表（pid/父 pid/状态/名称/命令行），lsof 拿 CLI 进程的工作目录。
// 都是系统自带工具、本用户进程无需提权。任何一个 CLI 的工作目录取不到就本轮放弃
// （scan=false），宁可不动也不猜
async function scanIdleBusyDarwin(paths) {
  const psInfo = await runCmd('ps', ['-axo', 'pid=,ppid=,stat=,comm=']);
  if (psInfo.err) return SCAN_OFF;
  const procs = [];
  for (const line of psInfo.stdout.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
    if (m) procs.push({ pid: Number(m[1]), ppid: Number(m[2]), stat: m[3], comm: m[4].trim() });
  }
  const clis = procs.filter((p) => /(^|\/)zcode-cli$/.test(p.comm));
  if (!clis.length) return SCAN_OFF; // 定位不到会话进程：可能名称对不上，不猜
  const psArgs = await runCmd('ps', ['-axo', 'pid=,command=']);
  if (psArgs.err) return SCAN_OFF;
  const cmdByPid = new Map();
  for (const line of psArgs.stdout.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(.+)$/);
    if (m) cmdByPid.set(Number(m[1]), m[2]);
  }
  const wantedByCwd = buildWantedByCwd(paths);
  const busy = new Set();
  for (const cli of clis) {
    const lsof = await runCmd('lsof', ['-a', '-p', String(cli.pid), '-d', 'cwd', '-Fn', '-w']);
    const cwd = (lsof.stdout.match(/^n(.+)$/m) || [])[1];
    if (!cwd) continue; // 进程多半刚退出：跳过即可，它已不可能挂着命令
    const wantedPaths = wantedByCwd.get(cwd);
    if (!wantedPaths) continue;
    for (const child of procs) {
      if (child.ppid !== cli.pid || child.stat.includes('Z')) continue;
      const cmdline = normCmdline(cmdByPid.get(child.pid) || '');
      if (!cmdline || !isInfraCmdline(cmdline)) {
        for (const wp of wantedPaths) busy.add(wp);
        break;
      }
    }
  }
  return { ok: true, scan: true, busy: [...busy] };
}

// Windows：PowerShell 的 Win32_Process 拿 pid/父 pid/命令行（系统自带，无需提权）。
// 拿不到其他进程的工作目录，改用两级归属：命令行带会话 ID（应用的 exec/ 包装）→
// 查任务索引反查工作区；认不出且无会话 ID 的活动子进程无法归属 → 全部请求判忙（保守）。
// 路径比较忽略大小写与分隔符差异
async function scanIdleBusyWindows(paths, dataRoot) {
  const ps = await runCmd('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress'], 30000);
  if (ps.err || !ps.stdout.trim()) return SCAN_OFF;
  let list;
  try {
    list = JSON.parse(ps.stdout);
    if (!Array.isArray(list)) list = [list];
  } catch { return SCAN_OFF; }
  const procs = list
    .filter((p) => p && Number.isFinite(Number(p.ProcessId)))
    .map((p) => ({
      pid: Number(p.ProcessId),
      ppid: Number(p.ParentProcessId) || 0,
      name: String(p.Name || ''),
      cmdline: normCmdline(p.CommandLine || ''),
    }));
  let wsMap = null; // 懒加载：任务 ID → 规范化工作区
  const lookupTaskWs = async (taskId) => {
    if (wsMap === null) {
      const raw = await listTaskWorkspaceMap(dataRoot);
      wsMap = {};
      for (const [k, v] of Object.entries(raw)) wsMap[k] = normCmdline(v).replace(/\/+$/, '').toLowerCase();
    }
    return wsMap[taskId];
  };
  return classifyIdleBusyWindows(procs, paths, lookupTaskWs);
}

// Windows 判定逻辑（与进程表获取解耦，可直接喂真实 CIM 数据测试）
export async function classifyIdleBusyWindows(procs, paths, lookupTaskWs) {
  const clis = procs.filter((p) => /^zcode-cli(\.exe)?$/i.test(p.name));
  if (!clis.length) return SCAN_OFF; // 定位不到会话进程：可能名称对不上，不猜
  const reqByNorm = new Map();
  for (const p of paths) reqByNorm.set(normCmdline(p).replace(/\/+$/, '').toLowerCase(), p);
  let unattributed = false;
  const busy = new Set();
  const markByTask = async (taskId) => {
    const normWs = await lookupTaskWs(taskId);
    const req = normWs ? reqByNorm.get(normWs) : undefined;
    if (req) busy.add(req);
    else unattributed = true; // 索引里查不到该会话：归属不明，保守处理
  };
  for (const cli of clis) {
    for (const child of procs) {
      if (child.ppid !== cli.pid) continue;
      if (isInfraCmdline(child.cmdline)) continue;
      if (!child.cmdline) { unattributed = true; continue; }
      const sess = child.cmdline.match(/sess_[A-Za-z0-9-]+/);
      if (sess) await markByTask(sess[0]);
      else unattributed = true; // 用户进程但无会话线索：归属不到具体项目
    }
  }
  if (unattributed) return { ok: true, scan: true, busy: paths }; // 有归属不明的活动进程：全部判忙
  return { ok: true, scan: true, busy: [...busy] };
}

// styles 部分更新的清洗（POST /config 与同步下载共用）：只收已知键；
// null 恢复默认；px 类 0–96 取整，行距 0.8–4 保留两位小数，宽度按单位限幅，字体栈经 sanitizeFontStack
function applyStylesPartial(base, partial) {
  const out = (base && typeof base === 'object') ? base : {};
  if (!partial || typeof partial !== 'object') return out;
  for (const key of ['rowGap', 'listSpacing', 'listItemSpacing', 'quoteCodeSpacing', 'tableSpacing', 'tableCellPaddingV', 'tableCellPaddingH', 'sidebarProjectSpacing', 'sidebarTaskSpacing']) {
    if (key in partial) {
      const v = partial[key];
      if (v === null) out[key] = null;
      else if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 96) out[key] = Math.round(v);
    }
  }
  for (const key of ['lineHeight', 'thinkingLineHeight', 'codeLineHeight', 'userLineHeight']) {
    if (key in partial) {
      const v = partial[key];
      if (v === null) out[key] = null;
      else if (typeof v === 'number' && Number.isFinite(v) && v >= 0.8 && v <= 4) out[key] = Math.round(v * 100) / 100;
    }
  }
  if ('contentWidth' in partial) {
    const v = partial.contentWidth;
    const ok = v && (v.unit === 'px' || v.unit === '%') && typeof v.value === 'number' && Number.isFinite(v.value)
      && v.value >= (v.unit === 'px' ? 320 : 20) && v.value <= (v.unit === 'px' ? 3840 : 100);
    if (v === null) out.contentWidth = null;
    else if (ok) out.contentWidth = { value: v.unit === 'px' ? Math.round(v.value) : Math.round(v.value * 10) / 10, unit: v.unit };
  }
  for (const key of ['uiFont', 'userFont', 'assistantFont']) {
    if (!(key in partial)) continue;
    const s = sanitizeFontStack(partial[key]);
    if (s !== undefined) out[key] = s;
  }
  return out;
}

// 字体栈清洗：去控制字符、限 200 字符；拒绝能破坏 CSS 声明的字符（{};<>\）
// 与引号不配对的值（返回 undefined = 忽略该次更新）。空串/null = 恢复默认（null）
function sanitizeFontStack(v) {
  if (v === null || v === '') return null;
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 200);
  if (!s) return null;
  if (/[{};<>\\]/.test(s)) return undefined;
  if (((s.match(/"/g) || []).length) % 2 !== 0 || ((s.match(/'/g) || []).length) % 2 !== 0) return undefined;
  return s;
}

// 跟随供应商下拉取数：合并 ~/.zcode/v2/config.json 的 provider（优先）与
// ~/.zcode/v2/provider_config.json 的 providerRules（同 id 时规则表的名字保留为别名）；只回 id/名称/别名，不含密钥。
// 导出以便测试脚本直接驱动。
export function listVisionProviders() {
  const list = [];
  const byId = new Map();
  const v2 = readJsonFile(join(homedir(), '.zcode', 'v2', 'config.json'));
  for (const [id, p] of Object.entries((v2 && typeof v2.provider === 'object' && v2.provider) || {})) {
    const entry = { id, name: (p && typeof p.name === 'string' && p.name.trim()) || id, aliases: [] };
    list.push(entry);
    byId.set(id, entry);
  }
  const rulesDoc = readJsonFile(join(homedir(), '.zcode', 'v2', 'provider_config.json'));
  const rules = (rulesDoc && rulesDoc.config?.providerConfigRules?.providerRules) || [];
  for (const r of rules) {
    if (!r || typeof r.providerId !== 'string' || !r.providerId) continue;
    const existing = byId.get(r.providerId);
    if (existing) {
      const alias = (typeof r.providerName === 'string' && r.providerName.trim()) || r.providerId;
      if (alias !== existing.name && !existing.aliases.includes(alias)) existing.aliases.push(alias);
      continue;
    }
    const entry = { id: r.providerId, name: (typeof r.providerName === 'string' && r.providerName.trim()) || r.providerId, aliases: [] };
    list.push(entry);
    byId.set(r.providerId, entry);
  }
  return list;
}

// zcode-vision 配置校验：只保留已知字段并规范化；出错时返回中文原因。
// 导出以便测试脚本直接驱动。
export function validateVisionConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [null, 'config 必须是对象'];
  if (raw.chainMode !== 'fallback' && raw.chainMode !== 'pipeline') return [null, 'chainMode 只能是 fallback 或 pipeline'];
  if (!Array.isArray(raw.chain) || raw.chain.some((n) => typeof n !== 'string')) return [null, 'chain 必须是代理名数组'];
  if (!Array.isArray(raw.proxies)) return [null, 'proxies 必须是数组'];
  const cfg = {
    enabled: raw.enabled !== false,
    chainMode: raw.chainMode,
    chain: raw.chain.map((s) => s.trim()).filter(Boolean),
    proxies: [],
    pollMs: clampInt(raw.pollMs, 0, 60000, 3000),
    apiTimeoutMs: clampInt(raw.apiTimeoutMs, 1000, 600000, 120000),
    compressThresholdKB: clampInt(raw.compressThresholdKB, 0, 102400, 1024),
    // 连续失败跳过（0 = 不跳过）；跳过时长（分钟）
    skipAfterFailures: clampInt(raw.skipAfterFailures, 0, 100, 4),
    skipMinutes: clampInt(raw.skipMinutes, 1, 10080, 30),
    // 主模型能看图时是否也拦截识别（false = 跳过；flash 主模型始终不触发，见插件）
    forceIntercept: raw.forceIntercept !== false,
  };
  const names = new Set();
  for (const p of raw.proxies) {
    if (!p || typeof p !== 'object') return [null, '代理必须是对象'];
    const proxy = {};
    for (const k of ['name', 'baseUrl', 'model', 'apiKey', 'format', 'useProvider', 'prompt']) {
      const v = p[k];
      if (v === undefined || v === null) continue;
      if (typeof v !== 'string') return [null, `代理字段 ${k} 必须是字符串`];
      if (k === 'prompt' ? v.length > 20000 : v.length > 500) return [null, `代理字段 ${k} 过长`];
      proxy[k] = v;
    }
    // 单代理超时（毫秒）：0/缺省 = 用全局 apiTimeoutMs；面板没有输入框，但保存时不能弄丢（/vision-proxy edit 可改）
    if (p.timeoutMs !== undefined && p.timeoutMs !== null && p.timeoutMs !== '') {
      proxy.timeoutMs = clampInt(p.timeoutMs, 0, 600000, 0);
    }
    const name = (proxy.name || '').trim();
    if (!name) return [null, '每个代理都需要名称'];
    if (names.has(name)) return [null, `代理名称重复：${name}`];
    names.add(name);
    proxy.name = name;
    if (!(proxy.baseUrl || '').trim() && !(proxy.useProvider || '').trim()) return [null, `代理 ${name} 缺少 baseUrl（或设置 useProvider 跟随供应商）`];
    if (!(proxy.model || '').trim()) return [null, `代理 ${name} 缺少 model`];
    if (proxy.baseUrl) proxy.baseUrl = proxy.baseUrl.trim();
    if (proxy.model) proxy.model = proxy.model.trim();
    if (proxy.useProvider) proxy.useProvider = proxy.useProvider.trim();
    if (proxy.format) proxy.format = proxy.format.trim();
    if (proxy.format && proxy.format !== 'openai' && proxy.format !== 'anthropic') {
      return [null, `代理 ${name} 的 format 只能是 openai 或 anthropic`];
    }
    cfg.proxies.push(proxy);
  }
  for (const n of cfg.chain) {
    if (!names.has(n)) return [null, `链中代理“${n}”未在 proxies 里定义`];
  }
  return [cfg, null];
}

// —— zcode-rtk 状态读写（mode / whitelist），与 rtk 插件钩子共用同一文件 ——

function readRtkMode(file) {
  try {
    return readFileSync(file, 'utf8').trim() === 'off' ? 'off' : 'hint';
  } catch {
    return 'hint'; // 钩子默认：文件缺失视为 hint
  }
}

function readRtkWhitelist(file) {
  try {
    return readFileSync(file, 'utf8').split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  } catch {
    return [];
  }
}

// 白名单校验：只收 name 或 git:name（与钩子的解析规则一致），去重保序。
// 导出以便测试脚本直接驱动。
export function validateRtkWhitelist(raw) {
  if (!Array.isArray(raw)) return { error: 'whitelist 必须是字符串数组' };
  if (raw.length > 200) return { error: '白名单最多 200 条' };
  const seen = new Set();
  const entries = [];
  for (const e of raw) {
    if (typeof e !== 'string' || !/^(git:)?[A-Za-z0-9._-]+$/.test(e)) {
      return { error: `无效的白名单条目：${String(e).slice(0, 50)}` };
    }
    if (!seen.has(e)) { seen.add(e); entries.push(e); }
  }
  return { entries };
}

// 写入 mode 与 whitelist（临时文件 + 改名原子写）。whitelist 为空时删除文件
// （钩子视为未自定义）；文件头带注释说明格式，方便用户直接编辑。
function writeRtkState(dir, { mode, whitelist }) {
  mkdirSync(dir, { recursive: true });
  const modeFile = join(dir, 'mode');
  const tmp = modeFile + '.tmp';
  writeFileSync(tmp, mode, 'utf8');
  renameSync(tmp, modeFile);
  const wlFile = join(dir, 'whitelist');
  if (whitelist.length === 0) {
    try { unlinkSync(wlFile); } catch { /* 不存在即目标状态 */ }
    return;
  }
  const wlTmp = wlFile + '.tmp';
  writeFileSync(wlTmp, '# rtk 白名单（不压缩直接放行）：每行 name 或 git:name（git 子命令）。删除本文件即恢复默认。\n'
    + whitelist.join('\n') + '\n', 'utf8');
  renameSync(wlTmp, wlFile);
}

// 探测 rtk 安装与版本：先 PATH（execFile 自带 Windows 扩展名解析），
// 再常见安装位置（与 rtk 插件钩子的查找清单一致）。
async function rtkBinaryInfo() {
  const attempt = (cmd) => new Promise((resolveV) => {
    execFile(cmd, ['--version'], { timeout: 5000, windowsHide: true }, (err, stdout) => {
      resolveV(err ? null : { binPath: cmd, version: String(stdout || '').trim().split('\n')[0] });
    });
  });
  const direct = await attempt('rtk');
  if (direct) return { installed: true, ...direct };
  // PATH 未命中时按与 rtkFindBin 相同的清单找绝对路径再试
  const bin = rtkFindBin();
  if (bin && bin !== 'rtk') {
    const r = await attempt(bin);
    if (r) return { installed: true, ...r };
  }
  return { installed: false, version: null, binPath: null };
}

// 内置放行清单（钩子 python 里的 GIT_MUTATIONS/PLAIN_MUTATIONS）：从钩子脚本解析，
// 随插件更新自动跟进；面板只读展示。解析失败返回空列表，不影响其他功能。
function readRtkBuiltinWhitelist() {
  const hook = findMarketplaceHook('rtk', join('hooks', 'rtk-pretooluse.sh'));
  if (!hook) return { builtinGit: [], builtinPlain: [] };
  try {
    const src = readFileSync(hook, 'utf8');
    const grab = (name) => {
      const m = new RegExp(name + '\\s*=\\s*\\{([^}]*)\\}').exec(src);
      return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
    };
    return { builtinGit: grab('GIT_MUTATIONS'), builtinPlain: grab('PLAIN_MUTATIONS') };
  } catch {
    return { builtinGit: [], builtinPlain: [] };
  }
}

// —— rtk 本体（独立二进制）的检查更新与升级：GitHub Releases 下载 → sha256 校验 → 原子替换 ——

function rtkFindBin() {
  // 兜底候选按平台给全扩展名：全新安装装到 ~/.local/bin 后 PATH 对运行中的 helper
  // 不可见（需注销重登），必须能按固定位置直接找到，否则面板误报“未安装”
  return findBinFile(
    process.platform === 'win32' ? ['rtk.exe'] : ['rtk'],
    process.platform === 'win32'
      ? [join(homedir(), '.local', 'bin', 'rtk.exe'), join(homedir(), '.cargo', 'bin', 'rtk.exe'),
         join(homedir(), 'miniforge3', 'Scripts', 'rtk.exe'), join(homedir(), 'miniconda3', 'Scripts', 'rtk.exe')]
      : [join(homedir(), '.local', 'bin', 'rtk'), join(homedir(), 'miniforge3', 'bin', 'rtk'),
         '/usr/local/bin/rtk', '/usr/bin/rtk']);
}

// 最新版本探测。两条互补通道，任一成功即用：① 匿名 GitHub API——直连常可用，但
// 走代理时出口 IP 常被限流；② releases/latest 302 的 Location 头——不受速率限制，
// 但 github.com 网页在部分网络直连不通。资产与 checksums 的下载地址按官方命名规则
// 构造。请求复用 webdavRequest（curl 优先、按 proxyScopes 注入代理；无 curl 的精简
// Windows 回退 fetch 直连，代理在那条路径不生效）。
async function rtkLatestInfo() {
  const assetName = rtkAssetName();
  if (!assetName) return { code: 'rtk-update', error: '当前平台不支持自动升级' };
  const mkInfo = (tag) => {
    const base = `https://github.com/rtk-ai/rtk/releases/download/v${tag}`;
    return { tag, assetName, assetUrl: `${base}/${assetName}`, sumsUrl: `${base}/checksums.txt` };
  };
  const proxyUrl = proxyUrlFor('deps');
  const api = await webdavRequest({
    method: 'GET', url: 'https://api.github.com/repos/rtk-ai/rtk/releases/latest',
    proxyUrl, timeoutMs: 12000, headers: ['User-Agent: zcode-pro'],
  });
  if (api.ok && api.httpCode === 200) {
    try {
      const tag = String(JSON.parse(api.body).tag_name || '').replace(/^v/, '');
      if (tag) return mkInfo(tag);
    } catch { /* body 不是 JSON：换重定向通道 */ }
  }
  const redir = await webdavRequest({
    method: 'GET', url: 'https://github.com/rtk-ai/rtk/releases/latest', proxyUrl, timeoutMs: 10000,
  });
  const m = /\/tag\/v?(\d[\w.+-]*)\s*$/.exec(redir.redirectUrl || '');
  if (m) return mkInfo(m[1]);
  return { code: 'rtk-update', error: '查询 GitHub Releases 失败（网络不通或需代理）' };
}

// 按平台/架构选资产文件名（与官方 Release 命名一致）
function rtkAssetName() {
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'rtk-aarch64-apple-darwin.tar.gz' : 'rtk-x86_64-apple-darwin.tar.gz';
  if (process.platform === 'linux') return process.arch === 'arm64' ? 'rtk-aarch64-unknown-linux-gnu.tar.gz' : 'rtk-x86_64-unknown-linux-musl.tar.gz';
  if (process.platform === 'win32') return 'rtk-x86_64-pc-windows-msvc.zip';
  return null;
}

let rtkUpgradeJob = null;

export function rtkUpgradeSnapshot() { return upgradeJobSnapshot(rtkUpgradeJob); }

function cancelRtkUpgrade() { return cancelUpgradeJob(rtkUpgradeJob); }

// 启动 rtk 本体升级或安装（后台任务，面板经 GET /rtk/upgrade 轮询）：
// 下载资产与 checksums → sha256 校验 → 解压 → 试运行 → 原子替换旧二进制；
// 未安装时装到 ~/.local/bin（钩子的 rtk 查找清单含该位置，装完钩子立即可用；
// Windows 资产是 zip，用系统自带 bsdtar 解压、PowerShell Get-FileHash 校验，
// 全新安装后把 ~/.local/bin 注册进用户级 PATH，运行中的进程读不到——重启 ZCode 生效）
function startRtkUpgrade() {
  if (rtkUpgradeJob && rtkUpgradeJob.running) return rtkUpgradeSnapshot();
  const j = newUpgradeJob();
  rtkUpgradeJob = j;
  const WIN = process.platform === 'win32';
  void (async () => {
    let dir = null;
    let bin = null;
    try {
      const freshInstall = !rtkFindBin();
      bin = rtkFindBin() || join(homedir(), '.local', 'bin', WIN ? 'rtk.exe' : 'rtk');
      const info = await rtkLatestInfo();
      if (info.code) throw new Error(info.error);
      dir = await mkdtemp(join(tmpdir(), 'rtk-upgrade-'));
      j.output += `下载 ${info.assetName}…\n`;
      const archPath = join(dir, info.assetName);
      await downloadToFile(j, info.assetUrl, archPath, 600000);
      // sha256 校验（checksums.txt 与本机摘要工具；失败即中止，不替换）
      if (info.sumsUrl) {
        const sumPath = join(dir, 'checksums.txt');
        await downloadToFile(j, info.sumsUrl, sumPath, 30000);
        const want = readFileSync(sumPath, 'utf8').split('\n')
          .find((l) => l.trim().endsWith(info.assetName))?.trim().split(/\s+/)[0];
        let got = '';
        if (WIN) {
          const local = await execCapture('powershell.exe',
            ['-NoProfile', '-Command', `(Get-FileHash -Algorithm SHA256 -LiteralPath "${archPath}").Hash`], 60000);
          got = (/[0-9a-fA-F]{64}/.exec(local.output || '') || [''])[0];
        } else {
          const sumCmd = process.platform === 'darwin' ? 'shasum' : 'sha256sum';
          const sumArgs = process.platform === 'darwin' ? ['-a', '256', archPath] : [archPath];
          const local = await execCapture(sumCmd, sumArgs, 30000);
          got = local.ok ? (local.output.split(/\s+/)[0] || '') : '';
        }
        if (!want || !got || want.toLowerCase() !== got.toLowerCase()) {
          throw new Error(`sha256 校验失败（期望 ${want || '?'}，实际 ${got || '?'}）`);
        }
        j.output += 'sha256 校验通过\n';
      }
      // 解压并定位二进制（包内根目录或一级子目录）。Windows 资产是 zip，
      // 系统自带 bsdtar（tar.exe）可直接解，不加 -z
      await jobRun(j, 'tar', WIN ? ['-xf', archPath, '-C', dir] : ['-xzf', archPath, '-C', dir], 60000);
      const exeName = WIN ? 'rtk.exe' : 'rtk';
      let newBin = join(dir, exeName);
      if (!existsSync(newBin)) {
        for (const ent of readdirSync(dir, { withFileTypes: true })) {
          const cand = join(dir, ent.name, exeName);
          if (ent.isDirectory() && existsSync(cand)) { newBin = cand; break; }
        }
      }
      if (!existsSync(newBin)) throw new Error('解压后未找到 rtk 二进制');
      if (!WIN) chmodSync(newBin, 0o755);
      const v = await binVersionOf(newBin);
      if (!v) throw new Error('新版本无法运行（--version 无输出）');
      // 放置：全新安装建目录直接放；已有旧文件则原子替换（先挪走，失败可回滚）
      if (freshInstall) mkdirSync(dirname(bin), { recursive: true });
      const backup = bin + '.rtk-old';
      try { rmSync(backup, { force: true }); } catch { /* ignore */ }
      const hadOld = existsSync(bin);
      if (hadOld) renameSync(bin, backup);
      try {
        try {
          renameSync(newBin, bin);
        } catch (renameErr) {
          // 跨文件系统（EXDEV）等 rename 失败：退化为复制（复制再失败由外层 catch 回滚）
          copyFileSync(newBin, bin);
          if (!WIN) chmodSync(bin, 0o755);
        }
      } catch (err) {
        if (hadOld && existsSync(backup)) { try { renameSync(backup, bin); } catch { /* ignore */ } }
        throw err;
      }
      try { if (existsSync(backup)) rmSync(backup, { force: true }); } catch { /* ignore */ }
      j.version = v;
      if (WIN && freshInstall) {
        const inPath = await ensureUserPathEntry(dirname(bin));
        j.output += `已安装 rtk ${v}（${bin}；PATH 需注销重登后对会话生效，插件钩子即时生效）\n`;
        if (!inPath) j.output += '注意：把 ~/.local/bin 写入用户 PATH 失败，钩子不受影响，会话里直接跑 rtk 需手动加 PATH\n';
      } else {
        j.output += freshInstall ? `已安装 rtk ${v}（${bin}）\n` : `已升级到 ${v}\n`;
      }
    } catch (err) {
      if (!j.canceled) j.error = j.timedOut ? '升级超时已终止' : String(err?.stack || err?.message || err);
    } finally {
      j.running = false;
      j.done = true;
      j.kill = null;
      if (dir) { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } }
    }
  })();
  return rtkUpgradeSnapshot();
}

// 把目录追加进用户级 PATH（HKCU\Environment，Windows）：保持原值类型不展开（REG_EXPAND_SZ
// 里的 %VAR% 引用原样保留），已含该目录则不动。不广播环境变更——运行中的进程读不到，
// 重启 ZCode 后新会话生效（rtk 钩子按固定清单找 rtk，不受 PATH 影响）。
async function ensureUserPathEntry(dir) {
  const q = await execCapture('reg', ['query', 'HKCU\\Environment', '/v', 'PATH'], 15000);
  if (!q.ok) {
    const add = await execCapture('reg', ['add', 'HKCU\\Environment', '/v', 'PATH', '/t', 'REG_EXPAND_SZ', '/d', `%USERPROFILE%\\.local\\bin`, '/f'], 15000);
    return add.ok;
  }
  const m = /PATH\s+(REG_SZ|REG_EXPAND_SZ)\s+(.*)/i.exec(q.output.replace(/\r?\n/g, ' ').trim());
  if (!m) return false;
  const cur = m[2].trim();
  const norm = (s) => s.replace(/[/\\]+/g, '\\').replace(/\\+$/, '').toLowerCase();
  const expanded = cur.replaceAll('%USERPROFILE%', homedir());
  if (expanded.split(';').some((p) => p && norm(p) === norm(dir))) return true;
  const next = cur ? `${cur};${dir}` : dir;
  const r = await execCapture('reg', ['add', 'HKCU\\Environment', '/v', 'PATH', '/t', m[1], '/d', next, '/f'], 15000);
  return r.ok;
}

// 在插件缓存里找市场插件的钩子脚本：只认 installed_plugins.json 登记的 installPath。
// 不能按目录扫描：卸载只删「当前指向」的版本目录，缓存里的历史版本目录会残留
// （升级留旧版、GitHub/本地源先后装过等），扫目录会把已卸载的插件误判为已装，
// 面板就不显示安装卡了。本地开发流（install-plugin-local.sh）同样会更新安装记录，兼容。
// 注意只认正式市场 duanluan-zcode-plugins：本地临时市场（如 duanluan-local）装的副本不在查找范围，
// 属预期限制——正式发布从 duanluan-zcode-plugins 安装后即可用。
function findMarketplaceHook(pluginName, hookRelPath) {
  const installedRaw = readJsonFile(join(cliPluginsDir(), 'installed_plugins.json'));
  for (const rec of (installedRaw?.plugins || [])) {
    if (rec?.name !== pluginName || rec?.marketplace !== ZCODE_PLUGINS_MARKETPLACE || !rec.installPath) continue;
    const hook = join(rec.installPath, hookRelPath);
    if (existsSync(hook)) return hook;
  }
  return null;
}

function findVisionHook() {
  return findMarketplaceHook('zcode-vision', join('hooks', 'vision-hook.mjs'));
}

// 读市场插件在 installed_plugins.json 里登记的版本（面板信息卡显示「插件 x.y.z」用）
function installedPluginVersion(pluginName) {
  const installedRaw = readJsonFile(join(cliPluginsDir(), 'installed_plugins.json'));
  const rec = (installedRaw?.plugins || []).find((p) => p?.name === pluginName && p?.marketplace === ZCODE_PLUGINS_MARKETPLACE);
  return rec?.version || null;
}

// —— headroom 配置读写与状态解析（与 headroom-lib.sh 共用 ~/.zcode/headroom.json）——

// 读配置并按插件默认值归一（文件缺失/键非法 → 默认）。导出以便测试脚本直接驱动。
export function readHeadroomConfig(file) {
  const raw = readJsonFile(file);
  const backend = typeof raw?.kompressBackend === 'string' ? raw.kompressBackend.trim() : '';
  const power = typeof raw?.powerSaveCpu === 'string' ? raw.powerSaveCpu.trim() : '';
  return {
    kompressBackend: /^[a-z0-9_]+$/i.test(backend) ? backend : 'auto',
    powerSaveCpu: power === 'battery' || power === 'saver' ? power : 'off',
    powerWatchInterval: clampInt(raw?.powerWatchInterval, 10, 3600, 60),
  };
}

// 写配置：与插件 hr_config_set 相同的三键整文件形状（该函数本就只保留这三个键）
function writeHeadroomConfig(file, cfg) {
  const tmp = file + '.tmp';
  writeFileSync(tmp, JSON.stringify({
    kompressBackend: cfg.kompressBackend,
    powerSaveCpu: cfg.powerSaveCpu,
    powerWatchInterval: cfg.powerWatchInterval,
  }, null, 2) + '\n', 'utf8');
  renameSync(tmp, file);
}

// —— 本体探测与升级任务的共用机制（headroom 的 pip 与 rtk 的 Releases 下载共用）——

// PATH + 常见安装位置找可执行文件
function findBinFile(names, extraCandidates) {
  const dirs = String(process.env.PATH || '').split(delimiter).filter(Boolean);
  for (const c of [...dirs.flatMap((d) => names.map((n) => join(d, n))), ...extraCandidates]) {
    try { if (existsSync(c)) return c; } catch { /* ignore */ }
  }
  return null;
}

// 执行 --version 并提取首个版本号（原样输出如 "rtk 0.49.0"、"headroom, version 0.37.0"）
async function binVersionOf(bin) {
  const r = await execCapture(bin, ['--version'], 10000);
  if (!r.ok) return null;
  const m = /(\d+(?:\.\d+){1,3}(?:[A-Za-z0-9.+-]*)?)/.exec(r.output);
  return m ? m[1] : null;
}

// 升级任务快照/创建/停止：任务在 helper 进程内后台执行，面板轮询展示进度
function upgradeJobSnapshot(j) {
  if (!j) return { running: false, done: false, canceled: false };
  return {
    running: j.running,
    done: j.done,
    canceled: j.canceled || false,
    error: j.error || null,
    version: j.version || null,
    startedAt: j.startedAt,
    output: j.output.length > 4000 ? j.output.slice(-4000) : j.output,
  };
}

function newUpgradeJob() {
  return { running: true, done: false, canceled: false, timedOut: false, error: null, version: null, output: '', startedAt: Date.now(), kill: null };
}

// 停止进行中的升级（SIGKILL 当前子进程；任务随即以 canceled 收尾，不算失败）
function cancelUpgradeJob(job) {
  if (job && job.running) {
    job.canceled = true;
    try { job.kill && job.kill(); } catch { /* ignore */ }
  }
  return upgradeJobSnapshot(job);
}

// 升级任务的可取消子进程执行：输出喂给任务对象供面板轮询，环境按用途注入代理
function jobRun(j, cmd, args, timeoutMs, scope = 'deps') {
  return new Promise((resolveRun, rejectRun) => {
    if (j.canceled) { rejectRun(new Error('canceled')); return; }
    const child = spawn(cmd, args, { env: { ...process.env, ...proxyEnv({}, scope) }, windowsHide: true });
    j.kill = () => { try { child.kill('SIGKILL'); } catch { /* ignore */ } };
    const feed = (d) => { j.output = (j.output + d.toString()).slice(-65536); };
    child.stdout.on('data', feed);
    child.stderr.on('data', feed);
    const timer = setTimeout(() => {
      j.timedOut = true;
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
    }, timeoutMs);
    child.on('error', (err) => { clearTimeout(timer); j.kill = null; rejectRun(err); });
    child.on('close', (code) => {
      clearTimeout(timer);
      j.kill = null;
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${cmd} 退出码 ${code}`));
    });
  });
}

// rtk 资产/校验和下载：有 curl 时经子进程下载（jobRun 注入 deps 代理并提供取消
// 与超时；-f 让 HTTP 错误直接失败，不会把错误页写成文件，此路径无百分比进度）。
// 无 curl 的精简 Windows 用 node fetch 流式写文件兜底：进度按 5% 一档喂给升级
// 任务，j.canceled 时立即中止（fetch 不读代理环境变量，配了代理又无 curl 的机器
// 在这条路径只能直连——与 WebDAV 同步的 fetch 兜底同一限制）
async function downloadToFile(j, url, dest, timeoutMs = 600000) {
  const curl = findCurl();
  if (curl) {
    await jobRun(j, curl,
      ['-fsSL', '--connect-timeout', '20', '--max-time', String(Math.ceil(timeoutMs / 1000)), '-o', dest, url],
      timeoutMs);
    return;
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok || !res.body) throw new Error(`下载失败 HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const out = createWriteStream(dest);
  let got = 0;
  let lastPct = -1;
  try {
    for await (const chunk of res.body) {
      if (j.canceled) throw new Error('canceled');
      if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
      got += chunk.length;
      if (total > 0) {
        const pct = Math.floor((got / total) * 100);
        if (pct >= lastPct + 5) { lastPct = pct; j.output += `下载中 ${pct}%\n`; }
      }
    }
    await new Promise((resolve, reject) => { out.end(resolve); out.once('error', reject); });
  } catch (err) {
    try { out.destroy(); } catch { /* ignore */ }
    throw err;
  }
}

// headroom 程序探测：镜像钩子 hr_find_headroom 的查找清单（PATH + 常见安装位置）
function headroomFindBin() {
  // Windows 兜底：pip 的 console script 落在各 Python 环境的 Scripts 目录（.exe），
  // Scripts 目录不一定在桌面应用的 PATH 里
  if (process.platform === 'win32') {
    const home = homedir();
    const pfRoots = [...new Set([process.env.PROGRAMFILES || 'C:\\Program Files', 'C:\\Program Files', 'C:\\ProgramFiles'])];
    const extra = [
      join(home, '.local', 'bin', 'headroom.exe'),
      join(home, 'miniforge3', 'Scripts', 'headroom.exe'),
      join(home, 'miniconda3', 'Scripts', 'headroom.exe'),
      join(home, 'anaconda3', 'Scripts', 'headroom.exe'),
    ];
    for (const pf of pfRoots) {
      extra.push(join(pf, 'miniforge3', 'Scripts', 'headroom.exe'), join(pf, 'miniconda3', 'Scripts', 'headroom.exe'));
      for (const v of ['313', '312', '311']) extra.push(join(pf, `Python${v}`, 'Scripts', 'headroom.exe'));
    }
    return findBinFile(['headroom.exe'], extra);
  }
  return findBinFile(['headroom'],
    [join(homedir(), '.local', 'bin', 'headroom'), join(homedir(), 'miniforge3', 'bin', 'headroom'),
     join(homedir(), '.cargo', 'bin', 'headroom'), '/usr/local/bin/headroom', '/usr/bin/headroom']);
}

async function headroomBinaryInfo() {
  const binPath = headroomFindBin();
  if (!binPath) return { installed: false, binPath: null, version: null };
  return { installed: true, binPath, version: await binVersionOf(binPath) };
}

// 通用命令执行（headroom 本体的 pip 检查/升级等），输出合并 stdout+stderr，
// 环境按用途注入代理（默认 deps：headroom/rtk；市场路径不走这里）
function execCapture(cmd, args, timeoutMs = 30000, scope = 'deps') {
  return new Promise((resolveRun) => {
    execFile(cmd, args, { timeout: timeoutMs, env: { ...process.env, ...proxyEnv({}, scope) }, windowsHide: true }, (err, stdout, stderr) => {
      resolveRun({
        ok: !err,
        code: err ? (err.code ?? 'error') : 0,
        error: err ? err.message : null,
        output: `${stdout || ''}${stderr && stderr.trim() ? `${stdout ? '\n' : ''}${stderr.trim()}` : ''}`.trim(),
      });
    });
  });
}

// headroom 本体（pip 安装）的升级通道：控制台脚本 shebang 指向安装它的 Python
// 解释器，检查更新与升级都通过该环境的 pip 执行（尊重用户 pip 源配置）。
function headroomPythonOf(binPath) {
  // Windows：pip console script 是 .exe（无 shebang），从所在目录推导——
  // Scripts\headroom.exe → 同环境根目录的 python.exe
  if (process.platform === 'win32') {
    const dir = dirname(binPath);
    if (basename(dir).toLowerCase() === 'scripts') {
      const py = join(dirname(dir), 'python.exe');
      if (existsSync(py)) return py;
    }
    const sibling = join(dir, 'python.exe');
    if (existsSync(sibling)) return sibling;
    return headroomFallbackPython();
  }
  // POSIX：读脚本的 shebang 行
  try {
    const first = (readFileSync(binPath, 'utf8').split('\n')[0] || '').trim();
    const m = /^#!\s*(.*python\S*)/.exec(first);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

// 找到 headroom 所属的 pip 发行版（发行版名未必是 headroom，如 headroom-ai）
const HEADROOM_DIST_PY = [
  'import importlib.metadata as m',
  'for d in m.distributions():',
  "    n = d.metadata['Name'] or ''",
  "    if 'headroom' in n.lower() or any(str(f).startswith('headroom') for f in (d.files or ())):",
  "        print(n + '\\t' + d.version); break",
].join('\n');

// 本体未装时的全新安装通道：找可用的 Python（PATH + 常见安装位置），
// 用官方发行版 headroom-ai[all] 走同一套 pip 升级任务
function headroomFallbackPython() {
  const WIN = process.platform === 'win32';
  const home = homedir();
  if (WIN) {
    const pfRoots = [...new Set([process.env.PROGRAMFILES || 'C:\\Program Files', 'C:\\Program Files', 'C:\\ProgramFiles'])];
    const extra = [
      join(home, 'miniforge3', 'python.exe'),
      join(home, 'miniconda3', 'python.exe'),
      join(home, 'anaconda3', 'python.exe'),
    ];
    for (const pf of pfRoots) {
      extra.push(join(pf, 'miniforge3', 'python.exe'), join(pf, 'miniconda3', 'python.exe'));
      for (const v of ['313', '312', '311']) extra.push(join(pf, `Python${v}`, 'python.exe'));
    }
    return findBinFile(['python.exe'], extra);
  }
  return findBinFile(['python3', 'python'],
    ['/usr/bin/python3', '/usr/local/bin/python3', join(home, '.local', 'bin', 'python3')]);
}

async function headroomPipChannel() {
  const bin = headroomFindBin();
  if (!bin) {
    const py = headroomFallbackPython();
    if (!py) return { code: 'headroom-update', error: '未找到 headroom 程序，也未找到可用的 Python（全新安装需要 Python ≥ 3.10）' };
    return { py, dist: 'headroom-ai[all]', current: null, freshInstall: true };
  }
  const py = headroomPythonOf(bin);
  if (!py) return { code: 'headroom-update', error: '无法确定 headroom 的 Python 安装来源（不是 pip 控制台脚本）' };
  const r = await execCapture(py, ['-c', HEADROOM_DIST_PY], 20000);
  if (!r.ok || !r.output.includes('\t')) {
    return { code: 'headroom-update', error: '未找到 headroom 的 pip 发行版: ' + (r.output || r.error || '').split('\n')[0] };
  }
  const [dist, current] = r.output.split('\n')[0].split('\t');
  return { py, dist, current };
}

// headroom 本体升级任务：pip install 后台执行，输出累积到任务对象供面板轮询。
// 大包下载可持续数分钟——同步等待 HTTP 会把按钮卡在“升级中”且关弹窗即失联；
// 任务状态存在 helper 进程内，重开弹窗可恢复显示。
let headroomUpgradeJob = null;

export function headroomUpgradeSnapshot() { return upgradeJobSnapshot(headroomUpgradeJob); }

function cancelHeadroomUpgrade() { return cancelUpgradeJob(headroomUpgradeJob); }

// 启动升级（已在跑则直接返回现状快照）；pip 正常结束后自动重取本体版本
function startHeadroomUpgrade(channel) {
  if (headroomUpgradeJob && headroomUpgradeJob.running) return headroomUpgradeSnapshot();
  const j = newUpgradeJob();
  headroomUpgradeJob = j;
  void (async () => {
    try {
      await jobRun(j, channel.py, ['-m', 'pip', 'install', '--upgrade', channel.dist], 10 * 60 * 1000);
      const bin = headroomFindBin();
      if (bin) j.version = await binVersionOf(bin);
    } catch (err) {
      // 手动停止（canceled）不算失败；超时给出明确提示而非裸退出码
      if (!j.canceled) j.error = j.timedOut ? '升级超时（10 分钟）已终止' : String(err?.message || err);
    } finally {
      j.running = false;
      j.done = true;
      j.kill = null;
    }
  })();
  return headroomUpgradeSnapshot();
}

// 运行 headroom 插件钩子：新版插件（≥1.2.0）是跨平台 node 入口 ensure-proxy.mjs
// （Windows 原生实现、POSIX 内部委托 ensure-proxy.sh），经 runNodeScript 跑（自动
// 处理 node/内嵌 node 回退）；旧版只有 .sh 时用 sh 直跑（仅 POSIX）。
// backend/power 写配置并立即生效，status/start/stop/restart 管理代理生命周期。
// 钩子运行注意两点：
// 1. 不注入下载代理（scope 'none'）——钩子不是安装/升级下载，代理范围开关不管它；
// 2. localhost 强制不走代理——钩子里 curl 探测 http://127.0.0.1:<端口> 判断代理
//    是否在跑，环境里残留的 http_proxy（包括 zcode-pro 自己注入的下载代理）会把
//    探测请求送进代理服务器，代理停了就把在跑的 headroom 误判成未运行，面板一直
//    卡在“正在启动”。
async function runHeadroomHook(args, timeoutMs = 30000) {
  const noProxy = ['127.0.0.1', 'localhost', process.env.NO_PROXY || process.env.no_proxy || ''].filter(Boolean).join(',');
  const hookEnv = { NO_PROXY: noProxy, no_proxy: noProxy };
  const mjs = findMarketplaceHook('headroom', join('hooks', 'ensure-proxy.mjs'));
  if (mjs) return runNodeScript([mjs, ...args], timeoutMs, 'none', hookEnv);
  const hook = findMarketplaceHook('headroom', join('hooks', 'ensure-proxy.sh'));
  if (!hook) {
    return { ok: false, code: 'headroom-plugin', error: '未找到 headroom 插件（先在插件市场安装）' };
  }
  return new Promise((resolveRun) => {
    execFile('sh', [hook, ...args], { timeout: timeoutMs, windowsHide: true, env: { ...process.env, ...hookEnv } }, (err, stdout, stderr) => {
      if (err && err.code === 'ENOENT') {
        resolveRun({ ok: false, code: 'headroom-sh', error: '未找到 sh，无法运行 headroom 插件脚本' });
        return;
      }
      resolveRun({
        ok: !err,
        code: err ? (err.code ?? 'error') : 0,
        error: err ? err.message : null,
        output: `${stdout || ''}${stderr && stderr.trim() ? `${stdout ? '\n' : ''}${stderr.trim()}` : ''}`.trim(),
      });
    });
  });
}

// 解析 ensure-proxy.sh status 输出为结构化字段（字段名以脚本 hr_status 的输出为准）。
// 导出以便测试脚本直接驱动。
export function parseHeadroomStatus(text) {
  const raw = String(text || '');
  const line = (key) => {
    const m = new RegExp('^' + key + ': *(.*)$', 'm').exec(raw);
    return m ? m[1].trim() : null;
  };
  const proxy = line('proxy') || '';
  const ps = line('power-save-auto-cpu') || '';
  return {
    up: /^up\b/.test(proxy),
    port: Number(/(\d+)\)?$/.exec(proxy)?.[1]) || null,
    managed: line('managed-by-plugin'),
    backend: line('current-backend'),
    desiredBackend: line('desired-backend'),
    powerMode: line('power-mode'),
    saverDetect: line('saver-detect'),
    watcherRunning: /^watcher: running/m.test(raw),
    saverHint: (raw.split('\n').find((l) => l.startsWith('注意：')) || '').trim() || null,
    powerSaveMode: (/^(battery|saver|off)/.exec(ps) || [])[1] || null,
    watchInterval: Number(/\(interval (\d+)s\)/.exec(ps)?.[1]) || null,
    raw,
  };
}

// —— headroom 启用开关（设置弹窗“Headroom”标签页右上角）：只切换 ZCode 供应商配置
// 里指向本地压缩代理（http://127.0.0.1:<端口>）的条目与直连上游之间的地址，绝不碰
// 代理进程——headroom 是共享程序，其他工具（如 codex）可能同时在用。
// 关闭时把条目改回直连地址（headroom 的默认转发上游），并在 zcodepro.json 的
// headroomRoutes 里记下 { 供应商 id → { proxy, direct } }；开启时按记录切回代理。
const HEADROOM_DIRECT_URL = 'https://open.bigmodel.cn/api/anthropic';
const HEADROOM_LOCAL_URL_RE = /^http:\/\/127\.0\.0\.1:\d+\/?$/;

// 扫描 v2/config.json（provider.<id>.options.baseURL）与 v2/provider_config.json
// （providerRules[].config.api.baseUrl），统计当前走本地代理的条目数
export function headroomUsageScan(dataRoot) {
  let via = 0;
  const v2 = readJsonFile(join(dataRoot, 'v2', 'config.json'));
  for (const p of Object.values((v2 && typeof v2.provider === 'object' && v2.provider) || {})) {
    const u = typeof p?.options?.baseURL === 'string' ? p.options.baseURL.trim() : '';
    if (HEADROOM_LOCAL_URL_RE.test(u)) via += 1;
  }
  const pc = readJsonFile(join(dataRoot, 'v2', 'provider_config.json'));
  for (const r of pc?.config?.providerConfigRules?.providerRules || []) {
    const u = typeof r?.config?.api?.baseUrl === 'string' ? r.config.api.baseUrl.trim() : '';
    if (HEADROOM_LOCAL_URL_RE.test(u)) via += 1;
  }
  return { enabled: via > 0, entries: via };
}

// 切换启用状态：enable=false 时 127.0.0.1 条目 → 直连（并记录）；enable=true 时按
// 记录把直连条目切回代理。改写前各留 .zcodepro-backup 备份，与同步导入同款。
export function setHeadroomUsage(dataRoot, configFile, enable) {
  const backupFile = (p) => {
    try { if (existsSync(p)) copyFileSync(p, p + '.zcodepro-backup'); } catch { /* 备份失败不阻塞 */ }
  };
  const atomicWrite = (p, obj) => {
    const tmp = p + '.zcodepro-tmp';
    writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
    renameSync(tmp, p);
  };
  const v2File = join(dataRoot, 'v2', 'config.json');
  const pcFile = join(dataRoot, 'v2', 'provider_config.json');
  const v2 = readJsonFile(v2File);
  const pc = readJsonFile(pcFile);
  if (!v2 && !pc) return { ok: false, code: 'headroom-provider-config', error: '未找到 ZCode 供应商配置（v2/config.json）' };

  const config = loadConfig(configFile);
  const routes = { ...(config.headroomRoutes || {}) };
  let changed = 0;
  // 供应商 id 来自配置文件，跳过保留键：对普通对象按 ["__proto__"] 赋值改的是原型，
  // 不是自有属性，记录会悄悄丢失
  const reserved = (id) => id === '__proto__' || id === 'constructor' || id === 'prototype';
  const apply = (get, set, id) => {
    const u = get();
    if (!enable && HEADROOM_LOCAL_URL_RE.test(u)) {
      routes[id] = { proxy: u, direct: HEADROOM_DIRECT_URL };
      set(HEADROOM_DIRECT_URL);
      changed += 1;
      return true;
    }
    if (enable && routes[id] && u === routes[id].direct) {
      set(routes[id].proxy);
      changed += 1;
      return true;
    }
    return false;
  };

  if (v2 && v2.provider && typeof v2.provider === 'object') {
    let touched = false;
    for (const [id, p] of Object.entries(v2.provider)) {
      if (reserved(id) || !p || typeof p !== 'object' || !p.options || typeof p.options !== 'object') continue;
      const u = typeof p.options.baseURL === 'string' ? p.options.baseURL.trim() : '';
      if (apply(() => u, (v) => { p.options.baseURL = v; }, id)) touched = true;
    }
    if (touched) { backupFile(v2File); atomicWrite(v2File, v2); }
  }
  if (Array.isArray(pc?.config?.providerConfigRules?.providerRules)) {
    let touched = false;
    for (const r of pc.config.providerConfigRules.providerRules) {
      const id = typeof r?.providerId === 'string' ? r.providerId : '';
      const api = r?.config?.api;
      if (!id || reserved(id) || !api || typeof api.baseUrl !== 'string') continue;
      const u = api.baseUrl.trim();
      if (apply(() => u, (v) => { api.baseUrl = v; }, id)) touched = true;
    }
    if (touched) { backupFile(pcFile); atomicWrite(pcFile, pc); }
  }
  config.headroomRoutes = routes;
  saveConfig(configFile, config);
  return { ok: true, changed };
}

// 用 node 跑脚本：优先 PATH 里的 node；桌面环境没有时用自身进程
// （zcode-pro 本就跑在 ELECTRON_RUN_AS_NODE=1 的 ZCode 二进制上）。导出以便测试。
// scope 默认 deps（headroom、rtk 的安装与升级）；插件市场的 zcode CLI 传 plugins；
// extraEnv 是调用方要额外覆盖的环境变量（如 NO_PROXY）
export function runNodeScript(scriptArgs, timeoutMs = 120000, scope = 'deps', extraEnv = {}) {
  const attempt = (cmd, runEnv) => new Promise((resolveRun) => {
    execFile(cmd, scriptArgs, { timeout: timeoutMs, env: { ...process.env, ...proxyEnv({}, scope), ...extraEnv, ...runEnv }, windowsHide: true }, (err, stdout, stderr) => {
      if (err && err.code === 'ENOENT') { resolveRun(null); return; }
      resolveRun({
        ok: !err,
        code: err ? (err.code ?? 'error') : 0,
        error: err ? err.message : null,
        output: `${stdout || ''}${stderr && stderr.trim() ? `${stdout ? '\n' : ''}${stderr.trim()}` : ''}`.trim(),
      });
    });
  });
  return attempt('node', {}).then((r) => r || attempt(process.execPath, { ELECTRON_RUN_AS_NODE: '1' }));
}

// ZCode CLI bundle（plugins 子命令入口）：优先从定位到的 ZCode 可执行文件推导
// （paths.mjs 覆盖 --zcode-path/环境变量/平台默认位置/Windows 注册表，含
// C:\Program Files\ZCode 安装），再退回常见安装位置，可用环境变量覆盖
function zcodeCliBundleCandidates() {
  const fromExe = [];
  try {
    const exe = resolveZcodeExecutable();
    if (exe) fromExe.push(join(dirname(exe), 'resources', 'glm', 'zcode.cjs'));
  } catch { /* 未找到 ZCode 可执行文件时走静态候选 */ }
  return [
    process.env.ZCODEPRO_ZCODE_CLI,
    ...fromExe,
    '/opt/ZCode/resources/glm/zcode.cjs',
    '/usr/lib/zcode/resources/glm/zcode.cjs',
    '/usr/share/zcode/resources/glm/zcode.cjs',
    '/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs',
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Programs', 'ZCode', 'resources', 'glm', 'zcode.cjs') : null,
    process.env.PROGRAMFILES ? join(process.env.PROGRAMFILES, 'ZCode', 'resources', 'glm', 'zcode.cjs') : null,
  ].filter(Boolean);
}

// 运行 zcode CLI 子命令（plugins …，走 plugins 代理范围）
function runZcodeCli(subArgs, timeoutMs = 120000) {
  const bundle = zcodeCliBundleCandidates().find((c) => existsSync(c));
  if (!bundle) {
    return Promise.resolve({ ok: false, code: 'cli-not-found', error: '未找到 ZCode CLI（resources/glm/zcode.cjs）' });
  }
  return runNodeScript([bundle, ...subArgs], timeoutMs, 'plugins');
}

// 比对市场清单与已装清单：每个插件的已装版本与最新版本。导出以便测试。
export function pluginUpdateStatus() {
  const installedRaw = readJsonFile(join(cliPluginsDir(), 'installed_plugins.json'));
  const mine = new Map();
  for (const p of installedRaw?.plugins || []) {
    if (p?.marketplace === ZCODE_PLUGINS_MARKETPLACE && p.name) mine.set(p.name, p.version || '');
  }
  const mkt = readJsonFile(join(cliPluginsDir(), 'marketplaces', ZCODE_PLUGINS_MARKETPLACE, 'marketplace.json'));
  if (!mkt || !Array.isArray(mkt.plugins)) return null;
  const plugins = mkt.plugins.map((e) => ({
    name: e.name,
    latest: e.version || '',
    installed: mine.get(e.name) || null,
    hasUpdate: mine.has(e.name) && mine.get(e.name) !== (e.version || ''),
  }));
  return { plugins, updates: plugins.filter((e) => e.hasUpdate) };
}

// 市场未添加时自动补装（新机器上设置面板的“安装/更新”按钮一键可用）：
// 读 known_marketplaces.json 判断，缺失则跑 plugins marketplace add。
// 失败 30 分钟内不重试（add 是 git clone，GitHub 不通时每次面板请求都会白等
// 最长 120 秒）；返回 null = 已存在无需处理，{ ok, cached } = 执行或跳过了 add。
let lastMarketplaceAddFail = 0;
async function ensureZcodePluginsMarketplace() {
  const known = readJsonFile(join(cliPluginsDir(), 'known_marketplaces.json'));
  const ids = new Set((known?.marketplaces || []).map((m) => m?.id).filter(Boolean));
  if (ids.has(ZCODE_PLUGINS_MARKETPLACE)) return null;
  if (Date.now() - lastMarketplaceAddFail < 30 * 60 * 1000) return { ok: false, cached: true, error: '上次添加市场失败，30 分钟内不再自动重试' };
  const r = await runZcodeCli(['plugins', 'marketplace', 'add', ZCODE_PLUGINS_MARKETPLACE_SOURCE], 120000);
  if (!r.ok) lastMarketplaceAddFail = Date.now();
  return { ok: r.ok, output: r.output, error: r.error };
}

// 读全局提示词（~/.zcode/AGENTS.md）；文件不存在视为空内容。
export function readAgents(agentsFile) {
  try {
    return [200, { ok: true, content: existsSync(agentsFile) ? readFileSync(agentsFile, 'utf8') : '' }];
  } catch (err) {
    return [500, { ok: false, code: 'agents-read', error: '读取 AGENTS.md 失败: ' + (err?.message || err) }];
  }
}

// 写全局提示词：覆盖前备份，临时文件 + 改名原子写；内容为空时移除文件（= 无全局提示词）。
// 导出以便测试脚本直接驱动。
export function writeAgents(body, agentsFile) {
  if (!body || typeof body.content !== 'string') {
    return [400, { ok: false, code: 'invalid-content', error: 'content 必须是字符串' }];
  }
  const empty = body.content.trim() === '';
  try {
    if (existsSync(agentsFile)) {
      try { copyFileSync(agentsFile, agentsFile + '.zcodepro-backup'); } catch { /* 备份失败不阻塞 */ }
      if (empty) {
        unlinkSync(agentsFile);
        return [200, { ok: true, content: '' }];
      }
    } else if (empty) {
      return [200, { ok: true, content: '' }];
    }
    const tmp = agentsFile + '.zcodepro-tmp';
    writeFileSync(tmp, body.content, 'utf8');
    renameSync(tmp, agentsFile);
  } catch (err) {
    return [500, { ok: false, code: 'agents-write', error: '写入 AGENTS.md 失败: ' + (err?.message || err) }];
  }
  return [200, { ok: true, content: body.content }];
}

// 在系统文件管理器中定位文件：
// Linux 走 freedesktop FileManager1.ShowItems（Dolphin/Nautilus 均支持），无会话服务时回退打开所在目录；
// macOS 用 open -R；Windows 用 explorer /select。导出以便测试脚本直接驱动。
export function revealInFileManager(rawPath) {
  return new Promise((resolveReveal) => {
    const p = typeof rawPath === 'string' ? rawPath.trim() : '';
    if (!p || !isAbsolute(p)) {
      resolveReveal([400, { ok: false, code: 'invalid-path', error: '无效的路径' }]);
      return;
    }
    if (process.platform === 'darwin') {
      execFile('open', ['-R', p], { timeout: 5000 }, (err) => resolveReveal(err ? [500, { ok: false, error: err.message }] : [200, { ok: true }]));
      return;
    }
    if (process.platform === 'win32') {
      const child = spawn('explorer.exe', ['/select,' + p], { detached: true, stdio: 'ignore' });
      child.on('error', (err) => resolveReveal([500, { ok: false, error: err.message }]));
      child.on('close', () => resolveReveal([200, { ok: true }]));
      return;
    }
    const uri = pathToFileURL(p).href;
    execFile('dbus-send', ['--session', '--print-reply', '--dest=org.freedesktop.FileManager1', '/org/freedesktop/FileManager1', 'org.freedesktop.FileManager1.ShowItems', `array:string:${uri}`, 'string:'], { timeout: 5000 }, (err) => {
      if (!err) {
        resolveReveal([200, { ok: true }]);
        return;
      }
      // 无 freedesktop 文件管理器服务时退而打开所在目录
      execFile('xdg-open', [dirname(p)], { timeout: 5000 }, (err2) => resolveReveal(err2 ? [500, { ok: false, error: err2.message }] : [200, { ok: true }]));
    });
  });
}

// 在系统文件管理器中打开文件夹本身（与 revealInFileManager 的定位不同）。
// macOS 用 open；Windows 用 explorer；Linux 用 xdg-open。导出以便测试脚本直接驱动。
export function openFolder(rawPath) {
  return new Promise((resolveOpen) => {
    const p = typeof rawPath === 'string' ? rawPath.trim() : '';
    if (!p || !isAbsolute(p)) {
      resolveOpen([400, { ok: false, code: 'invalid-path', error: '无效的路径' }]);
      return;
    }
    try {
      if (!existsSync(p) || !statSync(p).isDirectory()) {
        resolveOpen([400, { ok: false, code: 'not-found', error: '文件夹不存在' }]);
        return;
      }
    } catch (err) {
      resolveOpen([500, { ok: false, error: err?.message || String(err) }]);
      return;
    }
    const done = (err) => resolveOpen(err ? [500, { ok: false, error: err.message }] : [200, { ok: true }]);
    if (process.platform === 'darwin') execFile('open', [p], { timeout: 5000 }, done);
    else if (process.platform === 'win32') {
      const child = spawn('explorer.exe', [p], { detached: true, stdio: 'ignore' });
      child.on('error', done);
      child.on('close', () => done(null));
    } else execFile('xdg-open', [p], { timeout: 5000 }, done);
  });
}

// 用系统默认应用打开文件（或文件夹）：macOS 用 open；Windows 用 explorer；
// Linux 用 xdg-open。导出以便测试脚本直接驱动。
export function openWithDefaultApp(rawPath) {
  return new Promise((resolveOpen) => {
    const p = typeof rawPath === 'string' ? rawPath.trim() : '';
    if (!p || !isAbsolute(p)) {
      resolveOpen([400, { ok: false, code: 'invalid-path', error: '无效的路径' }]);
      return;
    }
    if (!existsSync(p)) {
      resolveOpen([400, { ok: false, code: 'not-found', error: '文件不存在' }]);
      return;
    }
    const done = (err) => resolveOpen(err ? [500, { ok: false, error: err.message }] : [200, { ok: true }]);
    if (process.platform === 'darwin') execFile('open', [p], { timeout: 5000 }, done);
    else if (process.platform === 'win32') {
      const child = spawn('explorer.exe', [p], { detached: true, stdio: 'ignore' });
      child.on('error', done);
      child.on('close', () => done(null));
    } else execFile('xdg-open', [p], { timeout: 5000 }, done);
  });
}

// 设置/清除项目自定义别名（纯渲染层，不动磁盘与任何 ZCode 数据）。
// alias 传空字符串/null 即清除该项目条目。
export function setAlias(body, configFile) {
  const raw = typeof body?.path === 'string' ? body.path.trim() : '';
  // 先校验再 resolve：resolve 会把相对路径悄悄变绝对，绕过校验
  if (!raw || !isAbsolute(raw)) return [400, { ok: false, error: '无效的项目路径' }];
  const path = resolve(raw);
  const name = typeof body?.alias === 'string' ? body.alias.trim() : '';
  if (name) {
    if (name.length > 100) return [400, { ok: false, error: '别名过长（最多 100 字符）', code: 'name-too-long' }];
    if (/[\r\n\0]/.test(name)) return [400, { ok: false, error: '别名不能包含换行等控制字符', code: 'name-invalid-chars' }];
  }
  const config = loadConfig(configFile);
  if (!config.aliases || typeof config.aliases !== 'object') config.aliases = {};
  if (name) config.aliases[path] = name;
  else delete config.aliases[path];
  try {
    saveConfig(configFile, config);
  } catch (err) {
    return [500, { ok: false, code: 'config-save', error: '保存配置失败: ' + (err?.message || err) }];
  }
  return [200, { ok: true, path, alias: name, aliases: config.aliases }];
}

function invalidProjectName(name) {
  if (typeof name !== 'string') return '名称必须是字符串';
  const n = name.trim();
  if (!n) return '名称不能为空';
  if (n === '.' || n === '..') return '名称不能是 . 或 ..';
  if (n.length > 100) return '名称过长（最多 100 字符）';
  if (/[\\/:*?"<>|\0]/.test(n)) return '名称不能包含 \\ / : * ? " < > | 等字符';
  if (/^\s|\s$/.test(name)) return '名称首尾不能有空格';
  return null;
}

// 修改项目位置：把项目的记录（最近项目/标签页/任务索引/别名）重新指向另一个文件夹。
// 不移动、不修改任何目录；目标文件夹必须已存在。导出以便测试脚本直接驱动。
export async function relocateProject(body, dataRoot) {
  const rawOld = typeof body?.path === 'string' ? body.path.trim() : '';
  const rawNew = typeof body?.newPath === 'string' ? body.newPath.trim() : '';
  if (!rawOld || !isAbsolute(rawOld)) return [400, { ok: false, error: '无效的项目路径' }];
  if (!rawNew || !isAbsolute(rawNew)) return [400, { ok: false, code: 'invalid-path', error: '无效的新位置' }];
  const norm = (p) => p.replace(/[\\/]+$/, '');
  const oldPath = resolve(rawOld);
  const newPath = resolve(rawNew);
  if (norm(newPath) === norm(oldPath)) return [400, { ok: false, code: 'same-path', error: '新位置与当前位置相同' }];
  const nameError = invalidProjectName(basename(norm(newPath)));
  if (nameError) return [400, { ok: false, code: 'invalid-path', error: nameError }];
  // 数据目录护栏：不得指向 ZCode 数据目录内部（优先于存在性检查）
  if (newPath === dataRoot || newPath.startsWith(norm(dataRoot) + sep)) {
    return [400, { ok: false, code: 'protected-path', error: '拒绝指向 ZCode 数据目录内部路径' }];
  }

  let isDir = false;
  try { isDir = existsSync(newPath) && statSync(newPath).isDirectory(); } catch { /* ignore */ }
  if (!isDir) return [404, { ok: false, code: 'new-not-found', error: '目标文件夹不存在: ' + newPath }];

  // 任务索引：存在且有驱动时同步。先预检写锁——任何写入前发现拿不到锁直接失败。
  const indexFile = taskIndexPath(dataRoot);
  const indexExists = existsSync(indexFile);
  const syncIndex = indexExists && (await taskIndexDriverAvailable());
  if (syncIndex) {
    try {
      await probeTaskIndexWritable(dataRoot);
    } catch (err) {
      return [503, { ok: false, code: err.code || 'index-error', error: String(err?.message || err) }];
    }
  }

  // setting.json 路径引用同步（recentProjects / lastWorkspaceSession / webRemoteControl…）
  const settingsFile = join(dataRoot, 'v2', 'setting.json');
  try {
    const settings = readSettings(settingsFile);
    writeSettingsAtomic(settingsFile, remapSettingsPaths(settings, oldPath, newPath));
  } catch (err) {
    return [500, { ok: false, error: '更新 setting.json 失败: ' + (err?.message || err) }];
  }

  // 任务索引同步；失败则回滚 setting.json，保持两边一致
  if (syncIndex) {
    try {
      await remapTaskIndexPaths(dataRoot, oldPath, newPath);
    } catch (err) {
      try {
        const cur = readSettings(settingsFile);
        writeSettingsAtomic(settingsFile, remapSettingsPaths(cur, newPath, oldPath));
      } catch { /* 回滚失败：setting.json.zcodepro-backup 仍有兜底 */ }
      return [500, {
        ok: false,
        code: err.code || 'index-remap-failed',
        error: '更新任务索引失败（已回滚配置更新）: ' + (err?.message || err),
      }];
    }
  }

  // 别名随迁（仅渲染层数据，失败不影响结果）
  try {
    const config = loadConfig(join(dataRoot, 'zcodepro.json'));
    const aliases = config.aliases || {};
    if (Object.prototype.hasOwnProperty.call(aliases, oldPath)) {
      const v = aliases[oldPath];
      delete aliases[oldPath];
      aliases[newPath] = v;
      saveConfig(join(dataRoot, 'zcodepro.json'), config);
    }
  } catch { /* ignore */ }

  return [200, {
    ok: true,
    oldPath,
    newPath,
    reload: true,
    indexSynced: syncIndex || !indexExists,
    ...(indexExists && !syncIndex
      ? { warning: '任务索引未更新：本机缺少 SQLite 支持（需 Node ≥23.4 或 sqlite3 命令），旧任务条目可能仍指向旧路径。' }
      : {}),
  }];
}
