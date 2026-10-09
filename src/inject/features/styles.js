// 样式调整（设置弹窗「样式调整」标签页）：
// 把配置里的样式覆盖写入独立 <style>，改动即时生效、无需刷新页面；
// 另提供聚焦预览高亮（showStyleHighlight）：设置弹窗聚焦某个样式输入框时，
// 把会话/侧栏中受影响的区域描边标出，间距类项再把边距区域涂成淡黄条。
// 策略：不逐个追应用的间距机制（回合列表/包裹层/行分组/内容容器各有各的写法），
// 而是定位到会话容器（SECTION[class*="@md/conversation"]），在其范围内统一重映射
// 相关间距工具类（gap-5/gap-4/pt-5/pb-5/space-y-4）——对应用内部结构调整更稳。
// 注意 Tailwind v4 的间距工具类落到 CSS 的多是逻辑属性 margin-block(-start)，
// 只盖 margin-top 会在级联中输掉——必须逻辑/物理一起盖。
import { getConfig } from '../core.js';

// 各样式项的应用默认值（用于设置界面显示与「恢复默认」）
export const STYLE_DEFAULTS = {
  rowGap: 20,           // 段落间距：会话内各块之间的垂直间距
  listSpacing: 12,      // 列表上下留白（my-3）
  listItemSpacing: 6,   // 列表项之间的间距（space-y-1.5）
  quoteCodeSpacing: 16, // 引用块上下留白（my-4；代码块同规则）
  codeLineHeight: 1.65,  // 代码块行高（应用默认 12px 字号 × 20px 行盒）
  tableSpacing: 20,      // 表格上下边距（未设置时跟随段落间距）
  tableCellPaddingV: 3,  // 单元格上下边距（应用默认 3px）
  tableCellPaddingH: 3,  // 单元格左右边距（应用默认 3px）
  lineHeight: 1.75,     // 回答行高（leading-[1.75]，挂在答案内容容器上）
  userLineHeight: 1.5,  // 提问行高（用户消息文本容器，默认 normal=1.5）
  contentWidth: null,   // 内容宽度：默认 100%（跟随应用，不覆盖）
  sidebarProjectSpacing: 20,  // 侧栏项目间距：项目行视觉间距（行内留白 12 + 边距 8）
  sidebarTaskSpacing: 10,    // 侧栏任务间距：行内留白加行间边距（py-1 + space-y-0.5）
  uiFont: null,              // 界面字体：除终端外所有界面文字（null = 跟随应用默认）
  userFont: null,            // 提问字体：会话中提问内容
  assistantFont: null,       // 回答字体：会话中回答正文（代码块仍用等宽字体）
};

let styleEl = null;

// 应用原生的字体变量值：首次应用覆盖前抓取，用于界面字体开启时的终端保护
let origFontSans = '';
let origFontMono = '';
function captureFontVars() {
  try {
    const cs = getComputedStyle(document.documentElement);
    origFontSans = cs.getPropertyValue('--font-sans').trim();
    origFontMono = cs.getPropertyValue('--font-mono').trim();
  } catch { /* ignore */ }
}

// 字体设置项的取值：非空字符串才算设置（helper 已清洗，这里只做空值防御）
const fontStack = (v) => (typeof v === 'string' && v.trim() && !/[{};<>\\]/.test(v) ? v.trim() : null);

const CONV = '[class*="@md/conversation"]';
// 答案内容容器里的“特殊块”：段落间距规则跳过它们，由各自的间距项独立控制
const SPECIAL = ':is(ul, ol, blockquote, pre, table, div:has(table), div:has(pre), [class*="code-block"])';
// 特殊块的定位选择器：buildCss 的覆盖规则与高亮预览共用一份，避免两处平行维护后漂移
const SEL_LIST = `${CONV} .space-y-4 > :is(ul, ol)`;
const SEL_QUOTE = `${CONV} .space-y-4 > :is(blockquote, div:has(pre), [class*="code-block"])`;
const SEL_TABLE = `${CONV} .space-y-4 > div:has(table)`;

