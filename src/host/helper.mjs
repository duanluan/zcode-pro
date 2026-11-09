// 本地辅助服务：注入到页面里的增强脚本通过 http://127.0.0.1:<port> 调用这里，
// 完成文件系统操作（页面沙箱内做不了的事）与配置持久化。
// 仅绑定 127.0.0.1，并通过每次启动随机生成的 token 鉴权。

import { createServer } from 'node:http';
import { execFile, spawn, spawnSync } from 'node:child_process';
import { createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { appendFileSync, chmodSync, closeSync, copyFileSync, createReadStream, createWriteStream, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readlinkSync, readSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises'; // 注意：fs 的 mkdtemp 是回调版，await 它会把 undefined 当回调
import { basename, delimiter, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { homedir, tmpdir, userInfo } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readSettings, remapSettingsPathsAtomic, isProjectOpenInTabs } from './settings.mjs';
import { taskIndexPath, probeTaskIndexWritable, remapTaskIndexPaths, taskIndexDriverAvailable, listOverriddenTitles, listTaskWorkspaceMap, listTaskStatuses, listSessionsActivity, listSessionsTrace, listSessionModelUsage, listSubagentChildrenActivity, listProjectsUnread, listWorkspaceTaskIds, setTaskTitleIfNotOverridden, setCustomSessionTitle, isTaskTitleOverridden, reconcileCustomTitles, getTaskProviderModel, listVirtualProjects, countTasks, readRecentQa } from './taskIndex.mjs';
import { pickFolderSystem } from './pickFolder.mjs';
import { reorderTasks } from './taskOrder.mjs';
import { webdavRequest, webdavPutWithMkcol, webdavHttpText, parseWebdavListing, findCurl } from './webdav.mjs';
import { resolveZcodeExecutable, resolveDataRootDir } from './paths.mjs';
import { skillStats, DEFAULT_METADATA_BUDGET } from './skill-stats.mjs';

const VERSION = '1.5.1';

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

// 主题功能的壁纸图库：用户上传的图片/视频都存这里，helper 以 /bg/file/<name> 提供，
// 注入层直接引用该 URL（媒体元素/CSS url() 带不了鉴权请求头，URL 带 ?t= token，见下）
const BG_DIR_NAME = 'backgrounds';
export function backgroundsDir(dataRoot) {
  return join(dataRoot, BG_DIR_NAME);
}
// 壁纸上传约束：图片只收常见位图格式（单张 ≤10MB），视频收 mp4/webm/mov（单个
// ≤200MB）；图库合计 ≤50 个（防塞爆磁盘与同步）
export const BG_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif']);
export const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov']);
export const MEDIA_EXT = new Set([...BG_EXT, ...VIDEO_EXT]);
export const BG_MAX_BYTES = 10 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 200 * 1024 * 1024;
export const BG_MAX_COUNT = 50;
const BG_MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp', '.avif': 'image/avif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime' };
// 文件名安全化：去路径分隔符与控制字符，空白折叠，保留扩展名；非法返回 null
export function sanitizeBgName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/[\r\n\t\/\\:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  if (!name || name.startsWith('.') || name.length > 120) return null;
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  if (!MEDIA_EXT.has(ext)) return null;
  // Windows 设备名（CON/NUL/COM1…）作文件名会落到设备而非磁盘
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(name)) return null;
  return name;
}
// 文件头魔数校验（防把可执行文件改扩展名上传）：图片按扩展名匹配常见位图头，
// 视频 mp4/mov 是 ftyp 盒、webm 是 EBML。/bg 上传与 wallpaper CLI 共用这一份
export function bgMagicOk(name, head) {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  if (VIDEO_EXT.has(ext)) {
    return ext === '.webm'
      ? head.slice(0, 4).toString('hex') === '1a45dfa3'
      : head.slice(4, 8).toString('ascii') === 'ftyp';
  }
  return ({
    '.png': head.slice(0, 8).toString('hex') === '89504e470d0a1a0a',
    '.jpg': head[0] === 0xff && head[1] === 0xd8,
    '.jpeg': head[0] === 0xff && head[1] === 0xd8,
    '.gif': head.slice(0, 3).toString('ascii') === 'GIF',
    '.webp': head.slice(0, 4).toString('ascii') === 'RIFF' && head.slice(8, 12).toString('ascii') === 'WEBP',
    '.bmp': head[0] === 0x42 && head[1] === 0x4d,
    '.avif': head.slice(4, 8).toString('ascii') === 'ftyp',
  })[ext] === true;
}

// 删原片时同步清掉该视频的转码缓存（key 公式与 /bg/transcode 相同）：不清的话
// 删了原片，抽帧版会永久残留在 cache/transcode。/bg/delete 与 wallpaper CLI 共用
export function cleanupBgTranscode(dataRoot, file) {
  try {
    const st = statSync(file);
    for (const fps of TRANSCODE_FPS) {
      const k = createHash('sha1').update(`${file}#${fps}#${st.mtimeMs}#${st.size}`).digest('hex').slice(0, 16);
      const out = join(transcodeDir(dataRoot), k + '.mp4');
      if (existsSync(out)) unlinkOrDefer(out);
    }
  } catch { /* 缓存清理失败不影响删原片 */ }
}

// Windows 下 ffmpeg 转码/杀软会短暂占用文件，直接 unlink/rename 抛 EPERM/EBUSY：
// 抢不到就改名挂起（.deleted-<ts>），后续清理，不让一次失败卡住用户操作
export function unlinkOrDefer(file) {
  try {
    unlinkSync(file);
  } catch (e) {
    if (e && (e.code === 'EPERM' || e.code === 'EBUSY' || e.code === 'EACCES')) {
      try { renameSync(file, `${file}.deleted-${Date.now().toString(36)}`); } catch { /* 仍被占：下轮再试 */ }
    }
  }
}
export function renameOrReplace(tmp, dst) {
  try {
    renameSync(tmp, dst);
  } catch (e) {
    if (e && (e.code === 'EPERM' || e.code === 'EBUSY' || e.code === 'EACCES')) {
      // 目标被占用：把旧文件改名挂起后再改名落位
      try { renameSync(dst, `${dst}.deleted-${Date.now().toString(36)}`); renameSync(tmp, dst); } catch { throw e; }
    } else {
      throw e;
    }
  }
}
// 惰性清掉上轮挂起的 .deleted-*（超过 1 天才清，避开仍被占用的）
export function sweepDeferredBg(dir) {
  try {
    for (const n of readdirSync(dir)) {
      // .deleted-* 是延迟删除的残留；结尾 .tmp 是上传中断留下的半截文件（正常
      // 流程会即时改名或删掉）。都只清超过 24 小时的，避免误伤进行中的操作；
      // 媒体文件扩展名有白名单，正常文件不会以 .tmp 结尾
      if (!n.includes('.deleted-') && !n.endsWith('.tmp')) continue;
      const f = join(dir, n);
      try {
        if (Date.now() - statSync(f).mtimeMs > 24 * 3600 * 1000) unlinkSync(f);
      } catch { /* 仍被占用 */ }
    }
  } catch { /* 目录不存在 */ }
}

export function listBgFiles(dataRoot) {
  const dir = backgroundsDir(dataRoot);
  try {
    return readdirSync(dir)
      .map((name) => { try { const st = statSync(join(dir, name)); return { name, size: st.size, mtime: st.mtimeMs }; } catch { return null; } })
      .filter((f) => f && MEDIA_EXT.has(f.name.slice(f.name.lastIndexOf('.')).toLowerCase()))
      .filter((f) => sanitizeBgName(f.name) === f.name) // 与取文件的二次清洗对齐：名字对不上的不列（列了会误命中清洗后同名文件）
      .sort((a, b) => b.mtime - a.mtime);
  } catch { return []; } // 目录不存在 = 空图库
}

// ?dir= 只认用户配置过的目录（全局文件夹 + 各分区目录）——仅凭 URL 上的 token
// 还不够，别让持 token 的调用列出/读取任意目录的文件。取文件与列目录两条路由共用这一个判定
function bgFolderDirAllowed(bgCfg, qDir) {
  if (!qDir || qDir.length > 4096 || !isAbsolute(qDir)) return false;
  const allowed = [bgCfg.folder,
    bgCfg.regions?.left?.folder, bgCfg.regions?.center?.folder, bgCfg.regions?.right?.folder].filter(Boolean);
  return allowed.includes(qDir);
}

// 视频壁纸帧率上限：ffmpeg 一次性转码出抽帧版存缓存目录，注入层先播原片、
// 转码完成再换。没有 ffmpeg 时接口直接报缺依赖，注入层保持原片播放
export const TRANSCODE_FPS = new Set([15, 30, 60, 90, 120]);
let ffmpegOk = null; // 三态：null 未探测 / true / false
function hasFfmpeg() {
  if (ffmpegOk === null) {
    try { ffmpegOk = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0; }
    catch { ffmpegOk = false; }
  }
  return ffmpegOk;
}
export function transcodeDir(dataRoot) {
  return join(dataRoot, 'cache', 'transcode');
}
const transcodeJobs = new Set(); // 正在转码的 key，防同一文件重复起 ffmpeg
const transcodeChildren = new Set(); // 在跑的 ffmpeg 子进程：退出/交接时统一收掉，防孤儿进程
const TRANSCODE_MAX_CONCURRENCY = 2; // 同时最多 2 个 ffmpeg，防批量请求打满 CPU/磁盘
// URL 路径段解码：非法 % 序列回 null（调用方回 400），不让 URIError 落成 500
let folderCfgCache = { at: 0, dir: '' };
function decodeName(raw) {
  try { return decodeURIComponent(raw); } catch { return null; }
}

// 主题配置（设置 → 外观 → 主题/壁纸）：skin 为皮肤 id（default = 不覆盖，
// custom = 用 custom 锚点色现算色阶）；bg.mode 选壁纸来源——none 无壁纸 /
// library 本地图库（file 为当前文件，单选一张，轮换归文件夹）/ folder 文件夹
// （定时轮换，folderRandom 随机或顺序）/ url 图片网址（intervalMin 定时刷新）/
// web 网页（url 为页面地址，iframe 铺在界面后方）；
// maskOpacity 遮罩不透明度 0-0.99（越高画面越向主题背景色淡化，文字对比越
// 清晰，默认 0.82）、blurPx 画面模糊 0-24px（默认 0）、panelOpacity 面板
// 不透明度 0-1（侧栏/面板/标签栏，越低透出画面越多，默认 0.3）；
// transition 换壁纸转场（cut 直接切换 / fade 淡入淡出）、fpsCap 视频帧率上限
// （0 原始，其余 15/30/60/90/120，需 ffmpeg 抽帧转码）、videoVolume 音量 0-1（默认 0
// 静音）、playbackRate 倍速 0.5-2（默认 1）；pauseOnHidden/pauseOnBlur/
// pauseOnBattery 三个暂停条件（默认开/关/关）
const THEME_SKINS = new Set(['default', 'dracula', 'nord', 'tokyonight', 'catppuccin', 'gruvbox', 'onedark', 'solarized', 'rosepine', 'everforest', 'nightowl', 'kanagawa', 'custom']);
export const BG_MODES = new Set(['none', 'library', 'folder', 'url', 'web']);
export const BG_FITS = new Set(['cover', 'contain', 'fill', 'tile']);
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const CUSTOM_KEYS = ['bg', 'card', 'fg', 'muted', 'accent'];
function mergeCustomSkin(saved) {
  const out = {};
  for (const mode of ['light', 'dark']) {
    const src = saved && typeof saved === 'object' && saved[mode] && typeof saved[mode] === 'object' ? saved[mode] : {};
    out[mode] = {};
    for (const k of CUSTOM_KEYS) out[mode][k] = HEX_COLOR.test(src[k]) ? src[k].toLowerCase() : null;
  }
  return out;
}
function str(v, max) {
  return typeof v === 'string' && v.length <= max ? v : null;
}
// 分区背景来源（bg.regions.left/center/right）：null = 跟随全局；
// folder 轮换复用全局的 intervalMin 与 folderRandom
function mergeBgRegion(src) {
  if (!src || typeof src !== 'object') return null;
  const mode = src.mode === 'library' || src.mode === 'folder' || src.mode === 'url' ? src.mode : null;
  if (!mode) return null;
  return {
    mode,
    file: mode === 'library' ? (str(src.file, 200) || '') : '',
    folder: mode === 'folder' ? (str(src.folder, 4096) || '') : '',
    url: mode === 'url' ? (str(src.url, 2000) || '').trim() : '',
    // 分区独立缩放/遮罩：null = 跟随全局（只有分区行的控件会写这两项）
    fit: BG_FITS.has(src.fit) ? src.fit : null,
    maskOpacity: src.maskOpacity != null && src.maskOpacity !== '' && Number.isFinite(Number(src.maskOpacity))
      ? Math.min(0.99, Math.max(0, Number(src.maskOpacity))) : null,
  };
}
export function mergeThemeConfig(saved) {
  const t = saved && typeof saved === 'object' ? saved : {};
  const bg = t.bg && typeof t.bg === 'object' ? t.bg : {};
  const bgUrl = (str(bg.url, 2000) || '').trim();
  const cfg = {
    skin: THEME_SKINS.has(t.skin) ? t.skin : 'default',
    custom: mergeCustomSkin(t.custom),
    bg: {
      mode: BG_MODES.has(bg.mode) ? bg.mode : 'none',
      file: str(bg.file, 200) || '',
      folder: str(bg.folder, 4096) || '',
      folderRandom: bg.folderRandom !== false,
      url: /^https?:\/\//i.test(bgUrl) ? bgUrl : '', // 网页壁纸只收 http(s)（与 wallpaper CLI 校验一致）
      // Number() 容错与相邻数值字段一致：外部写入方（手改配置/壁纸控制插件）写数字字符串也能生效
      intervalMin: bg.intervalMin != null && Number.isFinite(Number(bg.intervalMin)) ? Math.min(1440, Math.max(0, Math.round(Number(bg.intervalMin)))) : 0,
      fit: BG_FITS.has(bg.fit) ? bg.fit : 'cover',
      // null/undefined/非数值都落默认（Number(null)=0 是有限数，须先排除 null）
      maskOpacity: bg.maskOpacity != null && bg.maskOpacity !== '' && Number.isFinite(Number(bg.maskOpacity))
        ? Math.min(0.99, Math.max(0, Number(bg.maskOpacity))) : 0.82,
      blurPx: bg.blurPx != null && Number.isFinite(Number(bg.blurPx)) ? Math.min(24, Math.max(0, Math.round(bg.blurPx))) : 0,
      panelOpacity: bg.panelOpacity != null && bg.panelOpacity !== '' && Number.isFinite(Number(bg.panelOpacity)) ? Math.min(1, Math.max(0, Number(bg.panelOpacity))) : 0.3,
      transition: bg.transition === 'fade' ? 'fade' : 'cut',
      fpsCap: TRANSCODE_FPS.has(Number(bg.fpsCap)) ? Number(bg.fpsCap) : 0,
      dialogFrost: bg.dialogFrost !== false,
      videoVolume: bg.videoVolume != null && Number.isFinite(Number(bg.videoVolume))
        ? Math.min(1, Math.max(0, Number(bg.videoVolume))) : 0,
      playbackRate: bg.playbackRate != null && Number.isFinite(Number(bg.playbackRate))
        ? Math.min(2, Math.max(0.5, Number(bg.playbackRate))) : 1,
      pauseOnHidden: bg.pauseOnHidden !== false,
      pauseOnBlur: bg.pauseOnBlur === true,
      pauseOnBattery: bg.pauseOnBattery === true,
      regions: {
        left: mergeBgRegion(bg.regions && bg.regions.left),
        center: mergeBgRegion(bg.regions && bg.regions.center),
        right: mergeBgRegion(bg.regions && bg.regions.right),
      },
    },
  };
  return cfg;
}

// wallpaper CLI 的参数键分类：与上面 mergeThemeConfig 里可调的 bg 参数一一对应
//（mode/file/folder/url/regions 是来源字段归 set 命令、intervalMin/folderRandom 归
// rotate 命令，都不在此表），mergeThemeConfig 加可调字段时这张表同步加。
// 值 'number'/'boolean' = 类型检查，Set = 枚举成员集；取值范围仍归
// mergeThemeConfig（clamp + 默认值）
export const BG_PARAM_KEYS = {
  maskOpacity: 'number', blurPx: 'number', panelOpacity: 'number', videoVolume: 'number', playbackRate: 'number',
  pauseOnHidden: 'boolean', pauseOnBlur: 'boolean', pauseOnBattery: 'boolean', dialogFrost: 'boolean',
  fit: BG_FITS, transition: new Set(['cut', 'fade']), fpsCap: new Set([0, ...TRANSCODE_FPS]),
};

// headroom 插件的配置文件（与 /hr-* 命令、钩子共用，headroom-lib.sh 按 HOME 定位）
function defaultHeadroomFile() {
  return join(homedir(), '.zcode', 'headroom.json');
}

// 本插件市场（zcode-plugins 仓库）在 ZCode CLI 数据目录里的落点。
// 市场未添加时（新机器）从这里自动补装，免得“安装”按钮因市场缺失永远失败。
const ZCODE_PLUGINS_MARKETPLACE = 'duanluan-zcode-plugins';
const ZCODE_PLUGINS_MARKETPLACE_SOURCE = 'duanluan/zcode-plugins';

function cliPluginsDir() {
  // 官方 CLI 数据目录跟 ZCODE_DATA_BASE_DIR 迁移（rollout/v2 同款），别固定 HOME
  return join(resolveDataRootDir(), 'cli', 'plugins');
}

export function defaultConfig() {
  return {
    version: VERSION,
    features: {
      projectMenu: true,        // 项目菜单增强：自定义别名 + 切换文件夹 + 打开文件夹 + 复制路径（含侧栏别名渲染）
      taskOrder: true,          // 侧边栏会话拖动排序持久化
      fileActions: true,        // 文件菜单：默认应用打开 / 打开所在目录
      autoUpdatePlugins: false,  // 启动时自动更新已装的 zcode-plugins 插件（含安装市场里新增的）
      sessionSwitch: true,     // 会话快捷切换（alt+z 上次会话；按住 alt x/c 弹窗导航，类 alt+tab）
      titleLock: true,        // 会话名锁定：手动重命名过的会话不被运行时推送的自动标题覆盖（侧栏钉回索引库中的名字）
      wsRunningSpin: true,     // 折叠项目运行提示：折叠后其中仍有会话运行时项目图标旋转
      subagentIcon: true,      // 子代理运行提示：任务行空闲图标位与折叠项目图标显示机器人（subagent-icon.js）
      idleReclaim: true,       // 空闲项目内存回收：长时间无活动的项目释放其会话进程（时长 idleReclaimMinutes）
      toolbarIcons: true,      // 侧栏菜单并入顶栏：新建任务/搜索/自动化/插件市场收成顶栏图标按钮（原菜单隐藏，点击转发）
      pinnedCollapse: true,    // 已置顶分区可折叠：标题可点折叠/展开任务列表（状态记 localStorage）
      tableCopy: true,        // 表格工具条"复制表格"按钮：富文本剪贴板，粘贴即表格（table-copy.js）
      sessionLink: true,      // 会话 ID 显示为任务名链接：聊天里的 sess_/session_ 显示为任务名，点击切换（session-link.js）
      composerProvider: true, // 输入框模型名前显示供应商名（composer-provider.js）
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
    // 自动重命名（原“任务名提示词”）：新会话开始作答后按可配置的供应商与
    // 提示词生成标题，并按“手动重命名”写入任务索引。默认关闭。provider：
    // 'session' = 跟随当前会话（调用时从任务索引解析该会话的供应商，默认）、
    // '' = 不跟随（自填 baseUrl/apiKey/format）、其余 = 供应商 id（保存时同步
    // 解析一份 baseUrl/apiKey/format 副本，供应商日后被删仍可直连）；
    // model 默认 glm-5.3-flash（起名用快模型即可），跟随会话时可留空
    //（用会话当前模型）；prompt 留空 = 内置默认提示词。
    // 手动“自动重命名”（任务行悬浮按钮 / 右键菜单入口，取会话最近 recentQa
    // 轮问答起名、已重命名也覆盖）不受 enabled 限制，入口各有开关：
    // hoverBtn 任务行按钮、menuEntry 右键菜单项
    titleGen: {
      enabled: false,
      customWritten: {},
      provider: 'session',
      model: 'glm-5.3-flash',
      prompt: '',
      baseUrl: '',
      apiKey: '',
      format: '',
      recentQa: 3,
      hoverBtn: true,
      menuEntry: true,
    },
    // HTTP 代理（http(s)://host:port）：helper 发起的网络访问走它——插件市场更新/安装
    // （zcode CLI → git）、headroom/rtk 的安装与升级（pip/GitHub）。空 = 不用代理。
    proxy: '',
    // 代理生效范围（按用途开关）：plugins = 插件市场更新/安装/卸载；deps = 插件依赖
    // 软件（headroom 与 rtk）的安装、检查更新与升级；sync = WebDAV 同步。同步默认
    // 关闭——坚果云等国内网盘通常直连即可，代理停了同步会跟着失败
    proxyScopes: { plugins: true, deps: true, sync: false },
    // 开发模式（设置弹窗“调试”标签页）：开启后出现“重载”按钮，可在不重启
    // ZCode 的情况下加载新代码（构建 → 换新启动器进程 → 各窗口自动刷新重注入）
    devMode: false,
    // 设置同步（设置弹窗“同步”标签页，交互参考 Tampermonkey 的手动同步）：
    // 仅 WebDAV、仅在点击按钮时传输（type 字段预留多后端扩展，当前恒为 webdav）。
    // url 为 WebDAV 服务器地址；dir 为其下的上传目录（默认 zcode-pro，避免直接
    // 写进网盘根目录）；include 选择同步内容；凭据只存本机、不同步出去；
    // lastPushAt/lastPullAt 只记录本机操作时间；historyLimit 为云端历史版本保留
    // 个数（同一次上传的各组文件算一个，上传成功后自动删除更早的；0 = 不留历史，
    // 只有固定名最新版）。
    sync: {
      type: 'webdav',
      url: '',
      dir: 'zcode-pro',
      login: '',
      password: '',
      include: { zcodepro: true, model: true },
      historyLimit: 10,
      lastPushAt: null,
      lastPullAt: null,
    },
    theme: mergeThemeConfig(undefined),
    // 一次性迁移标记：记录弹窗类迁移做过没有（目前只有别名迁移的
    // aliasRenameDismissed，经 /config POST 写入），有标记的迁移不再重复，
    // 用户此后手动改回的设置不再被覆盖
    migrations: {},
  };
}

// 配置文件“存在但读不出/解析不了”标记：写路径见标记拒绝写回，防止把默认值
// 覆盖上去把用户配置（WebDAV 账号、别名、样式…）整份清掉
let configUnreadable = false;
// 写配置前的可写检查（wallpaper CLI 等外部写入方用）：loadConfig 读不出时置位、
// saveConfig 据此拒写；外部写入方读到损坏要转成明确报错，别等 saveConfig 静默拒写
export function configFileUnreadable() {
  return configUnreadable;
}
export function loadConfig(configFile) {
  try {
    if (!existsSync(configFile)) { configUnreadable = false; return defaultConfig(); }
    const saved = JSON.parse(readFileSyncText(configFile).replace(/^\uFEFF/, '')); // 记事本存的带 BOM 文件也能解析
    if (Array.isArray(saved)) throw new Error('顶层是数组'); // 按损坏处理
    configUnreadable = false; // 解析成功就复位：修好文件后自动恢复可写
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
      titleGen: mergeTitleGenConfig(saved.titleGen),
      theme: mergeThemeConfig(saved.theme),
      proxyScopes: mergeProxyScopes(saved.proxyScopes),
      devMode: saved.devMode === true,
      // devActive 每次读取时重算（保存时会随配置一起写入文件，但读取方不用保存的值）：
      // 开发模式生效 = 配置开关或启动器带 ZCODEPRO_DEV=1，设置弹窗据此决定是否显示“调试”标签页（普通用户不可见）
      devActive: saved.devMode === true || process.env.ZCODEPRO_DEV === '1',
      sync: mergeSyncConfig(saved.sync),
    };
  } catch {
    configUnreadable = existsSync(configFile);
    return defaultConfig();
  }
}

function readFileSyncText(p) {
  return readFileSync(p, 'utf8');
}

// 原子写任意 JSON 文件：先写临时文件再改名，避免崩溃留下半截 JSON
function writeJsonAtomic(file, obj) {
  const tmp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`; // 防多写者共用同一 .tmp 撕裂
  try { mkdirSync(dirname(file), { recursive: true }); } catch { /* 目录已存在 */ } // 数据目录缺失时先建，别让写入直接抛
  writeFileSync(tmp, JSON.stringify(obj, null, 2), { encoding: 'utf8', mode: 0o600 }); // 配置含凭据，限制本人读写
  renameSync(tmp, file);
}

// 读改写必须同步完成（loadConfig→改→saveConfig 中间不能加 await）：
// HTTP 处理器靠单线程的同步原子性保证并发保存不互相覆盖字段
export function saveConfig(configFile, config) {
  // 配置"存在但损坏"时拒绝写回：否则 title-gen/同步/别名等写路径会把默认值
  // 整份覆盖上去（WebDAV 账号、样式、主题全丢且不可恢复）。POST /config 另有
  // 显式报错，这里兜住其余调用方；修好文件后 loadConfig 会复位标记恢复可写。
  // 保护只针对 zcodepro.json：写别的文件（/zcode-config 写 cli/config.json）
  // 直接用 writeJsonAtomic，别被这个标记误伤成静默不写。
  // 返回是否写入：调用方据此报错（同步导入不能在拒写时还报成功）
  if (configUnreadable) {
    console.error('[zcodepro] zcodepro.json 读取失败或已损坏，拒绝写回以免清空配置');
    return false;
  }
  writeJsonAtomic(configFile, config);
  return true;
}

// —— zcodepro.json 跨进程写锁 ——————————————————————————————————
// 多个进程（helper、wallpaper CLI、同步导入…）会同时读改写 zcodepro.json，
// 不互斥时各拿旧快照写回，会把对方改的整段配置（WebDAV 凭据、别名、样式）盖掉。
// 锁 = 配置文件同目录下的锁目录（mkdir 原子创建），目录里写持有者信息（pid + 随机 token）。
const CONFIG_LOCK_STALE_MS = 10_000; // 锁龄超过这个数按悬挂锁接管
const CONFIG_LOCK_WAIT_MS = 5_000;   // 等锁上限；等不到带提示继续尽力而为

// 进程还在不在（pid 被系统复用的极端情形由锁龄上限兜底）
function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
}

// 抢一次锁：mkdir 成功即持有；已有锁时仅在持有者死亡或锁龄超时才拆掉接管。
// 返回是否拿到（没拿到由调用方等待重试）
function tryAcquireConfigLock(configFile, token) {
  const lockDir = configFile + '.lock';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      mkdirSync(lockDir); // 原子创建：同时只有一个进程成功
      try {
        writeFileSync(join(lockDir, 'holder.json'), JSON.stringify({ pid: process.pid, token }), 'utf8');
      } catch { /* 持有者信息写失败不影响锁本身，释放时按超时接管兜底 */ }
      return true;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      let stale = false;
      try {
        let alive = true;
        try {
          const holder = JSON.parse(readFileSync(join(lockDir, 'holder.json'), 'utf8'));
          alive = pidAlive(Number(holder.pid));
        } catch { alive = true; } // 持有者信息缺失/写坏：只按锁龄判悬挂
        stale = Date.now() - statSync(lockDir).mtimeMs > CONFIG_LOCK_STALE_MS || !alive;
      } catch { stale = true; } // 锁目录正被删/读不了：按悬挂接管
      if (!stale) return false;
      try { rmSync(lockDir, { recursive: true, force: true }); } catch { return false; }
      // 接管后回到循环重试 mkdir（可能被另一个进程抢先）
    }
  }
  return false;
}

// 释放锁：只认自己那份持有者信息，被别人接管后不能把别人的锁删掉
function releaseConfigLock(configFile, token) {
  const lockDir = configFile + '.lock';
  try {
    const holder = JSON.parse(readFileSync(join(lockDir, 'holder.json'), 'utf8'));
    if (holder.token !== token) return;
  } catch { return; } // 读不到持有者信息（已被接管后删除等）：不动目录，留超时接管
  try { rmSync(lockDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

// 在跨进程锁内同步执行 fn 并返回其结果：fn 里保持同步读改写（loadConfig→改→
// saveConfig 中间不要 await）。等锁上限约 5 秒，等不到带提示继续尽力而为
//（不加锁至少还能写成，别直接失败）。调用点是 async 就 await 这个函数。
export async function withConfigLock(configFile, fn) {
  const token = randomBytes(12).toString('hex');
  const deadline = Date.now() + CONFIG_LOCK_WAIT_MS;
  while (!tryAcquireConfigLock(configFile, token)) {
    if (Date.now() >= deadline) {
      console.error('[zcodepro] 等 zcodepro.json 写锁超时，继续无锁写入（可能与别的进程互相覆盖）');
      return fn();
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  try {
    return fn();
  } finally {
    releaseConfigLock(configFile, token);
  }
}

// 同步等锁变体（同步调用点用，如 setHeadroomUsage）：Atomics.wait 睡眠重试，
// 语义与 withConfigLock 相同
export function withConfigLockSync(configFile, fn) {
  const token = randomBytes(12).toString('hex');
  const deadline = Date.now() + CONFIG_LOCK_WAIT_MS;
  while (!tryAcquireConfigLock(configFile, token)) {
    if (Date.now() >= deadline) {
      console.error('[zcodepro] 等 zcodepro.json 写锁超时，继续无锁写入（可能与别的进程互相覆盖）');
      return fn();
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  try {
    return fn();
  } finally {
    releaseConfigLock(configFile, token);
  }
}

// 一次性配置迁移已移除（原 wsRunningSpinOff）：旧实验版“折叠项目运行提示”
// 会后台周期性短暂展开项目，当时给无标记的配置强制关过一次；该功能 1.3.1
// 已重写，迁移对新装机（首启无配置文件、首存后才建）误伤为默认关闭，故删。

function json(res, status, obj) {
  if (res.writableEnded || res.headersSent) return; // 已发过响应就不再写（防双发崩进程）
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-ZCodePro-Token',
  });
  res.end(body);
}

function readBody(req, limitBytes = 1 << 20) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let size = 0;
    let overflowed = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) { overflowed = true; chunks.length = 0; return; } // 排干剩余字节，防 keep-alive 残字节错位
      chunks.push(c);
    });
    req.on('end', () => {
      if (overflowed) { rejectBody(Object.assign(new Error('请求体过大'), { statusCode: 413 })); return; }
      try { resolveBody(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (e) { rejectBody(new Error('无效的 JSON 请求体')); }
    });
    req.on('error', rejectBody);
  });
}

// 软件代理（设置弹窗“代理”标签页）：helper 发起的网络访问（zcode CLI→git、pip、
// WebDAV 同步）按用途（proxyScopes）走这里。activeProxyUrl 只存手填代理；没填时
// 按需读 Windows 系统代理（带短缓存，Clash 开关后能自动跟上）。
let activeProxyUrl = '';
let activeProxyScopes = { plugins: true, deps: true, sync: false };
let systemProxyCache = { url: '', at: 0 };

// ProxyServer 的值有两种写法：host:port，或 http=host:port;https=host:port。
// 取 https（没有就取 http），补上协议。导出以便测试。
export function parseWindowsProxyServer(raw) {
  if (!raw) return '';
  const clean = (s) => String(s).trim().replace(/^"|"$/g, '').trim();
  let v = clean(raw);
  if (v.includes('=')) {
    const parts = {};
    for (const seg of v.split(';')) {
      const i = seg.indexOf('=');
      if (i > 0) parts[seg.slice(0, i).trim().toLowerCase()] = clean(seg.slice(i + 1));
    }
    v = parts.https || parts.http || '';
  }
  if (!v) return '';
  const url = /^[a-z]+:\/\//i.test(v) ? v : `http://${v}`;
  // 注册表值不做校验会被坏值原样塞进 HTTP_PROXY；和手填代理一样要求 host:port
  return /^https?:\/\/[^\s/]+:\d+$/.test(url) ? url : '';
}

// Windows 系统代理（Internet 选项）。没单独配代理时沿用它：新电脑上 Clash 等
// 工具通常只开系统代理，用户不会再为单个应用填一遍地址。
function windowsSystemProxy() {
  if (process.platform !== 'win32') return '';
  const query = (name) => {
    const r = spawnSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', name],
      { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    const m = new RegExp(`${name}\\s+REG_(?:DWORD|SZ)\\s+(.+)`, 'i').exec(r.stdout || '');
    return m ? m[1].trim() : '';
  };
  if (!/^0x0*1$/i.test(query('ProxyEnable'))) return '';
  return parseWindowsProxyServer(query('ProxyServer'));
}

// 生效代理：手填优先；没填时读 Windows 系统代理并缓存 30 秒。Clash 在 ZCode
// 之后启动或退出时能自动跟上，又不会每次请求都跑 reg。
function effectiveProxyUrl() {
  if (activeProxyUrl) return activeProxyUrl;
  if (Date.now() - systemProxyCache.at > 30_000) {
    systemProxyCache = { url: windowsSystemProxy(), at: Date.now() };
  }
  return systemProxyCache.url;
}

// scope：'plugins'（插件市场）/ 'deps'（headroom、rtk）/ 'sync'（WebDAV 同步）；
// 'none' 表示这次调用与下载无关（headroom 生命周期钩子等），永不注入下载代理
function proxyEnv(extra = {}, scope = 'deps') {
  if (scope === 'none' || !activeProxyScopes[scope]) return extra;
  const proxy = effectiveProxyUrl();
  if (!proxy) return extra;
  return {
    HTTP_PROXY: proxy, HTTPS_PROXY: proxy,
    http_proxy: proxy, https_proxy: proxy,
    ...extra,
  };
}

// 该用途当前是否走代理：同步按 proxyUrl 参数传给 webdav（curl 路径用，
// fetch 兜底路径不认代理环境变量）
function proxyUrlFor(scope) {
  return activeProxyScopes[scope] ? effectiveProxyUrl() : '';
}

// 智能起名诊断日志：追加到 <dataRoot>/zcodepro.log（与启动诊断同文件），超 512KB
// 轮转 .old。起名过程注入侧静默（失败不打扰用户），出问题时靠这里回查
let titleGenLogRotated = false;
function titleGenLog(dataRoot, line) {
  try {
    const file = join(dataRoot, 'zcodepro.log');
    if (!titleGenLogRotated && existsSync(file) && statSync(file).size > 512 * 1024) {
      renameSync(file, file + '.old');
      titleGenLogRotated = true;
    }
    appendFileSync(file, `[${new Date().toISOString()}] title-gen ${line}\n`);
  } catch { /* 日志失败不影响功能 */ }
}

// ZCode 自身的行为配置（~/.zcode/cli/config.json，ZCode 官方用户级配置文件）：
// 设置弹窗“行为 → ZCode CLI”由此读写，只更新提交的键，其余内容原样保留。
// 与全局提示词一样固定按主目录定位，不跟 ZCODE_DATA_BASE_DIR 迁移
function zcodeDataRoot() {
  return join(homedir(), '.zcode');
}

function readZcodeConfig(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

// 记忆不在此列：工作区记忆由桌面设置里的 memoryEnabled（~/.zcode/v2/setting.json）
// 控制，官方 设置 → Agent 能力 → 记忆 页负责开关
const ZCODE_FEATURE_KEYS = ['compact', 'rewind', 'subagent', 'skill', 'mcp'];

function zcodeConfigSnapshot(dataRoot) {
  const cfg = readZcodeConfig(join(dataRoot, 'cli', 'config.json'));
  const skills = cfg.skills && typeof cfg.skills === 'object' ? cfg.skills : {};
  const features = cfg.features && typeof cfg.features === 'object' ? cfg.features : {};
  const roots = Array.isArray(skills.roots)
    ? skills.roots.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim())
    : [];
  const has = (v) => v !== undefined;
  const values = {
    skills: {
      enabled: skills.enabled !== false,
      includeInstructions: skills.includeInstructions !== false,
      metadataBudget: Number.isFinite(skills.metadataBudget) ? skills.metadataBudget : DEFAULT_METADATA_BUDGET,
      roots,
    },
    features: Object.fromEntries(ZCODE_FEATURE_KEYS.map((k) => [k, features[k] !== false])),
  };
  // configured（是否显式写在配置里）：界面据此标注“默认值”，也保证只写用户动过的键
  const configured = {
    skills: {
      enabled: has(skills.enabled),
      includeInstructions: has(skills.includeInstructions),
      metadataBudget: has(skills.metadataBudget),
      roots: has(skills.roots),
    },
    features: Object.fromEntries(ZCODE_FEATURE_KEYS.map((k) => [k, has(features[k])])),
  };
  const stats = skillStats({
    dataRoot,
    roots: values.skills.roots,
    budget: values.skills.metadataBudget,
    pluginsEnabled: cfg.plugins && typeof cfg.plugins === 'object' ? cfg.plugins.enabled !== false : true,
    enabledPlugins: cfg.plugins && typeof cfg.plugins.enabledPlugins === 'object' ? cfg.plugins.enabledPlugins : {},
    suppressedBuiltins: cfg.plugins && Array.isArray(cfg.plugins.suppressedBuiltins) ? cfg.plugins.suppressedBuiltins : [],
  });
  return { ok: true, values, configured, stats };
}

export function startHelper({ port, token, dataRoot, state, agentsFile = defaultAgentsFile(), listenTries = 40, rolloutDir = '', visionFile = '' }) {
  if (rolloutDir) rolloutDirOverride = rolloutDir;
  if (!visionFile) visionFile = defaultVisionFile(); // 测试可覆盖，别把启动补写落到真实 ~/.zcode
  const configFile = join(dataRoot, 'zcodepro.json');
  const settingsFile = join(dataRoot, 'v2', 'setting.json');
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
      // 背景图/壁纸取文件：媒体元素与 CSS url() 发不了自定义头，该路由在 token 校验
      // 之前放行。仅 Host 校验（127.0.0.1，防 DNS rebinding）+ 文件名白名单目录内
      // 取文件，不接受路径参数之外的任何输入。文件夹模式从配置的目录里取（同样免
      // token）。流式输出并支持 Range：视频元素播放中会按字节段请求
      const serveBgFile = (name, dir, res2) => {
        const safe = sanitizeBgName(name);
        const file = safe && join(dir, safe);
        if (!file || !existsSync(file)) {
          res2.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res2.end('not found');
          return;
        }
        try {
          const st = statSync(file);
          if (!st.isFile()) {
            res2.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res2.end('not found');
            return;
          }
          const headers = {
            'Content-Type': BG_MIME[safe.slice(safe.lastIndexOf('.')).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-cache',
            'Accept-Ranges': 'bytes',
            'Last-Modified': st.mtime.toUTCString(),
            'Access-Control-Allow-Origin': '*',
          };
          // 条件请求命中直接 304：视频被反复重载时不再整段重下
          const ims = String(req.headers['if-modified-since'] || '');
          if (ims && Date.parse(ims) >= Math.floor(st.mtimeMs / 1000) * 1000) {
            res2.writeHead(304, headers);
            res2.end();
            return;
          }
          // 读流出错（文件恰好被删/盘错误）不能裸抛：未发头回 500，已发则掐断连接
          const streamFile = (opts) => {
            const rs = createReadStream(file, opts);
            rs.on('error', () => {
              if (!res2.headersSent) {
                res2.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                res2.end('read error');
              } else {
                res2.destroy();
              }
            });
            res2.on('close', () => rs.destroy());
            rs.pipe(res2);
          };
          const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
          if (m && (m[1] || m[2])) {
            // 后缀区间 bytes=-N 取末尾 N 字节（N 是个数不是终点）；起点越界按 RFC 回 416
            const suffix = !m[1];
            const start = suffix ? Math.max(0, st.size - (+m[2] || 0)) : +m[1];
            const end = suffix ? st.size - 1 : (m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1);
            if (st.size === 0 || start >= st.size || start > end) {
              res2.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
              res2.end();
              return;
            }
            res2.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
            streamFile({ start, end });
            return;
          }
          res2.writeHead(200, { ...headers, 'Content-Length': st.size });
          streamFile();
        } catch {
          res2.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          res2.end('read error');
        }
      };
      // 媒体路由（CSS url()/<video> 引用，带不了鉴权请求头）：认 URL 上的
      // ?t= token，外部页面猜不到 token 就读不走图库媒体、也做不了存在性探测
      if (req.method === 'GET' && (url.pathname.startsWith('/bg/file/')
        || url.pathname.startsWith('/bg/folder/file/') || url.pathname.startsWith('/bg/transcode/file/'))) {
        const q = url.searchParams.get('t');
        if (!token || (req.headers['x-zcodepro-token'] !== token && q !== token)) {
          json(res, 401, { ok: false, error: 'unauthorized' });
          return;
        }
      }
      if (req.method === 'GET' && url.pathname.startsWith('/bg/file/')) {
        const dec = decodeName(url.pathname.slice('/bg/file/'.length));
        if (dec === null) { json(res, 400, { ok: false, error: '非法文件名编码' }); return; }
        serveBgFile(dec, backgroundsDir(dataRoot), res);
        return;
      }
      if (req.method === 'GET' && url.pathname.startsWith('/bg/folder/file/')) {
        // 分区背景可带自己的目录（?dir=）；缺省用全局设置的文件夹。目录值缓存 5 秒：
        // 媒体请求（含每个 Range 分段）都完整读盘解析配置太浪费
        const qDir = url.searchParams.get('dir');
        let dir;
        if (qDir) {
          // dir 只认用户配置过的目录（全局文件夹 + 各分区目录），
          // 判定与 /bg/folder/list 共用 bgFolderDirAllowed
          if (!bgFolderDirAllowed(loadConfig(configFile).theme.bg, qDir)) {
            json(res, 400, { ok: false, error: 'dir 参数无效或未配置' });
            return;
          }
          dir = qDir;
        } else {
          if (Math.abs(Date.now() - folderCfgCache.at) > 5000) folderCfgCache = { at: Date.now(), dir: loadConfig(configFile).theme.bg.folder };
          dir = folderCfgCache.dir;
        }
        if (!dir) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('no folder');
          return;
        }
        const dec = decodeName(url.pathname.slice('/bg/folder/file/'.length));
        if (dec === null) { json(res, 400, { ok: false, error: '非法文件名编码' }); return; }
        serveBgFile(dec, dir, res);
        return;
      }
      if (req.method === 'GET' && url.pathname.startsWith('/bg/transcode/file/')) {
        const dec = decodeName(url.pathname.slice('/bg/transcode/file/'.length));
        if (dec === null) { json(res, 400, { ok: false, error: '非法文件名编码' }); return; }
        if (!/^[0-9a-f]{16}\.mp4$/.test(dec)) { json(res, 400, { ok: false, error: '非法转码文件名' }); return; } // 只服务 key.mp4：写一半的 .tmp.mp4 别被取走
        serveBgFile(dec, transcodeDir(dataRoot), res);
        return;
      }
      // 空 token 视为配置错误直接拒绝（fail-closed），别放成免鉴权
      if (!token || req.headers['x-zcodepro-token'] !== token) {
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
        // 整段读改写（loadConfig→改→saveConfig）放进跨进程锁内同步执行，
        // 防止两个写入方各拿旧快照写回、互相覆盖整份配置
        await withConfigLock(configFile, () => {
          const current = loadConfig(configFile);
          if (configUnreadable) {
            json(res, 500, { ok: false, code: 'config-unreadable', error: 'zcodepro.json 读取失败或已损坏，拒绝写回以免清空配置；请先修复该文件' });
            return;
          }
          if (body && typeof body === 'object' && typeof body.proxy === 'string') {
            const v = body.proxy.trim();
            if (v === '') current.proxy = '';
            else if (/^https?:\/\/\S+:\d+$/.test(v) && v.length <= 300) current.proxy = v;
            else {
              json(res, 400, { ok: false, code: 'proxy-invalid', error: '代理地址需形如 http://127.0.0.1:7890，或留空清除' });
              return;
            }
            activeProxyUrl = current.proxy;
            if (!current.proxy) systemProxyCache = { url: '', at: 0 }; // 清空手填后立即重读系统代理
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
            // 会话名锁定开关的每次变化都落日志：它被意外关闭两次（页面里是关、
            // 配置文件是开，来源不明），有记录才能查到是谁改的
            if (typeof body.features.titleLock === 'boolean' && body.features.titleLock !== (loadConfig(configFile).features.titleLock !== false)) {
              titleGenLog(dataRoot, `titleLock ${body.features.titleLock ? 'on' : 'off'}（此前为 ${!body.features.titleLock ? 'on' : 'off'}）`);
            }
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
          // 会话快捷切换的键位（设置 → 快捷键里修改）：键名固定，值限单个字母或数字
          if (body && typeof body === 'object' && body.shortcuts && typeof body.shortcuts === 'object') {
            const patch = {};
            for (const k of ['switchLast', 'switchPrev', 'switchNext', 'switchRecent', 'switchAttention']) {
              const v = body.shortcuts[k];
              if (typeof v === 'string' && /^[a-z0-9]$/.test(v)) patch[k] = v;
            }
            current.shortcuts = { ...(current.shortcuts || {}), ...patch };
          }
          // 状态栏统计（设置 → 样式 → 状态栏）：items（任务统计项）与
          // turnItems（每轮统计项）两个清单各自整表覆盖，谁在请求里就更新谁；
          // id 白名单 + 去重保序，未知项丢弃
          if (body && typeof body === 'object' && body.statusBar && typeof body.statusBar === 'object') {
            const next = { ...(current.statusBar || {}) };
            if (Array.isArray(body.statusBar.items)) {
              const valid = new Set(['ctx', 'tokRate', 'questions', 'todayTokens', 'totalTokens', 'tasks']);
              const seen = new Set();
              const items = [];
              for (const it of body.statusBar.items) {
                if (!it || !valid.has(it.id) || seen.has(it.id)) continue;
                seen.add(it.id);
                items.push({ id: it.id, on: it.on !== false });
              }
              next.items = items;
            }
            if (Array.isArray(body.statusBar.turnItems)) {
              const turnValid = new Set(['turnIn', 'turnOut', 'turnCache']);
              const tseen = new Set();
              const turnItems = [];
              for (const it of body.statusBar.turnItems) {
                if (!it || !turnValid.has(it.id) || tseen.has(it.id)) continue;
                tseen.add(it.id);
                turnItems.push({ id: it.id, on: it.on !== false });
              }
              next.turnItems = turnItems;
            }
            current.statusBar = next;
          }
          // 主题（设置 → 样式 → 颜色/背景图）：按字段合并，白名单校验在
          // mergeThemeConfig；library 的 file 与 folder 的目录可能指向已不存在的
          // 目标（图已删/目录移走/同步后缺失），注入层按“取不到 = 无背景”降级
          if (body && typeof body === 'object' && body.theme && typeof body.theme === 'object') {
            const bt = body.theme;
            const cur = current.theme;
            const next = {
              skin: bt.skin !== undefined ? bt.skin : cur.skin,
              custom: bt.custom !== undefined ? bt.custom : cur.custom,
              bg: {
                mode: bt.bg && bt.bg.mode !== undefined ? bt.bg.mode : cur.bg.mode,
                file: bt.bg && bt.bg.file !== undefined ? bt.bg.file : cur.bg.file,
                folder: bt.bg && bt.bg.folder !== undefined ? bt.bg.folder : cur.bg.folder,
                folderRandom: bt.bg && bt.bg.folderRandom !== undefined ? bt.bg.folderRandom : cur.bg.folderRandom,
                url: bt.bg && bt.bg.url !== undefined ? bt.bg.url : cur.bg.url,
                intervalMin: bt.bg && bt.bg.intervalMin !== undefined ? bt.bg.intervalMin : cur.bg.intervalMin,
                fit: bt.bg && bt.bg.fit !== undefined ? bt.bg.fit : cur.bg.fit,
                maskOpacity: bt.bg && bt.bg.maskOpacity !== undefined ? bt.bg.maskOpacity : cur.bg.maskOpacity,
                blurPx: bt.bg && bt.bg.blurPx !== undefined ? bt.bg.blurPx : cur.bg.blurPx,
                panelOpacity: bt.bg && bt.bg.panelOpacity !== undefined ? bt.bg.panelOpacity : cur.bg.panelOpacity,
                transition: bt.bg && bt.bg.transition !== undefined ? bt.bg.transition : cur.bg.transition,
                fpsCap: bt.bg && bt.bg.fpsCap !== undefined ? bt.bg.fpsCap : cur.bg.fpsCap,
                videoVolume: bt.bg && bt.bg.videoVolume !== undefined ? bt.bg.videoVolume : cur.bg.videoVolume,
                playbackRate: bt.bg && bt.bg.playbackRate !== undefined ? bt.bg.playbackRate : cur.bg.playbackRate,
                pauseOnHidden: bt.bg && bt.bg.pauseOnHidden !== undefined ? bt.bg.pauseOnHidden : cur.bg.pauseOnHidden,
                pauseOnBlur: bt.bg && bt.bg.pauseOnBlur !== undefined ? bt.bg.pauseOnBlur : cur.bg.pauseOnBlur,
                pauseOnBattery: bt.bg && bt.bg.pauseOnBattery !== undefined ? bt.bg.pauseOnBattery : cur.bg.pauseOnBattery,
                dialogFrost: bt.bg && bt.bg.dialogFrost !== undefined ? bt.bg.dialogFrost : cur.bg.dialogFrost,
                regions: bt.bg && bt.bg.regions !== undefined ? bt.bg.regions : cur.bg.regions,
              },
            };
            current.theme = mergeThemeConfig(next);
          }
          if (body && typeof body === 'object' && body.titleGen && typeof body.titleGen === 'object') {
            current.titleGen = mergeTitleGenConfig({ ...current.titleGen, ...body.titleGen });
          }
          // 一次性迁移标记（如别名迁移弹窗的“暂不迁移”）：按项合并，只接受布尔值
          if (body && typeof body === 'object' && body.migrations && typeof body.migrations === 'object') {
            const patch = {};
            for (const [k, v] of Object.entries(body.migrations)) {
              if (typeof v === 'boolean') patch[k] = v;
            }
            current.migrations = { ...(current.migrations || {}), ...patch };
          }
          if (!saveConfig(configFile, current)) {
            json(res, 500, { ok: false, code: 'config-unreadable', error: 'zcodepro.json 读取失败或已损坏，保存中止（请先修好配置文件）' });
            return;
          }
          json(res, 200, { ok: true, config: current });
        });
        return;
      }
      // —— ZCode CLI 行为配置（设置 → 行为 → ZCode CLI）：读写 ~/.zcode/cli/config.json
      // 里的 skills / features 两组键，另附技能清单检查统计 ——
      if (req.method === 'GET' && url.pathname === '/zcode-config') {
        json(res, 200, zcodeConfigSnapshot(zcodeDataRoot()));
        return;
      }
      if (req.method === 'POST' && url.pathname === '/zcode-config') {
        const body = await readBody(req);
        const file = join(zcodeDataRoot(), 'cli', 'config.json');
        // 文件存在但解析失败时拒绝写入：按空对象重写会把 provider 等配置清掉
        let cfg;
        try {
          cfg = JSON.parse(readFileSync(file, 'utf8'));
        } catch {
          if (existsSync(file)) {
            json(res, 500, { ok: false, code: 'zcode-config-unreadable', error: 'ZCode 配置文件无法解析，已中止写入' });
            return;
          }
          cfg = {};
        }
        // 只收白名单里类型正确的键；数组类的 roots 整组覆盖（空数组 = 清空）
        const s = body && typeof body === 'object' && body.skills && typeof body.skills === 'object' ? body.skills : {};
        const skillsPatch = {};
        if (typeof s.enabled === 'boolean') skillsPatch.enabled = s.enabled;
        if (typeof s.includeInstructions === 'boolean') skillsPatch.includeInstructions = s.includeInstructions;
        if (typeof s.metadataBudget === 'number' && Number.isFinite(s.metadataBudget) && s.metadataBudget >= 0 && s.metadataBudget <= 1000000) {
          skillsPatch.metadataBudget = Math.round(s.metadataBudget);
        }
        if (Array.isArray(s.roots)) {
          skillsPatch.roots = s.roots.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim());
        }
        if (Object.keys(skillsPatch).length) {
          cfg.skills = { ...(cfg.skills && typeof cfg.skills === 'object' ? cfg.skills : {}), ...skillsPatch };
        }
        const f = body && typeof body === 'object' && body.features && typeof body.features === 'object' ? body.features : {};
        const featuresPatch = {};
        for (const k of ZCODE_FEATURE_KEYS) if (typeof f[k] === 'boolean') featuresPatch[k] = f[k];
        if (Object.keys(featuresPatch).length) {
          cfg.features = { ...(cfg.features && typeof cfg.features === 'object' ? cfg.features : {}), ...featuresPatch };
        }
        writeJsonAtomic(file, cfg); // 写的是 cli/config.json：不走 saveConfig 的 zcodepro.json 拒写保护
        json(res, 200, zcodeConfigSnapshot(zcodeDataRoot()));
        return;
      }
      // —— 主题背景图库：列表 / base64 上传 / 删除（取文件见上方的 /bg/file，URL 带 ?t= token）——
      if (req.method === 'GET' && url.pathname === '/bg') {
        json(res, 200, { ok: true, files: listBgFiles(dataRoot), maxCount: BG_MAX_COUNT });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/bg') {
        // 图片走 base64（约为原文件的 1.34 倍），上限放宽到 16MB；
        // 其余端点维持 1MB
        const body = await readBody(req, 16 << 20);
        const name = sanitizeBgName(body?.name);
        const data = typeof body?.data === 'string' ? body.data : '';
        if (!name || !BG_EXT.has(name.slice(name.lastIndexOf('.')).toLowerCase())) {
          json(res, 400, { ok: false, code: 'bg-name', error: '图片文件名需以 png/jpg/jpeg/webp/gif/bmp/avif 结尾，且不含路径' });
          return;
        }
        if (!/^data:image\/[a-z+]+;base64,/.test(data)) {
          json(res, 400, { ok: false, code: 'bg-data', error: '图片数据需为 data:image/*;base64 格式（视频走 /bg/upload）' });
          return;
        }
        const b64 = data.slice(data.indexOf(',') + 1);
        const buf = Buffer.from(b64, 'base64');
        if (!buf.length || buf.length > BG_MAX_BYTES) {
          json(res, 400, { ok: false, code: 'bg-size', error: `图片需在 10MB 以内（收到 ${(buf.length / 1048576).toFixed(1)}MB）` });
          return;
        }
        const dir = backgroundsDir(dataRoot);
        const existing = listBgFiles(dataRoot);
        if (!existsSync(join(dir, name)) && existing.length >= BG_MAX_COUNT) {
          json(res, 400, { ok: false, code: 'bg-count', error: `图库最多 ${BG_MAX_COUNT} 个文件，请先删除一些再上传` });
          return;
        }
        // 图片解码校验：文件头魔数匹配扩展名（防止把可执行文件改名成 png 上传）
        const magicOk = bgMagicOk(name, buf);
        if (!magicOk) {
          json(res, 400, { ok: false, code: 'bg-magic', error: '图片内容与扩展名不符' });
          return;
        }
        try {
          mkdirSync(dir, { recursive: true });
          // 临时名带 pid+随机：两个写者（上传/同步下载）撞同一文件名时不共用一个 .tmp
          const tmp = join(dir, `${name}.${process.pid}.${Date.now().toString(36)}.tmp`);
          writeFileSync(tmp, buf);
          renameOrReplace(tmp, join(dir, name));
        } catch (errBg) {
          json(res, 500, { ok: false, code: 'bg-write', error: '写入壁纸文件失败: ' + (errBg?.message || errBg) });
          return;
        }
        json(res, 200, { ok: true, name, files: listBgFiles(dataRoot) }); // 回传清洗后的落盘名：客户端选中态要按它存
        return;
      }
      if (req.method === 'POST' && url.pathname === '/bg/delete') {
        const body = await readBody(req);
        const name = sanitizeBgName(body?.name);
        if (!name) { json(res, 400, { ok: false, code: 'bg-name', error: '非法文件名' }); return; }
        try {
          const file = join(backgroundsDir(dataRoot), name);
          if (existsSync(file)) {
            cleanupBgTranscode(dataRoot, file);
            unlinkOrDefer(file);
          }
          sweepDeferredBg(backgroundsDir(dataRoot));
          sweepDeferredBg(transcodeDir(dataRoot)); // 转码缓存里被删片时改名的 .deleted-* 也扫
        } catch (errBg) {
          json(res, 500, { ok: false, code: 'bg-delete', error: '删除壁纸文件失败: ' + (errBg?.message || errBg) });
          return;
        }
        json(res, 200, { ok: true, files: listBgFiles(dataRoot) });
        return;
      }
      // —— 视频壁纸上传：raw 字节流直写文件（base64 会把内存翻倍，视频走这里）——
      if (req.method === 'POST' && url.pathname === '/bg/upload') {
        const name = sanitizeBgName(url.searchParams.get('name') || '');
        const ext = name ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
        if (!name || !VIDEO_EXT.has(ext)) {
          json(res, 400, { ok: false, code: 'bg-name', error: '视频文件名需以 mp4/webm/mov 结尾，且不含路径' });
          return;
        }
        const dir = backgroundsDir(dataRoot);
        const existing = listBgFiles(dataRoot);
        if (!existsSync(join(dir, name)) && existing.length >= BG_MAX_COUNT) {
          json(res, 400, { ok: false, code: 'bg-count', error: `图库最多 ${BG_MAX_COUNT} 个文件，请先删除一些再上传` });
          return;
        }
        let cleanupTmp = () => {};
        try {
          mkdirSync(dir, { recursive: true });
          // tmp 名带随机后缀：同名并发上传不共用一个临时文件互相写坏
          const tmp = join(dir, `${name}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.tmp`);
          cleanupTmp = () => { try { unlinkSync(tmp); } catch { /* 未写入过就没有 */ } };
          const ws = createWriteStream(tmp);
          ws.on('error', () => {
            cleanupTmp();
            if (!res.writableEnded) json(res, 500, { ok: false, code: 'bg-write', error: '写入视频失败（磁盘或权限）' });
          });
          let size = 0;
          let head = Buffer.alloc(0);
          let overflow = false;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > VIDEO_MAX_BYTES) {
              overflow = true; // 超限后排干剩余字节，直接 break 会销毁连接、400 到不了客户端
              continue;
            }
            if (head.length < 16) head = Buffer.concat([head, chunk]).slice(0, 16);
            ws.write(chunk);
          }
          if (overflow) {
            try { ws.destroy(); } catch { /* ignore */ }
            cleanupTmp();
            json(res, 400, { ok: false, code: 'bg-size', error: `视频需在 ${VIDEO_MAX_BYTES / 1048576}MB 以内` });
            return;
          }
          // 等数据全部落盘再校验/改名：半截文件冒充成功是数据损坏
          await new Promise((resolveWait) => {
            if (ws.writableFinished) { resolveWait(); return; }
            ws.on('finish', resolveWait);
            ws.on('error', resolveWait); // 出错同样解除等待，不然请求处理函数永久挂起
            ws.end();
          });
          // 文件头魔数校验（防把可执行文件改名成 mp4 上传）：mp4/mov 是 ftyp 盒，webm 是 EBML
          const magicOk = bgMagicOk(name, head);
          if (!size || !magicOk) {
            try { unlinkSync(tmp); } catch { /* ignore */ }
            json(res, 400, { ok: false, code: 'bg-magic', error: '视频内容与扩展名不符' });
            return;
          }
          renameOrReplace(tmp, join(dir, name));
        } catch (errBg) {
          cleanupTmp();
          if (!res.writableEnded) json(res, 500, { ok: false, code: 'bg-write', error: '写入视频失败: ' + (errBg?.message || errBg) });
          return;
        }
        json(res, 200, { ok: true, name, files: listBgFiles(dataRoot) });
        return;
      }
      // —— 视频帧率上限转码：起 ffmpeg 出抽帧版存缓存（key = 源路径+帧率的散列），
      // 注入层先播原片、转码完成再换；同一文件重复请求只起一个 ffmpeg
      if (req.method === 'POST' && url.pathname === '/bg/transcode') {
        const body = await readBody(req);
        const name = sanitizeBgName(body?.name || '');
        const ext = name ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
        const fps = Number(body?.fps);
        const dir = body?.from === 'folder' ? loadConfig(configFile).theme.bg.folder : backgroundsDir(dataRoot);
        const src = name && dir ? join(dir, name) : '';
        if (!src || !VIDEO_EXT.has(ext) || !existsSync(src)) {
          json(res, 400, { ok: false, code: 'transcode-src', error: '转码源视频无效' });
          return;
        }
        if (!TRANSCODE_FPS.has(fps)) {
          json(res, 400, { ok: false, code: 'transcode-fps', error: `帧率上限仅支持 ${[...TRANSCODE_FPS].join('/')}` });
          return;
        }
        const srcStat = statSync(src);
        // key 并入源文件大小与修改时间：同名覆盖后缓存自动失效重转
        const key = createHash('sha1').update(`${src}#${fps}#${srcStat.mtimeMs}#${srcStat.size}`).digest('hex').slice(0, 16);
        const out = join(transcodeDir(dataRoot), key + '.mp4');
        if (existsSync(out)) { json(res, 200, { ok: true, key, ready: true }); return; }
        if (!hasFfmpeg()) { json(res, 200, { ok: false, code: 'no-ffmpeg', error: '未检测到 ffmpeg，帧率上限不可用' }); return; }
        if (transcodeJobs.has(key)) { json(res, 200, { ok: true, key, ready: false }); return; }
        if (transcodeJobs.size >= TRANSCODE_MAX_CONCURRENCY) {
          // 并发满显式拒绝：让注入层本轮放弃，别空等 30 分钟轮询一个不会出现的文件
          json(res, 200, { ok: false, code: 'transcode-busy', error: '转码排队已满，稍后重试' });
          return;
        }
        if (true) {
          mkdirSync(transcodeDir(dataRoot), { recursive: true }); // 先建目录：同步抛错（磁盘满/无权限）不能把并发名额占住
          transcodeJobs.add(key);
          // 临时名必须保留 .mp4 后缀：ffmpeg 靠后缀识别容器，.tmp 会直接报
          // Unable to find a suitable output format（fpsCap 全程哑火的根因）
          const tmp = out + '.tmp.mp4';
          // 抽帧同时把长边压到 1920 以内：4K 素材按原始分辨率解码是视频壁纸
          // 发热/卡顿的大头，缩小后解码与合成开销成倍下降；小视频不放大
          const vf = `fps=${fps},scale=min(1920\\,iw):min(1920\\,ih):force_original_aspect_ratio=decrease`;
          let child;
          try {
            child = spawn('ffmpeg', ['-y', '-i', src, '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', tmp], { stdio: 'ignore', windowsHide: true });
            transcodeChildren.add(child);
          } catch (errSpawn) {
            transcodeJobs.delete(key); // 同步抛错也把名额放掉
            throw errSpawn;
          }
          child.on('exit', (code) => {
            transcodeJobs.delete(key);
            transcodeChildren.delete(child);
            try {
              if (code === 0) renameOrReplace(tmp, out); // renameOrReplace 扛得住 Windows 文件占用
              else rmSync(tmp, { force: true });
            } catch { /* 缓存目录写失败：下次再试 */ }
          });
          child.on('error', () => { transcodeJobs.delete(key); transcodeChildren.delete(child); });
          // 看门狗直接 SIGKILL（与 jobRun 一致）：ffmpeg 不退则 exit 不触发、转码名额泄漏
          const killTimer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* 已退出 */ } }, 30 * 60 * 1000);
          child.on('exit', () => clearTimeout(killTimer));
        }
        json(res, 200, { ok: true, key, ready: false });
        return;
      }
      // —— 文件夹背景：设置/刷新列表（目录本身存 theme.bg.folder，文件原地读
      // 取不复制）；切换由注入层定时驱动（随机或顺序）
      const listFolderBg = (dir) => {
        const st = statSync(dir);
        if (!st.isDirectory()) return { error: '不是文件夹：' + dir };
        const files = readdirSync(dir)
          .filter((name) => MEDIA_EXT.has(name.slice(name.lastIndexOf('.')).toLowerCase()))
          // 名字过不了取文件时二次清洗的不列（列了也取不到，还会误命中清洗后同名的文件）
          .filter((name) => sanitizeBgName(name) === name)
          .map((name) => { const s = statSync(join(dir, name)); return { name, size: s.size, mtime: s.mtimeMs }; })
          .sort((a, b) => a.name.localeCompare(b.name));
        return { files };
      };
      if (req.method === 'POST' && url.pathname === '/bg/folder') {
        const body = await readBody(req);
        const dir = typeof body?.dir === 'string' ? body.dir.trim() : '';
        if (!dir || dir.length > 4096) { json(res, 400, { ok: false, code: 'bg-folder', error: '文件夹路径无效' }); return; }
        if (!isAbsolute(dir)) { json(res, 400, { ok: false, code: 'bg-folder', error: '文件夹路径需为绝对路径（以 / 或盘符开头）' }); return; }
        if (!existsSync(dir)) { json(res, 404, { ok: false, code: 'bg-folder', error: '文件夹不存在：' + dir }); return; }
        try {
          const r = listFolderBg(dir);
          if (r.error) { json(res, 400, { ok: false, code: 'bg-folder', error: r.error }); return; }
          json(res, 200, { ok: true, files: r.files, dir });
        } catch (errBg) {
          json(res, 500, { ok: false, code: 'bg-folder', error: '读取文件夹失败: ' + (errBg?.message || errBg) });
          return;
        }
        return;
      }
      if (req.method === 'GET' && url.pathname === '/bg/folder/list') {
        // dir 查询参数：分区背景列自己目录时传入；缺省列全局设置的目录。
        // dir 只认用户配置过的目录（与取文件路由同一判定），不合法与文件路由同款报错
        const qDir = url.searchParams.get('dir');
        if (qDir && !bgFolderDirAllowed(loadConfig(configFile).theme.bg, qDir)) {
          json(res, 400, { ok: false, error: 'dir 参数无效或未配置' });
          return;
        }
        const dir = qDir || loadConfig(configFile).theme.bg.folder;
        if (!dir || !existsSync(dir)) { json(res, 200, { ok: true, files: [], missing: true, dir: dir || '' }); return; }
        try {
          const r = listFolderBg(dir);
          json(res, 200, r.error ? { ok: true, files: [], missing: true, dir } : { ok: true, files: r.files, dir });
        } catch {
          json(res, 200, { ok: true, files: [], missing: true, dir });
        }
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
      if (req.method === 'GET' && url.pathname === '/projects-v2') {
        // 虚拟项目（3.16.1 起 projects/project_roots 表）：别名迁移弹窗用 roots
        // 区分“目录已并入其他项目”与“项目已删除”。读不到时 available=false，
        // 注入端降级为纯 DOM 检测
        const data = await listVirtualProjects(dataRoot);
        json(res, 200, data
          ? { ok: true, available: true, ...data }
          : { ok: true, available: false, projects: [], deletedRoots: [] });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/task-statuses') {
        // 批量会话终态 + 标题：注入侧剔除 syncer 卡滞的误报、alt+r 弹窗显示
        // 折叠项目会话标题都用它。读不到时 available=false，调用方按未确认处理
        const ids = (url.searchParams.get('ids') || '')
          .split(',').map((s) => s.trim()).filter(Boolean).slice(0, 200);
        const statuses = ids.length ? await listTaskStatuses(dataRoot, ids) : {};
        json(res, 200, statuses !== null
          ? { ok: true, available: true, statuses }
          : { ok: true, available: false, statuses: {} });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/sessions-activity') {
        // 子会话最近活动时间（毫秒）：子代理 running 记录的新鲜度校验，
        // 长时间没动静的僵死记录不亮机器人（subagent-icon.js）
        const ids = (url.searchParams.get('ids') || '')
          .split(',').map((s) => s.trim()).filter(Boolean).slice(0, 300);
        const activity = ids.length ? await listSessionsActivity(dataRoot, ids) : {};
        json(res, 200, { ok: true, activity });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/workspace-sessions') {
        // 某工作区的任务会话 id（任务索引反查）：折叠项目行扫子代理运行状态的候选清单
        const path = url.searchParams.get('path') || '';
        const ids = path ? await listWorkspaceTaskIds(dataRoot, path) : [];
        json(res, 200, { ok: true, ids });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/subagent-children') {
        // 会话的子代理子会话及最近活动时间（含嵌套）：子代理判活的主信号——
        // 应用的运行记录会把还在跑的长跑子代理误记为结束（subagent-icon.js）
        const ids = (url.searchParams.get('ids') || '')
          .split(',').map((s) => s.trim()).filter(Boolean).slice(0, 300);
        const children = ids.length ? await listSubagentChildrenActivity(dataRoot, ids) : [];
        json(res, 200, { ok: true, children });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/background-bash') {
        // 后台 bash 任务在跑清单（进程握着的日志文件反查会话）：终端图标的信号，
        // 纯文件系统扫描，不拉会话快照（快照会 resume 会话，见 scanBackgroundBash）
        json(res, 200, scanBackgroundBash());
        return;
      }
      if (req.method === 'GET' && url.pathname === '/project-unread') {
        // 项目"真未读"任务数（排除错误态）：项目行蓝色未读徽标忽略红色错误行
        const ids = (url.searchParams.get('ids') || '')
          .split(',').map((s) => s.trim()).filter(Boolean).slice(0, 100);
        const unread = ids.length ? await listProjectsUnread(dataRoot, ids) : {};
        json(res, 200, unread === null ? { ok: false } : { ok: true, unread });
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
        json(res, ...(await setAlias(body, configFile)));
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
      // 会话拖动排序持久化：hint = 拖动落点所在的列表（project/pinned/section，
      // 缺省按数据判定），旧注入包的 scope（workspace/group-members）回退认作 hint；
      // 工作区列表重盖 updated_at，分组会话重写 members.sort_order
      if (req.method === 'POST' && url.pathname === '/task-order') {
        const body = await readBody(req);
        const ordered = Array.isArray(body?.ordered) ? body.ordered.filter((k) => typeof k === 'string') : [];
        if (ordered.length === 0) {
          json(res, 400, { ok: false, code: 'invalid-request', error: 'ordered 不能为空' });
          return;
        }
        const result = await reorderTasks(dataRoot, ordered, body.hint ?? body.scope);
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
        // 先自动校正：桌面端打开会话时会把运行时缓存的旧标题写回任务索引（实测），
        // 对我们写过且 CLI custom 仍是所写标题的会话，把索引改回来再下发
        const config0 = loadConfig(configFile);
        if (config0.titleGen.customWritten && Object.keys(config0.titleGen.customWritten).length) {
          const repaired = await reconcileCustomTitles(dataRoot, config0.titleGen.customWritten);
          if (repaired.length) titleGenLog(dataRoot, `reconciled sess=${repaired.map((s) => s.slice(5, 13)).join(',')}`);
        }
        const r = await listOverriddenTitles(dataRoot);
        if (r.error) {
          json(res, 500, { ok: false, code: r.code, error: r.error });
          return;
        }
        const config = loadConfig(configFile);
        json(res, 200, { ok: true, enabled: config.features.titleLock !== false, titles: r.titles });
        return;
      }
      // —— 智能起名：配置读写 + 供应商列表 + 生成并写库 ——
      if (req.method === 'GET' && url.pathname === '/title-gen') {
        json(res, 200, { ok: true, titleGen: loadConfig(configFile).titleGen, defaultPrompt: titleGenDefaultPrompt() });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/title-gen') {
        const body = await readBody(req);
        if (body && typeof body === 'object' && body.titleGen && typeof body.titleGen === 'object') {
          // 读改写（loadConfig→改→saveConfig）放进跨进程锁内同步执行，
          // 防止与别的写入方互相覆盖整份配置
          await withConfigLock(configFile, () => {
            const current = loadConfig(configFile);
            const next = { ...current.titleGen, ...body.titleGen };
            // 选了列表内供应商：同步解析并保存其地址/密钥/协议副本——供应商日后
            // 被删，这份副本仍可直连（界面标注“已删除”并展开字段）；
            // 跟随会话不存副本（每次调用时按该会话实时解析）
            const providerId = (next.provider || '').trim();
            if (providerId && providerId !== 'session') {
              const found = listTitleGenProviders().find((p) => p.id === providerId);
              if (found) {
                next.baseUrl = found.baseUrl;
                next.apiKey = found.apiKey;
                next.format = found.format;
              }
              // 找不到（手输 id 或已删）：保留原有副本字段不动
            } else if (providerId === 'session') {
              // 跟随会话不存副本（每次调用时按该会话实时解析）
              next.baseUrl = '';
              next.apiKey = '';
              next.format = '';
            }
            current.titleGen = mergeTitleGenConfig(next);
            if (!saveConfig(configFile, current)) {
              json(res, 500, { ok: false, code: 'config-unreadable', error: 'zcodepro.json 读取失败或已损坏，保存中止（请先修好配置文件）' });
              return;
            }
            json(res, 200, { ok: true, titleGen: current.titleGen });
          });
          return;
        }
        json(res, 400, { ok: false, code: 'invalid-request', error: 'body 需包含 titleGen 对象' });
        return;
      }
      // 供应商下拉数据：与视觉代理同源同规则，但只列 helper 能在会话外直接
      // 调用的条目（有地址、密钥且协议可判定），并带可选模型列表；不回密钥
      if (req.method === 'GET' && url.pathname === '/title-gen/providers') {
        json(res, 200, {
          ok: true,
          providers: listTitleGenProviders().map(({ apiKey, ...rest }) => rest),
        });
        return;
      }
      // 生成（并可选写库）：text = 会话首条消息；sessId 指定且非 test 时按
      // “手动重命名”写入任务索引（已重命名的会话不会被动）；test = 设置面板
      // 的测试按钮，只生成不写库
      if (req.method === 'POST' && url.pathname === '/title-gen/run') {
        const body = await readBody(req);
        const text = typeof body?.text === 'string' ? body.text : '';
        if (!text.trim()) {
          json(res, 400, { ok: false, code: 'invalid-request', error: 'text 不能为空' });
          return;
        }
        const cfg = loadConfig(configFile).titleGen;
        if (cfg.enabled !== true && body.test !== true) {
          json(res, 400, { ok: false, code: 'title-gen-disabled', error: '智能起名未开启' });
          return;
        }
        // 会话 id 有 sess_ 与 session_ 两种前缀（新版应用为 session_），两种都认，
        // 否则新形式会话的标题永远不会写入数据库
        const sessId = typeof body?.sessId === 'string' && /^(?:sess|session)_[A-Za-z0-9._-]+$/.test(body.sessId) ? body.sessId : '';
        let title;
        try {
          title = await generateTitleWith(cfg, text, dataRoot, sessId);
        } catch (err) {
          titleGenLog(dataRoot, `generate-failed sess=${sessId.slice(0, 13)} err=${err?.message || err}`);
          throw err; // 交给外层统一 500
        }
        let written = false;
        let store = ''; // CLI 会话库写入结果：'' 成功 | skipped 原因 | 'error'
        if (sessId && body.test !== true) {
          // 已被手动重命名（或前次起名已写过）就整体跳过——手动重命名永远优先，
          // 也避免起名晚到的 CLI 写入盖掉用户的 custom 标题
          if (await isTaskTitleOverridden(dataRoot, sessId)) {
            json(res, 200, { ok: true, title, written: false, store: 'skipped: overridden' });
            return;
          }
          const r = await writeGeneratedTitle(dataRoot, configFile, sessId, title);
          if (r.error) {
            json(res, 500, { ok: false, code: r.error.code || 'index-error', error: r.error.message });
            return;
          }
          written = r.written;
          store = r.store;
        }
        json(res, 200, { ok: true, title, written, store });
        return;
      }
      // 手动自动重命名（任务行悬浮按钮 / 右键菜单入口）：取会话最近 N 轮问答按
      // 提示词生成标题并按“手动重命名”写库。用户显式动作：已重命名过也照写
      //（force），不受启用开关限制（入口各有开关）；生成失败交外层统一 500
      if (req.method === 'POST' && url.pathname === '/title-gen/rename') {
        const body = await readBody(req);
        const sessId = typeof body?.sessId === 'string' && /^(?:sess|session)_[A-Za-z0-9._-]+$/.test(body.sessId) ? body.sessId : '';
        if (!sessId) {
          json(res, 400, { ok: false, code: 'invalid-request', error: 'sessId 不能为空' });
          return;
        }
        const cfg = loadConfig(configFile).titleGen;
        let material;
        try {
          material = await readRecentQa(dataRoot, sessId, cfg.recentQa);
        } catch (err) {
          titleGenLog(dataRoot, `rename-read-error sess=${sessId.slice(0, 13)} err=${err?.message || err}`);
          json(res, 500, { ok: false, code: 'read-error', error: err?.message || '读取会话内容失败' });
          return;
        }
        if (!material) {
          json(res, 200, { ok: false, code: 'no-content', error: '会话还没有问答内容' });
          return;
        }
        let title;
        try {
          title = await generateTitleWith(cfg, material, dataRoot, sessId);
        } catch (err) {
          titleGenLog(dataRoot, `rename-generate-failed sess=${sessId.slice(0, 13)} err=${err?.message || err}`);
          throw err; // 交给外层统一 500
        }
        const r = await writeGeneratedTitle(dataRoot, configFile, sessId, title, { force: true });
        if (r.error) {
          json(res, 500, { ok: false, code: r.error.code || 'index-error', error: r.error.message });
          return;
        }
        json(res, 200, { ok: true, title, written: r.written, store: r.store });
        return;
      }
      // —— zcode-vision 插件（图片视觉代理）：设置弹窗“视觉代理”标签页读写 ————
      if (req.method === 'GET' && url.pathname === '/vision') {
        const file = visionFile;
        let parsed = readJsonFile(file);
        // 装了 zcode-pro 默认启用识图卡片（插件纯安装默认关，纯文本展示）：
        // 只补从未写过的配置，用户显式设过 cardUi（含 false）不覆盖
        if (parsed && typeof parsed === 'object' && !('cardUi' in parsed)) {
          // 写前重读一次拿最新值合并：与插件侧的模板升级等写方并发时，
          // 拿读取时的旧快照整份写回会把对方刚写的键盖掉
          const fresh = readJsonFile(file);
          const base = (fresh && typeof fresh === 'object') ? fresh : parsed;
          if (!('cardUi' in base)) {
            const merged = { ...base, cardUi: true };
            try {
              const tmp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`; // 防多写者撕裂
              writeFileSync(tmp, JSON.stringify(merged, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 });
              renameSync(tmp, file);
            } catch { /* 补写失败下次再试，不阻塞读取 */ }
          }
        }
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
          const file = visionFile;
          // 与磁盘旧配置合并（本块曾两次被并发改动覆盖回全量覆盖）：前端按自己
          // 的字段重建整份配置，直接覆盖会丢插件新增、面板还不认识的键
          //（cardSandboxBudget/cardUi/interceptMode 等）
          const merged = { ...(readJsonFile(file) || {}), ...cfg };
          // forceIntercept 为 null = 面板选了「自动」：从磁盘配置删掉该键，恢复插件缺省联动
          if (cfg.forceIntercept === null) delete merged.forceIntercept;
          const tmp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`; // 防多写者撕裂
          writeFileSync(tmp, JSON.stringify(merged, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 });
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
            // 只改 powerWatchInterval 一个键：readHeadroomConfig 会把非规范值归一
            // 成默认值（插件侧是宽松读法），整份写回会把 backend 之类的本机值打回默认。
            // 套配置锁：与同步导入、setHeadroomUsage 等自家写方互斥（插件侧写方走
            // 它自己的生命周期锁，两边共存仍留极小窗口，写回本身是原子改名兜底）
            await withConfigLock(file, () => {
              const cfg = readJsonFile(file) || {};
              cfg.powerWatchInterval = clampInt(body.interval, 10, 3600, Number(cfg.powerWatchInterval) || 60);
              writeHeadroomConfig(file, cfg);
            });
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
      // —— 开发模式重载（设置弹窗“调试”标签页）：不重启 ZCode 换新代码 ——
      if (req.method === 'POST' && url.pathname === '/dev/reload') {
        if (loadConfig(configFile).devMode !== true && process.env.ZCODEPRO_DEV !== '1') {
          json(res, 404, { ok: false, error: 'not found' });
          return;
        }
        // 源码目录（有 package.json 与 esbuild）先构建，安装副本没有构建环境则跳过
        let built = false;
        const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
        // Windows 上优先 esbuild.exe：无扩展名的 bin/esbuild 是 JS 垫片，spawnSync 跑不起来
        const esbuildNames = process.platform === 'win32' ? ['esbuild.exe', 'esbuild'] : ['esbuild', 'esbuild.exe'];
        const esbuildBin = esbuildNames
          .map((n) => join(repoRoot, 'node_modules', 'esbuild', 'bin', n))
          .find((p) => existsSync(p)) || '';
        if (esbuildBin) {
          try {
            const b = spawnSync(esbuildBin, ['src/inject/index.js', '--bundle',
              '--format=iife', '--target=chrome120', '--outfile=dist/inject.js'],
              { cwd: repoRoot, timeout: 60000, encoding: 'utf8', windowsHide: true });
            built = !b.error && b.status === 0;
          } catch { /* 构建失败也继续交接（可能只改了 host 端代码） */ }
        }
        json(res, 200, { ok: true, built });
        // 先应答再交接：拉起新的启动器进程（同一入口与参数，读新构建的 inject.js
        // 与新 host 代码），本进程随后退出。页面刷新由注入脚本的换代守卫触发
        // （见 src/inject/index.js）；新进程的 helper 端口占用靠监听重试等待
        setTimeout(() => {
          try {
            const child = spawn(process.execPath, process.argv.slice(1), {
              detached: true, stdio: 'ignore', windowsHide: true, env: process.env,
            });
            child.unref();
          } catch { /* 拉不起来就只能等下次手动重启 */ }
          setTimeout(() => {
            try { dispose(); } catch { /* ignore */ } // 收掉残留 ffmpeg 子进程，防孤儿与新实例抢写缓存
            process.exit(0);
          }, 250);
        }, 150);
        return;
      }
      // —— 软件代理连通性检测：经 curl -x 走代理访问插件市场/本体升级实际要用的站点 ——
      if (req.method === 'POST' && url.pathname === '/proxy/test') {
        const body = await readBody(req);
        const proxy = typeof body?.proxy === 'string' && body.proxy.trim() ? body.proxy.trim() : effectiveProxyUrl();
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
        // 读改写（loadConfig→改→saveConfig）放进跨进程锁内同步执行，
        // 防止与别的写入方互相覆盖整份配置
        await withConfigLock(configFile, () => {
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
          if (!saveConfig(configFile, current)) {
            json(res, 500, { ok: false, code: 'config-unreadable', error: 'zcodepro.json 读取失败或已损坏，保存中止（请先修好配置文件）' });
            return;
          }
          json(res, 200, { ok: true, sync: current.sync });
        });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/sync/run') {
        const body = await readBody(req);
        const direction = body?.direction === 'pull' ? 'pull' : body?.direction === 'push' ? 'push' : '';
        if (!direction) {
          json(res, 400, { ok: false, code: 'invalid-request', error: 'direction 只能是 push 或 pull' });
          return;
        }
        // 同 direction 的并发触发共用同一次执行结果（见 enqueueSyncRun），
        // 不同 direction 串行排队
        const r = await enqueueSyncRun(direction, async () => {
          const cfg = loadConfig(configFile);
          return runSettingsSync({ direction, dataRoot, configFile, config: cfg, proxyUrl: proxyUrlFor('sync') });
        });
        if (r.error) {
          json(res, r.status || 500, { ok: false, code: r.code || 'sync-run', error: r.error });
          return;
        }
        json(res, 200, { ok: true, direction, applied: r.applied, ...(typeof r.pruned === 'number' ? { pruned: r.pruned } : {}), ...(r.bg ? { bg: r.bg } : {}), sync: loadConfig(configFile).sync });
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
        if (!webdavHttpSchemeOk(sync.url)) {
          json(res, 400, { ok: false, code: 'sync-not-configured', error: '公网 WebDAV 地址需改用 https（http 明文传输登录名和密码）；内网或回环地址可继续用 http' });
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
        if (!webdavHttpSchemeOk(sync.url)) {
          json(res, 400, { ok: false, code: 'sync-not-configured', error: '公网 WebDAV 地址需改用 https（http 明文传输登录名和密码）；内网或回环地址可继续用 http' });
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
          if (r && r.error) {
            json(res, r.status || 500, { ok: false, code: r.code, error: r.error });
            return;
          }
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
          writeFileSync(target, r.body, { encoding: 'utf8', mode: 0o600 }); // 导出内容含明文 apiKey，限制本人读写
          try { chmodSync(target, 0o600); } catch { /* 覆盖同名旧文件时 mode 不生效，补一次 */ }
        } catch (err) {
          json(res, 500, { ok: false, code: 'sync-export', error: `写入 ${target} 失败: ${err?.message || err}` });
          return;
        }
        json(res, 200, { ok: true, path: target });
        return;
      }
      // —— zcode-plugins 市场更新：读状态（带 30 分钟节流的市场同步）与执行更新 ————
      // —— 状态栏统计（status-bar.js）：聚合 ~/.zcode/cli/rollout 的模型调用记录 ————
      // model-io-*.jsonl 每行一次模型调用，response.usage 有分项 token；成本字段
      // 官方未落本地，成本类统计项由注入侧按“无数据自动隐藏”处理
      if (req.method === 'GET' && url.pathname === '/stats/usage') {
        // 会话 id 校验同 sessId 白名单：不像会话 id 的一律按全局口径处理
        //（降级后注入侧仍按“本会话”展示全局速率，官方改 key 格式时才会踩到）
        const rawSid = url.searchParams.get('session') || '';
        const sessionId = /^(?:sess|session)_[A-Za-z0-9._-]+$/.test(rawSid) ? rawSid : '';
        // turns=0 跳过分钟桶聚合（状态栏只读 global，不白建每轮桶）
        const wantTurns = url.searchParams.get('turns') !== '0';
        // 会话树 trace：速率把同树子代理的调用算进来
        const treeTrace = sessionId ? await sessionTrace(dataRoot, sessionId) : '';
        const { global, recentTurns } = collectUsageStats(sessionId, wantTurns, treeTrace);
        // 官方口径的会话汇总（主轮请求/累计输入输出/平均命中/树口径净生成速率）：状态栏会话组用
        const mu = sessionId ? await listSessionModelUsage(dataRoot, sessionId, treeTrace) : null;
        // 任务总数 60 秒缓存：状态栏每 2 秒请求一次，不必每次开关 SQLite
        if (Date.now() - tasksCountAt > 60_000) {
          tasksCountAt = Date.now();
          tasksCountCache = await countTasks(dataRoot);
        }
        global.tasks = tasksCountCache;
        json(res, 200, { ok: true, global, recentTurns, ...(mu ? { sessionSummary: mu.summary } : {}) });
        return;
      }
      // —— 每轮用量（turn-usage.js）：官方 model_usage 同源的主轮请求明细 ——
      if (req.method === 'GET' && url.pathname === '/stats/turns') {
        const rawSid = url.searchParams.get('session') || '';
        const sessionId = /^(?:sess|session)_[A-Za-z0-9._-]+$/.test(rawSid) ? rawSid : '';
        const mu = await listSessionModelUsage(dataRoot, sessionId);
        json(res, 200, { ok: true, rounds: mu.rounds, summary: mu.summary });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/plugins/status') {
        // 市场同步与更新任务共用同一条串行队列，不能绕过它：两处同时 clone/pull
        // 同一个市场目录会互相删对方的中间目录（ENOENT/坏目录）。
        // 有更新任务在跑/排队时整个跳过（任务自身会做市场同步并刷新时间戳），
        // 状态页轮询不排队等待、不能被长任务挂住；检查与入队在同一同步段内完成
        let marketAdd = null;
        if (!pluginsUpdateJobs.size) {
          await runPluginsQueued(async () => {
            marketAdd = await ensureZcodePluginsMarketplace();
            if (Date.now() - lastMarketplaceSync > 30 * 60 * 1000) {
              await ensureZcodePluginsCloneFresh();
              await runZcodeCli(['plugins', 'marketplace', 'update', ZCODE_PLUGINS_MARKETPLACE], 60000);
              lastMarketplaceSync = Date.now();
            }
          });
        }
        const status = pluginUpdateStatus();
        if (!status) {
          // 带上市场添加失败的真实原因：新机器最常见的是连不上 GitHub / 没装 Git，
          // 设置面板和启动检查都靠这条信息提示用户，别再只给一句“读取失败”
          const failed = marketAdd && !marketAdd.ok ? marketAdd : null;
          json(res, 500, {
            ok: false,
            code: failed?.code || 'plugins-status',
            error: failed?.error || '读取插件清单失败（未安装过 zcode-plugins 市场？）',
          });
          return;
        }
        json(res, 200, { ok: true, ...status });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/plugins/update') {
        const body = await readBody(req);
        const result = await enqueuePluginsUpdate(body);
        json(res, result.status, result.payload);
        return;
      }
      json(res, 404, { ok: false, error: 'not found' });
    } catch (err) {
      // 完整错误只进日志；响应里的消息抹掉主目录前缀，别把本机路径结构带出去
      console.error('[zcodepro] 路由处理出错:', err);
      json(res, 500, { ok: false, error: String(err?.message || err).split(homedir()).join('~') });
    }
  });

  // 端口被占时重试：开发重载的交接窗口内，旧进程退出略晚于新进程启动，
  // 新进程在这里等它让出端口（默认最多 20 秒），而不是启动失败；
  // 热替换路径传小的 listenTries，别把启动器主循环卡在这里
  return new Promise((resolveStarted, rejectStarted) => {
    let attempts = 0;
    const tryListen = () => {
      attempts += 1;
      server.removeAllListeners('error');
      server.once('error', (err) => {
        if (err && err.code === 'EADDRINUSE' && attempts < listenTries) {
          try { server.close(); } catch { /* ignore */ }
          setTimeout(tryListen, 500);
          return;
        }
        rejectStarted(err);
      });
      // 启动即补视觉配置缺省键：装了 zcode-pro ⇒ cardUi=true（识图卡片开，缺省
      // 才补、显式设过不动，规则同 GET /vision），不必等用户打开视觉设置页
      try {
        const vFile = visionFile;
        const vParsed = readJsonFile(vFile);
        if (vParsed && typeof vParsed === 'object' && !('cardUi' in vParsed)) {
          vParsed.cardUi = true;
          const vTmp = `${vFile}.${process.pid}.${Date.now().toString(36)}.tmp`; // 防多写者共用同一 .tmp 撕裂
          writeFileSync(vTmp, JSON.stringify(vParsed, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 }); // 文件里有明文 apiKey，限制本人读写
          renameSync(vTmp, vFile);
        }
      } catch { /* 无配置或不可写不影响启动 */ }
      // 服务就绪即安排 headroom 代理兜底（内部延迟 5 秒执行，避开启动高峰）
      server.listen(port, '127.0.0.1', () => { ensureHeadroomAtStartup(state); resolveStarted(server); });
    };
    tryListen();
  });
}

// 市场快照同步节流：helper 进程内 30 分钟最多主动 git pull 一次
let lastMarketplaceSync = 0;
let tasksCountAt = 0;
let tasksCountCache = 0; // 任务总数缓存（/stats/usage 高频轮询，60 秒一刷）

// —— 状态栏统计：rollout 模型调用记录聚合 ————
// ~/.zcode/cli/rollout/model-io-*.jsonl 每行一次模型调用；usage 字段有两种键风格
// （协议 camelCase 与原始 snake_case），两种都解析。文件小（个位数、每会话一个），
// 按 mtime+size 缓存只重读变过的文件；聚合结果含按日分桶（本地时区）供“今日”用
const usageFileCache = new Map(); // 文件名 → { mtime, size, ino, goneAt, recs: [{at, ts, ms, in, out, cacheRead, session, trace}] }
// 测试缝：覆盖 rollout 记录目录（scripts/test-usage-stats.mjs 用假数据跑真实聚合）
let rolloutDirOverride = '';
// 被滚动删除的会话文件，其解析记录在缓存里的保留时长
const ROLLOUT_KEEP_MS = 2 * 3600_000;
// 测试用：换目录即作废全部缓存，假数据与真实记录不混算
export function setRolloutDirForTest(dir) {
  rolloutDirOverride = dir || '';
  usageFileCache.clear();
  rolloutRecsCache = null;
  rolloutSig = '';
  statsResultCache = { sig: '', key: '', result: null };
}
// 记录合并结果缓存：文件签名（名称+mtime+size）没变就直接复用上次合并好的记录
let rolloutSig = '';
let rolloutRecsCache = null;
// 聚合结果缓存：同文件签名 + 同查询参数（含本地日期）直接复用，
// /stats/usage 2 秒轮询不用每次全量重聚合十万级记录
let statsResultCache = { sig: '', key: '', result: null };
// 供启动器热替换前调用：旧模块实例被 ESM 模块表永久持有，清掉大块缓存省内存
export function dispose() {
  usageFileCache.clear();
  rolloutRecsCache = null; // 合并后的全量记录数组（可达十万级），不留
  rolloutSig = '';
  statsResultCache = { sig: '', key: '', result: null };
  // 残留的 ffmpeg 转码子进程一并收掉（退出/交接时调用）：孤儿进程会与新实例
  // 并发写同一个 .tmp.mp4 写坏缓存且不再重建；杀掉只会丢半截临时文件，重启后重建
  for (const child of transcodeChildren) {
    try { child.kill(); } catch { /* 已退出 */ }
  }
  transcodeChildren.clear();
}
// 解析一段 rollout 文本为记录；completeBytes = 已完整解析的整行字节数
//（末行若是不完整 JSON（写入中途）不计入，调用方据此决定偏移推进量）
function parseRolloutLines(text) {
  const recs = [];
  let completeBytes = 0;
  let consumed = 0;
  const parts = text.split('\n');
  for (let pi = 0; pi < parts.length; pi++) {
    const line = parts[pi];
    const isTail = pi === parts.length - 1; // 末段无换行结尾
    const lineBytes = Buffer.byteLength(line, 'utf8') + 1; // +1 换行（末段实际没有，不影响“不推进”语义）
    if (!line.trim()) {
      if (!isTail) { consumed += lineBytes; completeBytes = consumed; }
      continue;
    }
    let d;
    try {
      d = JSON.parse(line);
    } catch {
      // 只有末段解析失败才视为“写入中途的半行”：偏移停在整行边界等下次补齐；
      // 中间的坏行（崩溃残留等）按旧行为跳过继续，不能截断后面的全部数据
      if (isTail) break;
      consumed += lineBytes;
      completeBytes = consumed;
      continue;
    }
    const u = (d.response && d.response.usage) || d.usage;
    if (u) {
      const num = (v) => Number(v) || 0;
      // 两种键风格语义相反，必须分开处理：
      // 协议格式（inputTokens）的总输入已含缓存读（官方 summary 证实）；
      // 原始 API 格式（input_tokens，Anthropic 语义）三个字段分开、需相加
      let input, cacheRead, cacheWrite;
      if (u.inputTokens != null) {
        input = num(u.inputTokens);
        cacheRead = num(u.cacheReadTokens);
        cacheWrite = num(u.cacheWriteTokens);
      } else {
        cacheRead = num(u.cache_read_input_tokens);
        cacheWrite = num(u.cache_write_input_tokens);
        input = num(u.input_tokens) + cacheRead + cacheWrite;
      }
      const output = num(u.outputTokens ?? u.output_tokens);
      const at = d.completedAt || d.startedAt || '';
      recs.push({
        at,
        ts: Date.parse(at),
        ms: Number(d.durationMs) || 0,
        in: input, out: output,
        cacheRead,
        session: String(d.sessionId || ''),
        trace: String(d.traceId || ''), // 会话树（父会话+子代理）共享同一 trace
      });
    }
    consumed += isTail ? Buffer.byteLength(line, 'utf8') : lineBytes;
    completeBytes = consumed;
  }
  return { recs, completeBytes };
}

function rolloutRecords() {
  const dir = rolloutDirOverride || join(resolveDataRootDir(), 'cli', 'rollout'); // 官方 rollout 目录跟数据根迁移
  let names = [];
  try { names = readdirSync(dir).filter((n) => n.startsWith('model-io-') && n.endsWith('.jsonl')); } catch {
    // 读目录失败（杀软/权限抖动）时旧签名作废：否则空记录算出的 0 值结果会
    // 连着旧签名进缓存，目录恢复后文件没变就一直命中 0
    rolloutSig = '';
    rolloutRecsCache = null;
    return [];
  }
  // 官方会滚动删除会话文件（运行中的会话也会被删了重建，窗口期数据不断档），
  // 被删文件的解析记录在缓存里再留 ROLLOUT_KEEP_MS：速率停在最后的值而不是归零，
  // 累计数也不缩水；超时才淘汰，别让长跑进程无限积压（受控泄漏）
  const nameSet = new Set(names); // Set 判定：文件数上千时 names.includes 是 O(F²)
  for (const [k, v] of usageFileCache) {
    if (nameSet.has(k)) { v.goneAt = 0; continue; }
    if (!v.goneAt) { v.goneAt = Date.now(); continue; }
    if (Date.now() - v.goneAt > ROLLOUT_KEEP_MS) {
      usageFileCache.delete(k);
      rolloutSig = ''; // 记录变少了：作废合并缓存，强制重建
    }
  }
  const recs = [];
  // 先取各文件 stat 并算签名：签名没变直接复用上次合并好的记录。shortcut:
  // 同一毫秒内改写成相同字节数检测不到，实际不会发生，如遇到可把签名换成内容哈希
  const stats = [];
  for (const name of names) {
    try { stats.push([name, statSync(join(dir, name))]); } catch { /* 读不到的文件跳过 */ }
  }
  const sig = stats.map(([name, st]) => `${name}:${st.mtimeMs}:${st.size}`).join('|');
  if (sig === rolloutSig && rolloutRecsCache) return rolloutRecsCache;
  for (const [name, st] of stats) {
    const full = join(dir, name);
    const cached = usageFileCache.get(name);
    if (cached && cached.mtime === st.mtimeMs && cached.size === st.size && cached.ino === st.ino) {
      for (const r of cached.recs) recs.push(r); // 不用展开语法：单文件 13 万条会 RangeError
      continue;
    }
    // 追加式增量解析：jsonl 只追加（流式输出期间当前会话文件持续增长，整文件
    // 重读重解析一次可达数十毫秒）。从上次已完整解析的偏移续读新增部分；末行
    // 若是写入中途的半行会被丢弃且偏移不推进，下次变化时重读该行。
    // inode 也要求一致：文件被滚动删除后同名重建，旧偏移对不上新内容，
    // 续读会把半截 JSON 当坏行丢掉（实测运行中的会话也会被删了重建）
    if (cached && st.size > cached.size && st.mtimeMs >= cached.mtimeMs && cached.ino === st.ino) {
      const fd = openSync(full, 'r');
      let tail = '';
      try {
        const buf = Buffer.alloc(st.size - cached.size);
        readSync(fd, buf, 0, buf.length, cached.size);
        tail = buf.toString('utf8');
      } catch { tail = ''; } finally { closeSync(fd); }
      const { recs: added, completeBytes } = parseRolloutLines(tail);
      usageFileCache.set(name, {
        mtime: st.mtimeMs,
        size: cached.size + completeBytes,
        ino: st.ino,
        recs: cached.recs.concat(added),
      });
      for (const r of cached.recs) recs.push(r);
      for (const r of added) recs.push(r);
      continue;
    }
    let parsed = [];
    let parsedBytes = st.size;
    try {
      const text = readFileSync(full, 'utf8');
      const r = parseRolloutLines(text);
      parsed = r.recs;
      // 全量读不存在半行截断（readFileSync 拿到的是当下完整内容），但保守起见
      // 同样只把已完整解析的字节数记为偏移
      parsedBytes = Math.min(r.completeBytes, Buffer.byteLength(text, 'utf8'));
    } catch { /* 文件读失败跳过 */ }
    // 同名重建（inode 变了）：旧记录并进来——那是该会话真实发生过的调用；
    // 同 inode 的全量重读（截断等）仍整体替换
    const prior = cached && cached.ino !== st.ino ? cached.recs : [];
    usageFileCache.set(name, { mtime: st.mtimeMs, size: parsedBytes, ino: st.ino, recs: prior.concat(parsed) });
    for (const r of prior) recs.push(r);
    for (const r of parsed) recs.push(r);
  }
  // 已被滚动删除的文件：保留窗内的解析记录继续参与聚合
  for (const [k, v] of usageFileCache) {
    if (nameSet.has(k)) continue;
    for (const r of v.recs) recs.push(r);
  }
  rolloutSig = sig;
  rolloutRecsCache = recs;
  return recs;
}

// 会话 → trace_id（官方 db.sqlite 的 session 表，父子会话树共享同一 trace）：
// 命中即缓存（会话的 trace 写入后不变）；查不到不缓存，下轮再试
const traceBySession = new Map();
async function sessionTrace(dataRoot, sessionId) {
  if (traceBySession.has(sessionId)) return traceBySession.get(sessionId);
  const m = await listSessionsTrace(dataRoot, [sessionId]);
  const trace = m[sessionId] || '';
  if (trace) traceBySession.set(sessionId, trace);
  return trace;
}

export function collectUsageStats(sessionId, wantTurns = true, treeTrace = '') {
  const recs = rolloutRecords();
  // 分钟桶只服务每轮统计（turn-usage 带 session 拉取），状态栏请求带 turns=0
  // 跳过：省掉全记录分桶与 60 桶序列化（大记录集下每请求几十毫秒）
  wantTurns = wantTurns && !!sessionId;
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  // 记录没变（文件签名相同）+ 查询口径没变时直接复用上次聚合结果：锚定速率是
  // 记录的纯函数（锚 = 最新完成时刻，不随请求时刻移动），跨午夜才要重算"今日"
  const cacheKey = `${sessionId || ''}|${wantTurns ? 1 : 0}|${treeTrace}|${todayKey}`;
  if (statsResultCache.sig === rolloutSig && statsResultCache.key === cacheKey && statsResultCache.result) {
    return statsResultCache.result;
  }
  const global = { todayTokens: 0, todayOut: 0, totalTokens: 0, totalOut: 0, tasks: 0, records: recs.length };
  // 每轮用量按本地 HH:mm 分桶（回答末尾的显示时间与之匹配）；
  // 本地记录只留最近几轮，注入侧只给能对上时间的回答显示
  const byMinute = new Map();
  // 最近 60 秒速率（状态栏 tokRate 项）：token 按调用耗时摊到时间轴（完成
  // 时刻往前 durationMs 一段），按窗口重叠比例折算，长调用完成瞬间不会出现
  // 假尖峰。窗口以该口径最新一条记录的完成时刻为锚、往前 60 秒——回答结束
  // 后锚不再移动，速率自然停在最后的值：不衰减归零；有新调用完成锚前移、
  // 数值刷新。文件被官方滚动删除后靠保留窗内的缓存记录维持显示
  //（shortcut: 重启/热替换后只剩存活文件的记录，全删完速率归零，等官方出持久数据源再换）。
  // 统计范围：带 ?session= 按会话树算——本会话 + 同 trace 的子代理会话
  //（子代理的模型调用是这个会话真实发生的输出，只算本会话 id 会让派了
  // 子代理的会话速率归零），treeTrace 查不到时退化为只算本会话；
  // 不带 ?session= 则全局。与每轮桶不同，辅助小调用也计入（它们是真实消耗）
  const inTree = (r) => !sessionId || r.session === sessionId || (!!treeTrace && r.trace === treeTrace);
  const winMs = 60_000;
  let anchor = 0;
  for (const r of recs) {
    if (Number.isFinite(r.ts) && inTree(r)) anchor = Math.max(anchor, r.ts);
  }
  const anchorFuture = anchor > Date.now(); // 未来时间戳：钳制值依赖请求时刻，结果不能缓存
  anchor = Math.min(anchor, Date.now()); // 未来时间戳（时钟回拨等）别把锚拉到未来
  let rateTotal = 0;
  let rateOut = 0;
  for (const r of recs) {
    const total = r.in + r.out;
    global.totalTokens += total;
    global.totalOut += r.out;
    // 按本地日期归"今日"：r.at 是 ISO/UTC 串，直接取前 10 位是 UTC 日期，
    // 本地凌晨（UTC+8 的 0-8 点）完成的调用会被算进昨天
    if (Number.isFinite(r.ts)) {
      const rd = new Date(r.ts);
      const day = `${rd.getFullYear()}-${String(rd.getMonth() + 1).padStart(2, '0')}-${String(rd.getDate()).padStart(2, '0')}`;
      if (day === todayKey) { global.todayTokens += total; global.todayOut += r.out; }
    }
    const end = r.ts;
    if (Number.isFinite(end) && inTree(r)) {
      const dur = Math.max(r.ms || 0, 1); // 无耗时字段的旧记录按 1ms 点事件计
      const overlap = Math.min(end, anchor) - Math.max(end - dur, anchor - winMs);
      if (overlap > 0) {
        const w = overlap / dur;
        rateTotal += total * w;
        rateOut += r.out * w;
      }
    }
    // 每轮回答只统计主对话流的调用：起名等辅助请求是独立小上下文、
    // 缓存从零开始，混进分钟桶会把命中率拉到个位数（全局统计仍全量计入）
    if (!wantTurns || total < 5000) continue;
    // 指定会话时每轮桶只算该会话的调用——否则切到别的会话聊天后，
    // 那些调用会被区间归属算进当前会话最后一行的头上
    if (r.session !== sessionId) continue;
    const t = r.ts;
    if (!Number.isFinite(t)) continue;
    const d = new Date(t);
    // 桶键 = 本地"月-日 时:分"；注入侧不读这个键（按 ts 区间归属到回答行），
    // 键只用于同分钟的调用并桶
    const hm = (d.getMonth() + 1) + '-' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    const bucket = byMinute.get(hm) || { hm, in: 0, out: 0, cacheRead: 0, ts: t };
    bucket.in += r.in;
    bucket.out += r.out;
    bucket.cacheRead += r.cacheRead;
    bucket.ts = Math.max(bucket.ts, t);
    byMinute.set(hm, bucket);
  }
  // 保留 1 位小数：工具循环期的输出只有零点几每秒，取整会显示成 0/s
  const perSec = (x) => Math.round((x / (winMs / 1000)) * 10) / 10;
  global.rate60 = { total: perSec(rateTotal), out: perSec(rateOut) };
  const recentTurns = [...byMinute.values()].sort((a, b) => b.ts - a.ts).slice(0, 60);
  const out = { global, recentTurns };
  if (!anchorFuture) statsResultCache = { sig: rolloutSig, key: cacheKey, result: out };
  return out;
}

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

// loadConfig 时把磁盘上的 titleGen 段按默认值归一（智能起名）：只收已知字段，
// 字符串限长；enabled 默认关闭（改动官方起名行为，需用户显式开启）
function mergeTitleGenConfig(saved) {
  const d = defaultConfig().titleGen;
  const s = (saved && typeof saved === 'object' && !Array.isArray(saved)) ? saved : {};
  // 旧版配置的 'cli'（登录账号单独成模式）统一迁移为 'session'：
  // 登录账号的套餐已在供应商列表里，跟随会话即覆盖原语义
  const provider = typeof s.provider === 'string' ? s.provider.trim().slice(0, 200) : d.provider;
  // customWritten：起名功能写过的 { sessId → { title, at } }，自动校正只认这些
  // 记录（见 reconcileCustomTitles）。只收合法会话 id（sess_/session_ 两种前缀，
  // 新版应用为 session_）与短字符串，超 7 天/500 条的丢弃
  const written = {};
  const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
  let kept = 0;
  for (const [k, v] of Object.entries((s.customWritten && typeof s.customWritten === 'object' && !Array.isArray(s.customWritten)) ? s.customWritten : {})) {
    if (kept >= 500 || !/^(?:sess|session)_[A-Za-z0-9._-]+$/.test(k)) continue;
    if (!v || typeof v !== 'object' || typeof v.title !== 'string' || v.title.length > 200) continue;
    if (!Number.isFinite(v.at) || v.at < cutoff) continue;
    written[k] = { title: v.title, at: v.at };
    kept++;
  }
  return {
    enabled: s.enabled === true,
    provider: provider === 'cli' ? 'session' : provider,
    model: typeof s.model === 'string' ? s.model.trim().slice(0, 200) : d.model,
    prompt: typeof s.prompt === 'string' ? s.prompt.slice(0, 20000) : d.prompt,
    baseUrl: typeof s.baseUrl === 'string' ? s.baseUrl.trim().slice(0, 500) : d.baseUrl,
    apiKey: typeof s.apiKey === 'string' ? s.apiKey.trim().slice(0, 500) : d.apiKey,
    format: s.format === 'openai' ? 'openai' : s.format === 'anthropic' ? 'anthropic' : '',
    recentQa: Number.isFinite(Number(s.recentQa)) ? Math.min(20, Math.max(1, Math.round(Number(s.recentQa)))) : d.recentQa,
    hoverBtn: s.hoverBtn !== false,
    menuEntry: s.menuEntry !== false,
    customWritten: written,
  };
}

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
    historyLimit: Number.isInteger(saved.historyLimit) && saved.historyLimit >= 0 && saved.historyLimit <= 100
      ? saved.historyLimit : d.historyLimit,
    lastPushAt: Number.isFinite(saved.lastPushAt) ? saved.lastPushAt : null,
    lastPullAt: Number.isFinite(saved.lastPullAt) ? saved.lastPullAt : null,
  };
}

// WebDAV 地址的协议判定：http 明文会把 Basic 登录名和密码原样传出去，
// http 只放行回环与内网地址（内网 NAS 常用 http），公网主机必须 https
function webdavHttpSchemeOk(raw) {
  const url = typeof raw === 'string' ? raw.trim() : '';
  if (!/^https?:\/\//i.test(url)) return false;
  if (/^https:/i.test(url)) return true;
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch { return false; }
  host = host.replace(/^\[|\]$/g, ''); // URL.hostname 对 IPv6 地址带方括号
  if (host === 'localhost' || host === '::1') return true;
  // IPv6 字面量不走下面的域名规则（不含点，会被误判成内网主机名）：
  // 只放行链路本地（fe80::/10）与 ULA（fc00::/7）内网段，公网 v6 仍要 https
  // （按 RFC 5952 规范写法匹配首段，缩写首段的极端写法不认）
  if (host.includes(':')) return /^(fe[89ab][0-9a-f]|f[cd][0-9a-f]{2}):/i.test(host);
  // 单标签主机名（无点，如 mynas）与 .local/.lan/.internal 后缀的域名按内网 NAS
  // 处理放行 http；其余域名型主机要求 https
  if (!host.includes('.') || /\.(local|lan|internal)$/.test(host)) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

// POST /sync 表单校验：url/login/password/dir 全量替换（dir 缺省时不动已有值）。
// URL 必填，指向 WebDAV 服务器（可含路径前缀）；dir 为其下的上传目录，可多级；
// historyLimit 可选（缺省时不动已有值），0–100 的整数
function validateSyncForm(raw) {
  const url = typeof raw.url === 'string' ? raw.url.trim() : '';
  const login = typeof raw.login === 'string' ? raw.login.trim() : '';
  const password = typeof raw.password === 'string' ? raw.password : '';
  if (!url) return { error: '请先填写 URL（如 https://dav.jianguoyun.com/dav/）' };
  if (!/^https?:\/\/\S+$/.test(url)) return { error: 'URL 需为 WebDAV 服务器地址，如 https://dav.example.com/dav/' };
  if (url.length > 500) return { error: 'URL 过长（最多 500 字符）' };
  if (!webdavHttpSchemeOk(url)) return { error: '公网地址需用 https（http 明文传输登录名和密码）；内网或回环地址（如 http://192.168.1.5:5005）可继续用 http' };
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
  if (raw.historyLimit !== undefined && raw.historyLimit !== null) {
    if (!Number.isInteger(raw.historyLimit) || raw.historyLimit < 0 || raw.historyLimit > 100) {
      return { error: '历史版本保留个数需为 0–100 的整数' };
    }
    out.historyLimit = raw.historyLimit;
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

// —— 背景图库随 zcodepro 组同步：镜像语义，覆盖式、无历史版本 ——
// 上传 = 本地图全部传上去（同名同大小跳过），云端多余删除；
// 下载 = 云端图全部落到本机（同名同大小跳过），本地多余删除
function syncBgDirUrl(sync) {
  return syncBaseDir(sync) + '/' + BG_DIR_NAME;
}
function syncBgFileUrl(sync, name) {
  return syncBgDirUrl(sync) + '/' + encodeURIComponent(name);
}
// 云端图库列表：目录不存在（404）视为空库；条目按扩展名白名单过滤
async function syncBgListRemote(sync, proxyUrl) {
  const list = await webdavRequest({ method: 'PROPFIND', url: syncBgDirUrl(sync) + '/', login: sync.login, password: sync.password, proxyUrl, headers: ['Depth: 1'], timeoutMs: 30000 });
  if (!list.ok) return { error: list.error, code: 'sync-request', status: 502 };
  if (list.httpCode === 404) return { files: [] };
  if (list.httpCode < 200 || list.httpCode >= 300) return { error: webdavHttpText(list.httpCode), code: 'sync-request', status: 502 };
  return { files: parseWebdavListing(list.body).filter((f) => MEDIA_EXT.has(f.name.slice(f.name.lastIndexOf('.')).toLowerCase())) };
}
async function syncBgPush({ sync, proxyUrl, dataRoot }) {
  const localFiles = listBgFiles(dataRoot);
  const remote = await syncBgListRemote(sync, proxyUrl);
  if (remote.error) return remote;
  const remoteByName = new Map(remote.files.map((f) => [f.name, f]));
  const dir = backgroundsDir(dataRoot);
  const uploaded = [];
  for (const f of localFiles) {
    const r = remoteByName.get(f.name);
    if (r && r.size === f.size) continue;
    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
    const put = await webdavPutWithMkcol({
      url: syncBgFileUrl(sync, f.name), login: sync.login, password: sync.password,
      uploadFile: join(dir, f.name), proxyUrl, timeoutMs: 120000,
      contentType: BG_MIME[ext] || 'application/octet-stream',
    });
    if (!put.ok) return { code: 'sync-request', status: 502, error: put.error };
    if (put.httpCode < 200 || put.httpCode >= 300) return { code: 'sync-request', status: 502, error: webdavHttpText(put.httpCode) };
    uploaded.push(f.name);
  }
  const deleted = [];
  const localNames = new Set(localFiles.map((f) => f.name));
  for (const f of remote.files) {
    if (localNames.has(f.name)) continue;
    const del = await webdavRequest({ method: 'DELETE', url: syncBgFileUrl(sync, f.name), login: sync.login, password: sync.password, proxyUrl, timeoutMs: 30000 });
    if (!del.ok) return { code: 'sync-request', status: 502, error: del.error };
    if (del.httpCode === 404) continue; // 已被并发清掉
    if (del.httpCode < 200 || del.httpCode >= 300) return { code: 'sync-request', status: 502, error: webdavHttpText(del.httpCode) };
    deleted.push(f.name);
  }
  return { uploaded, deleted, count: localFiles.length };
}
async function syncBgPull({ sync, proxyUrl, dataRoot }) {
  const remote = await syncBgListRemote(sync, proxyUrl);
  if (remote.error) return remote;
  const localFiles = listBgFiles(dataRoot);
  const localByName = new Map(localFiles.map((f) => [f.name, f]));
  const dir = backgroundsDir(dataRoot);
  mkdirSync(dir, { recursive: true });
  const downloaded = [];
  for (const f of remote.files) {
    const name = sanitizeBgName(f.name);
    if (!name) continue; // 云端的异常文件名条目不镜像
    const l = localByName.get(name);
    if (l && l.size === f.size) continue;
    // 临时名带 pid+随机：与上传路径撞同一文件名时不共用一个 .tmp
    const tmp = join(dir, `${name}.${process.pid}.${Date.now().toString(36)}.tmp`);
    const get = await webdavRequest({ method: 'GET', url: syncBgFileUrl(sync, name), login: sync.login, password: sync.password, proxyUrl, timeoutMs: 120000, downloadFile: tmp });
    const bad = !get.ok || get.httpCode < 200 || get.httpCode >= 300;
    if (bad) {
      try { if (existsSync(tmp)) unlinkSync(tmp); } catch { /* ignore */ }
      return { code: 'sync-request', status: 502, error: get.ok ? webdavHttpText(get.httpCode) : get.error };
    }
    renameSync(tmp, join(dir, name));
    downloaded.push(name);
  }
  const deleted = [];
  const remoteNames = new Set(remote.files.map((f) => f.name));
  for (const f of localFiles) {
    if (remoteNames.has(f.name)) continue;
    try { unlinkSync(join(dir, f.name)); deleted.push(f.name); } catch { /* ignore */ }
  }
  return { downloaded, deleted, count: remote.files.length };
}

// 信封校验：云端文件必须是 { app: 'zcode-pro', kind, format, data } 且组别与文件名
// 前缀一致；4MB 上限挡住异常大文件。导出供回归测试直接喂坏信封
export function parseSyncEnvelope(body, kind, label) {
  if (body.length > 4 * 1024 * 1024) {
    return { error: `云端 ${label} 超过 4MB，已拒绝应用`, code: 'sync-remote-invalid', status: 400 };
  }
  let doc = null;
  try { doc = JSON.parse(body); } catch { /* 落到统一报错 */ }
  if (!doc || typeof doc !== 'object' || doc.app !== 'zcode-pro' || doc.kind !== kind || !doc.data || typeof doc.data !== 'object') {
    return { error: `云端 ${label} 不是 zcode-pro 的同步数据（可能被其他内容占用），请删除该文件或换一个目录`, code: 'sync-remote-invalid', status: 409 };
  }
  // format 超出认识范围（更新版本的 zcode-pro 写入的新格式）：不导入，提示升级客户端
  if (doc.format !== 1) {
    return { error: `云端 ${label} 是更新版本的 zcode-pro 写入的数据，当前客户端版本过旧，请升级 zcode-pro 后再同步`, code: 'sync-remote-invalid', status: 400 };
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

// —— /sync/run 单飞 ————————————————————————————————————
// 同 direction 的并发触发共用同一个 promise（去重），不同 direction 串行排队：
// 两轮同步并发跑会互相清掉对方刚上传的历史版本。在途（排队 + 执行）期间计入
// 忙碌标志，启动器热替换据此延后——同步中途换进程同样会互删历史版本
let syncRunJobs = new Map(); // direction → 在跑或排队的 promise
let syncRunQueue = Promise.resolve();

function enqueueSyncRun(direction, fn) {
  const inflight = syncRunJobs.get(direction);
  if (inflight) return inflight;
  const prev = syncRunQueue;
  const promise = (async () => {
    await prev;
    try {
      return await fn();
    } finally {
      syncRunJobs.delete(direction);
    }
  })();
  syncRunQueue = promise.then(() => undefined, () => undefined);
  syncRunJobs.set(direction, promise);
  return trackBusy(promise);
}

async function runSettingsSync({ direction, dataRoot, configFile, config, proxyUrl }) {
  const sync = config.sync;
  if (!sync.url || !/^https?:\/\/\S+$/.test(sync.url)) {
    return { code: 'sync-not-configured', status: 400, error: '请先填写 WebDAV URL 并保存' };
  }
  if (!webdavHttpSchemeOk(sync.url)) {
    return { code: 'sync-not-configured', status: 400, error: '公网 WebDAV 地址需改用 https（http 明文传输登录名和密码）；内网或回环地址可继续用 http' };
  }
  if (!sync.include.zcodepro && !sync.include.model) {
    return { code: 'sync-not-configured', status: 400, error: '请至少选择一项同步内容' };
  }
  return direction === 'push'
    ? runSyncPush({ dataRoot, configFile, config, sync, proxyUrl })
    : runSyncPull({ dataRoot, configFile, config, sync, proxyUrl });
}

// headroom.json 里值得同步/应用的判定：providers 每条注册都得带路由必需的
// id/upstream/format/keyHash 才算有效——空对象、空注册或残缺条目（如只写个 id
// 的测试夹具）不上传也不覆盖，免得把别台机器拉回无映射状态（请求 502）
function validHeadroomDoc(hr) {
  return !!hr && typeof hr === 'object' && !Array.isArray(hr)
    && Array.isArray(hr.providers) && hr.providers.length > 0
    && hr.providers.every((p) => !!p && typeof p === 'object'
      && typeof p.id === 'string' && p.id !== ''
      && typeof p.upstream === 'string' && p.upstream !== ''
      && (p.format === 'anthropic' || p.format === 'openai')
      && typeof p.keyHash === 'string' && p.keyHash !== '');
}

// 上传：每组独立一个云端文件（zcodepro.json / model.json，始终最新一版），勾选几组
// 写几个。aliases 不再上传——3.16.1 起别名功能已停用（官方“编辑项目”改名），
// 且各机器项目路径不同，同步别名只会互相带来无效路径。同一份内容再写一个带
// 时间戳的历史版本文件，供下载时任选版本恢复（旧版 zcode-pro 仍读固定名）；
// 历史版本最多保留 historyLimit 个（同一时间戳的各组文件算一个），上传成功后
// 自动删除更早的
async function runSyncPush({ dataRoot, configFile, config, sync, proxyUrl }) {
  const keep = Number.isInteger(sync.historyLimit) ? sync.historyLimit : defaultConfig().sync.historyLimit;
  const docs = {};
  if (sync.include.zcodepro) {
    // sync（本机的同步配置与凭据）、version（本机 helper 版本）与 aliases 不外发
    const { sync: _s, version: _v, aliases: _a, ...rest } = config;
    // titleGen.apiKey 是模型凭据，与 sync 一样只留本机（设置页文案：凭据不参与同步）
    if (rest.titleGen && typeof rest.titleGen === 'object') {
      const { apiKey: _k, ...tg } = rest.titleGen;
      rest.titleGen = tg;
    }
    docs.zcodepro = rest;
  }
  if (sync.include.model) {
    const v2conf = readJsonFile(join(dataRoot, 'v2', 'config.json'));
    if (v2conf && typeof v2conf.provider === 'object' && v2conf.provider) {
      docs.model = { provider: v2conf.provider };
      const pc = readJsonFile(join(dataRoot, 'v2', 'provider_config.json'));
      if (pc && typeof pc === 'object') docs.model.providerConfig = pc;
      // headroom.json 随模型组一起同步：它登记供应商的“keyHash → 上游”映射，
      // 缺了它新机器上指向 127.0.0.1:8787 的供应商会被 headroom 拒绝（401）；
      // 文件里 key 只以 keyHash 形式存储，没有明文。providers 为空不算有效注册，
      // 不上传；instances（实例端口表）与 router（监听端口）是本机运行状态，不外发
      const hr = readJsonFile(defaultHeadroomFile());
      if (validHeadroomDoc(hr)) {
        const { instances: _inst, router: _router, ...hrSync } = hr;
        docs.model.headroom = hrSync;
      }
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
      // 本机没有有效 headroom 注册时保留云端旧键：没接入 headroom 的机器上传，
      // 不该把已传播给新机器的映射抹掉（本地空 ≠ 用户想清空云端）
      if (kind === 'model' && !docs[kind].headroom && validHeadroomDoc(remote.doc?.data?.headroom)) {
        docs[kind].headroom = remote.doc.data.headroom;
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
      // 历史版本只在保留个数 > 0 时写（0 = 只留固定名最新版，由上传后清理收尾）
      if (keep > 0) {
        const putVersion = await putUrl(syncVersionName(kind, stamp));
        if (!putVersion.ok) return { code: 'sync-request', status: 502, error: putVersion.error };
        if (putVersion.httpCode < 200 || putVersion.httpCode >= 300) {
          return { code: 'sync-request', status: 502, error: webdavHttpText(putVersion.httpCode) };
        }
      }
      pushed.push(kind);
    }
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  sync.lastPushAt = Date.now();
  // 同步是分钟级网络流程：写回前重读配置、只合并本次时间戳，
  // 别把期间用户在设置弹窗的修改用这份旧快照盖掉；读改写放进跨进程锁内同步执行
  await withConfigLock(configFile, () => {
    const freshPush = loadConfig(configFile);
    freshPush.sync = { ...freshPush.sync, lastPushAt: sync.lastPushAt };
    if (!saveConfig(configFile, freshPush)) console.error('[zcodepro] lastPushAt 写回被拒（zcodepro.json 损坏），上传本身已成功');
  });
  // 上传成功后清理超出保留个数的旧历史版本（best-effort，失败不影响上传结果）
  const pruned = await pruneSyncHistory(sync, proxyUrl, keep);
  // 背景图库镜像上传（勾了 zcodepro 组才传；设置文档已传走，图库失败单独报错，重试幂等）
  let bg = null;
  if (sync.include.zcodepro) {
    const r = await syncBgPush({ sync, proxyUrl, dataRoot });
    if (r.error) return r;
    bg = r;
  }
  return { applied: pushed, pruned, bg };
}

// 下载：把云端所选组应用到本机（各组独立文件，勾选几组读几组，可只覆盖模型设置）。
// 覆盖前留 .zcodepro-backup 备份；zcodepro 组覆盖功能/样式/代理，别名不受影响
//（3.16.1 起别名已停用，且云端备份里的别名多是其他机器的路径）；sync 配置与
// 凭据始终保留本机的
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
  const applied = await applySyncDocs({ docs, dataRoot, configFile, config, sync });
  if (applied && applied.error) return applied;
  // 背景图库镜像下载（勾了 zcodepro 组才拉；设置文档已应用，图库失败单独报错，重试幂等）
  let bg = null;
  if (sync.include.zcodepro) {
    const r = await syncBgPull({ sync, proxyUrl, dataRoot });
    if (r.error) return r;
    bg = r;
  }
  return { ...applied, bg };
}

// 把云端读到的各组数据落到本机（runSyncPull 与按文件的历史版本导入共用）：
// zcodepro 组覆盖功能/样式/代理（sync 配置与凭据保留本机的），别名不导入
//（云端备份可能出自别的机器，路径在本机无效），model 组覆盖 v2/config.json 的
// provider、provider_config.json 与 headroom.json；覆盖前都留备份。导出以便测试。
export function applySyncDocs({ docs, dataRoot, configFile, config, sync }) {
  const applied = [];
  const backupFile = (p) => {
    try { if (existsSync(p)) copyFileSync(p, p + '.zcodepro-backup'); } catch { /* 备份失败不阻塞 */ }
  };
  const atomicWrite = (p, obj) => {
    const tmp = `${p}.${process.pid}.${Date.now().toString(36)}.tmp`; // 防多写者共用同一 .tmp 撕裂
    writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
    renameSync(tmp, p);
  };

  if (docs.zcodepro) {
    const rz = docs.zcodepro;
    // 整段 zcodepro.json 读改写放进跨进程锁内同步执行（applySyncDocs 是同步
    // 调用点，用同步等锁变体），防止与别的写入方互相覆盖整份配置
    const rzErr = withConfigLockSync(configFile, () => {
      const next = loadConfig(configFile);
      applyFeaturesPartial(next.features, rz.features);
      next.styles = applyStylesPartial(next.styles, rz.styles);
      // 别名保持本机的原样：云端备份里的别名可能出自其他机器（路径在本机无效），
      // 且 3.16.1 起别名功能已停用，不再导入
      if (typeof rz.proxy === 'string') {
        const v = rz.proxy.trim();
        if (v === '' || /^https?:\/\/\S+:\d+$/.test(v)) next.proxy = v;
      }
      next.sync = { ...next.sync, lastPullAt: sync.lastPullAt }; // 保留本机 sync 配置与凭据，只记本次拉取时间
      backupFile(configFile);
      if (!saveConfig(configFile, next)) {
        return { error: 'zcodepro.json 读取失败或已损坏，导入中止（请先修好配置文件）', code: 'config-unreadable', status: 500 };
      }
      return null;
    });
    if (rzErr) return rzErr;
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
    // headroom.json 只在云端文档带有效注册时才覆盖（旧版云端文档没有该字段、
    // 或 providers 为空/残缺，都不动本机，免得清掉已有映射）；instances（实例端口表）
    // 与 router（监听端口）是本机运行状态，云端的一律不用，保留本机的。
    // 路径跟随 dataRoot（与同组其他文件一致）：defaultHeadroomFile() 按 HOME 定位，
    // 测试跑进真配置会把用户的路由表整个写坏
    const hr = docs.model.headroom;
    if (validHeadroomDoc(hr)) {
      const hrFile = join(dataRoot, 'headroom.json');
      // 云端文档里带的三个设置键也剥掉：kompressBackend/powerSaveCpu/powerWatchInterval
      // 是本机设置，云端的赢会把 B 机器的压缩设备决策改成 A 机器的
      const { instances: _remoteInst, router: _remoteRouter, kompressBackend: _rKb, powerSaveCpu: _rPs, powerWatchInterval: _rWi, ...hrRest } = hr;
      // 读改写整段持 headroom.json 文件锁（与面板 interval 写入、setHeadroomUsage 互斥），
      // 锁内重读最新基线合并：以本机现有键为底、云端注册覆盖 providers，
      // instances/router 与三个本机设置键保留本机值
      withConfigLockSync(hrFile, () => {
        const fresh = readJsonFile(hrFile);
        const base = (fresh && typeof fresh === 'object') ? fresh : {};
        const merged = { ...base, ...hrRest };
        if (base.instances) merged.instances = base.instances;
        if (base.router) merged.router = base.router;
        backupFile(hrFile);
        atomicWrite(hrFile, merged);
      });
      // 让路由立刻吃到新映射、缺的实例补起来（路由器本身每请求重读配置，
      // 只有新上游的实例需要这一步），失败不影响同步结果
      runHeadroomHook(['ensure'], 20000).catch(() => { /* 尽力而为 */ });
    }
    applied.push('model');
  }
  // 没动 zcodepro.json 时，lastPullAt 也要写入配置文件（动了则已随 next 一起保存）。
  // 写回前重读配置、只合并时间戳：别用旧快照盖掉同步期间用户的修改
  if (!applied.includes('zcodepro')) {
    // lastPullAt 读改写同样在跨进程锁内同步完成
    withConfigLockSync(configFile, () => {
      const freshPull = loadConfig(configFile);
      freshPull.sync = { ...freshPull.sync, lastPullAt: sync.lastPullAt };
      if (!saveConfig(configFile, freshPull)) console.error('[zcodepro] lastPullAt 写回被拒（zcodepro.json 损坏）');
    });
  }
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
  // PROPFIND 的集合地址统一带尾斜杠（图库列表 syncBgListRemote 同款）：
  // 会给目录地址回 301 的网盘不认无斜杠写法，会报“HTTP 301”
  const baseDir = syncBaseDir(sync) + '/';
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
  const r = await webdavRequest({ method: 'PROPFIND', url: syncBaseDir(sync) + '/', login: sync.login, password: sync.password, proxyUrl, timeoutMs: 30000, headers: ['Depth: 1'] });
  if (!r.ok) return { error: r.error, code: 'sync-request', status: 502 };
  if (r.httpCode === 404 || r.httpCode === 409) return { files: [] };
  if (r.httpCode < 200 || r.httpCode >= 300) return { error: webdavHttpText(r.httpCode), code: 'sync-request', status: 502 };
  const files = parseWebdavListing(r.body)
    .filter((e) => SYNC_VERSION_RE.test(e.name))
    .map((e) => ({ name: e.name, size: e.size, lastModified: e.lastModified }));
  files.sort((a, b) => ((b.lastModified || 0) - (a.lastModified || 0)) || b.name.localeCompare(a.name));
  return { files };
}

// 从云端文件名列表选出待删除的历史版本（导出以便测试脚本直接驱动）：带时间戳的
// 文件按时间戳段分组——同一次上传的各组文件共用一个时间戳，算“一个”；时间戳
// 段定宽零填充，字典序即时间序。保留最近 keep 个，返回更早的各组文件名；
// 固定名（zcodepro.json / model.json）和不相干的文件名不会出现在结果里
export function syncHistoryStaleNames(names, keep) {
  const groups = new Map();
  for (const name of names) {
    const ts = (String(name).match(/^(?:zcodepro|model)(-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.json$/) || [])[1];
    if (!ts) continue;
    if (!groups.has(ts)) groups.set(ts, []);
    groups.get(ts).push(name);
  }
  // 时间戳段按新 → 旧排，slice(keep) 剩下的即超出保留个数的更早各组
  return [...groups.keys()].sort((a, b) => b.localeCompare(a)).slice(Math.max(0, keep)).flatMap((ts) => groups.get(ts));
}

// 上传后清理云端目录里超出保留个数的历史版本：列出文件，删掉 syncHistoryStaleNames
// 归出的旧文件。best-effort——列目录或单个删除失败只跳过（下次上传再清），不抛错；
// 返回本次删掉的文件数
async function pruneSyncHistory(sync, proxyUrl, keep) {
  const list = await listSyncVersions(sync, proxyUrl);
  if (list.error) return 0;
  const stale = syncHistoryStaleNames(list.files.map((f) => f.name), keep);
  let removed = 0;
  for (const name of stale) {
    const r = await webdavRequest({ method: 'DELETE', url: syncFileUrlByName(sync, name), login: sync.login, password: sync.password, proxyUrl, timeoutMs: 30000 });
    if (!r.ok) continue; // 网络失败：跳过该文件
    if (r.httpCode !== 404 && (r.httpCode < 200 || r.httpCode >= 300)) continue; // 404 = 已不在，视为已清
    removed++;
  }
  return removed;
}

// features 部分更新（POST /config 与同步下载共用）：只收已知开关的布尔值
function applyFeaturesPartial(base, partial) {
  const out = (base && typeof base === 'object') ? base : {};
  if (!partial || typeof partial !== 'object') return out;
  const known = new Set(Object.keys(defaultConfig().features));
  for (const key of Object.keys(partial)) {
    // 布尔特性一律可存（新特性未列入 defaultConfig 时不能被丢弃），
    // 非布尔值只在已知键内、且与默认值同类型时接受——防垃圾类型进配置
    if (typeof partial[key] === 'boolean') out[key] = partial[key];
    else if (known.has(key) && typeof partial[key] === typeof defaultConfig().features[key]) out[key] = partial[key];
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

// Linux：直接读取 /proc（comm 定位 CLI、cwd 定位项目、task/<pid>/children 拿子进程）
// 后台 bash 任务扫描：运行中的任务进程把 /tmp/zcode-bash-*/<会话id>/call_*-stdout.log
// 握在 stdout/stderr 上（实测 fd/1、fd/2），日志路径就带会话 id——按"有进程握着
// 该文件"判定在跑，纯文件系统读取，不惊动会话进程。不能走会话快照：快照会把
// 会话 resume 起来，逐会话轮询快照曾造成整夜 6600 次/小时 resume、内存暴涨。
// 返回 { ok, jobs: [{ sessionId, jobId }] }；平台不支持（无 /proc 且无 lsof）时 ok=false
export function scanBackgroundBash(tmpDir = '/tmp', procDir = '/proc') {
  let files;
  try {
    files = new Map(); // 日志绝对路径 → { sessionId, jobId }
    for (const d of readdirSync(tmpDir)) {
      if (!d.startsWith('zcode-bash-')) continue;
      let sessDirs;
      try { sessDirs = readdirSync(join(tmpDir, d)); } catch { continue; }
      for (const sess of sessDirs) {
        if (!/^sess/.test(sess)) continue;
        let names;
        try { names = readdirSync(join(tmpDir, d, sess)); } catch { continue; }
        for (const n of names) {
          const m = n.match(/^call_(.+)-stdout\.log$/);
          if (m) files.set(join(tmpDir, d, sess, n), { sessionId: sess, jobId: m[1] });
        }
      }
    }
  } catch { return { ok: false, jobs: [] }; }
  if (!files.size) return { ok: true, jobs: [] };
  const hit = new Map(); // 文件 → 记录（同一任务的 stdout/stderr 两个 fd 去重）
  try {
    // Linux：/proc/*/fd/{1,2} 的符号链接命中即在跑
    for (const p of readdirSync(procDir)) {
      if (!/^\d+$/.test(p)) continue;
      for (const fd of ['1', '2']) {
        let target;
        try { target = readlinkSync(join(procDir, p, 'fd', fd)); } catch { continue; }
        const rec = files.get(target);
        if (rec) hit.set(target, rec);
      }
    }
  } catch {
    // 无 /proc（macOS）：lsof -t 判文件是否被占用
    for (const f of files.keys()) {
      let r;
      try { r = spawnSync('lsof', ['-t', '--', f], { encoding: 'utf8', timeout: 3000 }); } catch { return { ok: false, jobs: [] }; }
      if (r.error) return { ok: false, jobs: [] };
      if ((r.stdout || '').trim()) hit.set(f, files.get(f));
    }
  }
  return { ok: true, jobs: [...hit.values()] };
}

function scanIdleBusyLinux(paths) {
  let pids;
  try { pids = readdirSync('/proc').filter((d) => /^\d+$/.test(d)); }
  catch { return SCAN_OFF; }
  const wantedByCwd = buildWantedByCwd(paths);
  const cliPidByCwd = new Map();
  for (const pid of pids) {
    try {
      if (readFileSync(`/proc/${pid}/comm`, 'utf8').trim() !== 'zcode-cli') continue;
      const cwd = readlinkSync(`/proc/${pid}/cwd`);
      // 同一工作区可以开多个会话进程：记列表别后写覆盖先写——漏扫一个会话的
      // 子进程会把跑着命令的项目判成空闲
      const arr = cliPidByCwd.get(cwd);
      if (arr) arr.push(pid); else cliPidByCwd.set(cwd, [pid]);
    } catch { /* 进程退出/权限：跳过 */ }
  }
  const busy = new Set();
  for (const [cwd, cliPids] of cliPidByCwd) {
    const wantedPaths = wantedByCwd.get(cwd);
    if (!wantedPaths) continue;
    for (const pid of cliPids) {
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
    // 与注释的约定一致：任一 CLI 的工作目录取不到就整轮放弃（scan=false）——
    // lsof 缺失/被限权/进程行取不到 cwd 时都不能把项目判成空闲
    if (lsof.err) return SCAN_OFF;
    const cwd = (lsof.stdout.match(/^n(.+)$/m) || [])[1];
    if (!cwd) return SCAN_OFF;
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
  // 输出编码固定 UTF-8（同 pickFolder.mjs）：默认走 OEM 代码页（中文系统 936），
  // 按 UTF-8 解码不只乱码，GBK 尾字节 0x5C 还会被当转义符让 JSON.parse 抛错
  const ps = await runCmd('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress'], 30000);
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
      // 会话 id 有 sess_ 与 session_ 两种前缀（新版应用为 session_）；字符集与
      // 路由校验的 id 白名单一致（含 . 和 _）——字符类偏窄会在这些字符处截断成
      // 前缀，撞上别的真实 task_id 会把错误项目判忙。匹配不到会走 unattributed
      // 全量判忙——新形式命令挂着时空闲回收会整体停摆
      const sess = child.cmdline.match(/(?:sess|session)_[A-Za-z0-9._-]+/);
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

// 视觉代理“跟随供应商”下拉取数：与智能起名共用同一套供应商列表和过滤规则
//（见 listTitleGenProviders），只回 id/名称/别名，不含密钥。
// 导出以便测试脚本直接驱动。
export function listVisionProviders() {
  return listTitleGenProviders().map((p) => ({ id: p.id, name: p.name, aliases: p.aliases || [] }));
}

// —— 智能起名：供应商取数、模型调用与标题清洗 ——

// 内置默认提示词（用户可在设置弹窗覆盖），按界面语言取中文或英文版。
// 英文版的词数上限比中文版紧：英文单词更长，3~15 个词在会话列表里放不下
const TITLE_GEN_DEFAULT_PROMPTS = {
  zh: [
    '为下面的会话生成一个简短的标题。',
    '要求：',
    '- 使用用户消息的主要语言（中文消息用中文标题）',
    '- 概括用户要做的主要事情或主题，不要给出答案或结果',
    '- 一般3~15个词，在会话列表里能一眼认出',
    '- 保留重要的专有名词（文件名、产品名、技术名词等，如有）',
    '- 不要用`用户请求`、`新任务`、`提问`这类泛泛的标题',
    '- 不要直接复述或截取用户消息原文当标题',
    '- 只输出标题本身：不要解释、不要引号、不要末尾标点、不要markdown',
  ].join('\n'),
  en: [
    'Generate a short title for the session below.',
    'Requirements:',
    "- Use the primary language of the user's message (an English message gets an English title)",
    '- Summarize the user\'s main task or topic; do not give the answer or result',
    '- Usually 3-8 words, easy to recognize in a session list',
    '- Keep important proper nouns (file names, product names, technical terms, if any)',
    '- Avoid generic titles such as `User Request`, `New Task`, or `Question`',
    '- Do not copy or truncate the user\'s message as the title',
    '- Output only the title itself: no explanation, no quotes, no trailing punctuation, no markdown',
  ].join('\n'),
};

// 界面语言：桌面设置（v2/setting.json 的 localePreference）为 en-US / zh-CN 时
// 直接采用；system 或未设置时按系统环境语言判断（中文环境 → 中文，其余 → 英文）
function titleGenLocale() {
  const s = readJsonFile(join(resolveDataRootDir(), 'v2', 'setting.json')); // 官方 v2 配置跟数据根迁移（同 startHelper 的 settingsFile）
  const pref = String((s && s.localePreference) || '').toLowerCase();
  if (pref.startsWith('en')) return 'en';
  if (pref.startsWith('zh')) return 'zh';
  const lang = String(process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || '').toLowerCase();
  return lang.startsWith('zh') ? 'zh' : 'en';
}

function titleGenDefaultPrompt() {
  return TITLE_GEN_DEFAULT_PROMPTS[titleGenLocale()] || TITLE_GEN_DEFAULT_PROMPTS.en;
}

const TITLE_GEN_MAX_TEXT = 1200;  // 用户消息送入模型的长度上限（与官方起名一致）
const TITLE_GEN_MAX_TITLE = 64;   // 生成标题的长度上限（按字符计）
const TITLE_GEN_TIMEOUT_MS = 60000; // 单次模型调用超时（与官方起名一致；推理模型思考占时较长）

// 内置套餐显示名：与 ZCode 界面的叫法一致——条目原始名区分度差
//（coding-plan 与 start-plan 都叫 "Coding Plan"），界面里按套餐类型显示。
// coding-plan 的个人/团队是动态的：从桌面设置（v2/setting.json 的
// providerFamilyConnectionSelections）读当前登录的连接方式（kind 含
// individual → 个人、team → 团队），读不到时退回“个人/团队”
function codingPlanKindByFamily() {
  const s = readJsonFile(join(resolveDataRootDir(), 'v2', 'setting.json')); // 官方 v2 配置跟数据根迁移
  const sel = (s && s.providerFamilyConnectionSelections && typeof s.providerFamilyConnectionSelections === 'object')
    ? s.providerFamilyConnectionSelections : {};
  const out = {};
  for (const [family, v] of Object.entries(sel)) {
    const kind = String(v?.kind || '');
    if (/individual/i.test(kind)) out[family] = '个人';
    else if (/team/i.test(kind)) out[family] = '团队';
  }
  return out;
}

function titleGenProviderDisplayName(id, name, planKinds = {}) {
  const m = /^builtin:(zai|bigmodel)-coding-plan$/.exec(id);
  if (m) {
    const fam = m[1] === 'zai' ? 'Z.ai' : 'BigModel';
    return `${fam}（${planKinds[m[1]] || '个人/团队'}）`;
  }
  if (/^builtin:(zai|bigmodel)-start-plan$/.test(id)) return 'Start Plan';
  return (name && String(name).trim()) || id;
}

// headroom 压缩路由（/hr-join）注册表：供应商接入后 baseUrl 统一指向 127.0.0.1:8787，
// 地址不再带协议线索，真实格式（anthropic/openai）记录在 ~/.zcode/headroom.json 的
// providers 里；按供应商 id 查，查不到返回空串。同一查表逻辑在 zcode-plugins 的
// vision-lib.mjs（headroomFormatOf）与 hr-join 接入规则各有一份，改 providers
// 结构时三处同改
function headroomFormatOf(headroomProviders, providerId) {
  const hit = (headroomProviders || []).find((p) => p && p.id === providerId);
  const f = String(hit?.format || '').toLowerCase();
  return f === 'anthropic' || f === 'openai' ? f : '';
}

// 供应商条目（智能起名与视觉代理共用），列表范围与 ZCode 界面的供应商列表
// 保持一致：
// - 内置套餐（builtin:*）：有地址、密钥才列出（无密钥的 helper 无法在会话外
//   调用，如未配 key 的 API Key 型条目）；
// - 自定义供应商：以 provider_config.json 的 providerOrder 为准（ZCode 界面的
//   自定义列表就来自它），provider 表里不在其中的残留条目（已弃用的中转等）
//   不列出；
// - 协议：api.type / kind 缺失时按地址推断（含 anthropic → anthropic，含
//   openai 或以 /v\d 结尾 → openai）；地址推不出（典型：指向 headroom 压缩路由
//   127.0.0.1:8787）时查上面的注册表，仍没有才放弃该条目。
// 两张来源表同 id 合并（模型并集、原始名收进别名）。models 为该供应商的
// 可选模型（下拉用，可为空）。导出以便测试
export function listTitleGenProviders() {
  const out = [];
  const byId = new Map();
  const planKinds = codingPlanKindByFamily();
  // 注册表读一次，供下方各条目的协议判定兜底复用（文件不存在时为空数组）
  const headroomProviders = (readJsonFile(defaultHeadroomFile()) || {}).providers || [];
  const add = (id, { name, aliases = [], kind, baseUrl, apiKey, models = [] }) => {
    baseUrl = typeof baseUrl === 'string' ? baseUrl.trim() : '';
    apiKey = typeof apiKey === 'string' ? apiKey.trim() : '';
    if (!id || !baseUrl || !apiKey) return;
    let format = /anthropic/i.test(String(kind)) ? 'anthropic' : /openai/i.test(String(kind)) ? 'openai' : '';
    if (!format) format = /anthropic/i.test(baseUrl) ? 'anthropic'
      : (/openai/i.test(baseUrl) || /\/v\d+$/.test(baseUrl)) ? 'openai' : '';
    if (!format) format = headroomFormatOf(headroomProviders, id);
    if (!format) return;
    models = models.filter(Boolean);
    const known = byId.get(id);
    if (known) {
      known.models = [...new Set([...known.models, ...models])];
      for (const a of aliases) if (a && !known.aliases.includes(a)) known.aliases.push(a);
      return;
    }
    const shown = titleGenProviderDisplayName(id, name, planKinds);
    const entry = {
      id, name: shown, aliases: [...new Set(aliases.filter((a) => a && a !== shown))],
      format, baseUrl, apiKey, models: [...new Set(models)],
    };
    byId.set(id, entry);
    out.push(entry);
  };

  const v2 = readJsonFile(join(resolveDataRootDir(), 'v2', 'config.json')); // 官方 v2 配置跟数据根迁移
  const providers = (v2 && typeof v2.provider === 'object' && v2.provider) || {};
  const rulesDoc = readJsonFile(join(resolveDataRootDir(), 'v2', 'provider_config.json'));
  const rules = (rulesDoc && rulesDoc.config?.providerConfigRules?.providerRules) || [];
  const ruleById = new Map(rules.filter((r) => r && typeof r.providerId === 'string').map((r) => [r.providerId, r]));
  // 同一 id 在两张表的字段并起来（provider 表优先：地址/密钥以桌面实际在用的为准）
  const addMerged = (id) => {
    const p = providers[id];
    if (p !== undefined && (p === null || typeof p !== 'object')) return;
    const r = ruleById.get(id) || {};
    const c = r.config || {};
    add(id, {
      name: (p && p.name) || r.providerName,
      aliases: [r.providerName, p && p.name],
      kind: (p && p.kind) || c.api?.type,
      baseUrl: (p && p.options?.baseURL) || c.api?.baseUrl,
      apiKey: (p && p.options?.apiKey) || c.access?.apiKey,
      models: [...Object.keys((p && p.models) || {}), ...(c.modelOrder || []), ...(c.personalModelIds || [])],
    });
  };

  // 内置套餐在前（BigModel（个人/团队）→ Start Plan 的顺序）
  for (const id of Object.keys(providers)) {
    if (id.startsWith('builtin:')) addMerged(id);
  }
  // 自定义供应商按界面顺序（providerOrder）
  const order = (rulesDoc && Array.isArray(rulesDoc.config?.providerOrder) ? rulesDoc.config.providerOrder : [])
    .filter((id) => typeof id === 'string');
  for (const id of order) addMerged(id);
  return out;
}

// Anthropic Messages 文本调用（无系统提示词，单条用户消息）。max_tokens 给足
// 2048：glm 系列等推理模型先输出 thinking 块再出正文，给小了会全部耗在
// 思考上（stop_reason=max_tokens 且没有任何 text 块），起名调用不在意这点额度
async function callAnthropicText(baseUrl, apiKey, model, content) {
  const url = baseUrl.replace(/\/+$/, '') + '/v1/messages';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TITLE_GEN_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 2048, messages: [{ role: 'user', content }] }),
    });
    const body = await resp.text();
    if (!resp.ok) throw new Error(`HTTP ${resp.status} [model=${model}]: ${body.slice(0, 300)}`);
    const doc = JSON.parse(body);
    const text = Array.isArray(doc.content)
      ? doc.content.filter((b) => b && b.type === 'text').map((b) => b.text || '').join('') : '';
    if (!text) throw new Error(doc.stop_reason === 'max_tokens'
      ? '模型的思考用完了输出上限，仍未给出标题' : '响应中没有文本内容');
    return text;
  } catch (err) {
    if (err && err.name === 'AbortError') throw new Error(`请求超时（${Math.round(TITLE_GEN_TIMEOUT_MS / 1000)} 秒）`);
    throw err;
  } finally { clearTimeout(timer); }
}

// OpenAI Chat Completions 文本调用；baseURL 已含 /v1 时不重复拼
async function callOpenAiText(baseUrl, apiKey, model, content) {
  const base = baseUrl.replace(/\/+$/, '');
  const url = /\/v\d+$/.test(base) ? base + '/chat/completions' : base + '/v1/chat/completions';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TITLE_GEN_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, max_tokens: 2048, messages: [{ role: 'user', content }] }),
    });
    const body = await resp.text();
    if (!resp.ok) throw new Error(`HTTP ${resp.status} [model=${model}]: ${body.slice(0, 300)}`);
    const doc = JSON.parse(body);
    const text = doc.choices?.[0]?.message?.content || '';
    if (typeof text !== 'string' || !text.trim()) throw new Error('响应中没有文本内容');
    return text;
  } catch (err) {
    if (err && err.name === 'AbortError') throw new Error(`请求超时（${Math.round(TITLE_GEN_TIMEOUT_MS / 1000)} 秒）`);
    throw err;
  } finally { clearTimeout(timer); }
}

// 生成标题的双写收尾，顺序不能反：先写 CLI 会话库（title_source=custom，权威层
// ——官方自动起名看到 custom 会放弃，桌面同步器会把 custom 标题带着 overridden=1
// 送回任务索引），再写任务索引（展示层，立即上屏）。只写任务索引时，官方运行时
// 排队的自动标题会在几秒后把它覆盖（实测）。CLI 库不可写（旧版无 title_source
// 列 / 无该会话行）不阻断：退回单写任务索引的旧行为；任务索引随后失败也不回滚
// CLI——同步器会补。写库撞上宿主写入时稍候重试（起名不急这几秒）。
// force = 手动“自动重命名”：已重命名的会话也照写（用户显式改名）。
// 返回 { written, store, error }：store '' 成功 | skipped 原因 | 'error…'；
// error 非空 = 任务索引最终没写成（err 带 code，由调用方转 500）。
// CLI 库写成功才登记回查记录（reconcileCustomTitles 只认这些记录校正），
// 登记只是回查簿记，失败不影响改名结果。导出以便测试
export async function writeGeneratedTitle(dataRoot, configFile, sessId, title, { force = false } = {}) {
  let written = false;
  let store = ''; // CLI 会话库写入结果：'' 成功 | skipped 原因 | 'error…'
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await setCustomSessionTitle(dataRoot, sessId, title);
      store = r.written ? '' : (r.skipped || 'skipped');
      break;
    } catch (err) {
      if (err.code === 'index-busy' && attempt < 2) {
        await new Promise((r) => setTimeout(r, 1200));
        continue;
      }
      store = 'error: ' + (err?.message || err);
      titleGenLog(dataRoot, `cli-store-error sess=${sessId.slice(0, 13)} err=${err?.message || err}`);
      break;
    }
  }
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await setTaskTitleIfNotOverridden(dataRoot, sessId, title, { force });
      written = r.written;
      break;
    } catch (err) {
      if (err.code === 'index-busy' && attempt < 2) {
        await new Promise((r) => setTimeout(r, 1200));
        continue;
      }
      titleGenLog(dataRoot, `index-error sess=${sessId.slice(0, 13)} err=${err?.message || err}`);
      return { written, store, error: err };
    }
  }
  if (store === '') {
    // 跨进程锁内同步读改写，防止与别的写入方互相覆盖整份配置
    await withConfigLock(configFile, () => {
      try {
        const c = loadConfig(configFile);
        c.titleGen.customWritten = { ...(c.titleGen.customWritten || {}), [sessId]: { title, at: Date.now() } };
        if (!saveConfig(configFile, c)) throw new Error('zcodepro.json 损坏，写入被拒');
      } catch (err) {
        titleGenLog(dataRoot, `customWritten-save-error sess=${sessId.slice(0, 13)} err=${err?.message || err}`);
      }
    });
  }
  return { written, store };
}

