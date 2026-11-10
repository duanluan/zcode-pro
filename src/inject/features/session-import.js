// 设置弹窗的“导入会话”标签页：列出来源会话、筛选、多选导入。
import { h, t, rpc, errText } from '../core.js';
import { btnSmall, showToast } from '../ui.js';
import { findServices } from './ws-running.js';

const INPUT_CLS = 'h-8 w-full rounded-lg border border-border bg-input px-2.5 text-ui-sm text-foreground outline-none transition-shadow placeholder:text-foreground-subtle focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40';

function tag(text, title = '') {
  return h('span', { class: 'shrink-0 rounded border border-border px-1 text-ui-xs text-foreground-subtle', title: title || undefined }, text);
}

function when(ms) {
  if (!ms) return '';
  try { return new Date(ms).toLocaleString(); } catch { return ''; }
}

export function createSessionImportPane() {
  const L = t();
  const root = h('div', { role: 'tabpanel', style: 'display:none' });

  let sources = [];
  let active = '';
  let sessions = [];
  let selected = new Set();
  let projects = [];
  let projectId = '';
  let showAll = false;
  let onlyProject = false;
  let search = '';
  let loading = false;
  let importing = false;
  let loaded = false;
  let pendingReload = false;
  let searchTimer = null;

  const statusEl = h('div', { class: 'mt-2 min-h-4 text-ui-xs/relaxed text-foreground-subtle' });
  const listEl = h('div', { class: 'max-h-80 overflow-auto divide-y divide-border' });
  const sourceTabs = h('div', { role: 'tablist', 'aria-orientation': 'horizontal', class: 'zcodepro-tablist' });
  const searchInput = h('input', {
    type: 'text', class: INPUT_CLS + ' min-w-0 flex-1', placeholder: L.importSearch,
    spellcheck: 'false', autocomplete: 'off',
  });
  const projectSelect = h('select', { class: INPUT_CLS + ' min-w-0 max-w-56' });
  const onlyProjectBox = h('input', { type: 'checkbox' });
  const showAllBox = h('input', { type: 'checkbox', title: L.importShowAllTip });
  const selectAllBox = h('input', { type: 'checkbox' });
  const refreshBtn = btnSmall(L.importRefresh, () => { void loadList(); });
  const importBtn = btnSmall(L.importSelected.replace('{n}', '0'), () => { void doImport(); }, 'shrink-0', 'primary');
  importBtn.disabled = true;

  const setStatus = (text, kind = '') => {
    statusEl.textContent = text || '';
    statusEl.className = 'mt-2 min-h-4 text-ui-xs/relaxed '
      + (kind === 'error' ? 'text-destructive' : 'text-foreground-subtle');
  };

  const selectedProject = () => projects.find((p) => p.id === projectId) || null;
  const projectRoots = () => (selectedProject()?.roots || []).map((r) => r.path).filter(Boolean);

  // 侧边栏的任务树由页面里的控制器维护，直接写库不会通知它。导入完成后在 React
  // 树里找到持有 tree/factTree 的控制器，调用它的 refresh()，项目列表和“任务”
  // 区就会重新拉取；任务索引里已经写了 unread_at，原生未读蓝点随之出现。
  const refreshTaskTree = async () => {
    const rootEl = document.getElementById('root');
    const containerKey = rootEl && Object.keys(rootEl).find((k) => k.startsWith('__reactContainer$'));
    if (!containerKey) return false;
    const seen = new Set();
    let found = null;
    const scan = (o) => {
      if (!o || typeof o !== 'object' || seen.has(o) || found) return;
      seen.add(o);
      try {
        if (typeof o.refresh === 'function' && 'factTree' in o && 'tree' in o) found = o;
      } catch { /* ignore */ }
    };
    let visited = 0;
    const visit = (f) => {
      if (!f || found || visited > 60000) return;
      visited++;
      for (const h of [f.memoizedProps, f.memoizedState]) {
        if (!h || typeof h !== 'object') continue;
        scan(h);
        for (const v of Object.values(h)) if (v && typeof v === 'object') scan(v);
      }
      visit(f.child);
      visit(f.sibling);
    };
    visit(rootEl[containerKey]);
    if (!found) return false;
    try {
      await found.refresh();
      return true;
    } catch {
      return false;
    }
  };

  // 导入任务只写了库，对应会话的工作区没有准备过，任务列表服务里没有这个来源；
  // 用户点归档/置顶/未读时 mutation 会报“无法解析唯一 source”。导入后对每个
  // 来源工作区恢复一次会话，注册工作区，再做树刷新，让原生操作可用。
  const prepareWorkspaces = async (imported) => {
    const ag = findServices()?.zcodeAgentService;
    if (!ag || typeof ag.resumeSession !== 'function') return;
    const seen = new Set();
    for (const item of imported) {
      if (!item.workspace || seen.has(item.workspace)) continue;
      seen.add(item.workspace);
      try {
        await ag.resumeSession({ workspacePath: item.workspace, sessionId: item.taskId });
      } catch { /* 单个工作区准备失败不影响其他 */ }
    }
  };

  const renderSources = () => {
    sourceTabs.replaceChildren(...sources.filter((s) => s.available).map((s) => h('button', {
      type: 'button', role: 'tab', class: 'zcodepro-tab',
      'aria-selected': String(active === s.id),
      'data-state': active === s.id ? 'active' : 'inactive',
      disabled: !s.available,
      title: s.available ? '' : L.importSourceMissing,
      onClick: () => {
        if (!s.available || active === s.id) return;
        active = s.id;
        selected = new Set();
        sessions = [];
        renderSources();
        void loadList();
      },
    }, s.label)));
  };

  const selectable = () => sessions.filter((s) => !s.imported);
  const allSelected = () => {
    const list = selectable();
    return list.length > 0 && list.every((s) => selected.has(s.sessionId));
  };

  const renderList = () => {
    selectAllBox.checked = allSelected();
    selectAllBox.disabled = importing || !selectable().length;
    importBtn.textContent = L.importSelected.replace('{n}', String(selected.size));
    importBtn.disabled = importing || !selected.size;
    if (loading) {
      listEl.replaceChildren(h('div', { class: 'px-3 py-6 text-center text-ui-sm text-foreground-subtle' }, L.importLoading));
      return;
    }
    if (!sessions.length) {
      listEl.replaceChildren(h('div', { class: 'px-3 py-6 text-center text-ui-sm text-foreground-subtle' }, L.importNoSessions));
      return;
    }
    listEl.replaceChildren(...sessions.map((s) => {
      const checked = selected.has(s.sessionId);
      const box = h('input', {
        type: 'checkbox', class: 'mt-0.5 shrink-0', checked,
        disabled: importing || s.imported,
        onChange: () => {
          if (box.checked) selected.add(s.sessionId);
          else selected.delete(s.sessionId);
          renderList();
        },
      });
      const tags = [];
      if (s.imported) {
        tags.push(tag(
          s.importedArchived ? L.importAlreadyArchived : L.importAlready,
          s.importedArchived ? L.importArchivedTaskTip : '',
        ));
      }
      if (s.archived) tags.push(tag(L.importArchived));
      if (s.subagent) tags.push(tag(L.importSubagent));
      if (s.codexImport) tags.push(tag(L.importCodexCopy));
      if (s.large) tags.push(tag(L.importLarge));
      if (s.cwdExists === false) tags.push(tag(L.importCwdMissing));
      return h('label', {
        class: 'flex cursor-pointer items-start gap-2 px-3 py-2 transition-colors hover:bg-surface-hover',
        title: s.cwd || '',
      },
        box,
        h('div', { class: 'min-w-0 flex-1' },
          h('div', { class: 'truncate text-ui-sm' }, s.title || s.sessionId),
          h('div', { class: 'mt-0.5 flex items-center gap-2 overflow-hidden' },
            h('span', { class: 'min-w-0 flex-1 truncate text-ui-xs text-foreground-subtle' }, s.cwd || s.sourcePath || ''),
            h('span', { class: 'shrink-0 text-ui-xs text-foreground-subtle' }, when(s.updatedAt)),
            ...tags)));
    }));
  };

  const loadProjects = async () => {
    const res = await rpc('/projects-v2');
    projects = res.ok && Array.isArray(res.projects) ? res.projects : [];
    const current = projectId;
    projectSelect.replaceChildren(
      h('option', { value: '' }, L.importProjectNone),
      ...projects.map((p) => h('option', { value: p.id }, p.name || p.id)),
    );
    projectSelect.value = projects.some((p) => p.id === current) ? current : '';
    projectId = projectSelect.value;
    onlyProjectBox.disabled = !projectId;
    if (!projectId) { onlyProjectBox.checked = false; onlyProject = false; }
  };

  const loadList = async () => {
    if (loading || importing) { pendingReload = true; return; }
    loading = true;
    renderList();
    const done = () => {
      loading = false;
      if (pendingReload) {
        pendingReload = false;
        queueMicrotask(() => { void loadList(); });
      }
    };
    if (!sources.length || !sources.some((s) => s.id === active && s.available)) {
      const meta = await rpc('/import/list', { method: 'POST', body: { source: '' } });
      if (meta.ok && Array.isArray(meta.sources)) sources = meta.sources;
      if (!sources.some((s) => s.id === active && s.available)) {
        active = (sources.find((s) => s.available) || {}).id || '';
      }
      renderSources();
      if (!active) {
        sessions = [];
        done();
        renderList();
        setStatus(L.importNoSource);
        return;
      }
    }
    const res = await rpc('/import/list', {
      method: 'POST',
      body: {
        source: active, showAll, search,
        roots: onlyProject && projectId ? projectRoots() : [],
      },
    });
    if (!res.ok) {
      sessions = [];
      done();
      renderList();
      setStatus(errText(res), 'error');
      return;
    }
    sources = res.sources || sources;
    sessions = res.sessions || [];
    const usable = new Set(selectable().map((s) => s.sessionId));
    selected = new Set([...selected].filter((id) => usable.has(id)));
    if (!active || !sources.some((s) => s.id === active)) {
      active = (sources.find((s) => s.available) || {}).id || '';
    }
    done();
    renderSources();
    renderList();
    setStatus(res.unavailable ? L.importNoSource : '');
  };

  const doImport = async () => {
    if (importing || !selected.size) return;
    const chosen = sessions.filter((s) => selected.has(s.sessionId));
    if (!chosen.length) return;
    if (chosen.some((s) => s.large)) {
      if (!window.confirm(L.importConfirmLarge)) return;
    }
    importing = true;
    renderList();
    setStatus(L.importImporting);
    let summary = '';
    let summaryKind = '';
    try {
      const res = await rpc('/import/run', {
        method: 'POST',
        body: {
          source: active,
          projectId: projectId || null,
          items: chosen.map((s) => ({
            sessionId: s.sessionId, sourcePath: s.sourcePath, title: s.title, cwd: s.cwd,
          })),
        },
      });
      if (!res.ok) {
        setStatus(errText(res), 'error');
        showToast(L.importFailed + ': ' + errText(res), 'error');
        return;
      }
      const imported = Array.isArray(res.imported) ? res.imported : [];
      const skipped = Array.isArray(res.skipped) ? res.skipped : [];
      const failed = Array.isArray(res.failed) ? res.failed : [];
      const msg = L.importDone.replace('{ok}', String(imported.length))
        .replace('{skip}', String(skipped.length)).replace('{fail}', String(failed.length));
      const detail = failed.slice(0, 3).map((f) => `${f.sessionId}: ${f.error}`).join('; ');
      summary = msg + (detail ? ' · ' + detail : '');
      summaryKind = failed.length ? 'error' : '';
      showToast(msg, failed.length ? 'error' : 'success');
      if (imported.length) {
        void (async () => {
          await prepareWorkspaces(imported);
          await refreshTaskTree().catch(() => {});
        })();
      }
      selected = new Set();
    } finally {
      importing = false;
    }
    await loadList();
    setStatus(summary, summaryKind);
  };

  searchInput.addEventListener('input', () => {
    search = searchInput.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { void loadList(); }, 250);
  });
  projectSelect.addEventListener('change', () => {
    projectId = projectSelect.value;
    onlyProjectBox.disabled = !projectId;
    if (!projectId) { onlyProjectBox.checked = false; onlyProject = false; }
    void loadList();
  });
  onlyProjectBox.addEventListener('change', () => {
    onlyProject = onlyProjectBox.checked;
    void loadList();
  });
  showAllBox.addEventListener('change', () => {
    showAll = showAllBox.checked;
    selected = new Set();
    void loadList();
  });
  selectAllBox.addEventListener('change', () => {
    if (selectAllBox.checked) selected = new Set(selectable().map((s) => s.sessionId));
    else selected = new Set();
    renderList();
  });

  const checkLabel = (box, text, title = '') => h('label', { class: 'flex shrink-0 items-center gap-1.5 text-ui-xs text-foreground-subtle', title: title || undefined }, box, text);

  root.append(
    h('p', { class: 'text-ui-sm/relaxed text-foreground-subtle' }, L.importDesc),
    h('div', { class: 'mt-3' }, sourceTabs),
    h('div', { class: 'mt-2 flex flex-wrap items-center gap-2' },
      searchInput,
      projectSelect,
      checkLabel(onlyProjectBox, L.importOnlyProject),
      checkLabel(showAllBox, L.importShowAll, L.importShowAllTip),
      refreshBtn),
    h('div', { class: 'mt-2 flex items-center justify-between gap-2' },
      h('div', { class: 'flex items-center gap-2' },
        checkLabel(selectAllBox, L.importSelectAll),
        h('span', { class: 'text-ui-xs text-foreground-subtle' }, L.importProjectHint)),
      importBtn),
    h('div', { class: 'mt-2 rounded-xl border border-border' }, listEl),
    statusEl,
  );

  root.__onShow = () => {
    if (importing) return;
    if (!loaded) {
      loaded = true;
      setStatus(L.importLoading);
      void (async () => {
        await loadProjects();
        await loadList();
      })();
    } else {
      void loadList();
    }
  };

  return root;
}
