// 主题（设置弹窗 外观 → 主题）：皮肤 + 壁纸。
// 皮肤：覆盖 ZCode 明/暗两套 CSS 变量（theme-zai-light / theme-zai-dark 根 class），
//   每套皮肤含明、暗两份色值，跟随 ZCode 当前明暗自动选用，不改用户的明暗设置。
// 壁纸：图片/视频/网页三类，全窗铺在界面后方（fixed slide 层 + 同色遮罩，遮罩
//   浓度 = 1 - 可见度），换壁纸可直接切换或淡入淡出，可定时轮换；素材存 helper 数据
//   目录（/bg/file/<name> 引用，URL 带 ?t= token）。侧栏/会话流/输入框等表面 token 改写
//   为 color-mix 半透明让画面透出；弹窗/菜单等浮层 token 不动，保可读。分区背景
//   仅静态图。表面半透明在 JS 里做而不是纯 CSS：需要先读皮肤应用后的计算值再
//   混透明，明暗切换/换肤/调可见度都要重算（重算前先撤掉上一轮注入，避免
//   color-mix 叠 color-mix 越混越透——PiDeck 踩过同一坑）。
import { getConfig, rpc, liveBoot, HELPER_URL } from '../core.js';

// 媒体 URL 的鉴权参数：媒体元素（CSS url()/<video>）带不了请求头，helper 的
// /bg 媒体路由认 URL 上的 ?t= token（外部页面猜不到，读不走图库媒体）
const mediaAuth = () => 't=' + encodeURIComponent(liveBoot().token || '');

// —— 皮肤定义：色阶制（取自 Radix Colors，MIT）——
// 每套皮肤 = 一个色相的 12 级色阶 × 明/暗两套 + 透明度叠色。级数语义按 Radix
// 约定固定：1-2 界面底色、3-4 元素底与悬停、5-6 边框与低强调底、7-8 中强调底、
// 9 品牌色、10 焦点描边、11-12 可读文字。ZCode 的表面层级（背景 < 侧栏 < 卡片/
// 输入，悬停加深）与 gray 色阶逐级对得上（gray2≈#f8f8f8 背景、gray3≈#f0f0f0
// 侧栏、gray4≈#ececee winAlt、gray1≈#fff 卡片；暗侧同理），按级数映射即可，
// 不再逐 token 手写色值——手写版文字/图标/边框的色调各自为政，观感发灰。
// —— 皮肤定义：知名编辑器主题（VS Code / IntelliJ 装机前列）× 12 级色阶 ——
// 每套 = 官方调色板锚点（背景/卡片/文字/注释色/强调色）经 OKLab 插值生成的
// 12 级明/暗色阶 + 透明度叠色；级数语义沿用 Radix 约定（1-2 界面底、3-4 元素
// 底与悬停、5-6 边框、8-10 强调、11-12 可读文字），ZCode 表面层级按级映射。
// 锚点取自各主题公开配色：Dracula #282a36/#bd93f9、Nord #2e3440/#88c0d0、
// Tokyo Night #1a1b26/#7aa2f7、Catppuccin Mocha/Latte、Gruvbox #282828/#d79921、
// One Dark #282c34/#61afef、Solarized #002b36/#2aa198、Rosé Pine #191724/#c4a7e7、
// Everforest #2d353b/#a7c080、Night Owl #011627/#82aaff、Kanagawa #1f1f28/#7e9cd8。
// 暗色为主设计的主题（如 Dracula）按同色相合成亮色变体。
const SC = (light, dark, lightA, darkA) => ({ light, dark, lightA, darkA });
const SCALES = {
  dracula: SC(['#fefeff', '#f5f4f9', '#f1f0f6', '#edebf4', '#dedee4', '#c4c3cb', '#aaa9b3', '#885cdb', '#9a6ff0', '#af85ff', '#5f5c77', '#2b2a3a'],
       ['#21222c', '#282a36', '#2d303d', '#343746', '#484b59', '#656873', '#80828a', '#aa80e5', '#bd93f9', '#d3a9ff', '#7b89b3', '#f8f8f2'],
       ['#2b2a3a03', '#2b2a3a06', '#2b2a3a0f', '#2b2a3a17', '#2b2a3a1f', '#2b2a3a26', '#2b2a3a31', '#2b2a3a44', '#2b2a3a72', '#2b2a3a7c', '#2b2a3a9b', '#2b2a3adf'],
       ['#f8f8f203', '#f8f8f206', '#f8f8f20f', '#f8f8f217', '#f8f8f21f', '#f8f8f226', '#f8f8f231', '#f8f8f244', '#f8f8f272', '#f8f8f27c', '#f8f8f29b', '#f8f8f2df']),
  nord: SC(['#fbfcfe', '#f2f5f9', '#eef2f7', '#eaeff5', '#dce0e5', '#c3c7cd', '#aaaeb6', '#4d6f99', '#5e81ac', '#7296c2', '#576377', '#2e3440'],
       ['#272c36', '#2e3440', '#343a48', '#3b4252', '#4e5564', '#686e7c', '#808692', '#75adbd', '#88c0d0', '#9ed7e7', '#8e9ab0', '#eceff4'],
       ['#2e344003', '#2e344006', '#2e34400f', '#2e344017', '#2e34401f', '#2e344026', '#2e344031', '#2e344044', '#2e344072', '#2e34407c', '#2e34409b', '#2e3440df'],
       ['#eceff403', '#eceff406', '#eceff40f', '#eceff417', '#eceff41f', '#eceff426', '#eceff431', '#eceff444', '#eceff472', '#eceff47c', '#eceff49b', '#eceff4df']),
  tokyonight: SC(['#fafbfe', '#eef0f6', '#e9ebf2', '#e3e6ef', '#d9dce5', '#c0c5d1', '#a8aebd', '#2d488e', '#3d59a1', '#506eb8', '#5a6684', '#2f3a55'],
       ['#13141d', '#1a1b26', '#1e212f', '#24283b', '#34394f', '#4b516a', '#606784', '#688fe3', '#7aa2f7', '#8fb8ff', '#8893c3', '#c0caf5'],
       ['#2f3a5503', '#2f3a5506', '#2f3a550f', '#2f3a5517', '#2f3a551f', '#2f3a5526', '#2f3a5531', '#2f3a5544', '#2f3a5572', '#2f3a557c', '#2f3a559b', '#2f3a55df'],
       ['#c0caf503', '#c0caf506', '#c0caf50f', '#c0caf517', '#c0caf51f', '#c0caf526', '#c0caf531', '#c0caf544', '#c0caf572', '#c0caf57c', '#c0caf59b', '#c0caf5df']),
  catppuccin: SC(['#fbfcfe', '#eff1f5', '#eaecf1', '#e4e7ed', '#dde0e6', '#c8cbd5', '#b4b7c3', '#6174e8', '#7287fd', '#869dff', '#73768c', '#4c4f69'],
       ['#181825', '#1e1e2e', '#262738', '#313244', '#424357', '#595c71', '#6e7289', '#a1abea', '#b4befe', '#cad5ff', '#979cb5', '#cdd6f4'],
       ['#4c4f6903', '#4c4f6906', '#4c4f690f', '#4c4f6917', '#4c4f691f', '#4c4f6926', '#4c4f6931', '#4c4f6944', '#4c4f6972', '#4c4f697c', '#4c4f699b', '#4c4f69df'],
       ['#cdd6f403', '#cdd6f406', '#cdd6f40f', '#cdd6f417', '#cdd6f41f', '#cdd6f426', '#cdd6f431', '#cdd6f444', '#cdd6f472', '#cdd6f47c', '#cdd6f49b', '#cdd6f4df']),
  gruvbox: SC(['#fefbf0', '#f8f2dd', '#f5eed4', '#f3eacc', '#e3decb', '#cbc5b5', '#b3aea0', '#8e6b00', '#a07d0a', '#b6922e', '#706558', '#3c3836'],
       ['#1d2021', '#282828', '#312f2e', '#3c3836', '#4f4944', '#696256', '#807867', '#c38600', '#d79921', '#eeaf40', '#a1927f', '#ebdbb2'],
       ['#3c383603', '#3c383606', '#3c38360f', '#3c383617', '#3c38361f', '#3c383626', '#3c383631', '#3c383644', '#3c383672', '#3c38367c', '#3c38369b', '#3c3836df'],
       ['#ebdbb203', '#ebdbb206', '#ebdbb20f', '#ebdbb217', '#ebdbb21f', '#ebdbb226', '#ebdbb231', '#ebdbb244', '#ebdbb272', '#ebdbb27c', '#ebdbb29b', '#ebdbb2df']),
  onedark: SC(['#fcfdff', '#f4f6fa', '#f0f3f8', '#edf0f6', '#dfe1e6', '#c6c8ce', '#adb0b7', '#3870c4', '#4a82d8', '#5f98f0', '#606774', '#333842'],
       ['#21252b', '#282c34', '#2d313a', '#333842', '#404550', '#525863', '#626874', '#4e9cdb', '#61afef', '#77c6ff', '#6a717e', '#abb2bf'],
       ['#33384203', '#33384206', '#3338420f', '#33384217', '#3338421f', '#33384226', '#33384231', '#33384244', '#33384272', '#3338427c', '#3338429b', '#333842df'],
       ['#abb2bf03', '#abb2bf06', '#abb2bf0f', '#abb2bf17', '#abb2bf1f', '#abb2bf26', '#abb2bf31', '#abb2bf44', '#abb2bf72', '#abb2bf7c', '#abb2bf9b', '#abb2bfdf']),
  solarized: SC(['#fffbf0', '#fdf6e3', '#fcf4dd', '#fbf1d7', '#ebe8d8', '#d7d7ca', '#c2c6bc', '#0078be', '#268bd2', '#41a1ea', '#889899', '#586e75'],
       ['#00212b', '#002b36', '#03303b', '#073642', '#1b424d', '#31525b', '#446168', '#008e86', '#2aa198', '#47b7ae', '#62777d', '#93a1a1'],
       ['#586e7503', '#586e7506', '#586e750f', '#586e7517', '#586e751f', '#586e7526', '#586e7531', '#586e7544', '#586e7572', '#586e757c', '#586e759b', '#586e75df'],
       ['#93a1a103', '#93a1a106', '#93a1a10f', '#93a1a117', '#93a1a11f', '#93a1a126', '#93a1a131', '#93a1a144', '#93a1a172', '#93a1a17c', '#93a1a19b', '#93a1a1df']),
  rosepine: SC(['#fffaf3', '#faf4ed', '#f8f1ea', '#f6efe8', '#e8e3e1', '#d3ced3', '#bfbac5', '#7e6896', '#907aa9', '#a58fbf', '#837d93', '#575279'],
       ['#141220', '#191724', '#1c1a28', '#1f1d2e', '#323143', '#4e4d60', '#69677b', '#b194d3', '#c4a7e7', '#dbbdff', '#817e99', '#e0def4'],
       ['#57527903', '#57527906', '#5752790f', '#57527917', '#5752791f', '#57527926', '#57527931', '#57527944', '#57527972', '#5752797c', '#5752799b', '#575279df'],
       ['#e0def403', '#e0def406', '#e0def40f', '#e0def417', '#e0def41f', '#e0def426', '#e0def431', '#e0def444', '#e0def472', '#e0def47c', '#e0def49b', '#e0def4df']),
  everforest: SC(['#fefdf5', '#faf7ec', '#f8f4e8', '#f6f2e4', '#e7e6dd', '#d2d2cb', '#bcbeb9', '#588c47', '#6a9e59', '#7fb46e', '#76827b', '#4f585e'],
       ['#272e33', '#2d353b', '#30393f', '#343f44', '#454e50', '#5d625f', '#73756d', '#95ad6e', '#a7c080', '#bdd796', '#a7aea2', '#d3c6aa'],
       ['#4f585e03', '#4f585e06', '#4f585e0f', '#4f585e17', '#4f585e1f', '#4f585e26', '#4f585e31', '#4f585e44', '#4f585e72', '#4f585e7c', '#4f585e9b', '#4f585edf'],
       ['#d3c6aa03', '#d3c6aa06', '#d3c6aa0f', '#d3c6aa17', '#d3c6aa1f', '#d3c6aa26', '#d3c6aa31', '#d3c6aa44', '#d3c6aa72', '#d3c6aa7c', '#d3c6aa9b', '#d3c6aadf']),
  nightowl: SC(['#fdfdfe', '#f6f7f9', '#f3f4f7', '#f0f2f5', '#e2e3e7', '#cbcbd2', '#b3b4bd', '#2253c2', '#3366d6', '#477cee', '#64667c', '#403f53'],
       ['#010e1c', '#011627', '#072033', '#122d42', '#284054', '#445a6e', '#5f7285', '#7097ea', '#82aaff', '#97c1ff', '#778ea7', '#d6deeb'],
       ['#403f5303', '#403f5306', '#403f530f', '#403f5317', '#403f531f', '#403f5326', '#403f5331', '#403f5344', '#403f5372', '#403f537c', '#403f539b', '#403f53df'],
       ['#d6deeb03', '#d6deeb06', '#d6deeb0f', '#d6deeb17', '#d6deeb1f', '#d6deeb26', '#d6deeb31', '#d6deeb44', '#d6deeb72', '#d6deeb7c', '#d6deeb9b', '#d6deebdf']),
  kanagawa: SC(['#fcf9f0', '#f4f1e8', '#f0ede4', '#edeae1', '#e1ded5', '#cac8c0', '#b4b2aa', '#2d4d95', '#3d5fa8', '#5074bf', '#72726a', '#43443e'],
       ['#16161d', '#1f1f28', '#24242f', '#2a2a37', '#3c3c46', '#57565a', '#6f6d6c', '#6c8ac4', '#7e9cd8', '#93b2ef', '#848277', '#dcd7ba'],
       ['#43443e03', '#43443e06', '#43443e0f', '#43443e17', '#43443e1f', '#43443e26', '#43443e31', '#43443e44', '#43443e72', '#43443e7c', '#43443e9b', '#43443edf'],
       ['#dcd7ba03', '#dcd7ba06', '#dcd7ba0f', '#dcd7ba17', '#dcd7ba1f', '#dcd7ba26', '#dcd7ba31', '#dcd7ba44', '#dcd7ba72', '#dcd7ba7c', '#dcd7ba9b', '#dcd7badf']),
};