// 生成标题。provider 三种取值：
// - 'session'：跟随当前会话——从任务索引解析该会话正在用的供应商与模型
//   （model 已填时用填写的），供应商需在可直连列表内；
// - ''：不跟随，用配置里的 baseUrl/apiKey/format 直连；
// - 供应商 id：按列表解析直连；id 已被删时退回保存时留下的地址/密钥副本。
// 输出统一清洗为单行短标题。导出以便测试
export async function generateTitleWith(cfg, rawText, dataRoot = '', sessId = '') {
  const text = String(rawText || '').trim().replace(/\s+/g, ' ').slice(0, TITLE_GEN_MAX_TEXT);
  const prompt = (cfg.prompt && cfg.prompt.trim()) || titleGenDefaultPrompt();
  // 注入当前日期（上海时区）：起名模型是无状态的，自定义提示词里要求
  // “MMDD 取对话创建日期”时它无从得知，只能留字面量 MMDD
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const dateLine = `当前日期（Asia/Shanghai）：${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}（MMDD 即 ${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}）`;
  const userContent = `${prompt}\n\n${dateLine}\n\n会话的用户消息：\n${text}`;
  const providerId = (cfg.provider || '').trim();
  const model = (cfg.model || '').trim();
  const conn = await resolveTitleGenConnection(cfg, providerId, model, dataRoot, sessId);
  const raw = conn.format === 'anthropic'
    ? await callAnthropicText(conn.baseUrl, conn.apiKey, conn.model, userContent)
    : await callOpenAiText(conn.baseUrl, conn.apiKey, conn.model, userContent);
  const title = cleanGeneratedTitle(raw);
  if (!title) throw new Error('模型未返回可用标题');
  return title;
}

