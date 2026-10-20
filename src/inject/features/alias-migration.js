// 别名迁移：3.16.1 起官方“编辑项目”支持修改项目名称，自定义别名功能停用；
// 本模块把 zcodepro.json 里已保存的别名引导写入官方项目名称。
// - 启动时满足条件（版本 >= 3.16.1、仍有别名、未曾处理过）弹一次性对话框；
//   “迁移所选”/“暂不迁移”都会记 migrations.aliasRenameDismissed，不再自动弹。
// - 设置页“功能”标签页放一张常驻卡片（仍有别名时显示），随时可重新打开对话框。
// - 自动迁移走官方界面：打开项目“更多”菜单 → 编辑项目 → 填名称 → 保存，
//   全程使用官方 testid（virtual-project-menu / -edit / -name / -save），
//   任一步超时即该项失败，不影响其余项；成功一项就从配置清掉一条别名。
import { h, t, rpc, getConfig, clearConfigCache, officialRenameSupported, isNewProjectSidebar } from '../core.js';
import { openDialog, btnPrimary, btnSecondary, btnSmall, showToast, ensureStyle } from '../ui.js';
import { findProjectRow, rowPath } from './ws-rows.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const basenameOf = (p) => String(p || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '';

function waitFor(getter, timeoutMs, step) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      let v = null;
      try { v = getter(); } catch { /* 取值异常按未就绪处理 */ }
      if (v) { resolve(v); return; }
      if (Date.now() - start >= timeoutMs) { reject(new Error(step)); return; }
      setTimeout(tick, 120);
    };
    tick();
  });
}

// React 受控输入赋值：原生 value setter 绕过 React 的合成属性，再派发 input 事件
function setReactInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(input.constructor.prototype, 'value')?.set
    || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('input-setter');
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

// 关掉还开着的官方弹层（菜单/对话框），Radix 在 document 上监听 Escape
function pressEscape() {
  try {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
  } catch { /* ignore */ }
}

async function markDismissed() {
  await rpc('/config', { method: 'POST', body: { migrations: { aliasRenameDismissed: true } } });
  clearConfigCache();
}

// 跨窗口锁：两个 ZCode 窗口同时启动时只有一个弹迁移对话框（localStorage 同源共享；
// 5 分钟过期，锁残留不会永久吞掉弹窗——设置页卡片始终可用）
const MIGRATE_LOCK_KEY = 'zcodepro:alias-migrate-lock';
const MIGRATE_LOCK_MS = 5 * 60_000;
function migrateLockFresh() {
  try {
    const at = Number(localStorage.getItem(MIGRATE_LOCK_KEY));
    return Number.isFinite(at) && Date.now() - at < MIGRATE_LOCK_MS;
  } catch { return false; }
}
function touchMigrateLock() {
  try { localStorage.setItem(MIGRATE_LOCK_KEY, String(Date.now())); } catch { /* ignore */ }
}

// 把一个别名写入官方项目名称。row 可能被 React 整体重渲染，全程按
// data-project-id 重新查询；路径匹配不到时按“官方名 = 目录名”兜底找行。
async function migrateOne(path, alias) {
  // 上一次失败的残留弹层（编辑对话框/菜单）先关掉，避免后续步骤匹配到旧元素
  if (document.querySelector('[data-testid="virtual-project-name"], [role="menu"]')) {
    pressEscape();
    await sleep(300);
  }
  let row = findProjectRow(path);
  if (!row) {
    // 按名兜底只认本地项目：远程分区可能撞名，误编辑远程项目
    const byName = [...document.querySelectorAll('section[data-project-id]')]
      .filter((el) => {
        const host = el.getAttribute('data-project-host');
        return (host === null || host === 'local') && el.getAttribute('data-project-name') === basenameOf(path);
      });
    if (byName.length === 1) row = byName[0];
  }
  if (!row) throw new Error('project-row');
  const projectId = row.getAttribute('data-project-id');
  const rowById = () => document.querySelector(`section[data-project-id="${CSS.escape(projectId)}"]`);

  try { row.scrollIntoView({ block: 'center' }); } catch { /* ignore */ }
  const trigger = await waitFor(
    () => rowById()?.querySelector('[data-testid="virtual-project-menu"]'),
    4000, 'menu-trigger'
  );
  // Radix 触发器监听 pointerdown（纯合成 click 打不开菜单，实测 3.16.1），派发完整指针序列
  trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0 }));
  trigger.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0 }));
  trigger.click();
  const menu = await waitFor(() => {
    for (const m of document.querySelectorAll('[role="menu"]')) {
      if (m.querySelector('[data-testid="virtual-project-edit"]')) return m;
    }
    return null;
  }, 4000, 'menu-open');
  menu.querySelector('[data-testid="virtual-project-edit"]').click();

  const input = await waitFor(
    () => document.querySelector('[data-testid="virtual-project-name"]'),
    5000, 'editor-open'
  );
  // 官方保存时按 name.trim() 写入数据库，这里先 trim 再填入，校验标准才一致
  const wantName = alias.trim();
  setReactInputValue(input, wantName);
  const save = await waitFor(
    () => {
      const btn = document.querySelector('[data-testid="virtual-project-save"]');
      return btn && !btn.disabled ? btn : null;
    },
    4000, 'save-ready'
  );
  save.click();

  await waitFor(() => {
    const r = rowById();
    return r && r.getAttribute('data-project-name') === wantName ? r : null;
  }, 8000, 'name-updated');
  // 保存成功后编辑对话框通常会自行关闭；个别情况仍开着时补一个 Escape
  await sleep(250);
  if (document.querySelector('[data-testid="virtual-project-name"]')) pressEscape();

  // 成功：从 zcodepro.json 清掉这条别名（失败保留，设置页卡片可重试）
  const res = await rpc('/project/alias', { method: 'POST', body: { path, alias: '' } });
  if (!res.ok) throw new Error('alias-clear');
}