export const THEME_SKINS = [
  { id: 'default', zh: '默认', en: 'Default',
    preview: ['#f8f8f8', '#ffffff', '#ececee', '#dfdfdf', '#8b8b8b', '#18181b', '#9a9a9a', '#18181b'] },
  { id: 'dracula', hue: 'dracula', zh: '德古拉', en: 'Dracula' },
  { id: 'nord', hue: 'nord', zh: '极夜', en: 'Nord' },
  { id: 'tokyonight', hue: 'tokyonight', zh: '东京夜', en: 'Tokyo Night' },
  { id: 'catppuccin', hue: 'catppuccin', zh: '奶咖', en: 'Catppuccin' },
  { id: 'gruvbox', hue: 'gruvbox', zh: '暖岩', en: 'Gruvbox' },
  { id: 'onedark', hue: 'onedark', zh: 'One Dark', en: 'One Dark' },
  { id: 'solarized', hue: 'solarized', zh: '日晒', en: 'Solarized' },
  { id: 'rosepine', hue: 'rosepine', zh: '玫瑰松', en: 'Rosé Pine' },
  { id: 'everforest', hue: 'everforest', zh: '常绿', en: 'Everforest' },
  { id: 'nightowl', hue: 'nightowl', zh: '夜枭', en: 'Night Owl' },
  { id: 'kanagawa', hue: 'kanagawa', zh: '神奈川', en: 'Kanagawa' },
];
// 预览色条（8 块：底色/卡片/加深面/边框级/强调/强调亮/次级文字/正文），从明色色阶取
for (const s of THEME_SKINS) {
  if (!s.hue) continue;
  const L = SCALES[s.hue].light;
  s.preview = [L[1], L[0], L[3], L[5], L[8], L[9], L[10], L[11]];
}
export const THEME_SKIN_IDS = THEME_SKINS.map((s) => s.id);

// '#rrggbb' + 两位十六进制 α（与 ZCode 原版边框/叠色写法一致）
const hexA = (hex, alphaHex) => `#${hex.slice(1)}${alphaHex}`;

// 由色阶生成整套 token 覆盖：表面按级映射，文字族取级 11/12，边框与悬停叠色
// 由文字色加 α 派生，品牌族取级 9。isDark 只影响取哪套色阶与个别层级偏移
function skinVars(s, isDark) {
  if (!s) return null;
  const fg = s[11];
  return {
    '--color-background': s[1],
    '--color-background-win-alt': s[3],
    '--color-background-alt': `color-mix(in oklab, ${s[1]} ${isDark ? 60 : 70}%, transparent)`,
    '--color-sidebar': s[isDark ? 1 : 2],
    '--color-header': s[isDark ? 2 : 0],
    '--color-panel': s[isDark ? 2 : 0],
    '--color-card': s[isDark ? 3 : 0],
    '--color-card-selected': s[isDark ? 4 : 1],
    '--color-input': s[isDark ? 3 : 0],
    '--color-input-focused': s[isDark ? 3 : 0],
    '--color-menu': s[isDark ? 3 : 0],
    '--color-menu-hover': s[isDark ? 4 : 2],
    '--color-popover': s[isDark ? 3 : 0],
    '--color-popover-header': s[isDark ? 2 : 1],
    '--color-highspeed-composer-surface': s[isDark ? 0 : 1],
    '--color-tab-active': s[isDark ? 1 : 0],
    '--color-foreground': fg,
    '--color-foreground-subtle': s[10],
    '--color-foreground-subtlest': `color-mix(in oklab, ${s[10]} 60%, transparent)`,
    '--color-foreground-inverse': isDark ? '#101010' : '#ffffff',
    '--color-popover-foreground': fg,
    '--color-tooltip-foreground': fg,
    '--color-brand': fg,
    '--color-primary': fg,
    '--color-primary-foreground': isDark ? '#101010' : '#ffffff',
    '--color-accent': s[2],
    '--color-highspeed-accent': s[8],
    '--highspeed-sidebar-model-icon': s[8],
    '--highspeed-sidebar-model-gradient': `linear-gradient(90deg,${s[7]} 0%,${s[8]} 50%,${s[9]} 100%)`,
    '--color-hover': hexA(fg, isDark ? '12' : '0f'),
    '--color-surface-hover': hexA(fg, isDark ? '12' : '0f'),
    '--color-border': hexA(fg, '1a'),
    '--color-border-hover': hexA(fg, '26'),
    '--color-card-border': hexA(fg, '1a'),
    '--color-input-border': hexA(fg, '1a'),
    '--color-input-border-hover': hexA(fg, '26'),
    '--color-input-border-focused': hexA(fg, '26'),
    '--color-popover-border': hexA(fg, '1a'),
    '--color-tab-border': hexA(fg, '1a'),
    '--color-highspeed-composer-border-pre-animation': hexA(fg, '1a'),
  };
}