function buildCss(styles) {
  const parts = [];
  const n = styles.rowGap;
  const rowGapSet = typeof n === 'number' && Number.isFinite(n) && n >= 0;
  if (rowGapSet) {
    parts.push(
      // 回合内外各级容器（SECTION 自身或后代，二者都覆盖）
      `${CONV}.pb-5,${CONV} .pb-5{padding-bottom:${n}px !important;}`,
      `${CONV}.pt-5,${CONV} .pt-5{padding-top:${n}px !important;}`,
      `${CONV} .flex.flex-col.gap-5{gap:${n}px !important;}`,
      `${CONV} .flex.flex-col.gap-4{gap:${n}px !important;}`,
      // 答案内相邻文本块之间（特殊块除外，走各自间距项）
      `${CONV} .space-y-4 > * + *:not(${SPECIAL}){margin-block-start:${n}px !important;margin-top:${n}px !important;}`,
      // 特殊块后接文本块：去掉文本块的段落间距，避免与特殊块自身留白叠加
      `${CONV} .space-y-4 > ${SPECIAL} + *:not(${SPECIAL}){margin-block-start:0 !important;margin-top:0 !important;}`,
      // 回合内部条目之间（思考触发条 ↔ 正文等）
      `.history-message.flex.flex-col > * + *:not([data-slot="collapsible-content"]){margin-block-start:${n}px !important;margin-top:${n}px !important;}`,
      // 工具/状态卡片（「N 个文件已更改」等）上方间距下限 8px：
      // 段落间距调到 0 时也不至于贴死（gap 与 margin 在弹性布局里相加）
      `${CONV} .flex.flex-col.gap-5 > [data-slot="collapsible"]{margin-block-start:max(0px, calc(8px - ${n}px)) !important;margin-top:max(0px, calc(8px - ${n}px)) !important;}`,
    );
  }
  // 特殊块（列表/引用块/表格）自身间距项未设置时跟随段落间距，
  // 否则它们带的原生默认边距（12/16px）会与段落间距合并取大值，调小于该值无效
  const own = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : (rowGapSet ? n : null));
  const ls = own(styles.listSpacing);
  const qc = own(styles.quoteCodeSpacing);
  const tsp = own(styles.tableSpacing);
  const anySet = ls !== null || qc !== null || tsp !== null;
  if (ls !== null) parts.push(`${SEL_LIST}{margin-block:${ls}px !important;}`);
  if (qc !== null) parts.push(`${SEL_QUOTE}{margin-block:${qc}px !important;}`);
  // 文本块自带的底边距（应用给段落默认 16px）清零：相邻块的边距合并会取大值，
  // 不清零时段落间距调小于 16 无效，列表也会上边距大、下边距小。
  // 任一间距项设置时启用，间距完全由设置的起始边距决定
  if (rowGapSet || anySet) {
    parts.push(`${CONV} .space-y-4 > :not(${SPECIAL}){margin-block-end:0 !important;margin-bottom:0 !important;}`);
  }
  if (tsp !== null) {
    // 表格包在 div.my-0.flex 里（space-y-4 的直接子块），边距落在包裹层上：
    // 包裹层 = 工具条（复制/下载/预览，常显）+ 8px 内隙 + 表格卡片，应用把
    // 包裹层边距清零（my-0），这里按设置值给上下边距。工具条必须留在文档流里：
    // 表格卡片容器自带 position:relative 且渲染顺序在后，一旦把工具条浮动到
    // 卡片右上角，会被卡片盖住——按钮看得见但点击全被表格截走，还挡住最后一
    // 列列名。表格框架底部隐藏的宽度调节把手（悬停显现，常占 26px）始终不可
    // 见且 pointer-events:none 不挡点击，浮动到卡片底边不占布局
    parts.push(
      `${SEL_TABLE}{margin-block:${tsp}px !important;}`,
      `${SEL_TABLE} [class*="markdown-table-frame"] > .pointer-events-none.py-1{position:absolute !important;left:0;right:0;bottom:0;}`,
    );
  }
  const li = styles.listItemSpacing;
  if (typeof li === 'number' && Number.isFinite(li) && li >= 0) {
    // 应用的 space-y-1.5 把项间距放在上一项的 margin-block-end 上，一并覆盖：
    // 只设下一项的起始边距会被合并取大值（设 0 仍剩 6px）
    parts.push(
      `${CONV} :is(ul, ol) > li{margin-block-end:0 !important;margin-bottom:0 !important;}`,
      `${CONV} :is(ul, ol) > li + li{margin-block-start:${li}px !important;margin-top:${li}px !important;}`,
    );
  }

  const clh = styles.codeLineHeight;
  if (typeof clh === 'number' && Number.isFinite(clh) && clh >= 0.8) {
    // 代码行在 diffs-container 自定义元素的 Shadow DOM 里（pre > code > 行 div），
    // 行高全部继承自宿主自身的显式值（20px）——直接覆盖宿主，倍数按各元素
    // 自身字号计算；保留 pre 规则兜底其他结构
    parts.push(
      `${CONV} diffs-container{line-height:${clh} !important;}`,
      `${CONV} pre,${CONV} pre code,${CONV} pre [class*="line"]{line-height:${clh} !important;}`,
    );
  }

  const tcv = styles.tableCellPaddingV;
  if (typeof tcv === 'number' && Number.isFinite(tcv) && tcv >= 0) {
    parts.push(`${CONV} table :is(td, th){padding-block:${tcv}px !important;padding-top:${tcv}px !important;padding-bottom:${tcv}px !important;}`);
  }
  const tch = styles.tableCellPaddingH;
  if (typeof tch === 'number' && Number.isFinite(tch) && tch >= 0) {
    parts.push(`${CONV} table :is(td, th){padding-inline:${tch}px !important;padding-left:${tch}px !important;padding-right:${tch}px !important;}`);
  }
  const lh = styles.lineHeight;
  if (typeof lh === 'number' && Number.isFinite(lh) && lh >= 0.8) {
    // 行高挂在内容容器上，段落/列表项继承；代码块等自带行高的元素不受影响
    parts.push(`${CONV} .space-y-4{line-height:${lh} !important;}`);
  }
  const ulh = styles.userLineHeight;
  if (typeof ulh === 'number' && Number.isFinite(ulh) && ulh >= 0.8) {
    // 用户提问是独立的 whitespace-pre-wrap 文本容器，行高默认与回答不同（1.5 vs 1.75）
    parts.push(`${CONV} [class*="user-row"] .whitespace-pre-wrap{line-height:${ulh} !important;}`);
  }
  const cw = styles.contentWidth;
  if (cw && (cw.unit === 'px' || cw.unit === '%') && Number.isFinite(cw.value)) {
    // 内容列（data-v4-timeline-content-column）是应用自己的宽度控制器：
    // 宽屏下 w-[calc(100%-24rem)] + max-w-6xl + 位移。盖它的 max-width，
    // % 相对会话区域可用宽度，且沿用应用自带的居中与过渡。
    parts.push(`[data-v4-timeline-content-column]{max-width:${cw.value}${cw.unit} !important;}`);
  }
  // —— 字体 ——
  const uif = fontStack(styles.uiFont);
  if (uif) {
    // 界面字体覆盖根变量：--font-sans 是全界面文字的来源，--font-mono 管
    // 代码块/路径等等宽区域（同属界面字体范围）；终端不受影响——xterm 用
    // 自生成样式表写字面量字体栈，不引用这些变量。为防应用把变量传给
    // xterm 的情形，再在终端子树内恢复注入前抓到的原值
    parts.push(`:root{--font-sans:${uif} !important;--font-mono:${uif} !important;}`);
    if (origFontSans && origFontMono) {
      parts.push(`.terminal,.terminal *{--font-sans:${origFontSans};--font-mono:${origFontMono};}`);
    }
  }
  const usf = fontStack(styles.userFont);
  if (usf) {
    parts.push(`${CONV} [class*="user-row"] .whitespace-pre-wrap{font-family:${usf} !important;}`);
  }
  const asf = fontStack(styles.assistantFont);
  if (asf) {
    // 挂在答案内容容器上由段落继承；代码块等自带等宽字体的元素不受影响
    parts.push(`${CONV} .space-y-4{font-family:${asf} !important;}`);
  }
  // —— 侧栏间距（选择器不依赖分区文案，跟随界面语言）——
  const SCROLL = '.flex.flex-1.min-h-0.flex-col.gap-3.overflow-y-auto';
  const sps = styles.sidebarProjectSpacing;
  if (typeof sps === 'number' && Number.isFinite(sps) && sps >= 0) {
    // 项目间距按视觉总量映射（与任务间距同一套）：应用默认 = 行内留白约 12px
    // + 块间边距 8px = 20px。边距封顶 8px，余量均分行内；项目行（role=button
    // 的 div，固定 h-8）、分区标题按钮及其 h-7 包装行的固定行高改为按内容+留白。
    // 注意：类名里的点要转义（\.），否则整条选择器非法、规则被丢弃
    const m = Math.min(sps, 8);
    const pad = Math.max(0, Math.round((sps - m) / 2));
    const LIST = '.space-y-2.pb-4:has(div [data-testid^="workspace-item-"])';
    parts.push(
      // 块间边距（应用的 space-y 落在非末尾子块的 margin-block-end 上，同方向覆盖不叠加）
      `${LIST} > :not(:last-child){margin-block-end:${m}px !important;margin-bottom:${m}px !important;}`,
      // 列表底部留白（pb-4）清零：分区间距由 gap 统一给，避免叠加出大空隙
      `${LIST}{padding-bottom:0 !important;}`,
      // 分区间距：外层滚动容器与项目/任务分区所在的 gap-3 容器。
      // 注意不能用嵌套 :has()（:has 里再套 LIST 的 :has）——当前 Chromium 不支持，
      // 整条选择器会被判非法而丢弃；这里用单层 :has 定位 pb-4 列表容器即可
      `${SCROLL}:has(> div .space-y-2.pb-4),.flex.min-h-0.flex-col.gap-3.px-2:has(.space-y-2.pb-4){gap:${m}px !important;row-gap:${m}px !important;}`,
      // 已置顶分区内层 gap-1（标题与列表间）与项目块内层 gap-1（项目行与任务列表间）
      `${SCROLL} .flex.flex-col.gap-1{gap:${m}px !important;row-gap:${m}px !important;}`,
      // 行高压缩：项目行（role=button 的 div，固定 h-8）、分区标题按钮及其 h-7 包装行。
      // 行高随设置压缩，但要留不小于悬停内容的稳定下限（悬停会渲染约 25px 高的
      // 操作按钮组，实际高约 26.2px 含小数，下限需留出余量，行高若随内容伸缩，
      // 行间无空隙时邻居会被推得上下抖动）；
      // box-sizing 为 border-box，min-height 已含上下留白。
      // 文字容器占满行高：否则悬停按钮组（比文字高）入场时行内重新居中，
      // 项目名称会被顶起约 2px
      `${LIST} [data-testid^="workspace-item-"]{height:auto !important;min-height:${28 + 2 * pad}px !important;padding-block:${pad}px !important;padding-top:${pad}px !important;padding-bottom:${pad}px !important;}`,
      `${LIST} [data-testid^="workspace-item-"] > div:first-child{align-self:stretch !important;}`,
      `${SCROLL} [data-slot="collapsible-trigger"],${SCROLL} .flex.h-7{height:auto !important;}`,
      `${SCROLL} [data-slot="collapsible-trigger"]{min-height:${28 + 2 * pad}px !important;padding-block:${pad}px !important;padding-top:${pad}px !important;padding-bottom:${pad}px !important;}`,
    );
  }
  const sts = styles.sidebarTaskSpacing;
  if (typeof sts === 'number' && Number.isFinite(sts) && sts >= 0) {
    // 任务行间距按视觉总量映射：应用默认 = 行内上下留白 4px + 行间边距 2px = 10px，
    // 一个数值同时落到两者（边距封顶 2px，余量均分行内），视觉间距与数值一致。
    // 「显示更多」行与列表之间的 gap-2 也随任务间距（同属任务区）
    const m = Math.min(sts, 2);
    const pad = Math.max(0, Math.round((sts - m) / 2));
    parts.push(
      `ul.space-y-0\\.5:has(> li[data-task-item-key]) > :not(:last-child){margin-block-end:${m}px !important;margin-bottom:${m}px !important;}`,
      `ul.space-y-0\\.5:has(> li[data-task-item-key]) > li{padding-block:${pad}px !important;padding-top:${pad}px !important;padding-bottom:${pad}px !important;}`,
      `${SCROLL} .flex.flex-col.gap-2{gap:${m}px !important;row-gap:${m}px !important;}`,
      `${SCROLL} div.cursor-pointer[class*="pl-8"]{padding-block:${pad}px !important;padding-top:${pad}px !important;padding-bottom:${pad}px !important;}`,
    );
  }
  return parts.join('');
}

