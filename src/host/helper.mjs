// 本地辅助服务：注入到页面里的增强脚本通过 http://127.0.0.1:<port> 调用这里，
// 完成文件系统操作（页面沙箱内做不了的事）与配置持久化。
// 仅绑定 127.0.0.1，并通过每次启动随机生成的 token 鉴权。

import { createServer } from 'node:http';
import { execFile, spawn } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises'; // 注意：fs 的 mkdtemp 是回调版，await 它会把 undefined 当回调
import { basename, delimiter, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { readSettings, writeSettingsAtomic, remapSettingsPaths, isProjectOpenInTabs } from './settings.mjs';
import { taskIndexPath, probeTaskIndexWritable, remapTaskIndexPaths, taskIndexDriverAvailable } from './taskIndex.mjs';
import { pickFolderSystem } from './pickFolder.mjs';
import { reorderWorkspaceTasks, reorderGroupMembers } from './taskOrder.mjs';

const VERSION = '0.12.0';

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

// 本插件市场（zcode-plugins 仓库）在 ZCode CLI 数据目录里的落点
const ZCODE_PLUGINS_MARKETPLACE = 'duanluan-zcode-plugins';

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
    },
    // 样式调整（设置弹窗「样式调整」标签页）。null = 不覆盖，跟随应用默认。
    styles: {
      rowGap: null,           // 段落间距：会话内各块之间的垂直间距（应用默认 20px）
      listSpacing: null,      // 列表上下留白（应用默认 12px）
      listItemSpacing: null,  // 列表项之间的间距（应用默认 6px）
      quoteCodeSpacing: null, // 引用/代码块上下留白（应用默认 16px，my-4）
      lineHeight: null,       // 回答行高，倍数（应用默认 1.75）
      userLineHeight: null,   // 提问行高，倍数（应用默认 1.5）
      contentWidth: null,     // 内容宽度：{ value, unit }，unit 为 'px'（320–3840）或 '%'（20–100）
    },
    // 项目路径（规范化，无尾分隔符）→ 自定义别名。只影响界面渲染，不改动任何真实数据。
    aliases: {},
    // HTTP 代理（http(s)://host:port）：helper 发起的网络访问走它——插件市场更新/安装
    // （zcode CLI → git）、headroom 本体的检查更新与升级（pip）。空 = 不用代理。
    proxy: '',
  };
}