// 供应商 id 的匹配归一化（导出以便测试）：会话索引里登录账号供应商带 account:
// 前缀（如 account:bigmodel-individual-coding-plan），供应商列表里同名条目带
// builtin: 前缀（builtin:bigmodel-coding-plan），个人/团队是同一端点——剥前缀、
// 抹掉 individual/team 差异后按同一家匹配
export function normalizeProviderIdForMatch(id) {
  return String(id || '')
    .replace(/^(account|builtin):/, '')
    .replace(/-(individual|team)-/, '-');
}

// —— 登录账号供应商（Coding Plan）直连凭据的换取 ——
// Coding Plan 的直连密钥不是静态保存的，官方桌面/CLI 用 OAuth access_token
// 实时换“项目 token”。这里复刻同款流程（协议读自官方 project-access-token-
// client.ts），让只登录、从未配置过供应商的机器也能直连起名：
// ① 解密 v2/credentials.json 里的 oauth:<family>:access_token——加密格式
//    enc:v1:<iv>.<authTag>.<cipher>（AES-256-GCM），密钥推导与官方
//    credential-cipher.ts 一致（ZCODE_CREDENTIAL_SECRET 环境变量优先，否则
//    sha256("zcode-credential-fallback:平台:主目录:用户名")），同机同用户可解；
// ② GET getCustomerInfo 定位个人（非团队）项目——优先名称含“默认机构/
//    默认项目”的条目，否则取第一个；
// ③ 在项目的 api_keys 里找官方建的 zcode-api-key（没有则创建）；
// ④ POST …/access_tokens 换项目 token（临期前进程内缓存复用）。
// 管理接口的鉴权：bigmodel 用原始 token、zai 带 Bearer 前缀；签发接口两家
// 都用 Bearer——与官方实现一致
const ACCOUNT_FAMILY_BASE = {
  bigmodel: { manageOrigin: 'https://bigmodel.cn', apiBase: 'https://open.bigmodel.cn/api/anthropic' },
  zai: { manageOrigin: 'https://api.z.ai', apiBase: 'https://api.z.ai/api/anthropic' },
};
const accountTokenCache = new Map(); // family → { token, expiresAt }