// —— 自定义主题（skin === 'custom'）：五个锚点色 × 明暗（背景/卡片/正文/次级
// 文字/强调），未设置的字段回退默认。色阶在页内现算，派生全部用
// color-mix(in oklab) 表达式（插值交给 CSS 引擎），级数语义与预设完全一致
export const CUSTOM_DEFAULTS = {
  light: { bg: '#f7f8fa', card: '#ffffff', fg: '#24262b', muted: '#6b7280', accent: '#6366f1' },
  dark: { bg: '#18181d', card: '#232329', fg: '#e8e8ec', muted: '#9494a0', accent: '#8b8ff5' },
};
const mixOf = (x, t, y) => `color-mix(in oklab, ${x} ${Math.round((1 - t) * 100)}%, ${y} ${Math.round(t * 100)}%)`;
function anchorsScale(a, isDark) {
  const { bg, card, fg, muted, accent } = a;
  return isDark ? [
    mixOf(bg, 0.12, '#000'), // 0 最深（输入区）
    bg,                      // 1 背景
    mixOf(bg, 0.45, card),   // 2 顶栏/面板
    card,                    // 3 卡片/输入
    mixOf(card, 0.12, fg),   // 4 选中/悬停
    mixOf(card, 0.28, fg),   // 5
    mixOf(card, 0.42, fg),   // 6
    mixOf(accent, 0.14, '#000'), // 7
    accent,                  // 8 品牌级
    mixOf(accent, 0.18, '#fff'), // 9
    mixOf(muted, 0.18, fg),  // 10 次级文字
    fg,                      // 11 主文字
  ] : [
    card,                    // 0 最浅（顶栏/卡片）
    bg,                      // 1 背景
    mixOf(bg, 0.05, fg),     // 2 侧栏
    mixOf(bg, 0.11, fg),     // 3 winAlt
    mixOf(bg, 0.17, fg),     // 4 悬停
    mixOf(bg, 0.26, fg),     // 5
    mixOf(bg, 0.36, fg),     // 6
    mixOf(accent, 0.14, '#000'),
    accent,
    mixOf(accent, 0.18, '#fff'),
    mixOf(muted, 0.18, fg),
    fg,
  ];
}

// —— 应用逻辑 ——

let skinStyleEl = null;   // 皮肤 token 覆盖
let bgStyleEl = null;     // html 底色（slide 层铺在它上面）
let injectedKeys = new Set(); // 半透明化写进 root.style 的变量（重算前先撤）
let classObserver = null; // 明暗切换（root class 变化）→ 重算遮罩色与透明度
let currentTheme = { skin: 'default', custom: null, bg: { mode: 'none', maskOpacity: 0.82, blurPx: 0, panelOpacity: 0.3 } };
let lastModeSig = ''; // 观察器只对明暗模式变化重算：applySkin/applyBackground
let lastThemeSig = ''; // 整份主题配置的序列化：外部改配置文件的轮询比对用
let themePollTimer = null; // 配置轮询句柄（重复启动先清旧的）
// 自己也会改 root class（zcodepro-skin-*/zcodepro-bg-on），不带这条过滤会自触发循环
let bgTimer = null;   // 轮换 / 网址刷新定时器（重应用前先清）
let bgTimerMs = 0;    // 当前计时间隔（间隔没变时保留倒计时，调参数不清零）
let wpShowTicket = 0; // 全局递增的上屏票号：迟到的预载回调凭票对号，过票作废
let wpSlide = null;   // 当前壁纸 slide（转场期间旧 slide 还挂在层里渐隐）
let wpMask = null;    // 当前遮罩层（明暗切换只改它的颜色，不动 slide）
let wpMedia = null;   // 当前 slide 里的视频/iframe，暂停判定作用在它身上
let wpTimers = new Set(); // 轮询转码完成等的定时器（重应用前先清）
let lastWpSig = '';   // 壁纸来源签名：来源没变就原地更新参数，不重建 slide
let batteryCharging = null; // 电池状态三态：null 未知（不暂停）/ true 充电中 / false 用电池
let regionStyleEl = null; // 分区背景（左栏/中栏/右栏）规则
let regionFolderIdx = { left: -1, center: -1, right: -1 };
// 三大区域容器：左栏（侧栏宽度变量容器）、中栏（会话列）、右栏（停靠面板，
// conversation-column 的 browser 兄弟，面板关闭时零宽不误伤；元素重挂载后
// 规则自动重新命中，CSS 方案比持有元素引用稳）
const REGION_SELECTORS = {
  left: 'div[class*="workspace-sidebar-panel-width"]',
  center: '[data-testid="conversation-column"]',
  right: '[data-testid="conversation-column"] ~ [data-testid="browser"]',
};
let rotateIdx = -1;   // 文件夹顺序轮换的当前索引（-1 → 首次取第 0 张）
let wpTickFn = null;  // 当前来源的轮换/刷新 tick（重新装订计时用）
let wpItem = null;    // 当前 slide 的来源 {name, from}（帧率上限补转码用）
let urlTick = 0;      // 网址刷新的缓存戳（只在定时刷新时递增，调参数不换图）
let applySeq = 0;     // 异步重入令牌：配置快速变化时只让最后一次生效

// 铺图时半透明化的表面 token（浮层 menu/popover 不在其中，保不透明可读）
const SURFACE_TOKENS = [
  '--color-background', '--color-background-win-alt', '--color-sidebar', '--color-header',
  '--color-panel', '--color-card', '--color-card-selected', '--color-input',
  '--color-input-focused', '--color-highspeed-composer-surface',
];
// 文件名比较归一：Windows 大小写不敏感、macOS 返回 NFD 分解字符
const sameName = (a, b) => String(a).normalize('NFC').toLowerCase() === String(b).normalize('NFC').toLowerCase();

const isDarkMode = () => document.documentElement.classList.contains('theme-zai-dark')
  || document.documentElement.classList.contains('dark');

// backdrop-filter 只有 GPU 合成才渲染；webgl 可用性当代理信号，结果按环境缓存
let blurUsableMemo = null;
function backdropBlurUsable() {
  if (blurUsableMemo === null) {
    try { blurUsableMemo = !!document.createElement('canvas').getContext('webgl'); } catch { blurUsableMemo = false; }
  }
  return blurUsableMemo;
}

// 读表面 token 的解析色（rgb()/rgba()）：自定义皮肤的多数表面 token 是
// color-mix() 字符串，直接读自定义属性拿到的是未解析的 token 流（半透明化与
// 遮罩取色都会整批跳过）——挂到隐藏元素的 color 上让引擎解析成具体颜色
let probeEl = null;
function resolvedColor(token) {
  try {
    if (!probeEl || !probeEl.isConnected) {
      probeEl = document.createElement('div');
      probeEl.style.display = 'none';
      (document.body || document.documentElement).append(probeEl);
    }
    probeEl.style.color = '';
    probeEl.style.color = `var(${token})`;
    // token 未定义时 var() 让声明"计算值无效"、属性落成继承的文字色——先按
    // 自定义属性取值判空，认不出就返回空串，别把文字色当表面色注入
    if (!getComputedStyle(probeEl).getPropertyValue(token).trim()) return '';
    const v = getComputedStyle(probeEl).color;
    // 计算值的序列化随主题而异（rgb()/rgba()/color(srgb ...)/oklch(...) 都有），
    // 按「是颜色函数」认而不是认某几种：冷启动应用默认色是 oklch()，认不出就
    // 整批跳过、表面半透明化悄悄失效、壁纸被不透明面板盖住
    return /^[a-z-]+\(/.test(v) ? v : '';
  } catch {
    return '';
  }
}

// 颜色字符串取 r,g,b 三元组（丢掉 α）：rgb()/rgba() 取前三个数，color(srgb ...)
// 取前三个 0-1 小数换算成 0-255；其余序列化（oklch()/oklab()/lab() 等）交给
// canvas 的 fillStyle 归一后再解析；都认不出给 fallback
function rgbTriple(v, fallback) {
  const pick = (str) => {
    const m = str.match(/^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
    if (m) return [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3])].join(',');
    const s = str.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
    if (s) return [Math.round(+s[1] * 255), Math.round(+s[2] * 255), Math.round(+s[3] * 255)].join(',');
    const h = str.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
    if (h) return [parseInt(h[1], 16), parseInt(h[2], 16), parseInt(h[3], 16)].join(',');
    return '';
  };
  const direct = pick(v);
  if (direct) return direct;
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.fillStyle = '#010203'; // 认不出时 fillStyle 不变，拿哨兵色兜住误认
    ctx.fillStyle = v;
    const norm = String(ctx.fillStyle);
    if (norm !== '#010203') {
      const p = pick(norm);
      if (p) return p;
    }
  } catch { /* 无 canvas 环境：走 fallback */ }
  return fallback;
}

