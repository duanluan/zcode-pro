// 主题（设置弹窗 外观 → 主题）：皮肤 + 背景图。
// 皮肤：覆盖 ZCode 明/暗两套 CSS 变量（theme-zai-light / theme-zai-dark 根 class），
//   每套皮肤含明、暗两份色值，跟随 ZCode 当前明暗自动选用，不改用户的明暗设置。
// 背景图：图库存 helper 数据目录（CSS url() 引用 /bg/file/<name>，免 token），
//   或内置纯 CSS 渐变（grad-* 前缀 id，无图片文件）。整窗铺图：最底层是 html
//   背景（图 + 同色遮罩，遮罩浓度 = 1 - 可见度），侧栏/会话流/输入框等表面
//   token 改写为 color-mix 半透明让图透出；弹窗/菜单等浮层 token 不动，保可读。
// 表面半透明在 JS 里做而不是纯 CSS：需要先读皮肤应用后的计算值再混透明，
//   明暗切换/换肤/调可见度都要重算（重算前先撤掉上一轮注入，避免 color-mix
//   叠 color-mix 越混越透——PiDeck 踩过同一坑）。
import { getConfig, rpc, liveBoot, HELPER_URL } from '../core.js';

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
let bgStyleEl = null;     // html 背景层（图 + 遮罩）
let injectedKeys = new Set(); // 半透明化写进 root.style 的变量（重算前先撤）
let classObserver = null; // 明暗切换（root class 变化）→ 重算遮罩色与透明度
let currentTheme = { skin: 'default', custom: null, bg: { mode: 'none', visibility: 0.8 } };
let lastModeSig = ''; // 观察器只对明暗模式变化重算：applySkin/applyBackground
// 自己也会改 root class（zcodepro-skin-*/zcodepro-bg-on），不带这条过滤会自触发循环
let bgTimer = null;   // 文件夹轮换 / 网址刷新定时器（重应用前先清）
let regionStyleEl = null; // 分区背景（左栏/中栏/右栏）规则
let regionTimers = [];    // 各分区自己的轮换/刷新定时器
let regionFolderIdx = { left: -1, center: -1, right: -1 };
// 三大区域容器：左栏（侧栏宽度变量容器）、中栏（会话列）、右栏（停靠面板，
// conversation-column 的 browser 兄弟，面板关闭时零宽不误伤；元素重挂载后
// 规则自动重新命中，CSS 方案比持有元素引用稳）
const REGION_SELECTORS = {
  left: 'div[class*="workspace-sidebar-panel-width"]',
  center: '[data-testid="conversation-column"]',
  right: '[data-testid="conversation-column"] ~ [data-testid="browser"]',
};
let folderIdx = -1;   // 文件夹顺序模式的当前索引（-1 → 首次取第 0 张）
let urlTick = 0;      // 网址刷新的缓存戳
let applySeq = 0;     // 异步重入令牌：配置快速变化时只让最后一次生效

// 铺图时半透明化的表面 token（浮层 menu/popover 不在其中，保不透明可读）
const SURFACE_TOKENS = [
  '--color-background', '--color-background-win-alt', '--color-sidebar', '--color-header',
  '--color-panel', '--color-card', '--color-card-selected', '--color-input',
  '--color-input-focused', '--color-highspeed-composer-surface',
];

const isDarkMode = () => document.documentElement.classList.contains('theme-zai-dark')
  || document.documentElement.classList.contains('dark');

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
    const v = getComputedStyle(probeEl).color;
    return /^rgba?\(/.test(v) ? v : '';
  } catch {
    return '';
  }
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