export function applyStyles(styles) {
  if (!styleEl) return;
  styleEl.textContent = styles && typeof styles === 'object' ? buildCss(styles) : '';
}

export function startStyleAdjustments() {
  const root = document.head || document.documentElement;
  if (!root) return;
  styleEl = document.getElementById('__zcodepro_styles__');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = '__zcodepro_styles__';
    root.append(styleEl);
  }
  // 先抓应用原生字体变量再应用覆盖（配置里已有界面字体时，抓到的才是原值）
  captureFontVars();
  void getConfig().then((cfg) => applyStyles(cfg.styles)).catch(() => { /* 配置读取失败时保持应用默认 */ });
  // 配置变更（设置弹窗保存等）后即时重应用
  window.addEventListener('zcodepro:config-changed', () => {
    void getConfig(true).then((cfg) => applyStyles(cfg.styles)).catch(() => { /* ignore */ });
  });
}

// —— 样式预览高亮：设置弹窗里聚焦某个样式输入框时，把会话/侧栏中受影响的
// 区域标出（类浏览器开发者工具）：元素本身 0.5px 内描边（描边间距离即真实
// 边距，数值直观）；间距类项再把实际边距区域用淡黄色涂出，调值时黄条
// 随设置实时变宽变窄。设置弹窗本身用透明遮罩，正好看得见后面的会话 ——
const HL_SELECTORS = {
  rowGap: `${CONV} .space-y-4 > *, ${CONV} .flex.flex-col.gap-5 > *`,
  listSpacing: `${CONV} :is(ul, ol)`,
  listItemSpacing: `${CONV} :is(ul, ol) > li`,
  quoteCodeSpacing: SEL_QUOTE,
  tableSpacing: SEL_TABLE,
  tableCellPaddingV: `${CONV} td, ${CONV} th`,
  tableCellPaddingH: `${CONV} td, ${CONV} th`,
  codeLineHeight: `${CONV} diffs-container, ${CONV} pre`,
  lineHeight: `${CONV} .space-y-4`,
  userLineHeight: `${CONV} [class*="user-row"] .whitespace-pre-wrap`,
  contentWidth: '[data-v4-timeline-content-column]',
  sidebarProjectSpacing: '[data-testid^="workspace-item-"]',
  sidebarTaskSpacing: 'li[data-task-item-key]',
};