function ensureEl(id) {
  let el = document.getElementById(id);
  if (!el || !el.isConnected) {
    el = document.createElement('style');
    el.id = id;
    (document.head || document.documentElement).append(el);
  }
  return el;
}

function applySkin(skinId, custom) {
  skinStyleEl = ensureEl('__zcodepro_skin__');
  const root = document.documentElement;
  // custom 不在 THEME_SKIN_IDS（预设清单）里，清理时要一并带上
  for (const id of [...THEME_SKIN_IDS, 'custom']) root.classList.remove('zcodepro-skin-' + id);
  const preset = THEME_SKINS.find((s) => s.id === skinId && s.hue);
  const isCustom = skinId === 'custom';
  if (!preset && !isCustom) { skinStyleEl.textContent = ''; return; }
  const cls = preset ? preset.id : 'custom';
  root.classList.add('zcodepro-skin-' + cls);
  const scaleOf = (isDark) => {
    if (isCustom) {
      const dflt = CUSTOM_DEFAULTS[isDark ? 'dark' : 'light'];
      const src = (custom && custom[isDark ? 'dark' : 'light']) || {};
      const a = {};
      for (const k of ['bg', 'card', 'fg', 'muted', 'accent']) {
        a[k] = /^#[0-9a-f]{6}$/i.test(src[k]) ? src[k] : dflt[k];
      }
      return anchorsScale(a, isDark);
    }
    const sc = SCALES[preset.hue];
    return isDark ? sc.dark : sc.light;
  };
  // 选择器比应用原规则（.theme-zai-light = 0,1,0）多一个 class 与元素名，级联必胜；
  // 暗色同时覆盖 .dark 与 .theme-zai-dark 两种根形态（与应用样式表同款写法）
  const rules = (isDark) => {
    const vars = skinVars(scaleOf(isDark), isDark);
    return vars ? Object.entries(vars).map(([k, v]) => `${k}:${v};`).join('') : '';
  };
  // 滚动条 thumb 由文字级色派生（应用原规则只定几何不给色）：颜色随皮肤换，几何归应用
  const sb = (isDark) => {
    const fg = scaleOf(isDark)[11];
    return `::-webkit-scrollbar-thumb{background-color:${hexA(fg, '59')} !important;}::-webkit-scrollbar-thumb:hover{background-color:${hexA(fg, '8c')} !important;}`;
  };
  skinStyleEl.textContent =
    `html.theme-zai-light.zcodepro-skin-${cls}{${rules(false)}}` +
    `html.theme-zai-dark.zcodepro-skin-${cls},html.dark.zcodepro-skin-${cls}{${rules(true)}}` +
    `html.theme-zai-light.zcodepro-skin-${cls}{${sb(false)}}` +
    `html.theme-zai-dark.zcodepro-skin-${cls},html.dark.zcodepro-skin-${cls}{${sb(true)}}`;
}

function clearBgOverrides() {
  const root = document.documentElement;
  for (const k of injectedKeys) root.style.removeProperty(k);
  injectedKeys = new Set();
}

// —— 全窗壁纸层的宿主元素与暂停判定 ——
function wpLayerEl() {
  let layer = document.getElementById('__zcodepro_wallpaper__');
  if (!layer || !layer.isConnected) {
    layer = document.createElement('div');
    layer.id = '__zcodepro_wallpaper__';
    layer.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden';
    (document.body || document.documentElement).append(layer);
  }
  return layer;
}
function clearWallpaper() {
  const layer = document.getElementById('__zcodepro_wallpaper__');
  if (wpMedia && wpMedia.tagName === 'VIDEO') wpMedia.pause(); // 移出文档音频还会响
  if (layer) layer.remove();
  wpSlide = null;
  wpMask = null;
  wpMedia = null;
  wpShowTicket += 1; // 作废在飞的预载回调：否则“关闭后旧回调复活壁纸”
}
function clearWpTimers() {
  if (bgTimer) { clearInterval(bgTimer); bgTimer = null; }
  for (const t of wpTimers) clearInterval(t);
  wpTimers.clear();
  // webview 透明扫描跟着停掉（不需要时一直空转）：停之前把已插的透明一次性
  // 撤掉，恢复卡片自己的背景；之后重开壁纸时 markBgOn 会重新启动扫描
  if (webviewScanTimer) { clearInterval(webviewScanTimer); webviewScanTimer = null; }
  for (const rec of [...wvStyled]) {
    if (rec.handler) rec.el.removeEventListener('dom-ready', rec.handler);
    if (rec.key) { try { void rec.el.removeCSS(rec.key).catch(() => { /* ignore */ }); } catch { /* ignore */ } }
    wvStyled.splice(wvStyled.indexOf(rec), 1);
  }
}
// 插件卡片（沙箱 webview）页面自带的背景是实色，会把壁纸整块盖住；
// 用 webview 自带的 insertCSS 把 guest 页面的 html/body 背景改成“主题色遮罩 +
// 卡片遮罩透明度”（0 = 全透明 = 壁纸原样透出）。页面每次加载后重插（CSS 随文档
// 生命周期失效），遮罩滑杆（bg.cardVeil）变化时撤旧 key 重插。只做加法：
// 页面其余样式不动
let webviewScanTimer = null;
const wvStyled = []; // [{ el, key, css, handler }]：壁纸关闭时撤掉遮罩，恢复卡片自己的背景
function cardVeilCss() {
  const raw = Number((currentTheme.bg || {}).cardVeil);
  const veil = Number.isFinite(raw) ? raw : 0.2;
  // 与壁纸遮罩同源取色：面板半透明化后 --color-background 是 color-mix，直接读
  // 自定义属性拿到的 token 认不出；resolvedColor 取计算值，rgbTriple 归一化成 rgb
  const rgb = rgbTriple(resolvedColor('--color-background'), isDarkMode() ? '13,13,13' : '248,248,248');
  return `html,body{background:rgba(${rgb},${veil}) !important}`;
}
function applyWebviewTransparency() {
  const hook = (w, css) => {
    // on 每次现读、css 每轮扫描现算：扫描定时器只启动一次、长期存活，闭包固化
    // 初值会让后建的 webview 拿到旧遮罩，还会每 2 秒把滑杆改后的新值覆盖回旧值
    const on = document.documentElement.classList.contains('zcodepro-bg-on');
    const rec = wvStyled.find((r) => r.el === w);
    if (on && !rec) {
      const entry = { el: w, key: null, css, handler: null };
      entry.handler = () => {
        if (!wvStyled.includes(entry)) return; // 已随关壁纸摘牌：别再插遮罩
        const myCss = entry.css; // 插入期间遮罩可能又变：结果回来只认自己这份
        try {
          void w.insertCSS(myCss).then((k) => {
            // 已摘牌或值已过期：插进去的遮罩没人撤，立刻自己撤掉
            if (wvStyled.includes(entry) && entry.css === myCss) entry.key = k;
            else { try { void w.removeCSS(k).catch(() => { /* ignore */ }); } catch { /* ignore */ } }
          }).catch(() => { /* 未就绪：dom-ready 再试 */ });
        } catch { /* 同步抛出：同上 */ }
      };
      w.addEventListener('dom-ready', entry.handler);
      wvStyled.push(entry);
      entry.handler();
    } else if (on && rec && rec.css !== css) {
      // 遮罩滑杆变了：撤旧 key 重插新值（insertCSS 的 key 对应一份 CSS 文本）
      rec.css = css;
      const oldKey = rec.key;
      rec.key = null;
      if (oldKey) { try { void w.removeCSS(oldKey).catch(() => { /* ignore */ }); } catch { /* ignore */ } }
      try {
        void w.insertCSS(css).then((k) => {
          if (wvStyled.includes(rec) && rec.css === css) rec.key = k;
          else { try { void w.removeCSS(k).catch(() => { /* ignore */ }); } catch { /* ignore */ } }
        }).catch(() => {
          // 没插进去（guest 未就绪等）：清掉记录值让下次扫描重试，否则
          // rec.css 已是新值、再也进不了本分支，遮罩就一直缺着
          if (wvStyled.includes(rec) && rec.css === css) rec.css = '';
        });
      } catch { /* 同步抛出：同上 */ }
    } else if (!on && rec) {
      if (rec.handler) w.removeEventListener('dom-ready', rec.handler); // 不摘会随开关次数累积
      if (rec.key) { try { void w.removeCSS(rec.key).catch(() => { /* ignore */ }); } catch { /* ignore */ } }
      wvStyled.splice(wvStyled.indexOf(rec), 1);
    }
  };
  // 每轮扫描算一次 CSS 给所有 webview 共用：卡片多时不必逐个读计算样式
  const scan = () => {
    const css = cardVeilCss();
    document.querySelectorAll('webview').forEach((w) => hook(w, css));
  };
  scan();
  if (!webviewScanTimer) webviewScanTimer = setInterval(scan, 2000);
}

