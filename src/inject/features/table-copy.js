// 回答内容表格工具条的「复制表格」按钮：把表格以富文本（text/html）写入
// 剪贴板，可粘贴进 Excel / 富文本编辑器并被识别为真正的表格（分列成格）。
// 官方已有「复制 Markdown / 下载 CSV / 预览」，但没有富文本形态——手动框选
// 复制虽也是 text/html，但带上了应用给单元格的横线与主题背景色，粘贴出来
// 脏样式。这里克隆表格后剥掉全部内联样式与 class，只保留表格结构本身。
// text/plain 同步写 TSV（Tab 分列、换行分行）：Excel / Numbers / 粘贴为纯
// 文本的场景都能正确分列；富文本编辑器取 text/html 得到干净表格。
import { ensureStyle, showToast } from '../ui.js';
import { t, getConfig } from '../core.js';

let installed = false;
let enabled = true; // helper features.tableCopy（默认开）

// 剥样式：克隆树上去掉 style/class/width 等表现属性，只留结构（含 rowspan/
// colspan——Excel 识别合并单元格）。thead/tbody 保留，th/td 语义也保留
function cleanTable(table) {
  const clone = table.cloneNode(false);
  const walk = (src, dst) => {
    for (const node of src.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent.trim()) dst.append(document.createTextNode(node.textContent));
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = node.tagName;
      // 嵌套的行内标记（strong/em/code/a/span）保留文本与标签但不带任何属性
      const el = document.createElement(tag.toLowerCase());
      if (tag === 'TD' || tag === 'TH') {
        // 合并单元格信息必须保留（Excel/编辑器据此铺格）
        for (const a of ['colspan', 'rowspan']) {
          const v = node.getAttribute(a);
          if (v && v !== '1') el.setAttribute(a, v);
        }
      }
      dst.append(el);
      walk(node, el);
    }
  };
  walk(table, clone);
  return clone;
}

// TSV 转义：单元格内的 Tab/换行替换为空格（TSV 无法表达内嵌二者）
function tableToTsv(table) {
  const rows = [];
  for (const tr of table.rows) {
    const cells = [];
    for (const cell of tr.cells) {
      cells.push((cell.textContent || '').replace(/[\t\r\n]+/g, ' ').trim());
    }
    rows.push(cells.join('\t'));
  }
  return rows.join('\n');
}

async function copyTable(table) {
  const L = t();
  const clean = cleanTable(table);
  const html = '<meta charset="utf-8"><table>' + clean.innerHTML + '</table>';
  const tsv = tableToTsv(table);
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard && navigator.clipboard.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([tsv], { type: 'text/plain' }),
        }),
      ]);
      showToast(L.tableCopied, 'success');
      return;
    }
  } catch { /* 走下面的兜底 */ }
  // 兜底：自建 Selection + execCommand('copy')，剪贴板由浏览器按 DOM 生成
  // text/html（无样式）与 text/plain
  try {
    const holder = document.createElement('div');
    holder.contentEditable = 'true';
    holder.style.cssText = 'position:fixed;left:-9999px;top:0;';
    holder.append(clean);
    document.body.append(holder);
    const range = document.createRange();
    range.selectNodeContents(holder);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const ok = document.execCommand('copy');
    sel.removeAllRanges();
    holder.remove();
    if (ok) { showToast(L.tableCopied, 'success'); return; }
  } catch { /* ignore */ }
  showToast(L.failed, 'error');
}

// 与官方按钮同款的 ghost 图标按钮：lucide table 图标 + tooltip 用 aria-label
//（应用的 tooltip 组件由 React 挂载，注入按钮只能靠原生 title/aria——这里
// 用 aria-label 保持与邻居一致的可访问性，悬停提示用原生 title）
function makeButton(onClick) {
  const L = t();
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('aria-label', L.tableCopyBtn);
  btn.title = L.tableCopyBtn;
  btn.className = 'group/button inline-flex items-center justify-center border border-transparent bg-clip-padding whitespace-nowrap transition-colors outline-none select-none text-foreground hover:bg-hover hover:text-foreground size-7 rounded-lg [&_svg:not([class*=\'size-\'])]:size-4 shrink-0';
  btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-table size-3.5" aria-hidden="true"><path d="M12 3v18"></path><path d="M3 9h18"></path><path d="M3 15h18"></path><path d="M5 21h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2"></path></svg>';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

export function startTableCopy() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  ensureStyle();

  // 定位工具条对应的表格：工具条与表格在同一个包裹容器（.my-0.flex 容器，
  // 官方结构）里；先在兄弟里找，找不到再向上两层内找
  const tableOf = (bar) => {
    let scope = bar.parentElement;
    for (let i = 0; i < 3 && scope; i++) {
      const table = scope.querySelector('table');
      if (table) return table;
      scope = scope.parentElement;
    }
    return null;
  };

  const enhance = (bar) => {
    if (bar.dataset.zcodeproTableCopy) return;
    bar.dataset.zcodeproTableCopy = '1';
    const table = tableOf(bar);
    if (!table) return; // 没有对应表格就没意义（工具条总在表格旁，防御而已）
    bar.append(makeButton(() => { void copyTable(table); }));
  };

  const scan = () => {
    for (const bar of document.querySelectorAll('[data-markdown-table-toolbar]')) enhance(bar);
  };
  scan();
  // 会话滚动/新回答渲染都会新增表格：body 子树观察器兜底（现有各功能同款模式）
  void getConfig().then((cfg) => { enabled = cfg.features ? cfg.features.tableCopy !== false : true; }).catch(() => {});
  window.addEventListener('zcodepro:config-changed', () => {
    void getConfig(true).then((cfg) => { enabled = cfg.features ? cfg.features.tableCopy !== false : true; }).catch(() => {});
  });
  const observer = new MutationObserver(() => { if (enabled) scan(); });
  observer.observe(document.body, { childList: true, subtree: true });
}