// —— 迁移对话框（启动时与设置页卡片共用） ——

// 预判一条别名的目标项目现状：
// - done：现存项目官方名已是该别名（用户已手动迁移过），默认跳过
// - merged：路径是某现存项目的附加目录（3.16.1 多目录合并），默认跳过——把别名
//   写上去会覆盖那个项目的名字
// - deleted：项目真删除过（数据库软删除标记）
// - missing：路径不在任何项目里（典型：旧机器路径，目录本机不存在）
// - ''：路径是某现存项目的主目录且官方名不同，可直接迁移；项目名是用户手动
//   改过的（name_overridden）时附 overridden=true，默认不勾（尊重用户手改的名字）
// 优先用 helper 的 /projects-v2（任务索引中的 projects/project_roots 表）；读不到时
// 降级为纯 DOM 检测（看不到附加目录与软删除标记，合并目录会误报 missing）
async function classifyEntry(path, alias, db) {
  const want = norm0(path);
  if (db) {
    let alsoDeleted = false;
    for (const proj of db.projects || []) {
      const hit = (proj.roots || []).find((r) => norm0(r.path) === want);
      if (!hit) continue;
      if (hit.primary) {
        if (proj.name === alias) return { state: 'done', note: '' };
        return { state: '', note: '', overridden: !!proj.overridden };
      }
      // 附加目录：并入现存项目；该路径同时可能还是已删除的独立项目（合并后删旧），
      // 两种状态都带回，徽标并排显示
      alsoDeleted = (db.deletedRoots || []).some((p) => norm0(p) === want);
      return { state: 'merged', note: proj.name, alsoDeleted };
    }
    if ((db.deletedRoots || []).some((p) => norm0(p) === want)) return { state: 'deleted', note: '' };
    return { state: 'missing', note: '' };
  }
  // —— DOM 降级路径 ——
  const localRows = [...document.querySelectorAll('section[data-project-id]')]
    .filter((el) => {
      const host = el.getAttribute('data-project-host');
      return host === null || host === 'local';
    });
  const byPath = localRows.find((el) => norm0(rowPath(el)) === want);
  if (byPath) {
    return (byPath.getAttribute('data-project-name') || '') === alias
      ? { state: 'done', note: '' }
      : { state: '', note: '' };
  }
  const byName = localRows.filter((el) => el.getAttribute('data-project-name') === alias);
  if (byName.length === 1) return { state: 'done', note: '' };
  // 目录被并入其他项目：该路径下的会话行出现在别的项目分区里
  for (const task of document.querySelectorAll('[data-task-item-key]')) {
    const key = task.getAttribute('data-task-item-key') || '';
    const cut = key.lastIndexOf(':');
    if (cut <= 1 || norm0(key.slice(0, cut)) !== want) continue;
    const owner = task.closest('section[data-project-id]');
    const ownerName = owner ? (owner.getAttribute('data-project-name') || '') : '';
    if (ownerName) return { state: 'merged', note: ownerName };
  }
  return { state: 'missing', note: '' };
}

// 拉取虚拟项目数据（失败返回 null，classifyEntry 走 DOM 降级）
async function fetchProjectDb() {
  const res = await rpc('/projects-v2');
  return res.ok && res.available ? res : null;
}

const norm0 = (p) => String(p || '').replace(/[\\/]+$/, '');