export function loadConfig(configFile) {
  try {
    if (!existsSync(configFile)) return defaultConfig();
    const saved = JSON.parse(readFileSyncText(configFile));
    return {
      ...defaultConfig(),
      ...saved,
      features: { ...defaultConfig().features, ...(saved.features || {}) },
      styles: { ...defaultConfig().styles, ...(saved.styles && typeof saved.styles === 'object' ? saved.styles : {}) },
      aliases: { ...((saved.aliases && typeof saved.aliases === 'object') ? saved.aliases : {}) },
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

// 软件代理（设置弹窗「代理」标签页）：helper 发起的网络访问（zcode CLI→git、pip）
// 统一走这里；startHelper 启动时读配置，保存代理时即时更新
let activeProxyUrl = '';

function proxyEnv(extra = {}) {
  if (!activeProxyUrl) return extra;
  return {
    HTTP_PROXY: activeProxyUrl, HTTPS_PROXY: activeProxyUrl,
    http_proxy: activeProxyUrl, https_proxy: activeProxyUrl,
    ...extra,
  };
}

export function startHelper({ port, token, dataRoot, state, agentsFile = defaultAgentsFile() }) {
  const configFile = join(dataRoot, 'zcodepro.json');
  const settingsFile = join(dataRoot, 'v2', 'setting.json');
  activeProxyUrl = String(loadConfig(configFile).proxy || '').trim();

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
        if (body && typeof body === 'object' && body.features && typeof body.features === 'object') {
          for (const key of Object.keys(defaultConfig().features)) {
            if (typeof body.features[key] === 'boolean') current.features[key] = body.features[key];
          }
        }
        if (body && typeof body === 'object' && body.styles && typeof body.styles === 'object') {
          if (!current.styles || typeof current.styles !== 'object') current.styles = {};
          // 各样式键：null 恢复默认；px 类 0–96 取整；行距 0.8–4 保留两位小数
          for (const key of ['rowGap', 'listSpacing', 'listItemSpacing', 'quoteCodeSpacing']) {
            if (key in body.styles) {
              const v = body.styles[key];
              if (v === null) current.styles[key] = null;
              else if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 96) current.styles[key] = Math.round(v);
            }
          }
          if ('lineHeight' in body.styles) {
            const v = body.styles.lineHeight;
            if (v === null) current.styles.lineHeight = null;
            else if (typeof v === 'number' && Number.isFinite(v) && v >= 0.8 && v <= 4) current.styles.lineHeight = Math.round(v * 100) / 100;
          }
          if ('userLineHeight' in body.styles) {
            const v = body.styles.userLineHeight;
            if (v === null) current.styles.userLineHeight = null;
            else if (typeof v === 'number' && Number.isFinite(v) && v >= 0.8 && v <= 4) current.styles.userLineHeight = Math.round(v * 100) / 100;
          }
          if ('contentWidth' in body.styles) {
            const v = body.styles.contentWidth;
            const ok = v && (v.unit === 'px' || v.unit === '%') && typeof v.value === 'number' && Number.isFinite(v.value)
              && v.value >= (v.unit === 'px' ? 320 : 20) && v.value <= (v.unit === 'px' ? 3840 : 100);
            if (v === null) current.styles.contentWidth = null;
            else if (ok) current.styles.contentWidth = { value: v.unit === 'px' ? Math.round(v.value) : Math.round(v.value * 10) / 10, unit: v.unit };
          }
        }
        saveConfig(configFile, current);
        json(res, 200, { ok: true, config: current });
        return;
      }
      // 全局提示词（~/.zcode/AGENTS.md）：设置弹窗「全局提示词」标签页读写
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
      // 用系统默认应用打开文件（会话文件菜单的「默认应用打开」；
      // 新版 ZCode 桥已不再暴露 openExternalFile，改由 helper 代开）
      if (req.method === 'POST' && url.pathname === '/open-path') {
        const body = await readBody(req);
        json(res, ...await openWithDefaultApp(body?.path));
        return;
      }
      // 在系统文件管理器中打开文件夹（项目「更多」菜单的「打开文件夹」）
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
      // —— zcode-vision 插件（图片视觉代理）：设置弹窗「视觉代理」标签页读写 ————
      if (req.method === 'GET' && url.pathname === '/vision') {
        const file = defaultVisionFile();
        const parsed = readJsonFile(file);
        if (parsed === null && existsSync(file)) {
          json(res, 500, { ok: false, code: 'vision-read', error: 'zcode-vision.json 不是合法 JSON' });
          return;
        }
        json(res, 200, { ok: true, config: parsed, file });
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
      // 供应商下拉取数（视觉代理「供应商」组合框用）：合并两张供应商表，只回 id/名称/别名，不含密钥
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
      // —— zcode-rtk 插件（命令输出压缩）：设置弹窗「rtk 压缩」标签页读写 ——
      // 状态目录与文件格式由 rtk 插件钩子定义：mode（hint|off）、whitelist（每行 name 或 git:name）
      if (req.method === 'GET' && url.pathname === '/rtk') {
        const dir = defaultRtkDir();
        const mode = readRtkMode(join(dir, 'mode'));
        const info = await rtkBinaryInfo();
        // rtkBinaryInfo 走 PATH 命中时 binPath 是命令名；换绝对路径用于面板展示
        json(res, 200, {
          ok: true, mode, whitelist: readRtkWhitelist(join(dir, 'whitelist')),
          dir, ...readRtkBuiltinWhitelist(), ...info,
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
      // —— headroom 插件（本地压缩代理）：设置弹窗「Headroom 省流」标签页读写 ——
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
        const hook = findMarketplaceHook('headroom', join('hooks', 'ensure-proxy.sh'));
        // 插件版本取自缓存目录名（…/headroom/1.0.2/hooks/…）
        const vm = hook ? /[/\\]headroom[/\\](\d+(?:\.\d+){0,3})[/\\]/.exec(hook) : null;
        json(res, 200, {
          ok: true, config, file, hook,
          pluginVersion: vm ? vm[1] : null,
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
          json(res, 400, { ok: false, code: 'invalid-request', error: 'body 需包含 action/backend/power/interval 之一' });
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
        const results = [];
        for (const [name, targetUrl] of targets) {
          results.push(await new Promise((resolveT) => {
            const started = Date.now();
            execFile('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '8', '-x', proxy, targetUrl],
              { timeout: 10000 }, (err, stdout) => {
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
      // —— zcode-plugins 市场更新：读状态（带 30 分钟节流的市场同步）与执行更新 ————
      if (req.method === 'GET' && url.pathname === '/plugins/status') {
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
            } else if (!p.installed && (body?.installMissing || only)) {
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
    if (!names.has(n)) return [null, `链中代理「${n}」未在 proxies 里定义`];
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
    execFile(cmd, ['--version'], { timeout: 5000 }, (err, stdout) => {
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
  return findBinFile(
    process.platform === 'win32' ? ['rtk.exe', 'rtk.cmd'] : ['rtk'],
    [join(homedir(), '.local', 'bin', 'rtk'), join(homedir(), 'miniforge3', 'bin', 'rtk'),
     '/usr/local/bin/rtk', '/usr/bin/rtk']);
}

// 最新版本探测（两条互补通道，任一成功即用）：
// ① releases/latest 的 302 重定向拿 tag——不受 API 速率限制，但 github.com 网页在
//    部分网络直连不通（超时）；② 匿名 GitHub API——直连常可用，但走代理时出口 IP
//    常被限流（403 无 tag_name）。资产与 checksums 的下载地址按官方命名规则构造。
async function rtkLatestInfo() {
  const assetName = rtkAssetName();
  if (!assetName) return { code: 'rtk-update', error: '当前平台不支持自动升级' };
  const mkInfo = (tag) => {
    const base = `https://github.com/rtk-ai/rtk/releases/download/v${tag}`;
    return { tag, assetName, assetUrl: `${base}/${assetName}`, sumsUrl: `${base}/checksums.txt` };
  };
  let redirErr = '';
  const redir = await execCapture('curl', ['-sS', '-o', '/dev/null', '-w', '%{url_effective}', '-L', '--max-time', '6',
    'https://github.com/rtk-ai/rtk/releases/latest'], 8000);
  if (redir.ok) {
    const m = /\/tag\/v?(\d[\w.+-]*)\s*$/.exec(redir.output.trim());
    if (m) return mkInfo(m[1]);
    redirErr = '重定向未携带版本';
  } else {
    redirErr = (redir.output || redir.error || '').split('\n').slice(-1)[0];
  }
  const api = await execCapture('curl', ['-s', '--max-time', '8',
    'https://api.github.com/repos/rtk-ai/rtk/releases/latest'], 10000);
  if (api.ok) {
    try {
      const tag = String((JSON.parse(api.output) || {}).tag_name || '').replace(/^v/, '');
      if (tag) return mkInfo(tag);
    } catch { /* 落到统一报错 */ }
  }
  return { code: 'rtk-update', error: '查询 GitHub Releases 失败（可尝试在「代理」标签页设置代理）。重定向: ' + redirErr };
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

// 启动 rtk 本体升级（后台任务，面板经 GET /rtk/upgrade 轮询）：
// 下载资产与 checksums → sha256 校验 → 解压 → 试运行 → 原子替换旧二进制
function startRtkUpgrade() {
  if (rtkUpgradeJob && rtkUpgradeJob.running) return rtkUpgradeSnapshot();
  const j = newUpgradeJob();
  rtkUpgradeJob = j;
  void (async () => {
    let dir = null;
    let bin = null;
    try {
      if (process.platform === 'win32') throw new Error('Windows 暂不支持自动升级，请手动下载 Release 覆盖安装');
      bin = rtkFindBin();
      if (!bin) throw new Error('未找到 rtk 程序');
      const info = await rtkLatestInfo();
      if (info.code) throw new Error(info.error);
      dir = await mkdtemp(join(tmpdir(), 'rtk-upgrade-'));
      j.output += `下载 ${info.assetName}…\n`;
      const archPath = join(dir, info.assetName);
      await jobRun(j, 'curl', ['-L', '--fail', '--progress-bar', '-o', archPath, info.assetUrl], 600000);
      // sha256 校验（checksums.txt 与本机摘要工具；失败即中止，不替换）
      if (info.sumsUrl) {
        const sumPath = join(dir, 'checksums.txt');
        await jobRun(j, 'curl', ['-sL', '--fail', '-o', sumPath, info.sumsUrl], 30000);
        const want = readFileSync(sumPath, 'utf8').split('\n')
          .find((l) => l.trim().endsWith(info.assetName))?.trim().split(/\s+/)[0];
        const sumCmd = process.platform === 'darwin' ? 'shasum' : 'sha256sum';
        const sumArgs = process.platform === 'darwin' ? ['-a', '256', archPath] : [archPath];
        const local = await execCapture(sumCmd, sumArgs, 30000);
        const got = local.ok ? (local.output.split(/\s+/)[0] || '') : '';
        if (!want || !got || want.toLowerCase() !== got.toLowerCase()) {
          throw new Error(`sha256 校验失败（期望 ${want || '?'}，实际 ${got || '?'}）`);
        }
        j.output += 'sha256 校验通过\n';
      }
      // 解压并定位二进制（包内根目录或一级子目录）
      await jobRun(j, 'tar', ['-xzf', archPath, '-C', dir], 60000);
      let newBin = join(dir, 'rtk');
      if (!existsSync(newBin)) {
        for (const ent of readdirSync(dir, { withFileTypes: true })) {
          const cand = join(dir, ent.name, 'rtk');
          if (ent.isDirectory() && existsSync(cand)) { newBin = cand; break; }
        }
      }
      if (!existsSync(newBin)) throw new Error('解压后未找到 rtk 二进制');
      chmodSync(newBin, 0o755);
      const v = await binVersionOf(newBin);
      if (!v) throw new Error('新版本无法运行（--version 无输出）');
      // 原子替换：旧文件先挪走，失败可回滚
      const backup = bin + '.rtk-old';
      try { rmSync(backup, { force: true }); } catch { /* ignore */ }
      renameSync(bin, backup);
      try {
        try {
          renameSync(newBin, bin);
        } catch (renameErr) {
          // 跨文件系统（EXDEV）等 rename 失败：退化为复制（复制再失败由外层 catch 回滚）
          copyFileSync(newBin, bin);
          chmodSync(bin, 0o755);
        }
      } catch (err) {
        renameSync(backup, bin);
        throw err;
      }
      try { rmSync(backup, { force: true }); } catch { /* ignore */ }
      j.version = v;
      j.output += `已升级到 ${v}\n`;
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

// 在插件缓存里找市场插件的钩子脚本（取版本号最大的目录，按数值比较，0.10.0 > 0.9.0）。
// 只认纯数字版本目录：手动安装/升级的残留（如 1.0.2.bak-1.0.2）内容不全，不能选中。
// 注意只认正式市场 duanluan-zcode-plugins：本地临时市场（如 duanluan-local）装的副本不在查找范围，
// 属预期限制——正式发布从 duanluan-zcode-plugins 安装后即可用。
function findMarketplaceHook(pluginName, hookRelPath) {
  const base = join(cliPluginsDir(), 'cache', ZCODE_PLUGINS_MARKETPLACE, pluginName);
  try {
    const versions = readdirSync(base)
      .filter((d) => /^\d+(\.\d+){0,3}$/.test(d))
      .sort((a, b) => {
        const pa = a.split('.').map(Number);
        const pb = b.split('.').map(Number);
        for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
        return 0;
      });
    for (let i = versions.length - 1; i >= 0; i--) {
      const hook = join(base, versions[i], hookRelPath);
      if (existsSync(hook)) return hook;
    }
  } catch { /* ignore */ }
  return null;
}

function findVisionHook() {
  return findMarketplaceHook('zcode-vision', join('hooks', 'vision-hook.mjs'));
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

// 升级任务的可取消子进程执行：输出喂给任务对象供面板轮询，环境注入代理
function jobRun(j, cmd, args, timeoutMs) {
  return new Promise((resolveRun, rejectRun) => {
    if (j.canceled) { rejectRun(new Error('canceled')); return; }
    const child = spawn(cmd, args, { env: { ...process.env, ...proxyEnv() } });
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

// headroom 程序探测：镜像钩子 hr_find_headroom 的查找清单（PATH + 常见安装位置）
function headroomFindBin() {
  return findBinFile(
    process.platform === 'win32' ? ['headroom.exe', 'headroom.cmd'] : ['headroom'],
    [join(homedir(), '.local', 'bin', 'headroom'), join(homedir(), 'miniforge3', 'bin', 'headroom'),
     join(homedir(), '.cargo', 'bin', 'headroom'), '/usr/local/bin/headroom', '/usr/bin/headroom']);
}

async function headroomBinaryInfo() {
  const binPath = headroomFindBin();
  if (!binPath) return { installed: false, binPath: null, version: null };
  return { installed: true, binPath, version: await binVersionOf(binPath) };
}

// 通用命令执行（headroom 本体的 pip 检查/升级用），输出合并 stdout+stderr
function execCapture(cmd, args, timeoutMs = 30000) {
  return new Promise((resolveRun) => {
    execFile(cmd, args, { timeout: timeoutMs, env: { ...process.env, ...proxyEnv() } }, (err, stdout, stderr) => {
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

async function headroomPipChannel() {
  const bin = headroomFindBin();
  if (!bin) return { code: 'headroom-update', error: '未找到 headroom 程序' };
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
// 大包下载可持续数分钟——同步等待 HTTP 会把按钮卡在「升级中」且关弹窗即失联；
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

// 运行 headroom 插件钩子（ensure-proxy.sh，POSIX sh）：backend/power 写配置并立即
// 生效，status/start/stop/restart 管理代理生命周期
function runHeadroomHook(args, timeoutMs = 20000) {
  const hook = findMarketplaceHook('headroom', join('hooks', 'ensure-proxy.sh'));
  if (!hook) {
    return Promise.resolve({ ok: false, code: 'headroom-plugin', error: '未找到 headroom 插件（先在插件市场安装）' });
  }
  return new Promise((resolveRun) => {
    execFile('sh', [hook, ...args], { timeout: timeoutMs }, (err, stdout, stderr) => {
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

// 用 node 跑脚本：优先 PATH 里的 node；桌面环境没有时用自身进程
// （zcode-pro 本就跑在 ELECTRON_RUN_AS_NODE=1 的 ZCode 二进制上）。导出以便测试。
export function runNodeScript(scriptArgs, timeoutMs = 120000) {
  const attempt = (cmd, extraEnv) => new Promise((resolveRun) => {
    execFile(cmd, scriptArgs, { timeout: timeoutMs, env: { ...process.env, ...proxyEnv(), ...extraEnv } }, (err, stdout, stderr) => {
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

// ZCode CLI bundle（plugins 子命令入口）：按常见安装位置查找，可用环境变量覆盖
function zcodeCliBundleCandidates() {
  return [
    process.env.ZCODEPRO_ZCODE_CLI,
    '/opt/ZCode/resources/glm/zcode.cjs',
    '/usr/lib/zcode/resources/glm/zcode.cjs',
    '/usr/share/zcode/resources/glm/zcode.cjs',
    '/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs',
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Programs', 'ZCode', 'resources', 'glm', 'zcode.cjs') : null,
  ].filter(Boolean);
}

// 运行 zcode CLI 子命令（plugins …）
function runZcodeCli(subArgs, timeoutMs = 120000) {
  const bundle = zcodeCliBundleCandidates().find((c) => existsSync(c));
  if (!bundle) {
    return Promise.resolve({ ok: false, code: 'cli-not-found', error: '未找到 ZCode CLI（resources/glm/zcode.cjs）' });
  }
  return runNodeScript([bundle, ...subArgs], timeoutMs);
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