// 暂停判定：三个条件任一命中就停（最小化默认开、失焦与电池供电默认关）。
// 视频直接 pause()；网页 iframe 没有暂停一说，置 about:blank 别让页面继续跑
function applyMediaState() {
  const bg = currentTheme.bg || {};
  const paused = (bg.pauseOnHidden !== false && document.hidden)
    || (bg.pauseOnBlur === true && !document.hasFocus())
    || (bg.pauseOnBattery === true && batteryCharging === false); // 未知电池状态不暂停，防台式机永久冻结
  const el = wpMedia;
  if (!el || !el.isConnected) return;
  if (el.tagName === 'VIDEO') {
    if (paused) { el.pause(); return; }
    el.muted = el.volume === 0; // 恢复前同步静音态：隐藏期间改过音量也要生效
    el.play().catch(() => {
      // 非静音起播被自动播放策略拦下：退回静音再试一次，别永久冻在静帧
      el.muted = true;
      el.play().catch(() => { /* 保持静帧 */ });
    });
    return;
  }
  if (paused) {
    if (el.src && el.src !== 'about:blank') {
      el.dataset.wpSrc = el.src;
      el.src = 'about:blank';
      el.style.visibility = 'hidden';
    }
  } else if (el.dataset.wpSrc) {
    el.src = el.dataset.wpSrc;
    delete el.dataset.wpSrc;
    el.style.visibility = '';
  }
}

// slide 元素自身样式（模糊/缩放/转场/播放参数）按 bg 现值写入：预载窗口里调过参的
// 话，新 slide 带的是创建时的旧参数，上屏时要按现值补写一次
function applySlideStyle(el, bg) {
  if (!el || !el.isConnected) return;
  const blurPx = typeof bg.blurPx === 'number' && Number.isFinite(bg.blurPx)
    ? Math.min(24, Math.max(0, Math.round(bg.blurPx))) : 0;
  const spread = blurPx > 0 ? Math.max(20, blurPx * 2) : 0;
  el.style.inset = `-${spread}px`;
  el.style.filter = blurPx > 0 ? `blur(${blurPx}px)` : '';
  el.style.transition = (currentTheme.bg || {}).transition === 'fade' ? 'opacity .4s ease' : 'none';
  if (el.tagName === 'DIV') {
    const fit = bg.fit || 'cover';
    el.style.backgroundSize = fit === 'tile' ? 'auto' : (fit === 'fill' ? '100% 100%' : fit);
    el.style.backgroundRepeat = fit === 'tile' ? 'repeat' : 'no-repeat';
    return;
  }
  el.style.objectFit = bg.fit === 'fill' ? 'fill' : (bg.fit === 'contain' ? 'contain' : 'cover');
  if (el.tagName === 'VIDEO') {
    el.volume = typeof bg.videoVolume === 'number' && Number.isFinite(bg.videoVolume)
      ? Math.min(1, Math.max(0, bg.videoVolume)) : 0;
    if (!el.paused) el.muted = el.volume === 0;
    el.playbackRate = typeof bg.playbackRate === 'number' && Number.isFinite(bg.playbackRate)
      ? Math.min(2, Math.max(0.5, bg.playbackRate)) : 1;
  }
}
// —— 来源没变时的原地更新：调参数不重建 slide ——
// 换图、视频重启、轮换计时清零都只应发生在换来源时；改遮罩/模糊/缩放/转场/
// 播放参数一律在现有 slide 上直接改样式和属性
function applySlideParams(bg, rgb, alpha) {
  if (wpMask) wpMask.style.background = `rgba(${rgb},${alpha})`;
  const el = wpSlide;
  if (!el || !el.isConnected) return;
  applySlideStyle(el, bg);
  if (el.tagName === 'VIDEO') {
    // fpsCap 变了才补转码：每次调参都请求会让 ready 快路径重设 src、视频重播
    if (String(Number(bg.fpsCap) || 0) !== (el.dataset.wpFps || '')) maybeTranscode(el, el.dataset.wpName, el.dataset.wpFrom);
  }
}
// 轮换定时器：间隔没变就保留倒计时（调参数不清零）；间隔变了才重装
function armRotateTimer(bg) {
  const ms = (Math.max(0, Number(bg.intervalMin) || 0)) * 60000;
  const want = ms >= 30000 && wpTickFn ? ms : 0;
  if (bgTimer && want === bgTimerMs) return;
  if (bgTimer) { clearInterval(bgTimer); bgTimer = null; }
  bgTimerMs = want;
  if (want) bgTimer = setInterval(wpTickFn, want);
}
// 帧率上限：先播原片，helper 的 ffmpeg 抽帧版转码完成后带着原播放进度换过去
function maybeTranscode(el, name, from) {
  const helperUrl = liveBoot().helperUrl || HELPER_URL;
  const cap = Number((currentTheme.bg || {}).fpsCap) || 0;
  el.dataset.wpFps = String(cap);
  if (!cap || !name) {
    // fpsCap 归零要还原原片：此前可能已换到抽帧版，不还原会一直锁在降质版
    if (!cap && name && el.src && el.src.includes('/bg/transcode/file/')) {
      const orig = (from === 'folder' ? `${helperUrl}/bg/folder/file/` : `${helperUrl}/bg/file/`) + encodeURIComponent(name) + '?' + mediaAuth();
      const at = el.currentTime;
      el.src = orig;
      el.addEventListener('loadedmetadata', () => {
        if (!el.isConnected) return;
        try { el.currentTime = at; } catch { /* ignore */ }
        applyMediaState(); // 按暂停判定起播，别绕过 pauseOnHidden 无条件 play
      }, { once: true });
    }
    return;
  }
  void (async () => {
    const reqCap = String(cap); // 发起时的上限：响应带回的是这一版转码
    const res = await rpc('/bg/transcode', { method: 'POST', body: { name, from, fps: cap } });
    if (!res.ok || !res.key) {
      // busy/没 ffmpeg 等失败：回滚记录让下次调参/轮换重试，别把 fpsCap 锁死在原片
      if (el.isConnected) el.dataset.wpFps = '';
      return;
    }
    if (!el.isConnected) return; // 已换掉/摘掉：不用管
    const swapTo = () => {
      if (!el.isConnected) return;
      if (el.dataset.wpFps !== reqCap) return; // 上限已改：旧响应别把元素换到旧帧率版
      const target = `${helperUrl}/bg/transcode/file/${res.key}.mp4?${mediaAuth()}`;
      if (el.src === target) return; // 已经在播抽帧版就别重设 src（视频会重播）
      const at = el.currentTime;
      el.src = target;
      el.addEventListener('loadedmetadata', () => {
        if (!el.isConnected) return; // 已脱屏：别再拉起脱屏音频
        try { el.currentTime = at; } catch { /* 换源后定位失败就从头播 */ }
        applyMediaState(); // 按暂停判定起播，别绕过 pauseOnHidden 无条件 play
      }, { once: true });
    };
    if (res.ready) { swapTo(); return; }
    let pollN = 0;
    const poll = setInterval(() => {
      if (!el.isConnected) { clearInterval(poll); wpTimers.delete(poll); return; } // 元素已换掉/摘掉：轮询跟着结束
      if (++pollN > 360) { clearInterval(poll); wpTimers.delete(poll); return; } // 30 分钟还没好就放弃（转码失败不再永远轮询）
      void fetch(`${helperUrl}/bg/transcode/file/${res.key}.mp4?${mediaAuth()}`).then((r) => {
        if (!r.ok) return;
        clearInterval(poll);
        wpTimers.delete(poll);
        void (r.body && r.body.cancel && r.body.cancel());
        swapTo();
      }).catch(() => { /* helper 没起来：下轮再试 */ });
    }, 5000);
    wpTimers.add(poll);
  })();
}