export function openMigrationDialog() {
  ensureStyle();
  const L = t();
  let running = false;
  // 无论点“迁移所选”、“暂不迁移”还是 Esc/点外部关闭，都记一次“已处理”，
  // 弹窗只打扰一次；RPC 失败则下次启动还可能再弹（可接受）。decide 保证只发一次。
  let decided = false;
  const decide = () => { if (decided) return; decided = true; void markDismissed(); };
  touchMigrateLock();

  openDialog({
    title: L.aliasMigrateTitle,
    description: L.aliasMigrateDesc,
    width: 'sm:max-w-md',
    // 迁移不可中途撤销且过程可见：点遮罩不关闭（防误触），右上角 ✕ 关闭
    dismissOnOutside: false,
    closable: true,
    onClose: () => {
      decide();
      // 设置页的迁移卡片据此重算（叠开场景下关闭弹窗后数字立即更新）
      window.dispatchEvent(new CustomEvent('zcodepro:aliases-changed'));
    },
    onMount: ({ body, close }) => {
      void (async () => {
        const config = await getConfig(true);
        const db = await fetchProjectDb();
        const entries = [];
        for (const [path, aliasRaw] of Object.entries(config.aliases || {})) {
          const alias = String(aliasRaw || '').trim();
          if (!alias) continue;
          const cls = await classifyEntry(path, alias, db);
          // 预分类结果放 state（'' 可迁移 / done / merged / deleted / missing），
          // 迁移过程中改写为 ok / fail。除“可直接迁移”外一律不可勾选：
          // 已并入的会把别名写到所属项目名上（覆盖现名），手改过名的迁移会
          // 覆盖用户改好的名字——都违背预期；要改项目名走官方“编辑项目”即可。
          // 手改项同样不默认勾选（disabled 且勾着会让“迁移所选”误覆盖）
          entries.push({
            path, alias,
            checked: cls.state === '' && !cls.overridden,
            state: cls.state, note: cls.note || '',
            overridden: !!cls.overridden,
            alsoDeleted: !!cls.alsoDeleted,
          });
        }
        if (!entries.length) { close(); return; }

        // 预分类徽标（行尾，可多个并排）：运行态（迁移中/已迁移/失败）+ 预分类
        //（已迁移绿 / 已并入琥珀 / 项目已删除、本机不存在、项目已重命名灰）
        const badgesOf = (e) => {
          const out = [];
          if (e.state === 'run') out.push({ text: L.aliasMigrateRunning, cls: 'text-amber-500' });
          if (e.state === 'ok') out.push({ text: L.aliasMigrateStateDone, cls: 'text-emerald-600' });
          if (e.state === 'fail') out.push({ text: L.aliasMigrateStateFailed, cls: 'text-destructive' });
          if (e.state === 'done') out.push({ text: L.aliasMigrateStateDone, cls: 'text-emerald-600' });
          if (e.state === 'merged') out.push({ text: L.aliasMigrateStateMerged.replace('{name}', e.note), cls: 'text-amber-500' });
          if (e.state === 'deleted' || (e.state === 'merged' && e.alsoDeleted)) out.push({ text: L.aliasMigrateStateDeleted, cls: 'text-foreground-subtle/70' });
          if (e.state === 'missing') out.push({ text: L.aliasMigrateStateMissing, cls: 'text-foreground-subtle/70' });
          if (e.state === '' && e.overridden) out.push({ text: L.aliasMigrateStateRenamed, cls: 'text-foreground-subtle/70' });
          return out;
        };
        // 别名多时列表自身滚动，避免撑爆视口；其上方一行迁移进度（迁移中显示）
        const progressEl = h('div', { class: 'mb-1 text-ui-xs text-foreground-subtle', style: 'display:none' });
        const listEl = h('div', { class: 'max-h-[50vh] space-y-1.5 overflow-y-auto' });
        // 失效条目（本机不存在 / 项目已删除）默认折叠成摘要行，可展开、可一键清除
        //——多来自设置同步带来的旧机器路径，正常迁移用不到它们
        let deadOpen = false;
        const renderList = () => {
          const alive = entries.filter((e) => e.state !== 'missing' && e.state !== 'deleted');
          const dead = entries.filter((e) => e.state === 'missing' || e.state === 'deleted');
          const rowOf = (e, deadRow) => {
            const cb = h('input', { type: 'checkbox' });
            cb.checked = e.checked;
            // 除“可直接迁移”（含失败重试）外一律禁勾；手改过名的可迁移项也禁勾
            cb.disabled = running || (e.state !== '' && e.state !== 'fail') || e.overridden;
            cb.addEventListener('change', () => { e.checked = cb.checked; });
            const badges = badgesOf(e);
            const dim = deadRow || (e.state !== '' && e.state !== 'fail' && e.state !== 'run') || e.overridden;
            return h('label', { class: 'flex cursor-pointer items-start gap-2 rounded-lg p-2 transition-colors hover:bg-surface-hover' + (dim ? ' opacity-60' : '') },
              h('span', { class: 'mt-0.5' }, cb),
              h('span', { class: 'min-w-0 flex-1' },
                h('span', { class: 'block truncate text-ui-sm font-medium text-foreground' }, e.alias),
                h('span', { class: 'block truncate font-mono text-ui-xs text-foreground-subtle' }, e.path)),
              ...badges.map((b) => h('span', { class: 'shrink-0 self-center text-ui-xs ' + b.cls }, b.text)));
          };
          const parts = alive.map((e) => rowOf(e, false));
          if (dead.length) {
            const deadRows = h('div', { class: 'space-y-1', style: deadOpen ? '' : 'display:none' },
              ...dead.map((e) => rowOf(e, true)));
            const toggle = h('button', {
              type: 'button',
              class: 'flex w-full items-center gap-1 rounded-lg p-2 text-left text-ui-xs text-foreground-subtle transition-colors hover:bg-surface-hover',
              onClick: () => { deadOpen = !deadOpen; renderList(); },
            }, (deadOpen ? '▾ ' : '▸ ') + L.aliasMigrateDeadSummary.replace('{n}', String(dead.length)));
            parts.push(toggle, deadRows);
          }
          listEl.replaceChildren(...parts);
        };
        renderList();
        // 一键清除失效条目：逐条写空别名（helper 端即删除该键），成功后从列表移除
        const clearDead = async () => {
          if (running) return;
          const dead = entries.filter((e) => e.state === 'missing' || e.state === 'deleted');
          if (!dead.length) return;
          running = true;
          goBtn.setAttribute('disabled', 'true');
          let ok = 0;
          for (const e of dead) {
            const r = await rpc('/project/alias', { method: 'POST', body: { path: e.path, alias: '' } });
            if (r.ok) { ok++; entries.splice(entries.indexOf(e), 1); }
          }
          running = false;
          goBtn.removeAttribute('disabled');
          goBtn.textContent = L.aliasMigrateGo;
          clearConfigCache();
          renderList();
          window.dispatchEvent(new CustomEvent('zcodepro:aliases-changed'));
          if (ok === dead.length) showToast(L.aliasMigrateDeadCleared.replace('{n}', String(ok)));
          else showToast(L.aliasMigrateDeadClearFailed, 'error');
        };

        const goBtn = btnPrimary(L.aliasMigrateGo, () => { void run(); }, 'min-w-24');
        const run = async () => {
          if (running) return;
          const todo = entries.filter((e) => e.checked);
          if (!todo.length) return;
          running = true;
          goBtn.setAttribute('disabled', 'true');
          goBtn.textContent = L.aliasMigrateRunning;
          let ok = 0;
          const failed = [];
          for (let i = 0; i < todo.length; i++) {
            const e = todo[i];
            progressEl.style.display = '';
            progressEl.textContent = L.aliasMigrateProgress.replace('{i}', String(i + 1)).replace('{n}', String(todo.length)).replace('{name}', e.alias);
            e.state = 'run';
            renderList();
            try {
              await migrateOne(e.path, e.alias);
              e.state = 'ok';
              e.checked = false;
              ok++;
            } catch (err) {
              // 步骤名（menu-open / save-ready…）进控制台，用户反馈时可定位卡在哪一步
              console.warn('[zcodepro] alias-migrate: ' + e.path + ' 失败于 ' + (err && err.message));
              e.state = 'fail';
              failed.push(e);
            }
            renderList();
          }
          running = false;
          progressEl.style.display = 'none';
          goBtn.removeAttribute('disabled');
          goBtn.textContent = L.aliasMigrateGo;
          decide();
          close();
          if (!failed.length) {
            showToast(L.aliasMigrateDone.replace('{n}', String(ok)), 'ok');
          } else if (ok) {
            showToast(L.aliasMigratePartial.replace('{n}', String(ok)).replace('{m}', String(failed.length)), 'error');
          } else {
            showToast(L.aliasMigrateAllFailed, 'error');
          }
        };

        body.append(
          progressEl,
          listEl,
          h('p', { class: 'text-ui-xs/relaxed text-foreground-subtle' }, L.aliasMigrateItemHint),
          (() => {
            const footer = document.createElement('div');
            footer.className = 'mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end';
            const hasDead = entries.some((e) => e.state === 'missing' || e.state === 'deleted');
            if (hasDead) {
              const clearBtn = btnSecondary(L.aliasMigrateClearDead, () => {
                void clearDead().then(() => {
                  if (!entries.some((e) => e.state === 'missing' || e.state === 'deleted')) clearBtn.style.display = 'none';
                });
              });
              footer.append(clearBtn);
            }
            footer.append(
              btnSecondary(L.aliasMigrateSkip, () => {
                if (running) return;
                decide();
                close();
              }),
              goBtn
            );
            return footer;
          })()
        );
      })();
    },
  });
}