// 解密 credentials.json 的 enc:v1: 值（非加密值原样返回；失败返回空串）
export function decryptCredentialValue(value) {
  const s = String(value || '');
  if (!s.startsWith('enc:v1:')) return s;
  const [ivRaw, tagRaw, ctRaw] = s.slice('enc:v1:'.length).split('.');
  if (!ivRaw || !tagRaw || !ctRaw) return '';
  try {
    const secret = (process.env.ZCODE_CREDENTIAL_SECRET || '').trim()
      || `zcode-credential-fallback:${process.platform}:${homedir()}:${userInfo().username}`;
    const key = createHash('sha256').update(secret).digest();
    const d = createDecipheriv('aes-256-gcm', key, Buffer.from(ivRaw, 'base64url'));
    d.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(ctRaw, 'base64url')), d.final()]).toString('utf8');
  } catch { return ''; }
}

// 换取登录账号的项目 token；成功返回 { token, apiBase, expiresAt }
export async function exchangeAccountProjectToken(family, dataRoot) {
  const conf = ACCOUNT_FAMILY_BASE[family];
  if (!conf) throw new Error(`不支持的供应商族 ${family}`);
  const cached = accountTokenCache.get(family);
  if (cached && Date.now() < cached.expiresAt - 5 * 60 * 1000) {
    return { token: cached.token, apiBase: conf.apiBase, expiresAt: cached.expiresAt };
  }
  const creds = readJsonFile(join(dataRoot, 'v2', 'credentials.json'));
  const loginToken = (creds && typeof creds === 'object')
    ? decryptCredentialValue(creds[`oauth:${family}:access_token`]) : '';
  if (!loginToken) throw new Error(`credentials.json 里没有可解的 ${family} 登录令牌（未登录或已过期）`);

  // BIGMODEL_API_BASE_URL：官方同款测试环境覆盖，顺带让协议可注入测试
  const origin = (family === 'bigmodel' && (process.env.BIGMODEL_API_BASE_URL || '').trim())
    || conf.manageOrigin;
  // 管理接口沿用旧鉴权格式（bigmodel 原始 token / zai Bearer）；签发接口用 Bearer
  const manageHeaders = {
    'content-type': 'application/json',
    authorization: family === 'zai' ? `Bearer ${loginToken}` : loginToken,
  };
  const api = async (path, init = {}) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const resp = await fetch(origin + path, { ...init, signal: ctrl.signal, headers: manageHeaders });
      const doc = await resp.json().catch(() => null);
      const data = (doc && [200, 0, '200', '0'].includes(doc.code)) ? doc.data : null;
      if (data === null) throw new Error(`接口 ${path} 返回异常（${resp.status}）`);
      return data;
    } finally { clearTimeout(timer); }
  };

  // ① 客户信息 → ② 定位个人项目（projectType "2" 是团队项目，个人密钥不能挂在团队下）
  const cust = await api('/api/biz/customer/getCustomerInfo');
  const orgs = (Array.isArray(cust?.organizations) ? cust.organizations : [])
    .map((o) => ({ id: String(o?.organizationId || '').trim(), name: String(o?.organizationName || ''),
      projects: (Array.isArray(o?.projects) ? o.projects : [])
        .filter((p) => String(p?.projectType ?? '').trim() !== '2' && String(p?.projectId || '').trim()) }));
  const org = orgs.find((o) => o.id && o.projects.length && o.name.includes('默认机构')) || orgs.find((o) => o.id && o.projects.length);
  const project = org && (org.projects.find((p) => String(p?.projectName || '').includes('默认项目')) || org.projects[0]);
  if (!org || !project) throw new Error('账号下没有可用的个人项目（未订阅 Coding Plan？）');

  // ③ 找官方建的 zcode-api-key，没有就建一个
  const keysUrl = `/api/biz/v1/organization/${encodeURIComponent(org.id)}/projects/${encodeURIComponent(project.projectId)}/api_keys`;
  const keys = await api(keysUrl);
  const keyEntry = (Array.isArray(keys) ? keys : []).find((k) => k && typeof k === 'object' && k.name === 'zcode-api-key')
    || await api(keysUrl, { method: 'POST', body: JSON.stringify({ name: 'zcode-api-key', usageScene: 1 }) });
  const apiKeyId = keyEntry && String(keyEntry.apiKey || '').trim();
  if (!apiKeyId) throw new Error('未能定位 Coding Plan 的 API Key');

  // ④ 签发项目 token（此接口用 Bearer 鉴权；超时与 api() 同款）
  const issueCtrl = new AbortController();
  const issueTimer = setTimeout(() => issueCtrl.abort(), 20000);
  let issueResp;
  let issue;
  try {
    issueResp = await fetch(`${origin}${keysUrl}/${encodeURIComponent(apiKeyId)}/access_tokens`, {
      method: 'POST',
      signal: issueCtrl.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${loginToken}` },
      body: JSON.stringify({ clientType: 'zcode', clientVersion: VERSION }),
    });
    // 响应体读取也放超时保护内（与 api() 同款）：管理接口回完头拖着不发体会永久挂起
    issue = await issueResp.json().catch(() => null);
  } finally { clearTimeout(issueTimer); }
  const issueData = (issue && [200, 0, '200', '0'].includes(issue.code)) ? issue.data : null;
  if (!issueData) throw new Error(`签发项目 token 失败（${issueResp.status}）`);
  // enable 语义与官方一致：旧版接口不回该字段（实测回的是同义的 enabled），
  // 缺失视为开启，仅显式 false 才算未开启
  if (issueData.enable === false || !issueData.accessToken) throw new Error('项目 token 未开启（enable=false）');
  accountTokenCache.set(family, { token: issueData.accessToken, expiresAt: Number(issueData.expiresAt) || 0 });
  return { token: issueData.accessToken, apiBase: conf.apiBase, expiresAt: Number(issueData.expiresAt) || 0 };
}

// 直连前的连接解析（见 generateTitleWith 的取值说明）；解析不出抛明确错误
async function resolveTitleGenConnection(cfg, providerId, model, dataRoot, sessId) {
  if (providerId === 'session') {
    if (!dataRoot) throw new Error('跟随当前会话需要会话信息');
    // sessId 为空（设置面板测试按钮，没有会话上下文）时取任务索引里最近更新
    // 的会话——与视觉代理测试按钮同款语义
    const task = await getTaskProviderModel(dataRoot, sessId || '');
    if (!task || !task.providerId) {
      throw new Error(sessId ? '索引中查不到该会话的供应商信息' : '任务索引里没有会话记录（“跟随当前会话”取上次会话的供应商/模型）：先在任意会话里发过消息，或改选具体供应商再测试');
    }
    const list = listTitleGenProviders();
    const entry = list.find((p) => p.id === task.providerId)
      || list.find((p) => normalizeProviderIdForMatch(p.id) === normalizeProviderIdForMatch(task.providerId));
    if (!entry) {
      // 登录账号供应商：本机没有物化密钥表（从未保存过供应商配置的机器不生成
      // v2/config.json）时按官方同款流程换取项目 token 直连（见下方实现）
      if (task.providerId.startsWith('account:')) {
        if (/start-plan/.test(task.providerId)) {
          throw new Error('会话用的是 Start Plan 登录供应商，暂不支持自动直连：请在此改选具体供应商或不跟随（自填地址）');
        }
        const family = task.providerId.includes(':zai') ? 'zai' : 'bigmodel';
        let accountConn;
        try {
          accountConn = await exchangeAccountProjectToken(family, dataRoot);
        } catch (err) {
          throw new Error(`登录账号供应商取直连密钥失败（${err?.message || err}）：请在 ZCode 里重新登录，或在此改选具体供应商 / 不跟随`);
        }
        const useAccountModel = model || task.modelId;
        if (!useAccountModel) throw new Error('未能确定会话当前模型，请手动填写模型');
        return {
          format: 'anthropic',
          baseUrl: accountConn.apiBase,
          apiKey: accountConn.token,
          // 官方目录的模型名是大写 GLM- 前缀；会话索引里可能是小写（不同供应商
          // 记法不一），登录端点按目录写法规整
          model: /^glm-\d/.test(useAccountModel) ? useAccountModel.replace(/^glm/, 'GLM') : useAccountModel,
        };
      }
      throw new Error(`会话供应商 ${task.providerId} 无法在会话外直连（无密钥或协议未知）`);
    }
    const useModel = model || task.modelId;
    if (!useModel) throw new Error('未能确定会话当前模型，请手动填写模型');
    return { format: entry.format, baseUrl: entry.baseUrl, apiKey: entry.apiKey, model: useModel };
  }
  if (providerId) {
    const entry = listTitleGenProviders().find((p) => p.id === providerId);
    if (entry) {
      if (!model) throw new Error('已选择供应商，但未填写模型');
      return { format: entry.format, baseUrl: entry.baseUrl, apiKey: entry.apiKey, model };
    }
    // 供应商已被删：退回保存时的地址/密钥副本
    if (cfg.baseUrl && cfg.apiKey && cfg.format) {
      if (!model) throw new Error('已删除的供应商需手动填写模型');
      return { format: cfg.format, baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model };
    }
    throw new Error(`供应商 ${providerId} 已不可用（未保存地址/密钥副本），请重新选择`);
  }
  // 不跟随（自填地址）
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.format) {
    throw new Error('不跟随（自填地址）需要填写接口地址、API Key 与协议');
  }
  if (!model) throw new Error('不跟随（自填地址）需要填写模型');
  return { format: cfg.format, baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model };
}

// 清洗模型输出：去思考块/代码围栏/首尾引号/序号/末尾标点，取首个非空行并限长。
// 模型可能沿用官方起名的习惯回 JSON 对象，此时取其 title 字段。自定义提示词常让
// 模型“先说明再给标题”（如“无法直接修改会话标题……建议手动设置：”后另起一行
// 【MMDD|类型|主题】），此时首个非空行是说明而非标题——优先取独立成行的
// 【】/[] 包裹标题行（允许行首 markdown 标题符）。导出以便测试
export function cleanGeneratedTitle(text) {
  let t = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  // 整段包在代码围栏里时先去掉围栏标记（先取行会把“```json”当成标题内容）
  t = t.replace(/^```[a-zA-Z]*\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
  const lines = t.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  // 标题行判定前剥掉 markdown 外壳（## 标题符、**加粗**、*斜体*、_下划线_、~~删除线~~）
  const unwrap = (s) => s.replace(/^#{1,4}\s*/, '').replace(/^[*_~]+/, '').replace(/[*_~]+$/, '').trim();
  const bracketed = lines.find((s) => /^(?:【[^】]{1,60}】|\[[^\]\n]{1,60}\])$/.test(unwrap(s)));
  let line = bracketed ? unwrap(bracketed) : (lines[0] || '');
  line = line.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '');
  try {
    const doc = JSON.parse(line);
    if (doc && typeof doc.title === 'string') line = doc.title;
  } catch { /* 不是 JSON，按纯文本处理 */ }
  line = line.replace(/^["'「『“]+/, '').replace(/["'」』”]+$/, '');
  line = line.replace(/^\d+[.、)\]]\s*/, '');
  line = line.replace(/[.。!！?？，,;；:：]\s*$/, '');
  line = line.replace(/\s+/g, ' ').trim();
  const chars = [...line];
  if (chars.length > TITLE_GEN_MAX_TITLE) {
    line = chars.slice(0, TITLE_GEN_MAX_TITLE).join('');
    // 截断落在英文单词中间时退到词边界，避免出现半个单词
    if (line.includes(' ')) line = line.slice(0, line.lastIndexOf(' '));
  }
  return line.trim();
}

// zcode-vision 配置校验：只保留已知字段并规范化；出错时返回中文原因。
// 导出以便测试脚本直接驱动。
export function validateVisionConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [null, 'config 必须是对象'];
  if (raw.chainMode !== 'fallback' && raw.chainMode !== 'pipeline') return [null, 'chainMode 只能是 fallback 或 pipeline'];
  if (!Array.isArray(raw.chain) || raw.chain.some((n) => typeof n !== 'string')) return [null, 'chain 必须是代理名数组'];
  if (!Array.isArray(raw.proxies)) return [null, 'proxies 必须是数组'];
  const cfg = {
    // enabled 同 cardUi：显式给值才写键，缺省保持磁盘原值（否则磁盘上显式
    // false 会被一次省略 enabled 的保存覆盖回 true）
    ...(raw.enabled !== undefined ? { enabled: raw.enabled !== false } : {}),
    chainMode: raw.chainMode,
    chain: raw.chain.map((s) => s.trim()).filter(Boolean),
    proxies: [],
    pollMs: clampInt(raw.pollMs, 0, 60000, 3000),
    apiTimeoutMs: clampInt(raw.apiTimeoutMs, 1000, 600000, 120000),
    compressThresholdKB: clampInt(raw.compressThresholdKB, 0, 102400, 1024),
    // 连续失败跳过（0 = 不跳过）；跳过时长（分钟）
    skipAfterFailures: clampInt(raw.skipAfterFailures, 0, 100, 2),
    skipMinutes: clampInt(raw.skipMinutes, 1, 10080, 30),
    // 主模型能看图时的策略：true = 始终走识别代理（双重识别换卡片）；false = 能看图就不拦截；
    // null = 自动（跟随宿主「模型设置」图片开关，zcode-vision ≥1.7.9 语义）。缺省不写键（POST
    // 磁盘合并保留原值）；显式 null 由 POST 合并处删键（面板「自动」选项）
    ...(raw.forceIntercept !== undefined
      ? { forceIntercept: raw.forceIntercept === true ? true : raw.forceIntercept === false ? false : null }
      : {}),
    // 识图卡片展示：只在调用方显式给值时透传（面板开关用）；缺省不写键，
    // 让 POST 的磁盘合并保留原值（zcode-pro 装机缺省 true 的补键逻辑见 GET /vision）
    ...(raw.cardUi !== undefined ? { cardUi: raw.cardUi === true } : {}),
    // interceptMode（tool/inject）同 cardUi：显式给值才透传，缺省保持磁盘原值
    ...(raw.interceptMode !== undefined && ['tool', 'inject'].includes(raw.interceptMode) ? { interceptMode: raw.interceptMode } : {}),
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
    // 跟随会话（useProvider=session）时允许 model 留空：留空 = 用会话当前模型
    //（zcode-vision ≥1.6.1 支持）；其余情况必须填写
    if (!(proxy.model || '').trim() && proxy.useProvider !== 'session') {
      return [null, `代理 ${name} 缺少 model`];
    }
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
  // 临时名带 pid+随机：钩子进程与面板并发写这两个文件时不共用一个 .tmp
  const pidTmp = (f) => `${f}.${process.pid}.${Date.now().toString(36)}.tmp`;
  const modeFile = join(dir, 'mode');
  const tmp = pidTmp(modeFile);
  writeFileSync(tmp, mode, 'utf8');
  renameSync(tmp, modeFile);
  const wlFile = join(dir, 'whitelist');
  if (whitelist.length === 0) {
    try { unlinkSync(wlFile); } catch { /* 不存在即目标状态 */ }
    return;
  }
  const wlTmp = pidTmp(wlFile);
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
      // sha256 校验（checksums.txt 与本机摘要工具；失败即中止，不替换）。
      // Release 没有 checksums.txt：无从校验，直接中止升级，绝不替换未经校验的二进制
      if (!info.sumsUrl) throw new Error('Release 缺少 checksums.txt，无法校验下载文件，已中止升级');
      {
        const sumPath = join(dir, 'checksums.txt');
        await downloadToFile(j, info.sumsUrl, sumPath, 30000);
        const want = readFileSync(sumPath, 'utf8').split('\n')
          .find((l) => l.trim().endsWith(info.assetName))?.trim().split(/\s+/)[0];
        let got = '';
        if (WIN) {
          // 路径包进单引号（内部 ' 写成 ''）：双引号里 $、反引号会被当变量/子表达式求值
          const safeArch = String(archPath).replace(/'/g, "''");
          const local = await execCapture('powershell.exe',
            ['-NoProfile', '-Command', `(Get-FileHash -Algorithm SHA256 -LiteralPath '${safeArch}').Hash`], 60000);
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
      // 试运行有约 10 秒窗口：期间被取消就别再替换二进制（否则状态显示
      // 已取消又显示升级成功，自相矛盾）
      if (j.canceled) throw new Error('canceled');
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
// 注册表读写走 PowerShell 而不是 reg.exe：reg 的输出按系统代码页编码（中文 Windows
// 是 GBK），Node 按 UTF-8 解码会把中文条目弄乱，原样写回就把用户 PATH 写坏了；
// PowerShell 经 .NET 读写值本身不做编码转换，只有控制台输出要固定 UTF-8（同 pickFolder.mjs）。
async function ensureUserPathEntry(dir) {
  const psRead = [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    "$k = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $false)",
    "if ($null -eq $k -or -not ($k.GetValueNames() -contains 'PATH')) { exit 2 }",
    "$v = $k.GetValue('PATH', $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)",
    "[Console]::Out.Write([string]($k.GetValueKind('PATH')) + [char]10 + [string]$v)",
  ].join('; ');
  const q = await execCapture('powershell.exe', ['-NoProfile', '-Command', psRead], 15000);
  // 值缺失才新建；读取本身出错一律不动用户 PATH（不能把整份值覆盖没了）
  let kind = 'String';
  let next = dir; // 缺失分支写调用方给的目录，别写死别的路径
  if (q.code !== 2) {
    if (!q.ok) return false;
    const nl = q.output.indexOf('\n');
    const curKind = (nl < 0 ? q.output : q.output.slice(0, nl)).trim();
    if (curKind !== 'String' && curKind !== 'ExpandString') return false; // REG_SZ/REG_EXPAND_SZ 之外的类型不认识，不动它
    const cur = (nl < 0 ? '' : q.output.slice(nl + 1)).trim();
    const norm = (s) => s.replace(/[/\\]+/g, '\\').replace(/\\+$/, '').toLowerCase();
    const expanded = cur.replaceAll('%USERPROFILE%', homedir());
    if (expanded.split(';').some((p) => p && norm(p) === norm(dir))) return true;
    kind = curKind;
    next = cur ? `${cur};${dir}` : dir;
  }
  // 值包进单引号（内部 ' 写成 ''）：$、反引号、$( ) 都不会被当变量/子表达式求值
  const psWrite = [
    "$k = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment')",
    `$k.SetValue('PATH', '${next.replace(/'/g, "''")}', [Microsoft.Win32.RegistryValueKind]::${kind})`,
  ].join('; ');
  const r = await execCapture('powershell.exe', ['-NoProfile', '-Command', psWrite], 15000);
  return r.ok;
}

// 在插件缓存里找市场插件的钩子脚本：只认 installed_plugins.json 登记的 installPath。
// 不能按目录扫描：卸载只删“当前指向”的版本目录，缓存里的历史版本目录会残留
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

// 读市场插件在 installed_plugins.json 里登记的版本（面板信息卡显示“插件 x.y.z”用）
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

// 写配置：与插件 hr_config_set 同语义——只改这三个键，其余键（hr-join 注册的
// providers/router/instances 等）原样保留，缺键不动对应旧值；三键重盖整文件
// 会把供应商映射丢光，面板一调设置全员 401（插件侧 ADR-0008 修过同款坑）。
// 导出以便测试。
export function writeHeadroomConfig(file, cfg) {
  const cur = readJsonFile(file);
  const out = (cur && typeof cur === 'object' && !Array.isArray(cur)) ? { ...cur } : {};
  for (const k of ['kompressBackend', 'powerSaveCpu', 'powerWatchInterval']) {
    if (cfg[k] !== undefined) out[k] = cfg[k];
  }
  const tmp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`; // 防多写者共用同一 .tmp 撕裂
  writeFileSync(tmp, JSON.stringify(out, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 }); // 配置含供应商凭据，限制本人读写
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
// 二进制版本缓存（路径+mtime+size）：--version 要 spawn 进程（headroom 的
// Python CLI 冷启约 600ms），版本只在二进制被升级（mtime/size 变化）时才可能变
const binVersionCache = new Map();
async function binVersionOf(bin) {
  let key = null;
  try {
    const st = statSync(bin);
    key = bin + ':' + st.mtimeMs + ':' + st.size;
  } catch { key = null; }
  if (key && binVersionCache.has(key)) return binVersionCache.get(key);
  const r = await execCapture(bin, ['--version'], 10000);
  const m = /(\d+(?:\.\d+){1,3}(?:[A-Za-z0-9.+-]*)?)/.exec(r.output);
  const v = r.ok && m ? m[1] : null;
  if (key) {
    binVersionCache.set(key, v);
    // 同一路径的旧键失效（防升级后多代堆积）
    for (const k of binVersionCache.keys()) if (k.startsWith(bin + ':') && k !== key) binVersionCache.delete(k);
  }
  return v;
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
  // 写盘错误必须有人接（磁盘满/杀软锁文件）：无人订阅的 error 事件直接崩进程，
  // 挂在 drain 等待上时还会永久不返回、升级任务卡死
  let outErr = null;
  out.on('error', (e) => { outErr = e; });
  let got = 0;
  let lastPct = -1;
  try {
    for await (const chunk of res.body) {
      if (j.canceled) throw new Error('canceled');
      if (outErr) throw outErr;
      if (!out.write(chunk)) {
        await new Promise((r) => {
          const done = () => { out.off('drain', done); out.off('error', done); r(); };
          out.once('drain', done);
          out.once('error', done); // 出错也解除等待，别永久挂起
        });
        if (outErr) throw outErr;
      }
      got += chunk.length;
      if (total > 0) {
        const pct = Math.floor((got / total) * 100);
        if (pct >= lastPct + 5) { lastPct = pct; j.output += `下载中 ${pct}%\n`; }
      }
    }
    if (outErr) throw outErr;
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
// 环境按用途注入代理（默认 deps：headroom/rtk；CLI 的市场命令走 runNodeScript，
// 市场回退克隆的 git 操作走这里，scope 传 plugins）
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

// 启动兜底：整机重启后首次打开应用时恢复的是旧会话，触发 SessionStart(resume)，
// 旧版 headroom 插件的钩子只匹配 startup，代理不会自动启动（要等用户新建会话或
// 手动重启）。helper 就绪后延迟几秒补一次 ensure：动作幂等（已在跑秒回），新版
// 插件侧还带跨进程锁；失败一律静默——没装 headroom 插件/本体的环境不能打扰启动。
function ensureHeadroomAtStartup(state = {}) {
  // 标志挂 state（跨热替换实例共享）：放模块级时每次热替换都重置，兜底 ensure 会重复排队
  if (state.headroomEnsureFired) return;
  state.headroomEnsureFired = true;
  const timer = setTimeout(() => {
    runHeadroomHook(['ensure'], 20000).catch(() => { /* 兜底失败不影响启动 */ });
  }, 5000);
  timer.unref?.();
}

// 解析 ensure-proxy(.sh/.mjs) status 输出为结构化字段（字段名以脚本 hr_status 的输出为准；
// headroom 插件 1.3.0+ 多实例模式由 hr-multi 输出同名字段，另附 instance: 行）。
// 导出以便测试脚本直接驱动。
export function parseHeadroomStatus(text) {
  const raw = String(text || '');
  const line = (key) => {
    const m = new RegExp('^' + key + ': *(.*)$', 'm').exec(raw);
    return m ? m[1].trim() : null;
  };
  const proxy = line('proxy') || '';
  const ps = line('power-save-auto-cpu') || '';
  // 多实例模式的实例行：instance: <端口> <格式> <上游> <up|down> <供应商列表>
  const instances = [];
  for (const m of raw.matchAll(/^instance: (\d+) (\S+) (\S+) (up|down) ?(.*)$/gm)) {
    instances.push({ port: Number(m[1]), format: m[2], upstream: m[3], up: m[4] === 'up', providers: m[5] || '' });
  }
  return {
    up: /^up\b/.test(proxy),
    port: Number(/(\d+)\)?$/.exec(proxy)?.[1]) || null,
    managed: line('managed-by-plugin'),
    multi: instances.length > 0 || /^instances: \d+$/m.test(raw),
    instances,
    backend: line('current-backend'),
    desiredBackend: line('desired-backend'),
    powerMode: line('power-mode'),
    saverDetect: line('saver-detect'),
    // watcher 行存在才是真状态；多实例模式不输出该行时为 null（面板显示 —）
    watcherRunning: /^watcher: /m.test(raw) ? /^watcher: running/m.test(raw) : null,
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
  // 同步调用点用同步等锁变体：整段读改写在跨进程锁内完成，防止与别的写入方互相覆盖
  return withConfigLockSync(configFile, () => setHeadroomUsageLocked(dataRoot, configFile, enable));
}

function setHeadroomUsageLocked(dataRoot, configFile, enable) {
  const backupFile = (p) => {
    try { if (existsSync(p)) copyFileSync(p, p + '.zcodepro-backup'); } catch { /* 备份失败不阻塞 */ }
  };
  const atomicWrite = (p, obj) => {
    const tmp = `${p}.${process.pid}.${Date.now().toString(36)}.tmp`; // 防多写者共用同一 .tmp 撕裂
    writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
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
  if (!saveConfig(configFile, config)) {
    return { ok: false, code: 'config-unreadable', error: 'zcodepro.json 读取失败或已损坏，保存中止（请先修好配置文件）' };
  }
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

// 运行 zcode CLI 子命令（plugins … 默认走 plugins 代理范围；智能起名的
// 无界面提问传 none——模型 API 直连，不走下载代理）
function runZcodeCli(subArgs, timeoutMs = 120000, scope = 'plugins') {
  const bundle = zcodeCliBundleCandidates().find((c) => existsSync(c));
  if (!bundle) {
    return Promise.resolve({ ok: false, code: 'cli-not-found', error: '未找到 ZCode CLI（resources/glm/zcode.cjs）' });
  }
  return runNodeScript([bundle, ...subArgs], timeoutMs, scope);
}

// 简单版本号比较（a<b 返回 -1，相等 0，a>b 返回 1）：主版本按点分段，
// 数字段按数值比、非数字段按字符串比；主版本相同时带 pre-release 后缀
// （如 1.7.0-beta）低于正式版，后缀内部同样按段比较；空版本视为最旧
// （已装版本未知时当作可更新）
function cmpVersion(a, b) {
  const cmpSegs = (A, B) => {
    for (let i = 0; i < Math.max(A.length, B.length); i++) {
      const x = A[i] || '';
      const y = B[i] || '';
      const nx = /^\d+$/.test(x) ? Number(x) : null;
      const ny = /^\d+$/.test(y) ? Number(y) : null;
      if (nx !== null && ny !== null) {
        if (nx !== ny) return nx < ny ? -1 : 1;
      } else if (x !== y) {
        return x < y ? -1 : 1;
      }
    }
    return 0;
  };
  const parse = (v) => {
    const s = String(v || '');
    const i = s.indexOf('-');
    return { pre: i >= 0 ? s.slice(i + 1) : null, core: (i >= 0 ? s.slice(0, i) : s).split('.') };
  };
  const A = parse(a), B = parse(b);
  const c = cmpSegs(A.core, B.core);
  if (c !== 0) return c;
  if ((A.pre === null) !== (B.pre === null)) return A.pre === null ? 1 : -1;
  if (A.pre !== B.pre) return cmpSegs(A.pre.split('.'), B.pre.split('.'));
  return 0;
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
    // 只有市场版本更高才算可更新：本地高于市场（市场回退/降级）不提示、不自动降级
    hasUpdate: mine.has(e.name) && cmpVersion(mine.get(e.name), e.version || '') < 0,
  }));
  return { plugins, updates: plugins.filter((e) => e.hasUpdate) };
}

// 市场未添加时自动补装（新机器上设置面板的“安装/更新”按钮一键可用）：
// 读 known_marketplaces.json 判断，缺失则跑 plugins marketplace add；add 退出后
// 验证登记结果，未登记则回退 git clone 到本地走目录源——node 26 下 CLI 的 GitHub
// 归档解包会挂死并以退出码 0 静默退出，add 看似成功、登记表却没写，不能只信退出码。
// 不做失败冷却：用户可能刚配好代理就要重试，限制次数只会让人以为一直装不上。
// 返回 null = 已存在无需处理，{ ok } = 本次执行结果。

// 目录源回退的 git 克隆位置（sources/ 对 CLI 是无关目录，不干扰它自己的缓存布局）
function zcodePluginsSourceDir() {
  return join(cliPluginsDir(), 'sources', ZCODE_PLUGINS_MARKETPLACE);
}

function zcodePluginsMarketplaceRegistered() {
  const known = readJsonFile(join(cliPluginsDir(), 'known_marketplaces.json'));
  return (known?.marketplaces || []).some((m) => m?.id === ZCODE_PLUGINS_MARKETPLACE);
}

// 目录源市场的内容刷新：marketplace update 对目录源只重读本地目录，
// 新版本靠这里先 git pull（没有回退克隆时什么都不做）。导出以便测试。
export async function pullZcodePluginsSourceClone() {
  const dir = zcodePluginsSourceDir();
  if (!existsSync(dir)) return null;
  return execCapture('git', ['-C', dir, 'pull', '--ff-only'], 60000, 'plugins');
}

// 目录源刷新：目录不存在返回 null（正常 GitHub 源机器无克隆，不动作）；存在则
// git pull，pull 失败（残目录/上游强推无法快进）删掉重克隆自动恢复——坏目录不能让
// 市场更新永远停摆。wantClone = true 时目录缺失也克隆（add 回退路径用）
async function ensureZcodePluginsCloneFresh(wantClone = false) {
  const dir = zcodePluginsSourceDir();
  if (!existsSync(dir) && !wantClone) return null;
  const r = existsSync(dir) ? await pullZcodePluginsSourceClone() : null;
  if (r?.ok) return r;
  // pull 失败（残目录/上游强推）：先克隆到临时目录、成功后才替换旧目录——
  // 网络瞬断时保留“过时但可用”的旧目录，别一删了之
  const tmp = dir + '.reclone';
  rmSync(tmp, { recursive: true, force: true });
  const c = await execCapture('git', ['clone', '--depth', '1', `https://github.com/${ZCODE_PLUGINS_MARKETPLACE_SOURCE}.git`, tmp], 120000, 'plugins');
  if (!c.ok) return c;
  rmSync(dir, { recursive: true, force: true });
  renameSync(tmp, dir);
  return c;
}

// 目录源回退：克隆到本地后以目录源登记（marketplace add <目录>）。目录源的登记/
// 更新/安装只做文件读写，不走 CLI 的 GitHub 归档解包
async function addZcodePluginsMarketplaceFromClone() {
  const r = await ensureZcodePluginsCloneFresh(true);
  if (!r.ok) return r;
  return runZcodeCli(['plugins', 'marketplace', 'add', zcodePluginsSourceDir()], 120000);
}

// 市场添加失败的分类与提示：新机器常见两类原因——没装 Git、连不上 GitHub。
// 提示放最前：toast 是单行截断，放末尾会被长长的命令错误挤掉；独立的 code 让
// 英文界面也能显示对应说明（errText 对已登录的错误码用 errEn 文案）。
export function marketplaceAddFailure(raw) {
  const text = String(raw || '');
  if (/spawn git ENOENT/i.test(text)) {
    return { code: 'plugins-market-git', hint: '本机没有 Git，且直连 GitHub 失败；请安装 Git，或在 ZCode Pro 设置 → 代理 填写代理地址后重试。' };
  }
  if (/fetch failed|ENOTFOUND|ECONN|ETIMEDOUT|Failed to materialize|Failed to connect|Could not (?:connect|resolve)|unable to access/i.test(text)) {
    return { code: 'plugins-market-network', hint: '当前网络访问不了 GitHub；如需要代理，请在 ZCode Pro 设置 → 代理 填写代理地址后重试。' };
  }
  return { code: '', hint: '' };
}

export async function ensureZcodePluginsMarketplace() {
  if (zcodePluginsMarketplaceRegistered()) return null;
  let r = await runZcodeCli(['plugins', 'marketplace', 'add', ZCODE_PLUGINS_MARKETPLACE_SOURCE], 120000);
  if (!zcodePluginsMarketplaceRegistered()) r = await addZcodePluginsMarketplaceFromClone();
  const ok = r.ok && zcodePluginsMarketplaceRegistered();
  const raw = r.error || 'marketplace add 未生效：登记表里没有该市场';
  if (ok) return { ok, output: r.output, error: raw };
  const failure = marketplaceAddFailure(raw);
  const detail = raw.length > 300 ? `${raw.slice(0, 300)}…` : raw;
  return {
    ok,
    output: r.output,
    code: failure.code || undefined,
    error: failure.hint ? `${failure.hint} ${detail}` : detail,
  };
}

// /plugins/update 并发控制：启动自动更新、打开设置弹窗时的自动触发、手动按钮、
// 各插件面板的单插件操作都打到这个端点，而 CLI 同时改同一个插件目录会互相破坏。
// 按目标键（全量 = 空键，或同一插件名）去重：同目标的并发请求共用同一次执行结果，
// 不同目标各占一个槽位互不顶掉、排队串行，后到的等前一个结束再跑
let pluginsUpdateJobs = new Map(); // only 键 → 在跑或排队的任务 promise
// 一般后台任务在途标志（市场克隆/刷新、WebDAV 同步）：排队 + 执行期间 +1，跑完 -1
let busyBackground = 0;
// 后台任务占用标志：启动器热替换前查询，有任务在跑就延后换——新模块实例
// 不继承任务锁，立刻换会跟旧实例拉起的子进程（插件更新/同步/转码等）并发互删中间文件。
// 升级任务对象完成后变量不置回 null（只把 running 置 false），必须看 running
export function busyJobs() {
  return !!(pluginsUpdateJobs.size || busyBackground || (headroomUpgradeJob && headroomUpgradeJob.running) || (rtkUpgradeJob && rtkUpgradeJob.running) || transcodeJobs.size);
}
let pluginsUpdateQueue = Promise.resolve();

// 任务在途（排队 + 执行）期间计入忙碌标志，跑完清掉，热替换据此延后
function trackBusy(promise) {
  busyBackground += 1;
  promise.then(() => { busyBackground -= 1; }, () => { busyBackground -= 1; });
  return promise;
}

// 把一步市场操作排进串行队列（状态页的节流同步用）：与更新任务互斥执行
function runPluginsQueued(fn) {
  const promise = pluginsUpdateQueue.then(() => fn());
  pluginsUpdateQueue = promise.then(() => undefined, () => undefined);
  return trackBusy(promise);
}

async function runPluginsUpdateJob(body) {
  // name 指定时只处理该插件：已装且有更新则更新，未装则安装（各插件面板的单插件操作）
  const only = typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : null;
  const steps = [];
  const added = await ensureZcodePluginsMarketplace();
  if (added) steps.push({ step: 'marketplace add', ok: added.ok, output: added.output || added.error });
  if (added && !added.ok) {
    // 市场没登记上时 update 必然报 Marketplace not found，别让它冒头顶掉真实错误
    return { status: 500, payload: { ok: false, code: added.code || 'plugins-update', error: added.error || added.output || 'marketplace add 失败', steps } };
  }
  const pull = await ensureZcodePluginsCloneFresh();
  const sync = await runZcodeCli(['plugins', 'marketplace', 'update', ZCODE_PLUGINS_MARKETPLACE], 60000);
  lastMarketplaceSync = Date.now();
  steps.push({
    step: 'marketplace update',
    ok: sync.ok,
    output: [pull && !pull.ok ? `目录源刷新失败（git pull / 重克隆），本地目录源可能不是最新：${pull.output || pull.error}` : '', sync.output].filter(Boolean).join('\n'),
  });
  if (!sync.ok && sync.code !== 'cli-not-found') {
    return { status: 500, payload: { ok: false, code: 'plugins-update', error: sync.error || sync.output || 'marketplace update 失败', steps } };
  }
  const status = pluginUpdateStatus();
  if (!status) return { status: 200, payload: { ok: sync.ok, updated: 0, steps } };
  let updated = 0;
  for (const p of status.plugins) {
    if (only && p.name !== only) continue;
    if (p.installed && p.hasUpdate) {
      const r = await runZcodeCli(['plugins', 'update', `${p.name}@${ZCODE_PLUGINS_MARKETPLACE}`], 120000);
      steps.push({ step: `update ${p.name}`, ok: r.ok, output: r.output });
      if (r.ok) updated += 1;
    } else if (!p.installed && only) {
      // 安装只走单插件入口（name 指定＝各面板的安装卡）：
      // 全量“检查并更新”/启动自动更新只升级已装插件——卸载必须被尊重，
      // 未装插件一律由用户在各 tab 显式点安装
      const r = await runZcodeCli(['plugins', 'install', `${p.name}@${ZCODE_PLUGINS_MARKETPLACE}`], 120000);
      steps.push({ step: `install ${p.name}`, ok: r.ok, output: r.output });
      if (r.ok) updated += 1;
    }
  }
  return { status: 200, payload: { ok: steps.every((s) => s.ok), updated, steps, ...pluginUpdateStatus() } };
}

function enqueuePluginsUpdate(body) {
  const only = typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : null;
  // 按 only 键去重：单个槽位会被后到的不同目标顶掉，被顶掉的任务随后会重复跑
  const key = only || '';
  const inflight = pluginsUpdateJobs.get(key);
  if (inflight) return inflight;
  const prev = pluginsUpdateQueue;
  const promise = (async () => {
    await prev;
    try {
      return await runPluginsUpdateJob(body);
    } finally {
      pluginsUpdateJobs.delete(key); // 同键去重保证此刻槽里就是自己，不用再比对
    }
  })();
  pluginsUpdateQueue = promise.then(() => undefined, () => undefined);
  pluginsUpdateJobs.set(key, promise);
  return promise;
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
    // 改名目标取真实路径：直接 rename 到 agentsFile 会把符号链接本身替换成
    // 普通文件（dotfiles 管理的链接会丢）
    let real = agentsFile;
    try { real = realpathSync(agentsFile); } catch { /* 文件还不存在：直接写原路径 */ }
    const tmp = `${real}.${process.pid}.${Date.now().toString(36)}.tmp`; // 防多写者共用同一 .tmp 撕裂
    writeFileSync(tmp, body.content, 'utf8');
    renameSync(tmp, real);
  } catch (err) {
    return [500, { ok: false, code: 'agents-write', error: '写入 AGENTS.md 失败: ' + (err?.message || err) }];
  }
  return [200, { ok: true, content: body.content }];
}

