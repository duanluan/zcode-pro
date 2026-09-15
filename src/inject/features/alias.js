// 功能三：项目自定义别名——只改侧边栏渲染文本，不改动磁盘目录与任何 ZCode 数据。
// 存储：helper 的 zcodepro.json aliases 表（路径规范化无尾分隔符 → 名称）。
// 渲染：侧边栏项目行有唯一文本叶子 div.min-w-0.truncate（逆向确认），
// 按行 testid（workspace-item-<绝对路径>）查表替换；React 重渲染后由 MutationObserver 重新套用。
import { h, t, rpc, getConfig, clearConfigCache } from '../core.js';
import { openDialog, dialogFooter, btnPrimary, btnSecondary, textInput, showToast, ensureStyle } from '../ui.js';

const norm = (p) => String(p || '').replace(/[\\/]+$/, '');
const basenameOf = (p) => norm(p).split(/[\\/]/).pop() || '';

function extractPathFromTestId(testid) {
  let m = testid.match(/[-:=,|](\/.+)$/);
  if (m) return m[1];
  m = testid.match(/[-:=,|]([A-Za-z]:\\.*)$/);
  return m ? m[1] : null;
}

// —— 渲染替换 ——

let aliases = {};       // 规范化路径 → 别名（与 helper 配置同步）
let enabled = true;   // 功能总开关（关闭时还原真实名）
let observer = null;

export async function startAliasWatcher() {
  await syncFromConfig();
  if (observer) return;
  observer = new MutationObserver(() => scheduleApply());
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  applyAliass();
}

async function syncFromConfig() {
  const config = await getConfig();
  enabled = !(config.features && config.features.projectAlias === false);
  aliases = enabled ? (config.aliases || {}) : {};
}

let applyTimer = 0;
function scheduleApply() {
  clearTimeout(applyTimer);
  applyTimer = setTimeout(applyAliass, 60);
}

export function applyAliass() {
  const rows = document.querySelectorAll('[data-testid^="workspace-item-"]');
  for (const row of rows) {
    const path = norm(extractPathFromTestId(row.getAttribute('data-testid') || ''));
    if (!path) continue;
    // 行内唯一文本叶子即项目名元素
    const nameEl = [...row.querySelectorAll('*')].find((e) => e.children.length === 0 && e.textContent.trim());
    if (!nameEl) continue;
    const real = nameEl.textContent.trim();
    const want = aliases[path];
    if (want) {
      // 记录真实名，供清除别名时恢复（React 不重渲染也能还原）
      if (!row.dataset.zcodeproRealName) row.dataset.zcodeproRealName = real;
      if (real !== want) nameEl.textContent = want;
    } else if (row.dataset.zcodeproRealName) {
      nameEl.textContent = row.dataset.zcodeproRealName;
      delete row.dataset.zcodeproRealName;
    }
  }
}

export async function refreshAliases() {
  await syncFromConfig();
  applyAliass();
}

// —— 「更多」菜单入口 ——

export function appendAliasItem(menu, anchorItem, project) {
  if (menu.querySelector('[data-zcodepro-item="alias"]')) return;
  const L = t();
  const item = anchorItem.cloneNode(true);
  item.removeAttribute('data-testid');
  item.removeAttribute('data-highlighted');
  item.setAttribute('data-zcodepro-item', 'alias');
  for (const child of [...item.childNodes]) child.remove();
  const origIcon = anchorItem.querySelector('svg');
  const iconClass = origIcon ? origIcon.getAttribute('class') : 'h-3.5 w-3.5';
  item.append(hTagIcon(iconClass), document.createTextNode(L.aliasItem));
  item.addEventListener('mouseenter', () => {
    for (const el of menu.querySelectorAll('[role="menuitem"]')) el.removeAttribute('data-highlighted');
    item.setAttribute('data-highlighted', '');
  });
  item.addEventListener('mouseleave', () => item.removeAttribute('data-highlighted'));
  item.addEventListener('click', () => {
    try { menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true })); } catch { /* ignore */ }
    setTimeout(() => openAliasDialog(project), 80);
  });
  anchorItem.before(item);
}

function hTagIcon(cls) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', cls);
  const p = document.createElementNS(ns, 'path');
  // 标签（tag）图标
  p.setAttribute('d', 'M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z');
  svg.append(p);
  const c = document.createElementNS(ns, 'circle');
  c.setAttribute('cx', '7.5');
  c.setAttribute('cy', '7.5');
  c.setAttribute('r', '.5');
  c.setAttribute('fill', 'currentColor');
  svg.append(c);
  return svg;
}

// —— 弹窗 ——

export function openAliasDialog(project) {
  ensureStyle();
  const L = t();
  const current = aliases[norm(project.path)] || '';
  const realName = project.name || basenameOf(project.path);
  let submitting = false;

  openDialog({
    title: L.aliasTitle,
    description: L.aliasDesc,
    width: 'sm:max-w-md',
    onMount: ({ body, close }) => {
      const input = textInput({
        value: current || realName,
        placeholder: L.aliasPlaceholder,
        onEnter: () => submit(),
      });
      const submitBtn = btnPrimary(L.aliasConfirm, () => submit(), 'min-w-24');
      const submit = async () => {
        if (submitting) return;
        const name = input.value.trim();
        if (name && name === current) { close(); return; }
        submitting = true;
        submitBtn.setAttribute('disabled', 'true');
        const res = await rpc('/project/alias', {
          method: 'POST',
          body: { path: project.path, alias: name === realName ? '' : name },
        });
        submitting = false;
        submitBtn.removeAttribute('disabled');
        if (res.ok) {
          close();
          clearConfigCache();
          await refreshAliases();
          showToast(name ? L.aliasSaved : L.aliasCleared);
          return;
        }
        showToast((L.failed) + ': ' + (res.error || L.retryHint), 'error');
      };

      body.append(
        h('div', { class: 'space-y-3' },
          h('div', {},
            h('div', { class: 'mb-1.5 text-ui-sm font-medium text-foreground' }, L.aliasLabel),
            input),
          h('div', {},
            h('div', { class: 'mb-1 text-ui-xs text-foreground-subtle' }, L.pathLabel),
            h('div', { class: 'break-all rounded-lg border border-border bg-surface-hover/50 px-3 py-1.5 font-mono text-ui-xs text-foreground-subtle' }, project.path)),
          h('p', { class: 'text-ui-xs/relaxed text-foreground-subtle' }, L.aliasHint)
        ),
        (() => {
          const footer = document.createElement('div');
          footer.className = 'mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end';
          if (current) {
            footer.append(btnSecondary(L.aliasClear, async () => {
              if (submitting) return;
              submitting = true;
              const res = await rpc('/project/alias', { method: 'POST', body: { path: project.path, alias: '' } });
              submitting = false;
              if (res.ok) {
                close();
                clearConfigCache();
                await refreshAliases();
                showToast(L.aliasCleared);
              } else showToast((L.failed) + ': ' + (res.error || L.retryHint), 'error');
            }));
          }
          footer.append(btnSecondary(L.cancel, () => close()), submitBtn);
          return footer;
        })()
      );
    },
  });
}