// —— 设置页卡片（settings-dialog 在“功能”标签页插入） ——

export function migrationCard() {
  const L = t();
  const card = h('div', {
    class: 'flex items-center gap-2 rounded-lg p-2',
    'data-zcodepro-migration-card': '',
  });
  const render = (count) => {
    card.replaceChildren(
      h('div', { class: 'min-w-0 flex-1' },
        h('div', { class: 'text-ui-sm font-medium text-foreground' }, L.aliasMigrateCardName),
        h('div', { class: 'mt-0.5 text-ui-xs/relaxed text-foreground-subtle' },
          count === null ? '…' : L.aliasMigrateCardDesc.replace('{n}', String(count)))),
      btnSmall(L.aliasMigrateRun, () => { openMigrationDialog(); }));
  };
  render(null); // 先渲染占位（取到配置前不显示具体数字），无别名时整个卡片移除
  const refresh = async () => {
    const config = await getConfig(true);
    const db = await fetchProjectDb();
    let count = 0;
    for (const [p, a] of Object.entries(config.aliases || {})) {
      if (!String(a || '').trim()) continue;
      const cls = await classifyEntry(p, String(a).trim(), db);
      // 只数真正可迁移的：项目名已重命名的虽分类为可迁移但弹窗里禁勾，不计
      if (cls.state === '' && !cls.overridden) count++;
    }
    if (!count) { card.remove(); return; }
    render(count);
  };
  // 迁移弹窗（可叠在设置窗上）关闭或清除失效条目后，卡片立即重算——
  // 否则设置窗开着的期间数字是打开时的快照，与实际不一致。卡片随设置页
  // 标签切换会被整卡重建，监听器须随旧卡自我移除，否则逐次累积
  const onAliasesChanged = () => {
    if (!card.isConnected) {
      window.removeEventListener('zcodepro:aliases-changed', onAliasesChanged);
      return;
    }
    void refresh();
  };
  window.addEventListener('zcodepro:aliases-changed', onAliasesChanged);
  void refresh();
  return card;
}