// 路径不存在时的还原尝试。宿主把消息里的反斜杠路径渲染成文件 chip 时，markdown
// 会把 “\.” 当转义序列吃掉反斜杠（Administrator\.zcode 变成 Administrator.zcode），
// 其余分隔符再统一显示为 /，chip 上拿到的就是这种坏路径。把每个“段名.点开头后缀”
// 形式的段试着拆回两级（Administrator.zcode → Administrator/.zcode），哪个变体
// 真实存在就用哪个；都不存在返回 null，按原路径走 not-found。导出以便测试脚本直接驱动。
export function recoverSwallowedSeparator(rawPath) {
  const segs = String(rawPath).split(/[\\/]/);
  for (let i = 0; i < segs.length; i++) {
    const dot = segs[i].indexOf('.');
    if (dot <= 0) continue; // 段里没有点，或本身就是 .zcode 这类点开头目录
    const candidate = [...segs.slice(0, i), segs[i].slice(0, dot), segs[i].slice(dot), ...segs.slice(i + 1)].join(sep);
    try {
      if (existsSync(candidate)) return candidate;
    } catch { /* ignore */ }
  }
  return null;
}

// 在系统文件管理器中定位文件：
// Linux 走 freedesktop FileManager1.ShowItems（Dolphin/Nautilus 均支持），无会话服务时回退打开所在目录；
// macOS 用 open -R；Windows 用 explorer /select。导出以便测试脚本直接驱动。
export function revealInFileManager(rawPath) {
  return new Promise((resolveReveal) => {
    let p = typeof rawPath === 'string' ? rawPath.trim() : '';
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

// 用系统默认应用打开文件（或文件夹）：macOS 用 open；Windows 走 rundll32 的
// FileProtocolHandler（等价 ShellExecute，启动失败时退回 cmd start）；Linux 用
// xdg-open。导出以便测试脚本直接驱动。Windows 上不能用 explorer.exe <文件路径>：
// 那只会在资源管理器里定位该文件（打开所在目录并选中），不会启动默认关联应用。
export function openWithDefaultApp(rawPath) {
  return new Promise((resolveOpen) => {
    let p = typeof rawPath === 'string' ? rawPath.trim() : '';
    if (!p || !isAbsolute(p)) {
      resolveOpen([400, { ok: false, code: 'invalid-path', error: '无效的路径' }]);
      return;
    }
    if (!existsSync(p)) {
      // chip 带来的路径可能被宿主渲染弄坏（见 recoverSwallowedSeparator），先试还原
      const recovered = recoverSwallowedSeparator(p);
      if (!recovered) {
        resolveOpen([400, { ok: false, code: 'not-found', error: '文件不存在' }]);
        return;
      }
      p = recovered;
    }
    const done = (err) => resolveOpen(err ? [500, { ok: false, error: err.message }] : [200, { ok: true }]);
    if (process.platform === 'darwin') execFile('open', [p], { timeout: 5000 }, done);
    else if (process.platform === 'win32') {
      // rundll32 的参数不经 shell 解释，路径里的空格、%、& 等字符都安全；
      // start 的第一个引号参数是窗口标题，兜底时必须先给空标题再给路径。
      // 进程拉起即算成功：系统里没有该类型的关联应用时 rundll32 会弹
      // “你要如何打开这个文件”对话框并一直挂着，不能等它退出才回话
      let settled = false;
      const finish = (err) => {
        if (settled) return;
        settled = true;
        done(err);
      };
      const child = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', p], { detached: true, stdio: 'ignore', windowsHide: true });
      child.on('spawn', () => finish(null));
      child.on('error', () => {
        // cmd 兜底里路径不能直接拼进命令行（%VAR% 会被展开改写命令结构）：
        // 走环境变量传入，% 的展开是单遍、变量值不会被二次扫描
        const viaCmd = spawn('cmd.exe', ['/d /s /c start "" "%ZP_OPEN%"'], {
          env: { ...process.env, ZP_OPEN: p },
          windowsVerbatimArguments: true, detached: true, stdio: 'ignore', windowsHide: true,
        });
        viaCmd.on('spawn', () => finish(null));
        viaCmd.on('error', finish);
      });
    } else execFile('xdg-open', [p], { timeout: 5000 }, done);
  });
}

// 设置/清除项目自定义别名（纯渲染层，不动磁盘与任何 ZCode 数据）。
// alias 传空字符串/null 即清除该项目条目。
export async function setAlias(body, configFile) {
  const raw = typeof body?.path === 'string' ? body.path.trim() : '';
  // 先校验再 resolve：resolve 会把相对路径悄悄变绝对，绕过校验
  if (!raw || !isAbsolute(raw)) return [400, { ok: false, error: '无效的项目路径' }];
  const path = resolve(raw);
  const name = typeof body?.alias === 'string' ? body.alias.trim() : '';
  if (name) {
    if (name.length > 100) return [400, { ok: false, error: '别名过长（最多 100 字符）', code: 'name-too-long' }];
    if (/[\r\n\0]/.test(name)) return [400, { ok: false, error: '别名不能包含换行等控制字符', code: 'name-invalid-chars' }];
  }
  // 读改写放进跨进程锁内同步执行，防止与别的写入方互相覆盖整份配置
  return withConfigLock(configFile, () => {
    const config = loadConfig(configFile);
    if (!config.aliases || typeof config.aliases !== 'object') config.aliases = {};
    if (name) config.aliases[path] = name;
    else delete config.aliases[path];
    try {
      if (!saveConfig(configFile, config)) {
        return [500, { ok: false, code: 'config-unreadable', error: 'zcodepro.json 读取失败或已损坏，保存中止（请先修好配置文件）' }];
      }
    } catch (err) {
      return [500, { ok: false, code: 'config-save', error: '保存配置失败: ' + (err?.message || err) }];
    }
    return [200, { ok: true, path, alias: name, aliases: config.aliases }];
  });
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

  // setting.json 路径引用同步（recentProjects / lastWorkspaceSession / webRemoteControl…）；
  // 写回前比对 mtime 的重算逻辑在 remapSettingsPathsAtomic 里
  const settingsFile = join(dataRoot, 'v2', 'setting.json');
  try {
    remapSettingsPathsAtomic(settingsFile, oldPath, newPath);
  } catch (err) {
    return [500, { ok: false, error: '更新 setting.json 失败: ' + (err?.message || err) }];
  }

  // 任务索引同步；失败则回滚 setting.json，保持两边一致
  if (syncIndex) {
    try {
      await remapTaskIndexPaths(dataRoot, oldPath, newPath);
    } catch (err) {
      try {
        remapSettingsPathsAtomic(settingsFile, newPath, oldPath);
      } catch { /* 回滚失败：setting.json.zcodepro-backup 仍有兜底 */ }
      return [500, {
        ok: false,
        code: err.code || 'index-remap-failed',
        error: '更新任务索引失败（已回滚配置更新）: ' + (err?.message || err),
      }];
    }
  }

  // 别名随迁（仅渲染层数据，失败不影响结果）；读改写放进跨进程锁内同步执行，
  // 防止与别的写入方互相覆盖整份配置
  try {
    await withConfigLock(join(dataRoot, 'zcodepro.json'), () => {
      const config = loadConfig(join(dataRoot, 'zcodepro.json'));
      const aliases = config.aliases || {};
      if (Object.prototype.hasOwnProperty.call(aliases, oldPath)) {
        const v = aliases[oldPath];
        delete aliases[oldPath];
        aliases[newPath] = v;
        saveConfig(join(dataRoot, 'zcodepro.json'), config);
      }
    });
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