// 间距类项的边距黄条：受影响元素与边距方向（与 buildCss 里的规则选择器保持一致）
// rowGap 的黄条排除两种边距实际为零的元素：特殊块自身（走各自间距项）、
// 紧跟特殊块的文本（其起始边距被清零，画了会失真）
const HL_MARGIN = {
  rowGap: { sel: `${CONV} .space-y-4 > * + *:not(${SPECIAL}):not(${SPECIAL} + *)`, top: true },
  listSpacing: { sel: SEL_LIST, top: true, bottom: true },
  listItemSpacing: { sel: `${CONV} :is(ul, ol) > li + li`, top: true },
  quoteCodeSpacing: { sel: SEL_QUOTE, top: true, bottom: true },
  tableSpacing: { sel: SEL_TABLE, top: true, bottom: true },
};

const HL_AMBER = 'rgba(255, 213, 79, 0.5)';

let hlEl = null;

export function showStyleHighlight(key, value = null) {
  const outlineSel = HL_SELECTORS[key];
  const margin = HL_MARGIN[key];
  if (!outlineSel && !margin) return;
  if (!hlEl || !hlEl.isConnected) {
    hlEl = document.createElement('style');
    hlEl.id = '__zcodepro_hl__';
    (document.head || document.documentElement).append(hlEl);
  }
  const parts = [];
  if (outlineSel) {
    // 0.5px 内描边：画在元素边界内侧、不向外延伸，两条描边之间的可见距离
    // 严格等于实际边距（数值直观），也不挤动内容
    parts.push(`${outlineSel}{box-shadow:inset 0 0 0 0.5px color-mix(in oklab, var(--color-primary, #3b82f6) 65%, transparent) !important;}`);
  }
  if (margin) {
    const v = typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
    // 伪元素画在边距所在的区域（元素边界外侧），高度跟随当前设置值；
    // 调值提交时调用方会带新值重进，黄条随之变宽变窄
    parts.push(`${margin.sel}{position:relative !important;}`);
    if (margin.top) parts.push(`${margin.sel}::before{content:'' !important;position:absolute;left:0;right:0;bottom:100%;height:${v}px;background:${HL_AMBER};pointer-events:none;}`);
    if (margin.bottom) parts.push(`${margin.sel}::after{content:'' !important;position:absolute;left:0;right:0;top:100%;height:${v}px;background:${HL_AMBER};pointer-events:none;}`);
  }
  hlEl.textContent = parts.join('');
}

export function hideStyleHighlight() {
  if (hlEl) hlEl.textContent = '';
}
