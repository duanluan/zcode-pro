// 「切换文件夹」：把项目记录（侧边栏条目/标签页/任务历史）重新指向另一个已存在的文件夹。
// 不移动、不修改任何目录；本地任务索引与 setting.json 的路径引用同步更新，会话不丢失。
import { h, t, rpc, getConfig, closeRadixMenu, itemsOf, itemText } from '../core.js';
import { openDialog, dialogFooter, btnPrimary, btnSecondary, textInput, showToast, ensureStyle } from '../ui.js';

export function appendRelocateItem(menu, anchorItem, project) {
  if (menu.querySelector('[data-zcodepro-item="relocate"]')) return;
  const L = t();
  const item = anchorItem.cloneNode(true);
  item.removeAttribute('data-testid');
  item.removeAttribute('data-highlighted');
  item.setAttribute('data-zcodepro-item', 'relocate');
  for (const child of [...item.childNodes]) child.remove();
  const origIcon = anchorItem.querySelector('svg');
  const iconClass = origIcon ? origIcon.getAttribute('class') : 'h-3.5 w-3.5';
  item.append(hMoveIcon(iconClass), document.createTextNode(L.relocateItem));
  item.addEventListener('mouseenter', () => {
    for (const el of menu.querySelectorAll('[role="menuitem"]')) el.removeAttribute('data-highlighted');
    item.setAttribute('data-highlighted', '');
  });
  item.addEventListener('mouseleave', () => item.removeAttribute('data-highlighted'));
  item.addEventListener('click', () => {
    closeRadixMenu(menu);
    setTimeout(() => openRelocateDialog(project), 80);
  });
  anchorItem.before(item);
}

function hMoveIcon(cls) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', cls);
  // 双向箭头（arrow-right-left）：位置指向的变更
  for (const d of ['m16 3 4 4-4 4', 'M20 7H4', 'm8 21-4-4 4-4', 'M4 17h16']) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

export function openRelocateDialog(project) {
  ensureStyle();
  const L = t();
  let submitting = false;

  openDialog({
    title: L.relocateTitle,
    description: L.relocateDesc,
    width: 'sm:max-w-md',
    onMount: ({ body, close }) => {
      const errLine = h('div', { class: 'mt-2 hidden text-ui-sm text-destructive', 'data-zcodepro-error': '1' });
      const showError = (msg) => { errLine.textContent = msg; errLine.classList.remove('hidden'); };
      const input = textInput({ value: project.path, onEnter: () => submit() });
      const submitBtn = btnPrimary(L.relocateConfirm, () => submit(), 'min-w-24');

      // ZCode 自带的系统文件夹选择器（含“新建文件夹”）；不可用时不显示按钮
      const picker = typeof window !== 'undefined' && window.zcode && typeof window.zcode.selectDirectory === 'function'
        ? () => window.zcode.selectDirectory()
        : null;
      const browseBtn = picker ? h('button', {
        type: 'button',
        class: 'h-9 shrink-0 whitespace-nowrap rounded-lg border border-border bg-surface px-3 text-ui-sm font-medium text-foreground transition-colors hover:bg-surface-hover',
        onClick: async () => {
          browseBtn.setAttribute('disabled', 'true');
          try {
            const dir = await picker();
            if (dir) {
              input.value = dir;
              input.focus();
            }
          } catch { /* 选择器不可用 */ }
          browseBtn.removeAttribute('disabled');
        },
      }, L.browse) : null;

      const submit = async () => {
        if (submitting) return;
        const newPath = input.value.trim();
        if (!newPath || newPath === project.path) { close(); return; }
        submitting = true;
        submitBtn.setAttribute('disabled', 'true');
        errLine.classList.add('hidden');
        const res = await rpc('/project/relocate', {
          method: 'POST',
          body: { path: project.path, newPath },
        });
        submitting = false;
        submitBtn.removeAttribute('disabled');
        if (res.ok) {
          close();
          showToast(res.indexSynced === false ? L.relocateIndexSkipped : L.relocateSuccess);
          setTimeout(() => location.reload(), 900);
          return;
        }
        const byCode = {
          'same-path': L.relocateSame,
          'new-not-found': L.relocateNotFound,
          'protected-path': L.relocateProtected,
          'index-busy': L.relocateIndexBusy,
        };
        showError(byCode[res.code] || L.failed + ': ' + (res.error || L.retryHint));
      };

      body.append(
        h('div', { class: 'space-y-3' },
          h('div', {},
            h('div', { class: 'mb-1.5 text-ui-sm font-medium text-foreground' }, L.relocateNewPathLabel),
            h('div', { class: 'flex gap-2' },
              h('div', { class: 'min-w-0 flex-1' }, input),
              browseBtn)),
          h('div', {},
            h('div', { class: 'mb-1 text-ui-xs text-foreground-subtle' }, L.pathLabel),
            h('div', { class: 'break-all rounded-lg border border-border bg-surface-hover/50 px-3 py-1.5 font-mono text-ui-xs text-foreground-subtle' }, project.path)),
          h('p', { class: 'text-ui-xs/relaxed text-foreground-subtle' }, L.relocateHint),
          errLine
        ),
        dialogFooter(btnSecondary(L.cancel, () => close()), submitBtn)
      );
    },
  });
}