// 壁纸五模式：none 无 / library 本地图库（单选一张，轮换归文件夹）/ folder
// 文件夹轮换（随机或顺序，intervalMin 分钟，0 = 不轮换）/ url 图片网址（intervalMin
// 分钟刷新，配随机图 API 用，刷新带缓存戳）/ web 网页（iframe 铺界面后方）。
// 列表经 helper 取（页面读不了磁盘），取不到一律降级为无壁纸
async function applyBackground(bg) {
  const seq = ++applySeq;
  bgStyleEl = ensureEl('__zcodepro_bg__');
  const root = document.documentElement;
  root.classList.remove('zcodepro-bg-on');
  clearBgOverrides();

  // 全局壁纸与分区背景任一在用，都需要后面的遮罩/半透明化；
  // 全局关闭时只清 slide 层，分区规则交给 applyRegionBackgrounds 自己清
  // 选了模式但还没选文件/目录/网址不算启用：半透明要等真有画面可透，否则图
  // 没上、面板先变透明露出底下的窗口内容
  // shortcut: 只挡"配置里没填来源"；配置填了但运行时取不到图（文件被删、
  // 目录为空、网址失效）时半透明仍保持，要跟着回退需要装载失败分支一起改，暂不做
  const srcLive = (s) => !!s && ((s.mode === 'library' && !!s.file)
    || (s.mode === 'folder' && !!s.folder) || ((s.mode === 'url' || s.mode === 'web') && !!s.url));
  const bgActive = srcLive(bg);
  const anyRegion = !!(bg && bg.regions && (srcLive(bg.regions.left) || srcLive(bg.regions.center) || srcLive(bg.regions.right)));
  if (!bgActive) {
    bgStyleEl.textContent = '';
    ensureEl('__zcodepro_bg_extra__').textContent = ''; // 磨砂/浮层规则不挂类门了，关壁纸要自己清
    clearWpTimers();
    wpTickFn = null;
    wpItem = null;
    lastWpSig = '';
    clearWallpaper();
  }
  if (!bgActive && !anyRegion) {
    await applyRegionBackgrounds(bg); // 无分区时也会清空分区规则与定时器
    return;
  }

  // 三参数（对齐 codeg 语义）：maskOpacity 遮罩不透明度（直接作为遮罩 α）；
  // blurPx 画面模糊（CSS filter，只糊 slide 不糊遮罩）；panelOpacity 面板
  // 不透明度（侧栏/面板/标签栏表面混入底色的比例，独立于遮罩）
  const num01 = (v, dflt) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : dflt);
  const maskOpacity = num01(bg.maskOpacity, 0.82);
  const alpha = Math.min(0.99, maskOpacity);
  const blurPx = typeof bg.blurPx === 'number' && Number.isFinite(bg.blurPx)
    ? Math.min(24, Math.max(0, Math.round(bg.blurPx))) : 0;
  const panelOpacity = num01(bg.panelOpacity, 0.3);
  // 遮罩色跟随当前明暗的皮肤底色：在皮肤已应用、半透明化未写入时读解析色
  const resolvedBg = resolvedColor('--color-background');
  const rgb = rgbTriple(resolvedBg, isDarkMode() ? '13,13,13' : '248,248,248');
  // 表面半透明化：面板不透明度直接用 panelOpacity（0=全透画面，1=纯色）
  const panelMix = Math.round(panelOpacity * 100);
  // composer 面板的磨砂玻璃：模糊只糊不掉对比度，底只有 20% 左右不透明度时
  // 背后滚过的文字仍会和输入文字叠着看；给面板单独加不透明度下限（其余表面
  // 不动），底色取 --color-input 的不透明基色
  const composerVeil = Math.max(panelMix, 65);
  const inputTriple = rgbTriple(resolvedColor('--color-input'), rgb);
  for (const t of SURFACE_TOKENS) {
    if (panelMix >= 100) continue;
    const v = resolvedColor(t);
    if (v) {
      root.style.setProperty(t, `color-mix(in srgb, ${v} ${panelMix}%, transparent)`);
      injectedKeys.add(t);
    }
  }
  // 右上角状态面板（进程/智能体/命令行）走 popover 色——浮层 token 不半透明是
  // 为了右键菜单可读，但它是常驻面板，单独按面板不透明度混透明（其余菜单不变）。
  // 输入框的可读性靠磨砂玻璃：圆角面板本体一层盖得住的底 + backdrop-filter
  // 把背后滚过的回答文字糊掉。磨砂只贴面板本体（overflow-hidden+圆角把模糊
  // 裁进圆角内）：贴到 v4-composer 这类直角容器上，模糊矩形会盖出面板下方几
  // 像素、并在面板圆角外的左上/右上方露出方角。别加不透明度兜底到包装层——
  // 那会把提示条和输入框之间的空隙填成不透明
  // 这几条不挂 html.zcodepro-bg-on 类门：只开分区背景时那个类不会加，磨砂会
  // 整体失效（分区图就铺在会话列后面）。关壁纸路径上面已自己清空本表
  ensureEl('__zcodepro_bg_extra__').textContent =
    `[data-testid="chat-summary-panel"]{` +
    `background-color:color-mix(in srgb, var(--color-popover) ${panelMix}%, transparent) !important;` +
    `backdrop-filter:blur(24px) saturate(1.15);-webkit-backdrop-filter:blur(24px) saturate(1.15);}` +
    `[data-testid="v4-composer"] form > .rounded-2xl{` +
    `background-color:rgba(${inputTriple},${composerVeil / 100}) !important;` +
    `backdrop-filter:blur(24px) saturate(1.15);-webkit-backdrop-filter:blur(24px) saturate(1.15);}` +
    // 设置弹窗卡片（data-zcodepro-settings）同款磨砂：卡片自带 98% 不透明的
    // popover 底把壁纸盖死，换成不透明度下限的底 + 糊掉背后滚过的会话文字。
    // 下限 35%（低于输入框的 65%）：弹窗要看得见壁纸，实测 35% 底 + blur(24px)
    // 壁纸明显可见、卡片内文字仍清楚；再高就"透出等于没透出"。
    // backdrop-filter 只有 GPU 合成才渲染（软件渲染下静默失效、只剩透明底
    // 叠字），用 webgl 可用性当代理信号，webgl 不可用时下限抬到 75% 防叠影——
    // 实测 75% 无模糊也文字清楚、壁纸可见。GPU 在但禁 webgl 的机器会把底色
    // 再加实一点（75%）
    // dialogFrost 关掉时不写这条，卡片回落原不透明底
    (bg.dialogFrost !== false
      ? `[data-zcodepro-settings="1"]{` +
        `background-color:color-mix(in srgb, var(--color-popover) ${Math.max(panelMix, backdropBlurUsable() ? 35 : 75)}%, transparent) !important;` +
        `backdrop-filter:blur(24px) saturate(1.15);-webkit-backdrop-filter:blur(24px) saturate(1.15);}`
      : '') +
    // 侧栏细线图标加深到正文实色（描边是 currentColor，改 color 即可）：
    // 灰色/半透明图标在透出的壁纸上没有对比度；背景和透明度不动。
    // 加载图标（zcodepro-ws-loader）另有自己的颜色，排除掉
    `aside[data-testid="sidebar"] svg:not(.zcodepro-ws-loader){` +
    `color:var(--color-foreground) !important;stroke:currentColor !important;}`;
  await applyRegionBackgrounds(bg, { rgb, alpha, fit: bg.fit, seq });
  if (seq !== applySeq) return; // 分区文件夹列表等待期间配置又变了
  if (!bgActive) return; // 只有分区背景：到此为止，全局层不设

  // 来源签名（mode/file/folder/url）没变就原地更新参数：不重建 slide，
  // 不换图、视频不重启、轮换计时不清零。只有换来源才走下面的重建
  const sourceSig = JSON.stringify([bg.mode, bg.file, bg.folder, bg.url]);
  // bg-on 类和底色规则两条路径都要挂：函数开头摘掉后漏挂会让
  // html.zcodepro-bg-on 下的规则（面板/webview 透明、html 底色）集体失效
  const markBgOn = () => {
    bgStyleEl.textContent = `html.zcodepro-bg-on{background-color:rgb(${rgb}) !important;}` +
      `html.zcodepro-bg-on webview{background:transparent !important;}`;
    root.classList.add('zcodepro-bg-on');
    applyWebviewTransparency(); // 壁纸可见时给插件卡片 webview 插透明（扫描定时器在这里启动）
  };
  if (sourceSig === lastWpSig && wpSlide && wpSlide.isConnected) {
    markBgOn();
    applySlideParams(bg, rgb, alpha);
    armRotateTimer(bg);
    return;
  }
  // 提交（记来源签名、清旧轮换）挪到真正开始装载时再做：提前提交的话，取列表
  // 失败或被下一次 apply 抢占后，旧画面顶着新来源的签名、轮换定时器已清且不会
  // 重装，同来源的后续应用全走原地更新分支，永久救不回来
  const commit = () => {
    lastWpSig = sourceSig;
    clearWpTimers();
    applyWebviewTransparency(); // clearWpTimers 连 webview 扫描一起停了：壁纸还在用，重新启动
    wpTickFn = null; // 无轮换的来源（web）不残留旧 tick，防调参时装上别的来源的切换
  };
  markBgOn();

  const helperUrl = liveBoot().helperUrl || HELPER_URL;
  // tick 闭包延后执行时读的是最新配置（转场/缩放/轮换开关改了要生效在后续切换上）
  const B = () => currentTheme.bg || bg;

  // —— slide 层：容器 + 当前 slide + 遮罩 ——
  // 应用样式表把 html/body/#root 的 background-* 全钉成 initial !important，
  // 所以铺画面用真实元素而不是背景样式（视频/网页也铺得进）；转场靠新旧两个
  // slide 叠放淡入淡出。模糊只作用于 slide 自身；模糊会把元素边缘拉开出现
  // 透明缝，按模糊半径外扩 inset 收边
  const spread = blurPx > 0 ? Math.max(20, blurPx * 2) : 0;
  const mkSlide = (kind) => {
    const cur = B();
    const el = document.createElement(kind === 'video' ? 'video' : kind === 'web' ? 'iframe' : 'div');
    el.className = '__zcp-slide';
    el.style.position = 'absolute';
    el.style.inset = `-${spread}px`;
    el.style.transition = cur.transition === 'fade' ? 'opacity .4s ease' : 'none';
    if (blurPx > 0) el.style.filter = `blur(${blurPx}px)`;
    if (kind === 'image') {
      // 缩放方式：cover 填满裁剪 / contain 完整显示 / fill 拉伸 / tile 原尺寸平铺
      const fit = cur.fit || 'cover';
      el.style.backgroundSize = fit === 'tile' ? 'auto' : (fit === 'fill' ? '100% 100%' : fit);
      el.style.backgroundRepeat = fit === 'tile' ? 'repeat' : 'no-repeat';
      el.style.backgroundPosition = 'center';
    } else {
      // video/iframe 没有平铺概念，tile 按 cover 处理
      el.style.objectFit = cur.fit === 'fill' ? 'fill' : (cur.fit === 'contain' ? 'contain' : 'cover');
    }
    return el;
  };
  const mask = document.createElement('div');
  mask.className = '__zcp-mask';
  mask.style.position = 'absolute';
  mask.style.inset = '0';
  mask.style.background = `rgba(${rgb},${alpha})`;
  const setSlide = (el) => {
    const layer = wpLayerEl();
    // 旧遮罩一并清掉：每次重应用都造新遮罩，不清会在层里越堆越厚
    for (const c of [...layer.children]) if (c.classList.contains('__zcp-mask')) c.remove();
    const old = wpSlide;
    el.style.opacity = old && B().transition === 'fade' ? '0' : '1';
    // 预载窗口里的浓度/遮罩色改动落在旧遮罩上（applySlideParams 写的是可见的
    // wpMask），上屏时把最新样式带过来，否则改动随旧遮罩一起被删
    if (wpMask) mask.style.background = wpMask.style.background;
    layer.append(el, mask);
    wpMask = mask; // 上屏才换引用：预载没完成时改遮罩浓度要落在还可见的旧遮罩上
    wpSlide = el;
    wpMedia = el.tagName === 'DIV' ? null : el;
    applySlideStyle(el, B()); // 预载窗口里的模糊/缩放/转场/播放参数改动带上屏
    if (old) {
      if (old.tagName === 'VIDEO') old.pause(); // 移出文档音频还会响，渐隐期间也会双声
      if (B().transition === 'fade') {
        requestAnimationFrame(() => { el.style.opacity = '1'; old.style.opacity = '0'; });
        setTimeout(() => old.remove(), 450); // 旧 slide 渐隐完再摘
      } else {
        old.remove();
      }
    }
    applyMediaState();
  };
  // 上屏前先预载，就绪才交接：新画面没加载完就换会露出底色闪一下。
  // 票号 wpShowTicket 是模块级递增：切换频繁时旧预载的迟到回调凭票作废，
  // 不会顶掉后来的壁纸；预载失败不上屏（旧壁纸保持显示，等下一轮切换）
  const setImage = (rawUrl) => {
    const el = mkSlide('image');
    el.style.backgroundImage = `url("${rawUrl}")`;
    const ticket = ++wpShowTicket;
    const probe = new Image();
    probe.onload = () => { if (ticket === wpShowTicket) setSlide(el); };
    probe.onerror = () => {
      // 预载失败（网址失效、或切到另一模式留下的网址）：旧画面不能顶着新签名
      // 永久挂着，清掉两份签名让 5 秒轮询与后续应用都重试
      if (ticket === wpShowTicket) { lastWpSig = ''; lastThemeSig = ''; }
    };
    probe.src = rawUrl;
  };
  // 视频：静音起播（自动播放策略要求）成功后按音量设置放开；音量 0 = 保持静音
  const setupVideo = (srcUrl, name, from) => {
    const cur = B();
    const el = mkSlide('video');
    el.dataset.wpName = name; // 来源跟元素走：预载窗口内改 fpsCap 不会拿新名改旧元素
    el.dataset.wpFrom = from;
    el.src = srcUrl;
    el.loop = true;
    el.playsInline = true;
    el.muted = true;
    el.volume = num01(cur.videoVolume, 0);
    el.playbackRate = typeof cur.playbackRate === 'number' && Number.isFinite(cur.playbackRate)
      ? Math.min(2, Math.max(0.5, cur.playbackRate)) : 1;
    const ticket = ++wpShowTicket;
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      if (ticket !== wpShowTicket) return;
      setSlide(el); // 内部走 applyMediaState：按暂停判定决定播不播，别绕过它无条件 play
      maybeTranscode(el, name, from);
    };
    el.addEventListener('loadeddata', go, { once: true });
    el.addEventListener('error', () => {
      done = true;
      // 加载失败不上屏，旧壁纸保持；清两份签名让轮询与后续应用重试（同图片路径）
      if (ticket === wpShowTicket) { lastWpSig = ''; lastThemeSig = ''; }
    }, { once: true });
    wpTimers.add(setTimeout(go, 8000)); // 首帧迟迟不来也上屏，避免一直挂着旧图
  };
  const setupWeb = (u) => {
    const el = mkSlide('web');
    el.style.border = 'none';
    el.style.background = 'transparent';
    el.style.visibility = '';
    el.sandbox = 'allow-scripts'; // 不透明源：网页拿不到宿主与 helper 的任何东西
    el.src = u;
    const ticket = ++wpShowTicket;
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      if (ticket !== wpShowTicket) return;
      setSlide(el);
    };
    el.addEventListener('load', go, { once: true });
    el.addEventListener('error', () => {
      done = true;
      // 加载失败不上屏；清两份签名让轮询与后续应用重试（同图片路径）
      if (ticket === wpShowTicket) { lastWpSig = ''; lastThemeSig = ''; }
    }, { once: true });
    wpTimers.add(setTimeout(go, 8000));
  };
  const showFile = (f, from) => {
    wpItem = { name: f.name, from };
    const u = from === 'folder'
      ? `${helperUrl}/bg/folder/file/${encodeURIComponent(f.name)}?${mediaAuth()}`
      : `${helperUrl}/bg/file/${encodeURIComponent(f.name)}?${mediaAuth()}`;
    if (/\.(mp4|webm|mov)$/i.test(f.name)) setupVideo(u, f.name, from);
    else setImage(u);
  };
  // 轮换取下一张：随机或按列表顺序（顺序模式 rotateIdx 单调前进）
  const nextIdx = (n) => {
    if (B().folderRandom !== false) return n > 1 ? Math.floor(Math.random() * n) : 0;
    rotateIdx = (rotateIdx + 1) % n;
    return rotateIdx;
  };

  if (bg.mode === 'library') {
    const res = await rpc('/bg');
    if (seq !== applySeq) return; // 等待期间配置又变了，本次作废
    if (!res.ok) { lastThemeSig = ''; return; } // 取列表失败（helper 重启窗口）：保持旧壁纸；清主题签名让 5 秒轮询重试
    commit();
    const files = Array.isArray(res.files) ? res.files.filter((f) => f && f.name) : [];
    if (!files.length) { clearWallpaper(); return; }
    // 图库单选：只显示选中的那张（没选中就无壁纸）；整库轮换归文件夹模式
    const pickFile = files.find((f) => sameName(f.name, bg.file));
    if (!pickFile) { clearWallpaper(); return; }
    showFile(pickFile, 'library');
    return;
  }
  if (bg.mode === 'folder') {
    const res = await rpc('/bg/folder/list');
    if (seq !== applySeq) return;
    if (!res.ok) { lastThemeSig = ''; return; } // 取列表失败：保持旧壁纸与旧轮换；清主题签名让 5 秒轮询重试
    commit();
    const files = Array.isArray(res.files) ? res.files.filter((f) => f && f.name) : [];
    if (!files.length) { clearWallpaper(); return; }
    const tick = () => showFile(files[nextIdx(files.length)], 'folder');
    wpTickFn = tick;
    tick();
    armRotateTimer(bg);
    return;
  }
  if (bg.mode === 'url') {
    commit();
    const u0 = (/^https?:\/\/\S+$/i.test(bg.url || '') && !/[<>"'\\]/.test(bg.url)) ? bg.url : '';
    if (!u0) { clearWallpaper(); return; }
    const bust = () => {
      urlTick += 1;
      const sep = u0.includes('?') ? '&' : '?';
      setImage(`${u0}${sep}_zcp=${urlTick}`);
    };
    wpTickFn = bust;
    bust();
    armRotateTimer(bg);
    return;
  }
  if (bg.mode === 'web') {
    commit();
    const u0 = (/^https?:\/\/\S+$/i.test(bg.url || '') && !/[<>"'\\]/.test(bg.url)) ? bg.url : '';
    if (!u0) { clearWallpaper(); return; }
    setupWeb(u0);
  }
  // 四个 mode 分支是平级 if：认不出的 mode 到这里提交并清壁纸，别让旧画面顶着
  // 新签名、旧来源的轮换一直跑
  if (!['library', 'folder', 'url', 'web'].includes(bg.mode)) { commit(); clearWallpaper(); }
}

// —— 分区背景：左栏 / 中栏 / 右栏各自选来源（null = 跟随全局）——
// 图片解析与全局同构；规则写成 CSS（元素重挂载自动重新命中），元素自身的
// background-color（半透明表面色）按 CSS 规则画在自身背景图之上，层级正好。
// 每区缓存来源签名与当前选中文件：调参数只按新配色/缩放重写规则，不重新抽图
const regionState = { left: null, center: null, right: null }; // {sig, image, tick, timer, interval}
// 规则表与配色参数放模块级：轮换 tick 是旧调用留下的闭包，迟到触发时现读这两样，
// 就不会拿旧配色盖掉新规则、或把别次调用写入的规则整表抹掉
const regionRules = new Map(); // region -> 规则文本（同分区覆盖，不无限追加）
const regionPaint = { rgb: '13,13,13', alpha: 0.82, sizeVal: '100% 100%,cover', repeatVal: 'no-repeat' };
async function applyRegionBackgrounds(bg, pre) {
  regionStyleEl = ensureEl('__zcodepro_bg_regions__');
  const flush = () => { regionStyleEl.textContent = [...regionRules.values()].join(''); };
  // pre.alpha = 遮罩不透明度（直接配置值），与全局同值
  regionPaint.alpha = pre ? pre.alpha : 0.82;
  regionPaint.rgb = pre ? pre.rgb : '13,13,13';
  const FIT_CSS = {
    cover: '100% 100%,cover', contain: '100% 100%,contain', fill: '100% 100%,100% 100%', tile: '100% 100%,auto',
  };
  regionPaint.sizeVal = FIT_CSS[bg && bg.fit] || FIT_CSS.cover;
  regionPaint.repeatVal = bg && bg.fit === 'tile' ? 'no-repeat,repeat' : 'no-repeat';
  const helperUrl = liveBoot().helperUrl || HELPER_URL;
  // 网址进 CSS 前过滤引号与尖括号：url("...") 的字符串不能被截断（CSS 注入面）
  const safeUrl = (u) => (/^https?:\/\/\S+$/i.test(u || '') && !/[<>"'\\]/.test(u) ? u : '');
  const addRule = (region, image) => {
    if (!image) return;
    // 分区独立缩放/遮罩：调用时读取当前主题里的分区值（轮换 tick 是旧调用留下的
    // 闭包，读形参 bg 会拿旧值把新设置盖回去），没设（null）跟随全局
    const rbg = currentTheme.bg || bg;
    const r = rbg && rbg.regions && rbg.regions[region];
    const fit = r && r.fit ? r.fit : '';
    const sizeVal = fit ? (FIT_CSS[fit] || FIT_CSS.cover) : regionPaint.sizeVal;
    const repeatVal = fit ? (fit === 'tile' ? 'no-repeat,repeat' : 'no-repeat') : regionPaint.repeatVal;
    const a = r && r.maskOpacity != null ? r.maskOpacity : regionPaint.alpha;
    regionRules.set(region, `${REGION_SELECTORS[region]}{background-image:linear-gradient(rgba(${regionPaint.rgb},${a}),rgba(${regionPaint.rgb},${a})),${image} !important;` +
      `background-size:${sizeVal} !important;background-position:center !important;background-repeat:${repeatVal} !important;}`);
  };
  const seq = applySeq;
  const ms = (Math.max(0, Number(bg && bg.intervalMin) || 0)) * 60000;
  for (const region of ['left', 'center', 'right']) {
    const r = bg && bg.regions && bg.regions[region];
    const st = regionState[region];
    if (!r) {
      if (st) { if (st.timer) clearInterval(st.timer); regionState[region] = null; }
      regionRules.delete(region);
      continue;
    }
    const sig = JSON.stringify([r.mode, r.file, r.folder, r.url]);
    // 来源没变：沿用已选中的图，只按新的遮罩色/缩放重写规则（不重新抽图）
    if (st && st.sig === sig && st.image) {
      addRule(region, st.image);
      if (st.timer && st.interval !== ms) { clearInterval(st.timer); st.timer = null; }
      if (!st.timer && st.tick && ms >= 30000) { st.timer = setInterval(st.tick, ms); st.interval = ms; }
      continue;
    }
    if (st && st.timer) { clearInterval(st.timer); st.timer = null; } // 句柄置空：列表失败走 continue 保住旧图时，同签名回来还能重装轮换
    const setState = (image, tick) => {
      regionState[region] = { sig, image, tick, timer: null, interval: 0 };
      if (image) addRule(region, image);
    };
    // 配置了分区但给不出图（没选文件/网址非法/目录为空/认不出的 mode）：撤掉旧
    // 规则、清缓存态，与全局"空列表清壁纸"一致，别让上一来源的图顶着新配置显示
    const drop = () => { regionRules.delete(region); regionState[region] = null; };
    if (r.mode === 'library') {
      if (r.file) setState(`url("${helperUrl}/bg/file/${encodeURIComponent(r.file)}?${mediaAuth()}")`, null);
      else drop();
    } else if (r.mode === 'url') {
      const u = safeUrl(r.url);
      if (u) setState(`url("${u}")`, null);
      else drop();
    } else if (r.mode === 'folder' && r.folder) {
      // 分区列自己的目录（?dir=），不用全局的
      const res = await rpc('/bg/folder/list?dir=' + encodeURIComponent(r.folder));
      if (seq !== applySeq) return;
      const files = res.ok && !res.missing && Array.isArray(res.files)
        ? res.files.filter((f) => f && f.name && !/\.(mp4|webm|mov)$/i.test(f.name)) : []; // 分区是 CSS 铺图，视频抽到就空白一拍
      if (!files.length) continue;
      const pick = () => {
        let idx = 0;
        if ((currentTheme.bg || {}).folderRandom !== false) idx = files.length > 1 ? Math.floor(Math.random() * files.length) : 0;
        else { regionFolderIdx[region] = (regionFolderIdx[region] + 1) % files.length; idx = regionFolderIdx[region]; }
        const image = `url("${helperUrl}/bg/folder/file/${encodeURIComponent(files[idx].name)}?dir=${encodeURIComponent(r.folder)}&${mediaAuth()}")`;
        if (regionState[region]) regionState[region].image = image;
        addRule(region, image);
        flush();
      };
      setState(null, pick);
      pick();
      if (ms >= 30000) {
        regionState[region].timer = setInterval(pick, ms);
        regionState[region].interval = ms;
      }
    } else {
      drop(); // folder 没填目录、或认不出的 mode
    }
  }
  flush();
}

function applyAll(theme) {
  if (theme && typeof theme === 'object') currentTheme = theme;
  lastThemeSig = JSON.stringify(currentTheme);
  // 先皮肤后背景：半透明化读的是皮肤应用后的计算值
  applySkin(currentTheme.skin || 'default', currentTheme.custom);
  void applyBackground(currentTheme.bg);
}

export function startTheme() {
  if (!document.head && !document.documentElement) return;
  applyWebviewTransparency();
  applyAll({ skin: 'default', custom: null, bg: { mode: 'none', maskOpacity: 0.82, blurPx: 0, panelOpacity: 0.3 } });
  void getConfig().then((cfg) => applyAll(cfg.theme)).catch(() => { /* 读不到配置保持应用默认 */ });
  window.addEventListener('zcodepro:config-changed', () => {
    void getConfig(true).then((cfg) => applyAll(cfg.theme)).catch(() => { /* ignore */ });
  });
  // 外部直接改配置文件（壁纸控制插件、手动编辑）不会触发 config-changed 事件，
  // 低频轮询补上；helper 读盘时会清洗配置，脏字段带不进来
  lastThemeSig = JSON.stringify(currentTheme);
  if (themePollTimer) clearInterval(themePollTimer);
  let pollFail = 0; // 取不到配置就开始跳过取数：helper 挂掉时从 30 秒一轮降到约 3 分钟一轮，成功即复位
  themePollTimer = setInterval(() => {
    if (pollFail >= 3 && ++pollFail % 6 !== 0) return; // 跳过取数；每 6 跳试一次，成功即复位
    void getConfig(true).then((cfg) => {
      if (!cfg.theme) { pollFail = Math.max(pollFail + 1, 3); return; } // helper 未就绪/无 theme：不动，别空转重应用
      pollFail = 0;
      const sig = JSON.stringify(cfg.theme);
      if (sig !== lastThemeSig) applyAll(cfg.theme);
    }).catch(() => { pollFail = Math.max(pollFail + 1, 3); });
  }, 30000);
  // 暂停判定的三个触发源：页面可见性（最小化）、窗口焦点、电池状态
  document.addEventListener('visibilitychange', applyMediaState);
  window.addEventListener('focus', applyMediaState);
  window.addEventListener('blur', applyMediaState);
  if (navigator.getBattery) {
    navigator.getBattery().then((b) => {
      batteryCharging = !!b.charging;
      b.addEventListener('chargingchange', () => { batteryCharging = !!b.charging; applyMediaState(); });
      applyMediaState(); // 初次取到状态补判一次，否则已暂停的视频要等下次焦点事件才恢复
    }).catch(() => { batteryCharging = null; });
  }
  // 跟随系统的明暗切换只改 root class（theme-zai-light ↔ theme-zai-dark）：
  // 皮肤变量由 CSS 选择器自动换挡，背景遮罩色与半透明混色是 JS 算的，需重算
  if (!classObserver) {
    lastModeSig = isDarkMode() ? 'd' : 'l';
    classObserver = new MutationObserver(() => {
      const sig = isDarkMode() ? 'd' : 'l';
      if (sig === lastModeSig) return; // 自身写入的 zcodepro-* class，不是明暗切换
      lastModeSig = sig;
      applyAll(currentTheme);
    });
    classObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }
}
