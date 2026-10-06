// “ZCode Pro 增强设置”弹窗：功能开关 + 样式调整 + 运行状态。
// 顶部标签页切换（视觉参考侧栏「分组/项目」切换）；配置写入 helper（~/.zcode/zcodepro.json）。
import { h, t, rpc, getConfig, clearConfigCache, errText, HELPER_URL } from '../core.js';
import { openDialog, dialogFooter, btnPrimary, btnSecondary, btnSmall, settingRow, ensureStyle, showToast, numberField, unitField } from '../ui.js';
import { refreshAliases } from './alias.js';
import { applyStyles, STYLE_DEFAULTS, showStyleHighlight, hideStyleHighlight } from './styles.js';
import { copyToClipboard, hCopyIcon } from './copy-path.js';

// 调宿主桥在系统浏览器打开外链；宿主没暴露该能力时静默忽略
function openExternal(url) {
  try { void window.zcode.openExternal(url); } catch { /* ignore */ }
}

// 本体升级交互（Headroom 的 pip 与 rtk 的 GitHub Releases 共用）：
// 检查更新 → 升级（helper 后台任务，轮询进度，输出取最后一行、超长省略中间）→
// 进行中可停止；关弹窗不中断升级，重开恢复显示。endpoint 为 /headroom 或 /rtk，
// metaRefresh 在升级完成后刷新各面板自己的版本行与配置。
function makeUpgradeControls({ endpoint, metaRefresh }) {
  const L = t();
  const state = h('span', { class: 'min-w-0 flex-1 truncate text-left text-ui-xs/relaxed text-foreground-subtle' });
  // 失败原因在状态行直显红字（toast 只有 5 秒且易被弹窗遮挡）
  const setState = (text, kind = '') => {
    state.textContent = text;
    state.className = 'min-w-0 flex-1 truncate text-left text-ui-xs/relaxed '
      + (kind === 'error' ? 'text-destructive' : 'text-foreground-subtle');
  };
  let latest = null;   // 检查到新版本时记录最新版号，按钮随即转为「升级」
  let busy = false;
  let timer = null;
  const stopPoll = () => { if (timer) { clearInterval(timer); timer = null; } };
  const lastLine = (out) => {
    const lines = String(out || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return lines[lines.length - 1] || '';
  };
  // 进度行只留一行：先去掉工具自带的结尾省略号，超长截中间——
  // 头部（动作+包名）和尾部（大小/百分比）信息量最大，配合样式 truncate 不挤压版本行
  const short = (line) => {
    const v = line.replace(/[.…]{3,}\s*$/, '').trimEnd();
    if (v.length <= 80) return v;
    return v.slice(0, 40) + '…' + v.slice(-39);
  };
  const btn = btnSmall(L.upgradeCheck, () => { void runCheck(); }, 'shrink-0');
  const runCancel = async () => {
    const res = await rpc(endpoint, { method: 'POST', body: { cancelUpgrade: true } });
    if (!res.ok) showToast(L.failed + ': ' + errText(res), 'error');
    // 收尾交给轮询：任务结束后 tick 会恢复按钮并提示「已停止升级」
  };
  const runUpgrade = async () => {
    if (busy) return;
    busy = true;
    const res = await rpc(endpoint, { method: 'POST', body: { upgrade: true } });
    busy = false;
    if (!res.ok) {
      btn.textContent = L.upgradeNow;
      showToast(L.failed + ': ' + errText(res), 'error');
      return;
    }
    pollStart();
  };
  const runCheck = async () => {
    if (busy) return;
    if (timer) { void runCancel(); return; } // 升级进行中：按钮此时是「停止升级」
    if (latest) { void runUpgrade(); return; }
    busy = true;
    btn.disabled = true;
    setState(L.upgradeChecking);
    const res = await rpc(endpoint, { method: 'POST', body: { checkUpdate: true } });
    busy = false;
    btn.disabled = false;
    if (!res.ok) {
      setState(L.upgradeCheckFailed, 'error');
      showToast(L.upgradeCheckFailed + ': ' + errText(res), 'error');
      return;
    }
    if (res.upToDate) {
      latest = null;
      setState(L.upgradeUpToDate.replaceAll('{v}', res.current || ''));
      return;
    }
    latest = res.latest;
    setState(L.upgradeFound.replaceAll('{v}', res.latest || ''));
    btn.textContent = L.upgradeNow;
  };
  const tick = async () => {
    const res = await rpc(endpoint + '/upgrade');
    if (!res.ok) {
      stopPoll();
      latest = null;
      busy = false;
      btn.disabled = false;
      btn.textContent = L.upgradeCheck;
      showToast(L.failed + ': ' + errText(res), 'error');
      return;
    }
    const snap = res.upgrade || {};
    if (snap.running) {
      setState(short(lastLine(snap.output)) || L.upgradeRunning);
      return;
    }
    stopPoll();
    latest = null;
    busy = false;
    btn.disabled = false;
    btn.textContent = L.upgradeCheck;
    if (snap.canceled) {
      setState(L.upgradeStopped);
      return;
    }
    if (snap.error) {
      setState(String(snap.error).split('\n')[0], 'error');
      showToast(L.failed + ': ' + String(snap.error).split('\n')[0], 'error');
      return;
    }
    setState(snap.version ? L.upgradeDone.replaceAll('{v}', snap.version) : L.upgradeFinished);
    showToast(state.textContent, 'success');
    await metaRefresh();
  };
  const pollStart = () => {
    stopPoll();
    // 升级中按钮转为「停止升级」，保持可点（点击即中止）
    btn.disabled = false;
    btn.textContent = L.upgradeStop;
    setState(L.upgradeRunning);
    timer = setInterval(() => { void tick(); }, 1500);
    void tick();
  };
  // 打开弹窗时若升级仍在后台跑，恢复进度显示（关闭弹窗不会中断升级）
  void (async () => {
    const res = await rpc(endpoint + '/upgrade');
    if (res.ok && res.upgrade && res.upgrade.running) pollStart();
  })();
  return { btn, state, stop: stopPoll };
}

export function openSettingsDialog() {
  ensureStyle();
  const L = t();
  // Headroom / rtk 升级进度轮询的停止句柄：面板代码在 onMount 里赋值，关弹窗时停掉
  let hrUpgradePollStop = null;
  let rtkUpgradePollStop = null;
  openDialog({
    title: L.settingsTitle,
    // 宽度类必须用宿主样式表已有的工具类（注入的类名不会生成 CSS）：
    // sm:max-w-3xl 不存在会失去约束拉满全屏；max-w-2xl=42rem 存在且尺寸合适
    width: 'max-w-2xl',
    overlay: 'none',
    draggable: true,
    posKey: 'settings',
    dismissOnOutside: false,
    onClose: () => {
      if (hrUpgradePollStop) hrUpgradePollStop();
      if (rtkUpgradePollStop) rtkUpgradePollStop();
    },
    onMount: async ({ body, close, content }) => {
      // 标题行：左侧「ZCode Pro」点击跳转 GitHub 仓库；右上角 X 关闭弹窗（替代底部按钮）。
      // h2 仍是拖拽把手——X 上阻止 mousedown 冒泡，避免点关闭时误触发拖拽
      const titleEl = content && content.firstElementChild;
      if (titleEl && titleEl.tagName === 'H2') {
        titleEl.classList.add('flex', 'w-full', 'items-center', 'justify-between');
        const ns = 'http://www.w3.org/2000/svg';
        const mkIcon = (paths, cls) => {
          const svg = h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
            'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: cls });
          for (const d of paths) {
            const p2 = document.createElementNS(ns, 'path');
            p2.setAttribute('d', d);
            svg.append(p2);
          }
          return svg;
        };
        const titleLeft = h('span', { class: 'flex min-w-0 items-center' }, L.settingsTitle);
        if (typeof window.zcode?.openExternal === 'function') {
          const REPO_URL = 'https://github.com/duanluan/zcode-pro';
          titleLeft.replaceChildren(
            h('span', {
              class: 'cursor-pointer underline-offset-4 hover:underline',
              title: REPO_URL,
              onClick: () => openExternal(REPO_URL),
            }, L.settingsTitle),
            mkIcon(['M15 3h6v6', 'M10 14 21 3', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'], 'ml-1 inline-block size-4 text-foreground-subtle'));
        }
        // 关闭按钮用文字字形 + 自有样式（.zcodepro-close）：SVG 描边在本应用内不可见
        const closeX = h('button', {
          type: 'button',
          class: 'zcodepro-close',
          title: L.close,
          'aria-label': L.close,
          onMousedown: (e) => { e.stopPropagation(); },
          onClick: () => { close(); },
        }, '✕');
        titleEl.replaceChildren(titleLeft, closeX);
      }
      const health = await rpc('/health');
      const config = await getConfig(true);
      const agentsRes = await rpc('/agents');
      const visionRes = await rpc('/vision');
      const visionProvidersRes = await rpc('/vision/providers');
      const rtkRes = await rpc('/rtk');
      const headroomRes = await rpc('/headroom');

      const setFeature = async (key, value) => {
        const res = await rpc('/config', { method: 'POST', body: { features: { [key]: value } } });
        clearConfigCache();
        // 通知常驻功能（如侧栏菜单并入顶栏）立即按新配置启用/停用
        window.dispatchEvent(new CustomEvent('zcodepro:config-changed'));
        if (!res.ok) {
          body.querySelector('[data-zcodepro-status]').replaceChildren(
            h('span', { class: 'text-ui-sm text-destructive' }, L.failed + ': ' + errText(res))
          );
          return false;
        }
        return true;
      };

      const statusLine = h('div', {
        class: 'flex items-center gap-2 text-ui-sm text-foreground-subtle',
        'data-zcodepro-status': '1',
      },
        h('span', { class: 'inline-block size-2 rounded-full bg-emerald-500' }),
        h('span', { class: 'text-foreground-subtle/70' }, `${L.version} ${health.version} · ${HELPER_URL}`)
      );

      const rows = h('div', { class: 'divide-y divide-border rounded-xl border border-border' });
      const refreshRows = () => {
        const f = config.features || {};
        rows.replaceChildren(
          settingRow(L.featureProjectMenu, L.featureProjectMenuDesc, f.projectMenu !== false, async () => {
            const next = !(f.projectMenu !== false);
            if (await setFeature('projectMenu', next)) f.projectMenu = next;
            refreshRows();
            // 关闭后立即还原真实名称；开启则按表重新渲染
            await refreshAliases();
          }),
          settingRow(L.featureTaskOrder, L.featureTaskOrderDesc, f.taskOrder !== false, async () => {
            const next = !(f.taskOrder !== false);
            if (await setFeature('taskOrder', next)) f.taskOrder = next;
            refreshRows();
          }),
          settingRow(L.featureSessionSwitch, L.featureSessionSwitchDesc, f.sessionSwitch !== false, async () => {
            const next = !(f.sessionSwitch !== false);
            if (await setFeature('sessionSwitch', next)) f.sessionSwitch = next;
            refreshRows();
          }),
          settingRow(L.featureWsRunning, L.featureWsRunningDesc, f.wsRunningSpin !== false, async () => {
            const next = !(f.wsRunningSpin !== false);
            if (await setFeature('wsRunningSpin', next)) f.wsRunningSpin = next;
            refreshRows();
          }),
          settingRow(L.featurePinnedCollapse, L.featurePinnedCollapseDesc, f.pinnedCollapse !== false, async () => {
            const next = !(f.pinnedCollapse !== false);
            if (await setFeature('pinnedCollapse', next)) f.pinnedCollapse = next;
            refreshRows();
          }),
          settingRow(L.featureFileActions, L.featureFileActionsDesc, f.fileActions !== false, async () => {
            const next = !(f.fileActions !== false);
            if (await setFeature('fileActions', next)) f.fileActions = next;
            refreshRows();
          }),
          settingRow(L.featureImageCopy, L.featureImageCopyDesc, f.imageCopy !== false, async () => {
            const next = !(f.imageCopy !== false);
            if (await setFeature('imageCopy', next)) f.imageCopy = next;
            refreshRows();
          }),
          settingRow(L.featurePinnedExpand, L.featurePinnedExpandDesc, f.pinnedKeepCollapsed !== false, async () => {
            const next = !(f.pinnedKeepCollapsed !== false);
            if (await setFeature('pinnedKeepCollapsed', next)) f.pinnedKeepCollapsed = next;
            refreshRows();
          }),
          settingRow(L.featureAutoUpdatePlugins, L.featureAutoUpdatePluginsDesc, f.autoUpdatePlugins === true, async () => {
            const next = !(f.autoUpdatePlugins === true);
            if (await setFeature('autoUpdatePlugins', next)) f.autoUpdatePlugins = next;
            refreshRows();
          }),
        );
      };
      refreshRows();

      // 底部交流卡片：QQ 群 + 微信群，同一行两列。
      // QQ 群点击用宿主 openExternal 打开系统浏览器（宿主没该能力时不出 QQ 卡）；
      // 微信群点击把微信号复制到剪贴板，不依赖宿主能力
      const WECHAT_ID = 'ai4only';
      const ns = 'http://www.w3.org/2000/svg';
      const extIcon = () => {
        const icon = h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
          'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
          class: 'size-4 shrink-0 text-foreground-subtle' });
        for (const d of ['M15 3h6v6', 'M10 14 21 3', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6']) {
          const p2 = document.createElementNS(ns, 'path');
          p2.setAttribute('d', d);
          icon.append(p2);
        }
        return icon;
      };
      const communityCard = (title, desc, icon, onClick) => h('div', {
        class: 'flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-border p-2 transition-colors hover:bg-surface-hover',
        onClick,
      },
        h('div', { class: 'min-w-0' },
          h('div', { class: 'truncate text-ui-sm font-medium text-foreground' }, title),
          h('div', { class: 'mt-0.5 truncate text-ui-xs/relaxed text-foreground-subtle' }, desc)),
        icon());
      const communityCards = h('div', { class: 'mt-3 grid grid-cols-2 gap-2' },
        ...(typeof window !== 'undefined' && typeof window.zcode?.openExternal === 'function'
          ? [communityCard(L.qqGroupTitle, L.qqGroupDesc, extIcon, () => openExternal('https://qm.qq.com/q/WXuISJK3ug'))]
          : []),
        communityCard(L.wechatGroupTitle, L.wechatGroupDesc.replaceAll('{id}', WECHAT_ID),
          () => hCopyIcon('size-4 shrink-0 text-foreground-subtle'),
          async () => {
            if (await copyToClipboard(WECHAT_ID)) showToast(L.wechatIdCopied);
          }));

      // 标签页切换：功能（现有内容）/ 样式调整 / 全局提示词 / 视觉代理
      let activeTab = 'features';
      // 插件更新卡片：显示 duanluan-zcode-plugins 市场状态，一键更新（helper /plugins/* 端点）；
      // 状态异步加载，打开弹窗不等待
      const pluginsStatusLine = h('span', { class: 'text-ui-xs/relaxed text-foreground-subtle' }, '…');
      const pluginsBtn = btnSmall(L.pluginsCheckNow, () => { void runPluginsUpdate(); });
      const runPluginsUpdate = async () => {
        pluginsBtn.disabled = true;
        pluginsStatusLine.textContent = L.pluginsUpdating;
        const res = await rpc('/plugins/update', { method: 'POST', body: { installMissing: true } });
        pluginsBtn.disabled = false;
        if (!res.ok) {
          pluginsStatusLine.textContent = '';
          showToast(L.pluginsUpdateFailed + ': ' + errText(res), 'error');
          return;
        }
        pluginsStatusLine.textContent = res.updated > 0
          ? L.pluginsUpdatedDone.replaceAll('{n}', String(res.updated))
          : L.pluginsUpToDate;
        showToast(pluginsStatusLine.textContent, 'success');
      };
      void (async () => {
        const res = await rpc('/plugins/status');
        if (!res.ok) { pluginsStatusLine.textContent = ''; return; }
        pluginsStatusLine.textContent = (res.updates || []).length > 0
          ? L.pluginsUpdatesFound.replaceAll('{n}', String(res.updates.length))
          : L.pluginsUpToDate;
      })();
      // 标题中的 zcode-plugins 可点击跳转插件市场仓库（依赖宿主 openExternal 打开系统浏览器）
      const PLUGINS_REPO_URL = 'https://github.com/duanluan/zcode-plugins';
      const repoName = 'zcode-plugins';
      const titleParts = L.pluginsUpdateTitle.split(repoName);
      const pluginsTitle = h('div', { class: 'truncate text-ui-sm font-medium text-foreground' });
      if (titleParts.length === 2 && typeof window.zcode?.openExternal === 'function') {
        pluginsTitle.append(titleParts[0],
          h('span', {
            class: 'cursor-pointer underline-offset-4 hover:underline',
            title: PLUGINS_REPO_URL,
            onClick: () => openExternal(PLUGINS_REPO_URL),
          }, repoName),
          titleParts[1]);
      } else {
        pluginsTitle.append(L.pluginsUpdateTitle);
      }
      const pluginsCard = h('div', { class: 'mt-3 flex items-center justify-between gap-2 rounded-xl border border-border p-2' },
        h('div', { class: 'min-w-0' },
          pluginsTitle,
          h('div', { class: 'mt-0.5 truncate text-ui-xs/relaxed text-foreground-subtle' }, pluginsStatusLine)),
        pluginsBtn);
      const paneFeatures = h('div', { role: 'tabpanel', class: 'mt-4' },
        h('div', {}, rows),
        pluginsCard,
        communityCards,
      );
      const paneStyles = h('div', { role: 'tabpanel', class: 'mt-4', style: 'display:none' });
      const paneAgents = h('div', { role: 'tabpanel', class: 'mt-4', style: 'display:none' });
      const paneProxy = h('div', { role: 'tabpanel', class: 'mt-4', style: 'display:none' });
      const paneVision = h('div', { role: 'tabpanel', class: 'mt-4', style: 'display:none' });
      const paneRtk = h('div', { role: 'tabpanel', class: 'mt-4', style: 'display:none' });
      const paneHeadroom = h('div', { role: 'tabpanel', class: 'mt-4', style: 'display:none' });
      const panes = { features: paneFeatures, styles: paneStyles, agents: paneAgents, proxy: paneProxy, vision: paneVision, headroom: paneHeadroom, rtk: paneRtk };
      const tabDefs = [
        ['features', L.tabFeatures],
        ['styles', L.tabStyles],
        ['agents', L.tabAgents],
        ['proxy', L.tabProxy],
        ['vision', L.tabVision],
        ['headroom', L.tabHeadroom],
        ['rtk', L.tabRtk],
      ];
      const tablist = h('div', { role: 'tablist', 'aria-orientation': 'horizontal', class: 'zcodepro-tablist mt-4' });
      const renderTabs = () => tablist.replaceChildren(...tabDefs.map(([id, label]) =>
        h('button', {
          type: 'button', role: 'tab', class: 'zcodepro-tab',
          'aria-selected': String(activeTab === id),
          'data-state': activeTab === id ? 'active' : 'inactive',
          onClick: () => switchTab(id),
        }, label)));
      const switchTab = (name) => {
        activeTab = name;
        for (const [id, pane] of Object.entries(panes)) pane.style.display = id === name ? '' : 'none';
        renderTabs();
      };
      renderTabs();

      // 「样式调整」：一行两项、相关项同行；无描述文字，悬停名称显示 tip；
      // 数字框滚轮/手输调节，改完即存即生效
      const savedStyles = config.styles || {};
      let saveTimer = null;
      const persistStyles = (partial) => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(async () => {
          const res = await rpc('/config', { method: 'POST', body: { styles: partial } });
          clearConfigCache();
          if (res.ok) applyStyles((res.config && res.config.styles) || savedStyles);
          else showToast(L.failed + ': ' + errText(res), 'error');
        }, 150);
      };
      // 聚焦预览接线：聚焦标出影响位置（取输入框当前值，打开弹窗后调过的值
      // 不在 savedStyles 快照里），调值提交时黄条随新值实时变宽变窄
      const bindHighlight = (field, key) => {
        field.el.addEventListener('focus', () => showStyleHighlight(key, field.get()));
        field.el.addEventListener('blur', () => hideStyleHighlight());
      };
      const styleCell = (name, tip, key, { min = 0, max = 48, step = 1, unit = 'px' } = {}) => {
        const field = numberField({
          value: typeof savedStyles[key] === 'number' ? savedStyles[key] : null,
          fallback: STYLE_DEFAULTS[key],
          min, max, step,
          onCommit: (v) => {
            persistStyles({ [key]: v });
            showStyleHighlight(key, v);
          },
        });
        bindHighlight(field, key);
        return {
          field,
          el: h('div', { class: 'flex items-center justify-between gap-2 p-2' },
            h('span', { class: 'min-w-0 truncate text-ui-sm font-medium text-foreground', title: tip }, name),
            h('span', { class: 'flex shrink-0 items-center gap-1' }, field.el,
              h('span', { class: 'w-3 text-ui-xs text-foreground-subtle' }, unit))),
        };
      };
      // 内容宽度：数值+单位同框（px/%），交互参考 gemini-pro。
      // 默认值不是固定数——应用按窗口宽度自适应，打开弹窗时实测当前内容列宽度作为默认显示。
      const column = document.querySelector('[data-v4-timeline-content-column]');
      const currentWidth = column ? Math.round(column.getBoundingClientRect().width) : 0;
      const widthField = unitField({
        value: savedStyles.contentWidth || null,
        fallback: { value: currentWidth > 0 ? currentWidth : 1152, unit: 'px' },
        onCommit: (v) => persistStyles({ contentWidth: v }),
      });
      bindHighlight(widthField, 'contentWidth');
      const widthCell = {
        field: widthField,
        el: h('div', { class: 'flex items-center justify-between gap-2 p-2' },
          h('span', { class: 'min-w-0 truncate text-ui-sm font-medium text-foreground', title: L.contentWidthDesc }, L.contentWidthName),
          widthField.el),
      };
      // 单元格上下/左右边距：一行两个输入框（先上下后左右）
      const cellPadField = (key) => numberField({
        value: typeof savedStyles[key] === 'number' ? savedStyles[key] : null,
        fallback: STYLE_DEFAULTS[key],
        min: 0, max: 24, step: 1,
        onCommit: (v) => { persistStyles({ [key]: v }); showStyleHighlight(key, v); },
      });
      const cellPadV = cellPadField('tableCellPaddingV');
      const cellPadH = cellPadField('tableCellPaddingH');
      bindHighlight(cellPadV, 'tableCellPaddingV');
      bindHighlight(cellPadH, 'tableCellPaddingH');
      const cellPadCell = {
        field: { reset() { cellPadV.reset(); cellPadH.reset(); } },
        el: h('div', { class: 'flex items-center justify-between gap-2 p-2' },
          h('span', { class: 'min-w-0 truncate text-ui-sm font-medium text-foreground', title: L.tableCellPaddingDesc }, L.tableCellPaddingName),
          h('span', { class: 'flex shrink-0 items-center gap-1' },
            cellPadV.el, h('span', { class: 'text-ui-xs text-foreground-subtle' }, '/'),
            cellPadH.el, h('span', { class: 'w-3 text-ui-xs text-foreground-subtle' }, 'px'))),
      };
      const cells = [
        styleCell(L.sidebarProjectSpacingName, L.sidebarProjectSpacingDesc, 'sidebarProjectSpacing', { max: 24 }),
        styleCell(L.sidebarTaskSpacingName, L.sidebarTaskSpacingDesc, 'sidebarTaskSpacing', { max: 24 }),
        widthCell,
        styleCell(L.rowGapName, L.rowGapDesc, 'rowGap'),
        styleCell(L.userLineHeightName, L.userLineHeightDesc, 'userLineHeight', { min: 1, max: 3, step: 0.05, unit: 'x' }),
        styleCell(L.lineHeightName, L.lineHeightDesc, 'lineHeight', { min: 1, max: 3, step: 0.05, unit: 'x' }),
        styleCell(L.codeLineHeightName, L.codeLineHeightDesc, 'codeLineHeight', { min: 1, max: 3, step: 0.05, unit: 'x' }),
        styleCell(L.listSpacingName, L.listSpacingDesc, 'listSpacing'),
        styleCell(L.listItemSpacingName, L.listItemSpacingDesc, 'listItemSpacing'),
        styleCell(L.quoteCodeSpacingName, L.quoteCodeSpacingDesc, 'quoteCodeSpacing'),
        styleCell(L.tableSpacingName, L.tableSpacingDesc, 'tableSpacing'),
        cellPadCell,
      ];
      // 「侧栏菜单并入顶栏」开关放在样式页（属界面布局调整，存仍是 features 配置）；
      // 切换后重渲本行让开关状态即时反映
      const toolbarSwitchWrap = h('div');
      const renderToolbarSwitch = () => {
        const f = config.features || {};
        toolbarSwitchWrap.replaceChildren(settingRow(L.featureToolbarIcons, L.featureToolbarIconsDesc, f.toolbarIcons !== false, async () => {
          const next = !(f.toolbarIcons !== false);
          if (await setFeature('toolbarIcons', next)) f.toolbarIcons = next;
          renderToolbarSwitch();
        }));
      };
      renderToolbarSwitch();
      paneStyles.append(
        toolbarSwitchWrap,
        h('div', { class: 'mt-2 grid grid-cols-2 gap-2 rounded-xl border border-border p-1' },
          ...cells.map((c) => h('div', { class: 'rounded-lg transition-colors hover:bg-surface-hover' }, c.el))),
        h('div', { class: 'mt-2 flex justify-end' },
          btnSmall(L.resetDefault, () => {
            for (const c of cells) c.field.reset();
            persistStyles(Object.fromEntries(Object.keys(STYLE_DEFAULTS).map((k) => [k, null])));
          })),
      );

      // 「全局提示词」：编辑 ~/.zcode/AGENTS.md（helper /agents 端点读写）。
      // 大段文本不做即存即生效——显式保存；未修改时保存按钮禁用
      const agentsArea = h('textarea', {
        class: 'zcodepro-textarea',
        placeholder: L.agentsPlaceholder,
        spellcheck: 'false',
      });
      const agentsSaveBtn = btnSmall(L.agentsSave, () => { void saveAgents(); }, '', 'primary');
      let agentsOriginal = '';
      let agentsFailed = false;
      if (agentsRes.ok) {
        agentsOriginal = agentsRes.content || '';
        agentsArea.value = agentsOriginal;
      } else {
        agentsFailed = true;
        agentsArea.disabled = true;
      }
      agentsSaveBtn.disabled = true;
      agentsArea.addEventListener('input', () => {
        agentsSaveBtn.disabled = agentsFailed || agentsArea.value === agentsOriginal;
      });
      const saveAgents = async () => {
        agentsSaveBtn.disabled = true;
        const res = await rpc('/agents', { method: 'POST', body: { content: agentsArea.value } });
        if (res.ok) {
          agentsOriginal = typeof res.content === 'string' ? res.content : agentsArea.value;
          showToast(L.agentsSaved);
        } else {
          showToast(L.failed + ': ' + errText(res), 'error');
          agentsSaveBtn.disabled = false;
        }
      };
      paneAgents.append(
        h('p', { class: 'text-ui-sm/relaxed text-foreground-subtle' }, L.agentsDesc),
        ...(agentsFailed
          ? [h('p', { class: 'mt-2 text-ui-sm text-destructive' }, L.agentsLoadFailed + ': ' + errText(agentsRes))]
          : []),
        h('div', { class: 'mt-3' }, agentsArea),
        h('div', { class: 'mt-3 flex justify-end' }, agentsSaveBtn),
      );

      // 「代理」：为 helper 发起的网络访问（插件市场更新/安装、headroom 本体升级）设
      // HTTP 代理；保存即生效（helper 子进程环境变量注入），不影响 ZCode 应用与模型请求。
      // 「检测」经 curl -x 走代理访问 GitHub / PyPI，测输入框当前的地址（可先测再存）
      const savedProxy = typeof config.proxy === 'string' ? config.proxy : '';
      const proxyInputCls = 'h-8 w-full rounded-lg border border-border bg-input px-2.5 text-ui-sm text-foreground outline-none transition-shadow placeholder:text-foreground-subtle focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40';
      const proxyInput = h('input', { type: 'text', value: savedProxy, placeholder: L.proxyPlaceholder, spellcheck: 'false', class: proxyInputCls + ' min-w-0 flex-1' });
      const proxySaveBtn = btnSmall(L.proxySave, () => { void saveProxy(); }, 'shrink-0', 'primary');
      let proxyOriginal = savedProxy;
      proxySaveBtn.disabled = true;
      proxyInput.addEventListener('input', () => {
        proxySaveBtn.disabled = proxyInput.value.trim() === proxyOriginal;
      });
      const saveProxy = async () => {
        proxySaveBtn.disabled = true;
        const res = await rpc('/config', { method: 'POST', body: { proxy: proxyInput.value.trim() } });
        if (res.ok) {
          proxyOriginal = res.config && typeof res.config.proxy === 'string' ? res.config.proxy : proxyInput.value.trim();
          proxyInput.value = proxyOriginal;
          showToast(L.proxySaved);
        } else {
          proxySaveBtn.disabled = false;
          showToast(L.failed + ': ' + errText(res), 'error');
        }
      };
      const proxyTestState = h('p', { class: 'mt-2 text-ui-xs/relaxed text-foreground-subtle' });
      let proxyTesting = false;
      const proxyTestBtn = btnSmall(L.proxyTest, () => { void runProxyTest(); }, 'shrink-0');
      const runProxyTest = async () => {
        if (proxyTesting) return;
        proxyTesting = true;
        proxyTestBtn.disabled = true;
        proxyTestBtn.textContent = L.proxyTesting;
        proxyTestState.textContent = '';
        proxyTestState.className = 'mt-2 text-ui-xs/relaxed text-foreground-subtle';
        const res = await rpc('/proxy/test', { method: 'POST', body: { proxy: proxyInput.value.trim() } });
        proxyTesting = false;
        proxyTestBtn.disabled = false;
        proxyTestBtn.textContent = L.proxyTest;
        if (!res.ok) {
          proxyTestState.className = 'mt-2 text-ui-xs/relaxed text-destructive';
          proxyTestState.textContent = L.proxyTestFailed + ': ' + errText(res);
          return;
        }
        const parts = (res.targets || []).map((t) =>
          `${t.name} ${t.ok ? '✓ ' + (t.ms != null ? t.ms + 'ms' : '') : '✗ ' + (t.error || t.httpCode || '')}`.trim());
        const allOk = (res.targets || []).length > 0 && (res.targets || []).every((t) => t.ok);
        proxyTestState.className = 'mt-2 text-ui-xs/relaxed ' + (allOk ? 'text-foreground-subtle' : 'text-amber-500');
        proxyTestState.textContent = `${res.proxy}：${parts.join(' · ')}`;
      };
      paneProxy.append(
        h('p', { class: 'text-ui-sm/relaxed text-foreground-subtle' }, L.proxyDesc),
        h('div', { class: 'mt-3 flex items-center gap-2' },
          proxyInput,
          proxySaveBtn,
          proxyTestBtn),
        h('p', { class: 'mt-2 text-ui-xs/relaxed text-foreground-subtle' }, L.proxyHint),
        proxyTestState,
      );

      // 「视觉代理」：编辑 ~/.zcode/zcode-vision.json（zcode-vision 插件与 /vision-* 命令共用同一文件）。
      // 代理列表顺序即执行链；结构性改动（开关/模式/排序/删增）即时保存，文本输入防抖保存。
      // 注意：保存时链按全部代理重建——若用 /vision-chain 配过子集链，会被这里覆盖（两套入口语义如此，面板以列表为准）。
      // 默认两级链与 zcode-vision 插件 DEFAULT_CONFIG 保持一致：glm-session（跟随会话）→ glm-flash（GLM 订阅直连）。
      // 赠送额度级 trust-build 暂不进默认：ZCode 网关不放行无人值守调用（ADR-0002）。
      const VISION_DEFAULT_PROMPT = '请详细描述这张图片的全部内容。若是界面或图表截图，请先把所有错误、警告、异常状态逐字引用出来（含完整原文），再描述整体布局、文字与关键数据。';
      const VISION_DEFAULT_CFG = {
        enabled: true,
        chainMode: 'fallback',
        chain: ['glm-session', 'glm-flash'],
        proxies: [
          { name: 'glm-session', useProvider: 'session', model: 'glm-5.3-flash', prompt: VISION_DEFAULT_PROMPT },
          { name: 'glm-flash', baseUrl: 'https://open.bigmodel.cn/api/anthropic', model: 'glm-5.3-flash', apiKey: '', format: 'anthropic', prompt: VISION_DEFAULT_PROMPT },
        ],
        pollMs: 3000,
        apiTimeoutMs: 120000, // 视觉上游冷启动可能近 2 分钟，与插件 DEFAULT_CONFIG 一致
        compressThresholdKB: 1024,
        skipAfterFailures: 4,
        skipMinutes: 30,
        forceIntercept: true,
      };
      // 供应商下拉数据：合并 zcode 两张供应商表（config.json 的 provider 与 provider_config.json 的 providerRules）
      const visionProviders = visionProvidersRes.ok && Array.isArray(visionProvidersRes.providers) ? visionProvidersRes.providers : [];
      let visionCfg = visionRes.ok && visionRes.config && typeof visionRes.config === 'object'
        ? structuredClone(visionRes.config)
        : null;
      let visionSaveTimer = null;
      const persistVision = async () => {
        visionCfg.chain = visionCfg.proxies.map((p) => (p.name || '').trim()).filter(Boolean);
        const res = await rpc('/vision', { method: 'POST', body: { config: visionCfg } });
        if (!res.ok) showToast(L.failed + ': ' + errText(res), 'error');
        return res.ok;
      };
      const saveVisionSoon = () => {
        clearTimeout(visionSaveTimer);
        visionSaveTimer = setTimeout(() => { void persistVision(); }, 500);
      };
      const visionTestPre = h('pre', {
        class: 'mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-surface p-2 text-ui-xs text-foreground-subtle',
        style: 'display:none',
      });
      const visionInputCls = 'h-8 w-full rounded-lg border border-border bg-input px-2.5 text-ui-sm text-foreground outline-none transition-shadow placeholder:text-foreground-subtle focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40';
      const renderVision = () => {
        if (!visionCfg) {
          const initBtn = btnSmall(L.visionAddProxy, async () => {
            const res = await rpc('/vision', { method: 'POST', body: { config: VISION_DEFAULT_CFG } });
            if (res.ok) { visionCfg = structuredClone(res.config); renderVision(); }
            else showToast(L.failed + ': ' + errText(res), 'error');
          });
          paneVision.replaceChildren(
            h('p', { class: 'text-ui-sm/relaxed text-foreground-subtle' }, L.visionDesc),
            ...(visionRes.ok ? [] : [h('p', { class: 'mt-2 text-ui-sm text-destructive' }, L.visionLoadFailed + ': ' + errText(visionRes))]),
            h('div', { class: 'mt-3 flex justify-end' }, initBtn),
          );
          return;
        }
        const field = (labelText, node) => h('label', { class: 'block min-w-0' },
          h('span', { class: 'mb-1 block text-ui-xs font-medium text-foreground-subtle' }, labelText), node);
        const smallBtn = (text, onClick, extra = '') => btnSmall(text, onClick, extra);
        const modeBtn = (id, label, desc) => h('button', {
          type: 'button',
          class: 'zcodepro-tab',
          'data-state': visionCfg.chainMode === id ? 'active' : 'inactive',
          title: desc,
          onClick: () => { visionCfg.chainMode = id; void persistVision(); renderVision(); },
        }, label);
        const textIn = (value, onInput, { type = 'text', placeholder = '' } = {}) => {
          const n = h('input', { type, value: value || '', placeholder, class: visionInputCls });
          n.addEventListener('input', () => onInput(n.value));
          return n;
        };
        const numIn = (value, { min, dflt, title, label, commit }) => {
          const n = h('input', { type: 'number', min: String(min), step: '1', title,
            class: 'h-7 w-16 rounded-lg border border-border bg-input px-2 text-right text-ui-xs tabular-nums text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40' });
          n.value = String(Number.isFinite(value) ? value : dflt);
          n.addEventListener('change', () => {
            const v = Math.max(min, Math.round(Number(n.value) || 0));
            n.value = String(v);
            commit(v);
            void persistVision();
          });
          return h('label', { class: 'flex shrink-0 items-center gap-1.5', title },
            h('span', { class: 'text-ui-xs font-medium text-foreground-subtle' }, label), n);
        };
        const cards = visionCfg.proxies.map((p, i) => h('div', { class: 'mt-2 rounded-xl border border-border p-2' },
          h('div', { class: 'flex flex-wrap items-center gap-2' },
            h('span', { class: 'shrink-0 rounded-md bg-surface px-1.5 py-0.5 text-ui-xs tabular-nums text-foreground-subtle' }, String(i + 1)),
            // 名称输入框用 flex-1 占剩余宽度，与序号同行；textIn 的 w-full 会把序号挤成单独一行
            (() => {
              const n = h('input', { type: 'text', value: p.name || '', placeholder: L.visionName, class: visionInputCls + ' min-w-0 flex-1' });
              n.addEventListener('input', () => { p.name = n.value; saveVisionSoon(); });
              return n;
            })(),
            (() => {
              const sel = h('select', { class: 'h-7 shrink-0 rounded-lg border border-border bg-input px-1.5 text-ui-xs text-foreground outline-none' },
                h('option', { value: 'anthropic' }, 'anthropic'),
                h('option', { value: 'openai' }, 'openai'));
              sel.value = p.format === 'openai' ? 'openai' : 'anthropic';
              sel.addEventListener('change', () => { p.format = sel.value; void persistVision(); });
              return sel;
            })(),
            smallBtn(L.visionMoveUp, () => {
              if (i <= 0) return;
              visionCfg.proxies.splice(i - 1, 0, visionCfg.proxies.splice(i, 1)[0]);
              void persistVision(); renderVision();
            }, i === 0 ? 'pointer-events-none opacity-40' : ''),
            smallBtn(L.visionMoveDown, () => {
              if (i >= visionCfg.proxies.length - 1) return;
              visionCfg.proxies.splice(i + 1, 0, visionCfg.proxies.splice(i, 1)[0]);
              void persistVision(); renderVision();
            }, i === visionCfg.proxies.length - 1 ? 'pointer-events-none opacity-40' : ''),
            smallBtn(L.visionRemove, () => { visionCfg.proxies.splice(i, 1); void persistVision(); renderVision(); }),
          ),
          h('div', { class: 'mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2' },
            field(L.visionUseProvider, (() => {
              // 组合框：下拉（不跟随/session/全部供应商）+ 手动输入；手输失焦校验，未知供应商给提示
              const wrap = h('div', { class: 'flex flex-col gap-1' });
              const input = h('input', { type: 'text', value: p.useProvider || '', placeholder: L.visionUseProviderHint, class: visionInputCls });
              const warn = h('p', { class: 'text-ui-xs text-destructive', style: 'display:none' }, L.visionUseProviderUnknown);
              const isKnown = (v) => !v || v === 'session'
                || visionProviders.some((pr) => pr.id === v || pr.name === v || (pr.aliases || []).includes(v));
              const sel = h('select', { class: visionInputCls });
              const syncSelect = () => {
                const cur = (p.useProvider || '').trim();
                const opts = [h('option', { value: '' }, L.visionUseProviderNone), h('option', { value: 'session' }, L.visionUseProviderSession)];
                for (const pr of visionProviders) {
                  opts.push(h('option', { value: pr.id }, pr.name && pr.name !== pr.id ? `${pr.name}（${pr.id}）` : pr.id));
                }
                if (cur && !opts.some((o) => o.value === cur)) opts.push(h('option', { value: cur }, `${cur}（${L.visionUseProvider}）`));
                sel.replaceChildren(...opts);
                sel.value = cur;
              };
              sel.addEventListener('change', () => {
                input.value = sel.value;
                p.useProvider = sel.value.trim();
                warn.style.display = 'none';
                saveVisionSoon();
              });
              input.addEventListener('input', () => { p.useProvider = input.value.trim(); saveVisionSoon(); });
              input.addEventListener('blur', () => {
                p.useProvider = input.value.trim();
                warn.style.display = isKnown(p.useProvider) ? 'none' : '';
                syncSelect();
              });
              syncSelect();
              wrap.append(sel, input, warn);
              return wrap;
            })()),
            field(L.visionModel, textIn(p.model, (v) => { p.model = v; saveVisionSoon(); })),
            field(L.visionBaseUrl, textIn(p.baseUrl, (v) => { p.baseUrl = v; saveVisionSoon(); })),
            field(L.visionApiKey + ' · ' + L.visionApiKeyHint, textIn(p.apiKey, (v) => { p.apiKey = v; saveVisionSoon(); }, { type: 'password' })),
          ),
          (() => {
            const n = h('textarea', { class: 'zcodepro-textarea zcodepro-textarea-sm', rows: '3', placeholder: L.visionPrompt });
            n.value = p.prompt || '';
            n.addEventListener('input', () => { p.prompt = n.value; saveVisionSoon(); });
            return field(L.visionPrompt, n);
          })(),
        ));
        let testBtn;
        testBtn = smallBtn(L.visionTest, async () => {
          testBtn.disabled = true;
          testBtn.textContent = L.visionTesting;
          visionTestPre.style.display = '';
          visionTestPre.textContent = L.visionTesting;
          const res = await rpc('/vision/test', { method: 'POST', body: {} });
          testBtn.disabled = false;
          testBtn.textContent = L.visionTest;
          visionTestPre.textContent = res.output || res.error || '';
          if (!res.ok) showToast(L.visionTestFailed + ': ' + errText(res), 'error');
        });
        paneVision.replaceChildren(
          h('p', { class: 'text-ui-sm/relaxed text-foreground-subtle' }, L.visionDesc),
          // 链模式 + 两个开关合到一行（顶部已有简介，开关不再单占一块、不带描述）
          h('div', { class: 'mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-border p-1' },
            h('span', { class: 'ml-1.5 shrink-0 text-ui-sm font-medium text-foreground' }, L.visionMode),
            modeBtn('fallback', L.visionModeFallback, L.visionModeFallbackDesc),
            modeBtn('pipeline', L.visionModePipeline, L.visionModePipelineDesc),
            h('div', { class: 'ml-auto flex items-center gap-4' },
              settingRow(L.visionEnabled, '', visionCfg.enabled !== false, async () => {
                visionCfg.enabled = !(visionCfg.enabled !== false);
                await persistVision();
                renderVision();
              }),
              settingRow(L.visionForceIntercept, '', visionCfg.forceIntercept !== false, async () => {
                visionCfg.forceIntercept = !(visionCfg.forceIntercept !== false);
                await persistVision();
                renderVision();
              }),
            ),
          ),
          // 压缩阈值 / 连续失败次数 / 跳过分钟数 三个数字一行
          h('div', { class: 'mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-border p-1' },
            (() => {
              const n = h('input', { type: 'number', min: '0', step: '128', title: L.visionCompressKBHint,
                class: 'h-7 w-16 rounded-lg border border-border bg-input px-2 text-right text-ui-xs tabular-nums text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40' });
              n.value = String(Number.isFinite(visionCfg.compressThresholdKB) ? visionCfg.compressThresholdKB : 1024);
              n.addEventListener('change', () => {
                visionCfg.compressThresholdKB = Math.max(0, Math.round(Number(n.value) || 0));
                n.value = String(visionCfg.compressThresholdKB);
                void persistVision();
              });
              return h('label', { class: 'flex shrink-0 items-center gap-1.5', title: L.visionCompressKBHint },
                h('span', { class: 'text-ui-xs font-medium text-foreground-subtle' }, L.visionCompressKB), n);
            })(),
            numIn(visionCfg.skipAfterFailures, { min: 0, dflt: 4, title: L.visionSkipAfterFailuresHint, label: L.visionSkipAfterFailures, commit: (v) => { visionCfg.skipAfterFailures = v; } }),
            numIn(visionCfg.skipMinutes, { min: 1, dflt: 30, title: L.visionSkipMinutesHint, label: L.visionSkipMinutes, commit: (v) => { visionCfg.skipMinutes = v; } }),
          ),
          ...cards,
          h('div', { class: 'mt-2 flex items-center justify-between' },
            h('div', { class: 'flex items-center gap-1.5' },
              smallBtn('+ ' + L.visionAddProxy, () => {
                // 名称留空时 helper 校验会拒绝保存；等用户输入名称后防抖保存
                visionCfg.proxies.push({ name: '', baseUrl: 'https://open.bigmodel.cn/api/anthropic', model: 'glm-5.3-flash', apiKey: '', format: 'anthropic', prompt: '' });
                renderVision();
              }),
              smallBtn(L.visionResetChain, () => {
                if (!window.confirm(L.visionResetChainConfirm)) return;
                visionCfg.chainMode = VISION_DEFAULT_CFG.chainMode;
                visionCfg.proxies = structuredClone(VISION_DEFAULT_CFG.proxies);
                void persistVision();
                renderVision();
              })),
            testBtn),
          visionTestPre,
        );
      };
      renderVision();

      // 「rtk 压缩」：编辑 rtk 插件状态（~/.zcode-rtk 的 mode 与 whitelist，
      // /rtk-* 命令编辑同一文件）。开关与白名单增删即时保存，钩子每次执行都重读文件。
      let rtkCfg = rtkRes.ok
        ? {
            installed: rtkRes.installed !== false,
            version: rtkRes.version || '',
            binPath: rtkRes.binPath || '',
            mode: rtkRes.mode === 'off' ? 'off' : 'hint',
            whitelist: Array.isArray(rtkRes.whitelist) ? [...rtkRes.whitelist] : [],
            // 钩子内置放行清单（只读展示）
            builtinGit: Array.isArray(rtkRes.builtinGit) ? [...rtkRes.builtinGit] : [],
            builtinPlain: Array.isArray(rtkRes.builtinPlain) ? [...rtkRes.builtinPlain] : [],
          }
        : null;
      const persistRtk = async (partial) => {
        const res = await rpc('/rtk', { method: 'POST', body: partial });
        if (!res.ok) showToast(L.failed + ': ' + errText(res), 'error');
        return res.ok;
      };
      const rtkInputCls = 'h-8 w-full rounded-lg border border-border bg-input px-2.5 text-ui-sm text-foreground outline-none transition-shadow placeholder:text-foreground-subtle focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40';
      // rtk 本体（GitHub Releases 下载替换）的版本行与升级控件，渲染函数外创建一次
      const rtkVersionLine = h('span', { class: 'shrink-0 whitespace-nowrap text-ui-xs/relaxed text-foreground-subtle' });
      const renderRtkVersion = (meta) => {
        const v = meta.version || 'rtk';
        rtkVersionLine.textContent = meta.binPath ? `${v} · ${meta.binPath}` : v;
      };
      renderRtkVersion(rtkRes);
      const rtkUp = makeUpgradeControls({
        endpoint: '/rtk',
        metaRefresh: async () => {
          const meta = await rpc('/rtk');
          if (meta.ok) {
            // 初始读取失败时 rtkCfg 为 null，此时只刷新版本行
            if (rtkCfg) Object.assign(rtkCfg, meta);
            renderRtkVersion(meta);
          }
        },
      });
      rtkUpgradePollStop = rtkUp.stop;
      // 版本/路径/检查更新 + 启用 rtk 压缩开关合到一行（开关靠右，顶部已有简介不带描述）
      const rtkSwitchRow = h('div');
      const rtkVersionCard = h('div', { class: 'mt-3 flex items-center gap-2 rounded-xl border border-border p-2' },
        rtkVersionLine, rtkUp.state, rtkUp.btn, rtkSwitchRow);
      const rtkBody = h('div');
      // 简介置顶（与 Headroom 面板一致），其下版本卡（含启用 rtk 压缩开关），再下白名单
      paneRtk.append(
        h('p', { class: 'text-ui-sm/relaxed text-foreground-subtle' }, L.rtkDesc),
        rtkVersionCard,
        rtkBody);
      const renderRtk = () => {
        rtkVersionCard.style.display = rtkCfg && rtkCfg.installed ? '' : 'none';
        if (!rtkCfg) {
          rtkBody.replaceChildren(
            h('p', { class: 'text-ui-sm text-destructive' }, L.rtkLoadFailed + ': ' + errText(rtkRes)),
          );
          return;
        }
        const input = h('input', { type: 'text', placeholder: L.rtkWhitelistPlaceholder, class: rtkInputCls + ' min-w-0 flex-1' });
        const addEntry = async () => {
          const v = input.value.trim();
          if (!v) return;
          if (!/^(git:)?[A-Za-z0-9._-]+$/.test(v) || rtkCfg.whitelist.includes(v)) {
            showToast(L.rtkWhitelistInvalid, 'error');
            return;
          }
          if (await persistRtk({ whitelist: [...rtkCfg.whitelist, v] })) {
            rtkCfg.whitelist.push(v);
            renderRtk();
          }
        };
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); void addEntry(); }
        });
        const removeEntry = (entry) => {
          void (async () => {
            const next = rtkCfg.whitelist.filter((x) => x !== entry);
            if (await persistRtk({ whitelist: next })) {
              rtkCfg.whitelist = next;
              renderRtk();
            }
          })();
        };
        rtkSwitchRow.replaceChildren(
          settingRow(L.rtkEnabled, '', rtkCfg.mode === 'hint', async () => {
            const next = rtkCfg.mode === 'hint' ? 'off' : 'hint';
            if (await persistRtk({ mode: next })) {
              rtkCfg.mode = next;
              renderRtk();
            }
          }));
        rtkBody.replaceChildren(
          ...(rtkCfg.installed
            ? []
            : [h('p', { class: 'text-ui-sm text-amber-500' }, L.rtkNotInstalled)]),
          h('div', { class: 'mt-2 rounded-xl border border-border p-2' },
            h('div', { class: 'text-ui-sm font-medium text-foreground' }, L.rtkWhitelistTitle),
            h('p', { class: 'mt-1 text-ui-xs/relaxed text-foreground-subtle' }, L.rtkWhitelistDesc),
            ...((rtkCfg.builtinGit.length > 0 || rtkCfg.builtinPlain.length > 0)
              ? [
                h('div', { class: 'mt-2 text-ui-xs font-medium text-foreground-subtle' }, L.rtkBuiltinLabel),
                h('div', { class: 'mt-1 flex flex-wrap items-center gap-1' },
                  ...rtkCfg.builtinGit.map((g) => `git:${g}`).concat(rtkCfg.builtinPlain)
                    .map((entry) => h('span', {
                      class: 'inline-flex items-center rounded-md border border-border bg-surface px-1.5 py-0.5 text-ui-xs text-foreground-subtle/80',
                    }, entry))),
              ]
              : []),
            h('div', { class: 'mt-2 flex flex-wrap items-center gap-1.5' },
              ...rtkCfg.whitelist.map((entry) => h('span', {
                class: 'inline-flex items-center gap-1 rounded-md border border-border bg-surface px-1.5 py-0.5 text-ui-xs text-foreground',
              }, entry,
                h('button', {
                  type: 'button', class: 'text-foreground-subtle hover:text-destructive', title: L.visionRemove,
                  onClick: () => removeEntry(entry),
                }, '×'))),
              ...(rtkCfg.whitelist.length === 0
                ? [h('span', { class: 'text-ui-xs text-foreground-subtle/70' }, L.defaultValue)]
                : [])),
            h('div', { class: 'mt-2 flex items-center gap-2' },
              input,
              btnSmall(L.rtkWhitelistAdd, () => { void addEntry(); }, 'shrink-0'),
              btnSmall(L.rtkWhitelistClear, () => {
                void (async () => {
                  if (rtkCfg.whitelist.length === 0) return;
                  if (await persistRtk({ whitelist: [] })) {
                    rtkCfg.whitelist = [];
                    renderRtk();
                    showToast(L.rtkWhitelistCleared);
                  }
                })();
              }, 'shrink-0'))),
        );
      };
      renderRtk();

      // 「Headroom」：编辑 headroom 插件配置（~/.zcode/headroom.json，
      // /hr-* 命令与钩子共用同一文件）。压缩设备/省电切换经 helper 调钩子动作改
      // （立即生效；切换设备会重启代理）；监视间隔直写配置，监视器下一轮巡检生效。
      // 可整面重渲染：未装插件时显示安装卡，安装成功后原地恢复完整面板。
      // 版本行与本体升级控件（pip 通道）在渲染函数外创建一次，重渲染时复用同一组节点
      const hrVersionLine = h('span', { class: 'shrink-0 whitespace-nowrap text-ui-xs/relaxed text-foreground-subtle' });
      const renderHrVersion = (meta) => {
        const parts = [];
        if (meta.pluginVersion) parts.push(`${L.headroomVersionPlugin} ${meta.pluginVersion}`);
        if (meta.version) parts.push(`${L.headroomVersionBin} ${meta.version}`);
        hrVersionLine.textContent = parts.length ? parts.join(' · ') : `${L.headroomVersionPlugin} —`;
      };
      renderHrVersion(headroomRes);
      const hrUp = makeUpgradeControls({
        endpoint: '/headroom',
        metaRefresh: async () => {
          const meta = await rpc('/headroom');
          if (meta.ok) {
            renderHrVersion(meta);
            Object.assign(headroomRes, meta);
          }
        },
      });
      hrUpgradePollStop = hrUp.stop;
      const renderHeadroomPane = () => {
        paneHeadroom.replaceChildren();
        if (!headroomRes.ok || !headroomRes.config) {
          paneHeadroom.append(
            h('p', { class: 'text-ui-sm/relaxed text-foreground-subtle' }, L.headroomDesc),
            h('p', { class: 'mt-2 text-ui-sm text-destructive' }, L.headroomLoadFailed + ': ' + errText(headroomRes)),
          );
          return;
        }
        if (!headroomRes.hook) {
          // 未装插件：安装卡一键从市场安装（helper 单插件安装），装完原地恢复面板
          const installBtn = btnSmall(L.headroomInstall, () => { void runInstall(); }, 'shrink-0');
          const installState = h('div', { class: 'mt-0.5 truncate text-ui-xs/relaxed text-foreground-subtle' });
          const runInstall = async () => {
            installBtn.disabled = true;
            installBtn.textContent = L.headroomInstalling;
            installState.textContent = '';
            const res = await rpc('/plugins/update', { method: 'POST', body: { name: 'headroom', installMissing: true } });
            if (!res.ok) {
              installBtn.disabled = false;
              installBtn.textContent = L.headroomInstall;
              showToast(L.pluginsUpdateFailed + ': ' + errText(res), 'error');
              return;
            }
            const meta = await rpc('/headroom');
            if (meta.ok) Object.assign(headroomRes, meta);
            if (headroomRes.hook) {
              showToast(L.headroomInstalled, 'success');
              renderHeadroomPane();
            } else {
              installBtn.disabled = false;
              installBtn.textContent = L.headroomInstall;
              installState.textContent = L.headroomInstallRetry;
            }
          };
          paneHeadroom.append(
            h('p', { class: 'text-ui-sm/relaxed text-foreground-subtle' }, L.headroomDesc),
            h('div', { class: 'mt-3 flex items-center justify-between gap-2 rounded-xl border border-border p-2' },
              h('div', { class: 'min-w-0' },
                h('div', { class: 'text-ui-sm font-medium text-foreground' }, L.headroomInstallTitle),
                h('div', { class: 'mt-0.5 text-ui-xs/relaxed text-foreground-subtle' }, L.headroomInstallDesc),
                installState),
              installBtn),
          );
          return;
        }
        const hrCfg = { ...headroomRes.config };
        let hrBusy = false;
        const hrRun = async (reqBody, warn) => {
          if (hrBusy) return false;
          hrBusy = true;
          const res = await rpc('/headroom', { method: 'POST', body: reqBody });
          hrBusy = false;
          if (!res.ok) {
            showToast(L.failed + ': ' + errText(res), 'error');
            return false;
          }
          if (res.config) Object.assign(hrCfg, res.config);
          if (warn) showToast(warn);
          // backend/power 动作会重启代理，稍等其就绪再刷状态，避免闪现「未运行」
          setTimeout(() => { void hrRefresh(); }, 1200);
          return true;
        };
        // 状态值本地化：钩子输出的是 auto/cpu/ac/ok 等内部值，面板显示成人话
        const hrDevLabel = (v) => (v == null ? '—' : v === 'auto' ? L.hrValAuto : v === 'cpu' ? 'CPU' : v);
        const HR_PM = { ac: L.hrPmAc, battery: L.hrPmBattery, saver: L.hrPmSaver, 'saver+battery': L.hrPmSaverBat };
        const HR_DETECT = { ok: L.hrDetectOk, missing: L.hrDetectMissing, broken: L.hrDetectBroken };
        const hrStatusLine = h('div', { class: 'flex items-center gap-2' },
          h('span', { class: 'text-ui-sm text-foreground-subtle/70' }, '…'));
        const hrFacts = h('div', { class: 'mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3' });
        const hrHintLine = h('p', { class: 'mt-1.5 text-ui-xs/relaxed text-amber-500', style: 'display:none' });
        const hrRefresh = async () => {
          const res = await rpc('/headroom/status');
          if (!res.ok) {
            hrStatusLine.replaceChildren(
              h('span', { class: 'text-ui-sm text-destructive' }, L.headroomStatusLoadFailed + ': ' + errText(res)));
            hrFacts.replaceChildren();
            hrHintLine.style.display = 'none';
            return;
          }
          const s = res.status || {};
          hrStatusLine.replaceChildren(
            h('span', { class: 'inline-block size-2 shrink-0 rounded-full ' + (s.up ? 'bg-emerald-500' : 'bg-red-400') }),
            h('span', { class: 'text-ui-sm font-medium text-foreground' }, s.up ? L.headroomProxyUp : L.headroomProxyDown),
            ...(s.port ? [h('span', { class: 'text-ui-xs text-foreground-subtle' }, `127.0.0.1:${s.port}`)] : []),
          );
          const fact = (label, value) => h('div', { class: 'min-w-0 truncate text-ui-xs text-foreground-subtle' },
            h('span', { class: 'text-foreground-subtle/70' }, label + '：'),
            String(value ?? '—'));
          hrFacts.replaceChildren(
            fact(L.headroomCurrentBackend, hrDevLabel(s.backend)),
            fact(L.headroomDesiredBackend, hrDevLabel(s.desiredBackend)),
            fact(L.headroomPowerState, HR_PM[s.powerMode] || s.powerMode),
            fact(L.headroomWatcher, s.watcherRunning ? L.headroomWatcherOn : L.headroomWatcherOff),
            fact(L.headroomSaverDetect, HR_DETECT[s.saverDetect] || s.saverDetect),
          );
          hrHintLine.textContent = s.saverHint || '';
          hrHintLine.style.display = s.saverHint ? '' : 'none';
        };
        const hrRefreshBtn = btnSmall(L.headroomRefresh, () => { void hrRefresh(); });
        const hrStartBtn = btnSmall(L.headroomStart, () => { void hrRun({ action: 'start' }); });
        const hrRestartBtn = btnSmall(L.headroomRestart, () => { void hrRun({ action: 'restart' }); });
        const hrStopBtn = btnSmall(L.headroomStopAction, () => {
          // 停止会断开指向该代理的供应商连接，需二次确认（与「切换文件夹」同款确认弹窗）
          openDialog({
            title: L.headroomStopTitle,
            description: L.headroomStopDesc,
            width: 'sm:max-w-md',
            onMount: ({ body: confirmBody, close: closeConfirm }) => {
              confirmBody.append(
                dialogFooter(
                  btnSecondary(L.cancel, () => closeConfirm()),
                  btnPrimary(L.headroomStopAction, () => {
                    closeConfirm();
                    void hrRun({ action: 'stop' }, L.headroomStoppedWarn);
                  }, 'min-w-24'),
                ),
              );
            },
          });
        });
        void hrRefresh();


        // 压缩后端：下拉选择（auto/cpu，配置为原生值时追加显示当前值）
        const hrBackendSel = h('select', { class: 'h-7 shrink-0 rounded-lg border border-border bg-input px-1.5 text-ui-xs text-foreground outline-none' });
        const hrBackendOpts = [
          ['auto', L.headroomBackendAuto],
          ['cpu', L.headroomBackendCpu],
        ];
        if (!['auto', 'cpu'].includes(hrCfg.kompressBackend)) {
          hrBackendOpts.push([hrCfg.kompressBackend, hrCfg.kompressBackend + L.headroomBackendNative]);
        }
        for (const [v, label] of hrBackendOpts) hrBackendSel.append(h('option', { value: v }, label));
        hrBackendSel.value = hrCfg.kompressBackend;
        hrBackendSel.addEventListener('change', () => {
          const v = hrBackendSel.value;
          void (async () => {
            if (await hrRun({ backend: v })) updateHrPwrHint();
            else hrBackendSel.value = hrCfg.kompressBackend;
          })();
        });

        // 省电自动切换：三态胶囊（同「链模式」的标签按钮），与监视间隔同一行
        const hrPowerDefs = [
          ['off', L.headroomPowerOff, L.headroomPowerOffDesc],
          ['battery', L.headroomPowerBattery, L.headroomPowerBatteryDesc],
          ['saver', L.headroomPowerSaver, L.headroomPowerSaverDesc],
        ];
        const hrPowerBox = h('div', { class: 'flex min-w-0 flex-wrap items-center gap-1.5' });
        const renderHrPower = () => hrPowerBox.replaceChildren(
          h('span', { class: 'shrink-0 text-ui-sm font-medium text-foreground' }, L.headroomPower),
          ...hrPowerDefs.map(([id, label, desc]) => h('button', {
            type: 'button',
            class: 'zcodepro-tab',
            'data-state': hrCfg.powerSaveCpu === id ? 'active' : 'inactive',
            title: desc,
            onClick: () => {
              void (async () => {
                if (await hrRun({ power: id })) renderHrPower();
              })();
            },
          }, label)));
        renderHrPower();

        // 监视间隔：数字框（滚轮/手输），保存后从下一轮巡检起生效
        const hrIntervalField = numberField({
          value: hrCfg.powerWatchInterval,
          fallback: 60,
          min: 10,
          max: 3600,
          step: 5,
          onCommit: (v) => {
            void (async () => {
              const res = await rpc('/headroom', { method: 'POST', body: { interval: v } });
              if (res.ok && res.config) Object.assign(hrCfg, res.config);
              else {
                showToast(L.failed + ': ' + errText(res), 'error');
                hrIntervalField.set(hrCfg.powerWatchInterval);
              }
            })();
          },
        });

        // 压缩设备固定为 CPU 时，省电切换没有可切换的空间（规则命中也还是 CPU）
        const hrPwrHint = h('p', { class: 'px-2.5 pb-1.5 text-ui-xs/relaxed text-foreground-subtle', style: 'display:none' },
          L.hrCpuPinnedHint);
        const updateHrPwrHint = () => {
          hrPwrHint.style.display = hrCfg.kompressBackend === 'cpu' ? '' : 'none';
        };
        updateHrPwrHint();

        paneHeadroom.append(
          h('p', { class: 'text-ui-sm/relaxed text-foreground-subtle' }, L.headroomDesc),
          ...(headroomRes.installed === false
            ? [h('p', { class: 'mt-2 text-ui-sm text-amber-500' }, L.headroomBinMissing)]
            : []),
          h('div', { class: 'mt-3 flex items-center justify-between gap-2 rounded-xl border border-border p-2' },
            h('div', { class: 'flex min-w-0 items-center gap-2' }, hrVersionLine, hrUp.state),
            hrUp.btn),
          h('div', { class: 'mt-2 rounded-xl border border-border p-2' },
            h('div', { class: 'flex flex-wrap items-center justify-between gap-2' },
              h('span', { class: 'text-ui-sm font-medium text-foreground' }, L.headroomStatusTitle),
              h('div', { class: 'flex items-center gap-1.5' }, hrRefreshBtn, hrStartBtn, hrRestartBtn, hrStopBtn)),
            hrStatusLine,
            hrFacts,
            hrHintLine),
          h('div', {
            class: 'mt-2 rounded-xl border border-border p-1',
          },
            h('div', { class: 'flex items-center justify-between gap-2 rounded-lg p-2 transition-colors hover:bg-surface-hover' },
              h('span', { class: 'min-w-0 truncate text-ui-sm font-medium text-foreground', title: L.headroomBackendDesc }, L.headroomBackend),
              hrBackendSel),
            h('div', { class: 'flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg p-1.5 transition-colors hover:bg-surface-hover' },
              hrPowerBox,
              h('div', { class: 'ml-auto flex shrink-0 items-center gap-1.5' },
                h('span', { class: 'text-ui-xs font-medium text-foreground-subtle', title: L.headroomIntervalDesc }, L.headroomInterval),
                hrIntervalField.el,
                h('span', { class: 'w-4 text-ui-xs text-foreground-subtle' }, L.headroomSecUnit))),
            hrPwrHint),
        );
      };
      renderHeadroomPane();

      body.append(
        statusLine,
        tablist,
        paneFeatures,
        paneStyles,
        paneAgents,
        paneProxy,
        paneVision,
        paneHeadroom,
        paneRtk,
      );
    },
  });
}
