// 样式调整（设置弹窗「样式调整」标签页）：
// 把配置里的样式覆盖写入独立 <style>，改动即时生效、无需刷新页面。
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
  quoteCodeSpacing: 16, // 引用/代码块上下留白（my-4）
  lineHeight: 1.75,     // 回答行高（leading-[1.75]，挂在答案内容容器上）
  userLineHeight: 1.5,  // 提问行高（用户消息文本容器，默认 normal=1.5）
  contentWidth: null,   // 内容宽度：默认 100%（跟随应用，不覆盖）
  sidebarProjectSpacing: 20,  // 侧栏项目间距：项目行视觉间距（行内留白 12 + 边距 8）
  sidebarTaskSpacing: 10,    // 侧栏任务间距：行内留白加行间边距（py-1 + space-y-0.5）
};

let styleEl = null;

const CONV = '[class*="@md/conversation"]';
// 答案内容容器里的“特殊块”：段落间距规则跳过它们，由各自的间距项独立控制
const SPECIAL = ':is(ul, ol, blockquote, pre, table)';

function buildCss(styles) {
  const parts = [];
  const n = styles.rowGap;
  if (typeof n === 'number' && Number.isFinite(n) && n >= 0) {
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
    );
  }
  const ls = styles.listSpacing;
  if (typeof ls === 'number' && Number.isFinite(ls) && ls >= 0) {
    parts.push(`${CONV} .space-y-4 > :is(ul, ol){margin-block:${ls}px !important;}`);
  }
  const li = styles.listItemSpacing;
  if (typeof li === 'number' && Number.isFinite(li) && li >= 0) {
    parts.push(`${CONV} :is(ul, ol) > li + li{margin-block-start:${li}px !important;margin-top:${li}px !important;}`);
  }
  const qc = styles.quoteCodeSpacing;
  if (typeof qc === 'number' && Number.isFinite(qc) && qc >= 0) {
    parts.push(`${CONV} .space-y-4 > :is(blockquote, pre, table){margin-block:${qc}px !important;}`);
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
  void getConfig().then((cfg) => applyStyles(cfg.styles)).catch(() => { /* 配置读取失败时保持应用默认 */ });
  // 配置变更（设置弹窗保存等）后即时重应用
  window.addEventListener('zcodepro:config-changed', () => {
    void getConfig(true).then((cfg) => applyStyles(cfg.styles)).catch(() => { /* ignore */ });
  });
}
