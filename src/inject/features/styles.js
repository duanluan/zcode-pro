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
  quoteCodeSpacing: 12, // 引用/代码块上下留白（my-3）
  lineHeight: 1.75,     // 段内行高（leading-[1.75]，挂在内容容器上）
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
}