// —— 启动检查 ——

export function startAliasMigrationWatcher() {
  // 版本读不到（如 asar 读取失败）时按 DOM 兜底：新侧栏在场即认为官方改名可用，
  // 与其他功能的判定条件一致
  if (!officialRenameSupported() && !isNewProjectSidebar()) return;
  void (async () => {
    try {
      const config = await getConfig();
      const hasAliases = Object.values(config.aliases || {}).some((a) => String(a || '').trim());
      if (!hasAliases) return;
      if (config.migrations && config.migrations.aliasRenameDismissed) return;
      // 等新侧栏就绪；多窗口场景只有可见且聚焦的窗口弹，其余窗口本次不弹。
      // 焦点等待放宽到 5 分钟：启动时用户常切在别的窗口，切回 ZCode 点一下即弹
      await waitFor(() => document.querySelector('section[data-project-id]'), 45000, 'sidebar');
      let focused = false;
      for (let i = 0; i < 600; i++) {
        if (document.visibilityState === 'visible' && document.hasFocus()) { focused = true; break; }
        await sleep(500);
      }
      if (!focused) return;
      // 其他窗口刚弹过（5 分钟内）：本窗口不再弹，由设置页卡片兜底
      if (migrateLockFresh()) return;
      // 已有 ZCode Pro 弹窗（如设置窗）打开时等它关闭，最多等 2 分钟
      await waitFor(() => (document.querySelector('.zcodepro-overlay') ? null : true), 120000, 'dialog-busy');
      // 弹之前按最新配置再核一次（可能刚在别的窗口迁移完/选择了暂不）
      const fresh = await getConfig(true);
      const still = Object.values(fresh.aliases || {}).some((a) => String(a || '').trim());
      if (still && !(fresh.migrations && fresh.migrations.aliasRenameDismissed)) openMigrationDialog();
    } catch { /* 等待超时等：本次不弹即可，不影响其他功能 */ }
  })();
}