// 背景四模式：none 无 / library 本地图库单张 / folder 文件夹轮换（随机或顺序，
// intervalMin 分钟，0 = 不轮换）/ url 网址（intervalMin 分钟刷新，配随机图 API 用，
// 刷新带缓存戳）。文件夹列表经 helper 取（页面读不了磁盘），取不到一律降级为无背景
async function applyBackground(bg) {
  const seq = ++applySeq;
  bgStyleEl = ensureEl('__zcodepro_bg__');
  const root = document.documentElement;
  if (bgTimer) { clearInterval(bgTimer); bgTimer = null; }
  root.classList.remove('zcodepro-bg-on');
  clearBgOverrides();

  // 全局背景与分区背景任一在用，都需要后面的遮罩/半透明化；
  // 全局关闭时只清 html 层，分区规则交给 applyRegionBackgrounds 自己清
  const bgActive = !!(bg && bg.mode && bg.mode !== 'none');
  const anyRegion = !!(bg && bg.regions && (bg.regions.left || bg.regions.center || bg.regions.right));
  if (!bgActive) bgStyleEl.textContent = '';
  if (!bgActive && !anyRegion) {
    await applyRegionBackgrounds(bg); // 无分区时也会清空分区规则与定时器
    return;
  }

  const visibility = typeof bg.visibility === 'number' && Number.isFinite(bg.visibility)
    ? Math.min(1, Math.max(0, bg.visibility)) : 0.8;
  const alpha = 1 - visibility;
  // 遮罩色跟随当前明暗的皮肤底色：在皮肤已应用、半透明化未写入时读解析色
  const resolvedBg = resolvedColor('--color-background');
  const mHex = resolvedBg.match(/^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
  const rgb = mHex
    ? [Math.round(+mHex[1]), Math.round(+mHex[2]), Math.round(+mHex[3])].join(',')
    : (isDarkMode() ? '13,13,13' : '248,248,248');
  // 表面半透明化：面板不透明度 = 遮罩浓度 + 10% 基础偏移（可见度 100% → 面板
  // 10% 底色，0% → 100% 纯色）；在设图之前完成，与具体图片无关
  const panelMix = Math.min(100, Math.round(alpha * 100) + 10);
  if (panelMix < 100) {
    for (const t of SURFACE_TOKENS) {
      const v = resolvedColor(t);
      if (v) {
        root.style.setProperty(t, `color-mix(in srgb, ${v} ${panelMix}%, transparent)`);
        injectedKeys.add(t);
      }
    }
  }
  await applyRegionBackgrounds(bg, { mask, rgb, alpha, fit: bg.fit, visibility, seq });
  if (seq !== applySeq) return; // 分区文件夹列表等待期间配置又变了
  if (!bgActive) return; // 只有分区背景：到此为止，html 层不设图

  // html 的背景自动成为画布背景铺满视口。应用样式表把 html/body/#root 的
  // background-* 全钉成 initial !important，这里每条都带 !important 才能赢回来。
  // 缩放方式：cover 填满裁剪 / contain 完整显示 / fill 拉伸 / tile 原尺寸平铺
  //（平铺时遮罩层仍整幅不重复，只让图片层重复）
  const FIT_CSS = {
    cover: 'background-size:100% 100%,cover !important;background-repeat:no-repeat !important;',
    contain: 'background-size:100% 100%,contain !important;background-repeat:no-repeat !important;',
    fill: 'background-size:100% 100%,100% 100% !important;background-repeat:no-repeat !important;',
    tile: 'background-size:100% 100%,auto !important;background-repeat:no-repeat,repeat !important;',
  };
  const fitCss = FIT_CSS[bg.fit] || FIT_CSS.cover;
  const setImage = (image) => {
    bgStyleEl.textContent =
      `html.zcodepro-bg-on{background-color:rgb(${rgb}) !important;background-image:linear-gradient(rgba(${rgb},${alpha}),rgba(${rgb},${alpha})),${image} !important;` +
      `${fitCss}background-position:center !important;}`;
    root.classList.add('zcodepro-bg-on');
  };
  const helperUrl = liveBoot().helperUrl || HELPER_URL;

  if (bg.mode === 'library') {
    if (!bg.file) { bgStyleEl.textContent = ''; return; }
    setImage(`url("${helperUrl}/bg/file/${encodeURIComponent(bg.file)}")`);
    return;
  }
  if (bg.mode === 'folder') {
    const res = await rpc('/bg/folder/list');
    if (seq !== applySeq) return; // 等待期间配置又变了，本次作废
    const files = res.ok && Array.isArray(res.files) ? res.files.filter((f) => f && f.name) : [];
    if (!files.length) {
      bgStyleEl.textContent = '';
      root.classList.remove('zcodepro-bg-on');
      return;
    }
    const pick = () => {
      let idx = 0;
      if (bg.folderRandom) idx = files.length > 1 ? Math.floor(Math.random() * files.length) : 0;
      else { folderIdx = (folderIdx + 1) % files.length; idx = folderIdx; }
      setImage(`url("${helperUrl}/bg/folder/file/${encodeURIComponent(files[idx].name)}")`);
    };
    pick();
    const ms = (Math.max(0, Number(bg.intervalMin) || 0)) * 60000;
    if (ms >= 30000) bgTimer = setInterval(pick, ms);
    return;
  }
  if (bg.mode === 'url') {
    const u0 = (/^https?:\/\/\S+$/i.test(bg.url || '') && !/[<>"'\\]/.test(bg.url)) ? bg.url : '';
    if (!u0) { bgStyleEl.textContent = ''; return; }
    const bust = () => {
      urlTick += 1;
      const sep = u0.includes('?') ? '&' : '?';
      setImage(`url("${u0}${sep}_zcp=${urlTick}")`);
    };
    bust();
    const ms = (Math.max(0, Number(bg.intervalMin) || 0)) * 60000;
    if (ms >= 30000) bgTimer = setInterval(bust, ms);
  }
}

// —— 分区背景：左栏 / 中栏 / 右栏各自选来源（null = 跟随全局）——
// 图片解析与全局同构；规则写成 CSS（元素重挂载自动重新命中），元素自身的
// background-color（半透明表面色）按 CSS 规则画在自身背景图之上，层级正好
async function applyRegionBackgrounds(bg, pre) {
  regionStyleEl = ensureEl('__zcodepro_bg_regions__');
  for (const t of regionTimers) clearInterval(t);
  regionTimers = [];
  const rules = new Map(); // region -> 规则文本（轮换时覆盖同分区旧规则，不无限追加）
  const flush = () => { regionStyleEl.textContent = [...rules.values()].join(''); };
  // pre.alpha = 遮罩浓度（= 1 - 可见度），与全局同值，不再反转
  const alpha = pre ? pre.alpha : 0.2;
  const rgb = pre ? pre.rgb : '13,13,13';
  const FIT_CSS = {
    cover: '100% 100%,cover', contain: '100% 100%,contain', fill: '100% 100%,100% 100%', tile: '100% 100%,auto',
  };
  const sizeVal = FIT_CSS[bg && bg.fit] || FIT_CSS.cover;
  const repeatVal = bg && bg.fit === 'tile' ? 'no-repeat,repeat' : 'no-repeat';
  const helperUrl = liveBoot().helperUrl || HELPER_URL;
  // 网址进 CSS 前过滤引号与尖括号：url("...") 的字符串不能被截断（CSS 注入面）
  const safeUrl = (u) => (/^https?:\/\/\S+$/i.test(u || '') && !/[<>"'\\]/.test(u) ? u : '');
  const addRule = (region, image) => {
    if (!image) return;
    rules.set(region, `${REGION_SELECTORS[region]}{background-image:linear-gradient(rgba(${rgb},${alpha}),rgba(${rgb},${alpha})),${image} !important;` +
      `background-size:${sizeVal} !important;background-position:center !important;background-repeat:${repeatVal} !important;}`);
  };
  const seq = applySeq;
  for (const region of ['left', 'center', 'right']) {
    const r = bg && bg.regions && bg.regions[region];
    if (!r) continue;
    if (r.mode === 'library') {
      if (r.file) addRule(region, `url("${helperUrl}/bg/file/${encodeURIComponent(r.file)}")`);
    } else if (r.mode === 'url') {
      const u = safeUrl(r.url);
      if (u) addRule(region, `url("${u}")`);
    } else if (r.mode === 'folder' && r.folder) {
      // 分区列自己的目录（?dir=），不用全局的
      const res = await rpc('/bg/folder/list?dir=' + encodeURIComponent(r.folder));
      if (seq !== applySeq) return;
      const files = res.ok && !res.missing && Array.isArray(res.files) ? res.files.filter((f) => f && f.name) : [];
      if (!files.length) continue;
      const pick = () => {
        let idx = 0;
        if (bg.folderRandom !== false) idx = files.length > 1 ? Math.floor(Math.random() * files.length) : 0;
        else { regionFolderIdx[region] = (regionFolderIdx[region] + 1) % files.length; idx = regionFolderIdx[region]; }
        addRule(region, `url("${helperUrl}/bg/folder/file/${encodeURIComponent(files[idx].name)}")`);
        flush();
      };
      pick();
      const ms = (Math.max(0, Number(bg.intervalMin) || 0)) * 60000;
      if (ms >= 30000) regionTimers.push(setInterval(pick, ms));
    }
  }
  flush();
}

function applyAll(theme) {
  if (theme && typeof theme === 'object') currentTheme = theme;
  // 先皮肤后背景：半透明化读的是皮肤应用后的计算值
  applySkin(currentTheme.skin || 'default', currentTheme.custom);
  void applyBackground(currentTheme.bg);
}

export function startTheme() {
  if (!document.head && !document.documentElement) return;
  applyAll({ skin: 'default', custom: null, bg: { mode: 'none', visibility: 0.8 } });
  void getConfig().then((cfg) => applyAll(cfg.theme)).catch(() => { /* 读不到配置保持应用默认 */ });
  window.addEventListener('zcodepro:config-changed', () => {
    void getConfig(true).then((cfg) => applyAll(cfg.theme)).catch(() => { /* ignore */ });
  });
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
