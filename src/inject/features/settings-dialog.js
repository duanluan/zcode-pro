// “ZCode Pro 增强设置”弹窗：功能开关 + 样式调整 + 运行状态。
// 顶部标签页切换（视觉参考侧栏“分组/项目”切换）；配置写入 helper（~/.zcode/zcodepro.json）。
import { h, t, rpc, getConfig, clearConfigCache, errText, HELPER_URL, isZhLocale } from '../core.js';
import { openDialog, dialogFooter, btnPrimary, btnSecondary, btnSmall, settingRow, ensureStyle, showToast, numberField, unitField } from '../ui.js';
import { comboField, providerOptionsOf, modelOptionsOf, modelPlaceholderOf, isManualConn } from '../provider-fields.js';
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
function makeUpgradeControls({ endpoint, metaRefresh, idleText }) {
  const L = t();
  const state = h('span', { class: 'min-w-0 flex-1 truncate text-left text-ui-xs/relaxed text-foreground-subtle' });
  // 失败原因在状态行直显红字（toast 只有 5 秒且易被弹窗遮挡）。
  // idleText：空闲（无检查/升级活动）时该槽位显示调用方给的文本——rtk/headroom
  // 面板用它显示本体位置；一旦有活动（检查中/下载进度/结果），活动文本顶替位置
  const hasIdle = () => typeof idleText === 'function';
  const setState = (text, kind = '') => {
    const shown = text || (hasIdle() ? (idleText() || '') : '');
    // “ · ”前缀：与前面的版本行直接拼成“插件 x · rtk y · 状态/路径”一行；
    // 错误信息不加前缀——它是独立提示，拼在版本行后会读成版本的一部分
    state.textContent = shown ? (kind === 'error' ? shown : ` · ${shown}`) : '';
    state.className = 'min-w-0 flex-1 truncate text-left text-ui-xs/relaxed '
      + (kind === 'error' ? 'text-destructive' : 'text-foreground-subtle');
  };
  let latest = null;   // 检查到新版本时记录最新版号，按钮随即转为“升级”
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
    // 收尾交给轮询：任务结束后 tick 会恢复按钮并提示“已停止升级”
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
    if (timer) { void runCancel(); return; } // 升级进行中：按钮此时是“停止升级”
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
    // 升级中按钮转为“停止升级”，保持可点（点击即中止）
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
  // 初始化为空闲态（有 idleText 时即显示位置等空闲文本）
  setState('');
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
    // sm:max-w-3xl 不存在会失去约束拉满全屏；max-w-3xl=48rem 存在——英文界面
    // 标签栏较长，42rem 会挤出一块空白并触发横向滚动
    width: 'max-w-3xl',
    bodyClass: 'mt-1',
    overlay: 'none',
    draggable: true,
    posKey: 'settings',
    dismissOnOutside: false,
    onClose: () => {
      if (hrUpgradePollStop) hrUpgradePollStop();
      if (rtkUpgradePollStop) rtkUpgradePollStop();
    },
    onMount: async ({ body, close, content }) => {
      // 标题行：左侧“ZCode Pro”点击跳转 GitHub 仓库；右上角 X 关闭弹窗（替代底部按钮）。
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
      const titleGenRes = await rpc('/title-gen');
      const titleGenProvidersRes = await rpc('/title-gen/providers');
      // 供应商表（含各供应商可选模型）：视觉代理的模型下拉也用这份
      const titleGenProviders = titleGenProvidersRes.ok && Array.isArray(titleGenProvidersRes.providers)
        ? titleGenProvidersRes.providers : [];
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
        h('span', { class: 'text-foreground-subtle/70' }, `${health.version} · ${HELPER_URL}`)
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
          settingRow(L.featureTitleLock, L.featureTitleLockDesc, f.titleLock !== false, async () => {
            const next = !(f.titleLock !== false);
            if (await setFeature('titleLock', next)) f.titleLock = next;
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
          settingRow(L.featureWsRunning, L.featureWsRunningDesc, f.wsRunningSpin !== false, async () => {
            const next = !(f.wsRunningSpin !== false);
            if (await setFeature('wsRunningSpin', next)) f.wsRunningSpin = next;
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
        const res = await rpc('/plugins/update', { method: 'POST', body: {} });
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
      const panePerf = h('div', { role: 'tabpanel', class: 'mt-4', style: 'display:none' });
      const paneAgents = h('div', { role: 'tabpanel', class: 'mt-2', style: 'display:none' });
      const paneProxy = h('div', { role: 'tabpanel', class: 'mt-4', style: 'display:none' });
      const paneSync = h('div', { role: 'tabpanel', class: 'mt-4', style: 'display:none' });
      const paneVision = h('div', { role: 'tabpanel', class: 'mt-4', style: 'display:none' });
      const paneRtk = h('div', { role: 'tabpanel', class: 'mt-4', style: 'display:none' });
      const paneHeadroom = h('div', { role: 'tabpanel', class: 'mt-4', style: 'display:none' });
      const paneTitleGen = h('div', { role: 'tabpanel', class: 'mt-4', style: 'display:none' });
      const paneDebug = h('div', { role: 'tabpanel', class: 'mt-4', style: 'display:none' });
      const panes = { features: paneFeatures, styles: paneStyles, perf: panePerf, agents: paneAgents, proxy: paneProxy, sync: paneSync, vision: paneVision, headroom: paneHeadroom, rtk: paneRtk, debug: paneDebug };
      const tabDefs = [
        ['features', L.tabFeatures],
        ['agents', L.tabBehavior],
        ['styles', L.tabStyles],
        ['perf', L.tabPerformance],
        ['proxy', L.tabProxy],
        ['sync', L.tabSync],
        ['vision', L.tabVision],
        ['headroom', L.tabHeadroom],
        ['rtk', L.tabRtk],
        // “调试”标签页只对开发模式生效的用户显示（配置开关或 ZCODEPRO_DEV=1），
        // 普通用户不可见
        ...(config.devMode === true || config.devActive === true ? [['debug', L.tabDebug]] : []),
      ];
      const tablist = h('div', { role: 'tablist', 'aria-orientation': 'horizontal', class: 'zcodepro-tablist mt-1' });
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

      // “样式调整”：一行两项、相关项同行；无描述文字，悬停名称显示 tip；
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
        styleCell(L.thinkingLineHeightName, L.thinkingLineHeightDesc, 'thinkingLineHeight', { min: 1, max: 3, step: 0.05, unit: 'x' }),
        styleCell(L.codeLineHeightName, L.codeLineHeightDesc, 'codeLineHeight', { min: 1, max: 3, step: 0.05, unit: 'x' }),
        styleCell(L.listSpacingName, L.listSpacingDesc, 'listSpacing'),
        styleCell(L.listItemSpacingName, L.listItemSpacingDesc, 'listItemSpacing'),
        styleCell(L.quoteCodeSpacingName, L.quoteCodeSpacingDesc, 'quoteCodeSpacing'),
        styleCell(L.tableSpacingName, L.tableSpacingDesc, 'tableSpacing'),
        cellPadCell,
      ];
      // “侧栏菜单并入顶栏”开关放在样式页（属界面布局调整，存仍是 features 配置）；
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
      // 字体设置：界面/提问/回答三个下拉框（打开弹窗时异步拉系统字体列表，
      // 拉不到回退常用清单）；选中即保存即生效，选“默认”恢复跟随应用。
      // 不接聚焦高亮：字体变化肉眼可辨，无需标出受影响区域
      const fontSelectCls = 'h-8 w-full min-w-0 flex-1 rounded-lg border border-border bg-input px-2.5 text-ui-sm text-foreground outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40';
      // queryLocalFonts 不可用/被拒时的回退清单（常用中西文字体）
      const FONT_FALLBACK = ['霞鹜文楷 屏幕阅读版', '霞鹜新晰黑 屏幕阅读版', 'Noto Sans CJK SC', 'Noto Serif CJK SC', 'Noto Sans Mono CJK SC', '文泉驿微米黑', '文泉驿等宽微米黑', 'JetBrains Mono', 'Fira Code', 'Cascadia Mono', 'DejaVu Sans', 'DejaVu Serif', 'DejaVu Sans Mono', 'Liberation Mono', 'Consolas', 'Menlo', 'SF Mono', 'PingFang SC', 'Microsoft YaHei', 'SimSun', 'KaiTi', 'FangSong'];
      const fontCell = (name, tip, key) => {
        const saved = typeof savedStyles[key] === 'string' ? savedStyles[key].trim() : '';
        const sel = h('select', { class: fontSelectCls, title: tip },
          h('option', { value: '' }, L.defaultValue));
        // 配置里存过的值（旧版手输的多字体栈等不在列表中的）单列一项，保证回显与生效一致
        if (saved) sel.append(h('option', { value: saved }, saved));
        sel.value = saved;
        sel.addEventListener('change', () => persistStyles({ [key]: sel.value || null }));
        return {
          field: { reset() { sel.value = ''; } },
          el: h('div', { class: 'flex items-center justify-between gap-2 p-2' },
            h('span', { class: 'w-24 shrink-0 truncate text-ui-sm font-medium text-foreground', title: tip }, name),
            sel),
          setOptions(families) {
            const cur = sel.value;
            const opts = [h('option', { value: '' }, L.defaultValue)];
            if (cur && !families.includes(cur)) opts.push(h('option', { value: cur }, cur));
            for (const fam of families) {
              const opt = h('option', { value: fam }, fam);
              // 选项文字用自身字体渲染，选中前即可预览字形
              opt.style.fontFamily = fam;
              opts.push(opt);
            }
            sel.replaceChildren(...opts);
            sel.value = cur;
          },
        };
      };
      const fontCells = [
        fontCell(L.uiFontName, L.uiFontDesc, 'uiFont'),
        fontCell(L.userFontName, L.userFontDesc, 'userFont'),
        fontCell(L.assistantFontName, L.assistantFontDesc, 'assistantFont'),
      ];
      void (async () => {
        let families = null;
        try {
          if (typeof window.queryLocalFonts === 'function') {
            const fonts = await window.queryLocalFonts();
            families = [...new Set(fonts.map((f) => f.family))].sort((a, b) => a.localeCompare(b, 'zh'));
          }
        } catch { /* 权限被拒等：走回退清单 */ }
        const list = ['sans-serif', 'serif', 'monospace', ...(families || FONT_FALLBACK)];
        for (const c of fontCells) c.setOptions(list);
      })();
      renderToolbarSwitch();
      paneStyles.append(
        toolbarSwitchWrap,
        h('div', { class: 'mt-2 flex flex-col gap-0.5 rounded-xl border border-border p-1' },
          ...fontCells.map((c) => h('div', { class: 'rounded-lg transition-colors hover:bg-surface-hover' }, c.el))),
        h('div', { class: 'mt-2 grid grid-cols-2 gap-2 rounded-xl border border-border p-1' },
          ...cells.map((c) => h('div', { class: 'rounded-lg transition-colors hover:bg-surface-hover' }, c.el))),
        h('div', { class: 'mt-2 flex justify-end' },
          btnSmall(L.resetDefault, () => {
            for (const c of [...cells, ...fontCells]) c.field.reset();
            persistStyles(Object.fromEntries(Object.keys(STYLE_DEFAULTS).map((k) => [k, null])));
          })),
      );

      // “全局提示词”：编辑 ~/.zcode/AGENTS.md（helper /agents 端点读写）。
      // 大段文本不做即存即生效——显式保存；未修改时保存按钮禁用
      const agentsArea = h('textarea', {
        class: 'zcodepro-textarea zcodepro-textarea-lg',
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
      // “行为”标签页：二级标签切换“全局提示词 / 任务名”。全局提示词编辑
      // ~/.zcode/AGENTS.md；任务名（智能起名）面板复用 paneTitleGen（原本是
      // 一级标签页，收进来后不再单独出现在顶部标签栏）
      const agentsPromptPane = h('div', { class: 'mt-4' });
      agentsPromptPane.append(
        h('p', { class: 'text-ui-sm/relaxed text-foreground-subtle' }, L.agentsDesc),
        ...(agentsFailed
          ? [h('p', { class: 'mt-2 text-ui-sm text-destructive' }, L.agentsLoadFailed + ': ' + errText(agentsRes))]
          : []),
        h('div', { class: 'mt-3' }, agentsArea),
        h('div', { class: 'mt-3 flex justify-end' }, agentsSaveBtn),
      );
      let agentsSubTab = 'prompt';
      const agentsSubPanes = { prompt: agentsPromptPane, titleGen: paneTitleGen };
      const agentsSubList = h('div', { role: 'tablist', 'aria-orientation': 'horizontal', class: 'zcodepro-tablist' });
      const renderAgentsSubTabs = () => {
        agentsSubList.replaceChildren(...[
          ['prompt', L.tabAgents],
          ['titleGen', L.tabTitleGen],
        ].map(([id, label]) => h('button', {
          type: 'button', role: 'tab', class: 'zcodepro-tab',
          'aria-selected': String(agentsSubTab === id),
          'data-state': agentsSubTab === id ? 'active' : 'inactive',
          onClick: () => {
            agentsSubTab = id;
            for (const [pid, pane] of Object.entries(agentsSubPanes)) pane.style.display = pid === id ? '' : 'none';
            renderAgentsSubTabs();
          },
        }, label)));
      };
      for (const [pid, pane] of Object.entries(agentsSubPanes)) pane.style.display = pid === agentsSubTab ? '' : 'none';
      renderAgentsSubTabs();
      paneAgents.append(agentsSubList, agentsPromptPane, paneTitleGen);

      // “代理”：为 helper 发起的网络访问（插件市场更新/安装、headroom 本体升级）设
      // HTTP 代理；保存即生效（helper 子进程环境变量注入），不影响 ZCode 应用与模型请求。
      // “检测”经 curl -x 走代理访问 GitHub / PyPI，测输入框当前的地址（可先测再存）
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
        // 空地址不发请求（等网络超时才报“检测失败”的体验太差），立即提示
        if (!proxyInput.value.trim()) {
          proxyTestState.className = 'mt-2 text-ui-xs/relaxed text-amber-500';
          proxyTestState.textContent = L.proxyTestEmpty;
          return;
        }
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
      // 代理生效范围（即时保存，每个开关只改自己那项）：插件市场更新与插件依赖
      // 软件默认开，同步默认关——国内网盘直连即可，代理停了同步会跟着失败
      const persistProxyScope = async (partial) => {
        const res = await rpc('/config', { method: 'POST', body: { proxyScopes: partial } });
        if (!res.ok) {
          showToast(L.failed + ': ' + errText(res), 'error');
          return false;
        }
        if (res.config && res.config.proxyScopes) config.proxyScopes = res.config.proxyScopes;
        return true;
      };
      const proxyScopeWrap = h('div');
      const renderProxyScopes = () => {
        const sc = config.proxyScopes || {};
        proxyScopeWrap.replaceChildren(
          settingRow(L.proxyScopePlugins, L.proxyScopePluginsDesc, sc.plugins !== false, async () => {
            const next = !(sc.plugins !== false);
            if (await persistProxyScope({ plugins: next })) sc.plugins = next;
            renderProxyScopes();
          }),
          settingRow(L.proxyScopeDeps, L.proxyScopeDepsDesc, sc.deps !== false, async () => {
            const next = !(sc.deps !== false);
            if (await persistProxyScope({ deps: next })) sc.deps = next;
            renderProxyScopes();
          }),
          settingRow(L.proxyScopeSync, L.proxyScopeSyncDesc, sc.sync === true, async () => {
            const next = !(sc.sync === true);
            if (await persistProxyScope({ sync: next })) sc.sync = next;
            renderProxyScopes();
          }),
        );
      };
      renderProxyScopes();
      paneProxy.append(
        h('p', { class: 'text-ui-sm/relaxed text-foreground-subtle' }, L.proxyDesc),
        h('div', { class: 'mt-3 flex items-center gap-2' },
          proxyInput,
          proxySaveBtn,
          proxyTestBtn),
        h('p', { class: 'mt-2 text-ui-xs/relaxed text-foreground-subtle' }, L.proxyHint),
        proxyTestState,
        h('div', { class: 'mt-3 divide-y divide-border rounded-xl border border-border' }, proxyScopeWrap),
      );

      // “性能”：空闲项目内存回收（开关 + 两个时长）。idleReclaimStartupMinutes
      // 允许 0（启动后立即回收一次），取值不能用“|| 默认值”的写法回退
      const perfToggleWrap = h('div');
      const renderPerfToggle = () => {
        const f = config.features || {};
        perfToggleWrap.replaceChildren(
          settingRow(L.featureIdleReclaim, L.featureIdleReclaimDesc, f.idleReclaim !== false, async () => {
            const next = !(f.idleReclaim !== false);
            if (await setFeature('idleReclaim', next)) f.idleReclaim = next;
            renderPerfToggle();
          }),
        );
      };
      renderPerfToggle();
      const perfNumberRow = (labelText, tip, key, fallback, min) => {
        const v = Number(config[key]);
        return h('div', { class: 'flex items-center justify-between gap-2 px-2 py-1.5' },
          h('div', { class: 'min-w-0' },
            h('div', { class: 'text-ui-sm font-medium text-foreground' }, labelText),
            ...(tip ? [h('div', { class: 'mt-0.5 text-ui-xs/relaxed text-foreground-subtle' }, tip)] : [])),
          h('div', { class: 'flex shrink-0 items-center gap-1' },
            numberField({
              value: Number.isFinite(v) ? v : fallback,
              fallback,
              min,
              max: 1440,
              step: 1,
              onCommit: async (n) => {
                const res = await rpc('/config', { method: 'POST', body: { [key]: n } });
                if (res.ok && res.config) {
                  config[key] = res.config[key];
                  clearConfigCache();
                }
              },
            }).el,
            h('span', { class: 'text-ui-xs text-foreground-subtle' }, L.idleReclaimUnit)));
      };
      panePerf.append(
        h('p', { class: 'text-ui-sm/relaxed text-foreground-subtle' }, L.perfDesc),
        h('div', { class: 'mt-3 divide-y divide-border rounded-xl border border-border' },
          perfToggleWrap,
          perfNumberRow(L.idleReclaimMinutesLabel, null, 'idleReclaimMinutes', 30, 1),
          perfNumberRow(L.idleReclaimStartupLabel, L.idleReclaimStartupHint, 'idleReclaimStartupMinutes', 5, 0)),
      );

      // “同步”：把 ZCode Pro 设置与模型设置手动备份到 WebDAV / 从 WebDAV 恢复
      // （交互参考 Tampermonkey：URL/登录/密码 + 手动触发，无自动同步）。仅 WebDAV
      // 一种后端且本就只在点击时传输，不设“类型/禁用”下拉。表单显式保存（旁有
      // “测试”用当前表单值验证连通）；同步内容开关即时保存；下载先弹云端版本
      // 列表（固定名 = 最新 + 带时间戳的历史），任选一个导入，导入会覆盖本机、
      // 先弹二次确认
      const savedSync = (config.sync && typeof config.sync === 'object') ? config.sync
        : { url: '', dir: 'zcode-pro', login: '', password: '', include: { zcodepro: true, model: true }, lastPushAt: null, lastPullAt: null };
      // 宽度分开拼：定宽控件（历史版本数字框）不能带 w-full——与 w-20 同用时
      // w-full 在样式表里靠后、会胜出，把整行撑爆
      const syncInputBase = 'h-8 rounded-lg border border-border bg-input px-2.5 text-ui-sm text-foreground outline-none transition-shadow placeholder:text-foreground-subtle focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40';
      const syncInputCls = syncInputBase + ' w-full';
      const syncLabel = (text) => h('span', { class: 'w-20 shrink-0 text-ui-sm font-medium text-foreground' }, text);
      const syncFormRow = (labelText, node) => h('div', { class: 'flex items-center gap-3 px-2 py-1.5' },
        syncLabel(labelText), node);
      const syncUrlInput = h('input', { type: 'text', value: savedSync.url || '', placeholder: L.syncUrlPlaceholder, spellcheck: 'false', autocomplete: 'off', class: syncInputCls + ' min-w-0 flex-1' });
      // 上传目录：拼在 URL 之后的文件夹（默认 zcode-pro，避免直接写进网盘根目录），可多级
      const syncDirInput = h('input', { type: 'text', value: savedSync.dir || 'zcode-pro', placeholder: L.syncDirPlaceholder, spellcheck: 'false', autocomplete: 'off', class: syncInputCls + ' min-w-0 flex-1' });
      const syncLoginInput = h('input', { type: 'text', value: savedSync.login || '', spellcheck: 'false', autocomplete: 'off', class: syncInputCls + ' min-w-0 flex-1' });
      const syncPasswordInput = h('input', { type: 'password', value: savedSync.password || '', autocomplete: 'new-password', class: syncInputCls + ' min-w-0 flex-1' });
      // 历史版本保留个数：上传成功后自动删除云端更早的历史版本（固定名最新版不受
      // 影响）；0 = 不留历史版本。非法输入按默认 10 提交（服务端还会再校验）
      const syncHistoryInput = h('input', {
        type: 'number', min: '0', max: '100', step: '1',
        value: Number.isInteger(savedSync.historyLimit) ? savedSync.historyLimit : 10,
        title: L.syncHistoryLimitHint, class: syncInputBase + ' w-20 shrink-0 text-center',
      });
      const syncHistoryValue = () => {
        // 清空按默认 10 提交，不当成 0——0 会清掉云端全部历史版，误清空代价太大
        const s = syncHistoryInput.value.trim();
        if (!s) return 10;
        const n = Number(s);
        return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 10;
      };
      let syncFormOriginal = null;
      const syncSaveBtn = btnSmall(L.syncSave, () => { void saveSyncForm(); }, 'shrink-0', 'primary');
      const syncFormValues = () => ({
        url: syncUrlInput.value.trim(),
        dir: syncDirInput.value.trim(),
        login: syncLoginInput.value.trim(),
        password: syncPasswordInput.value,
        historyLimit: syncHistoryValue(),
      });
      const syncCheckDirty = () => {
        const c = syncFormValues();
        syncSaveBtn.disabled = c.url === syncFormOriginal.url && c.dir === syncFormOriginal.dir
          && c.login === syncFormOriginal.login && c.password === syncFormOriginal.password
          && c.historyLimit === syncFormOriginal.historyLimit;
      };
      syncFormOriginal = syncFormValues();
      syncSaveBtn.disabled = true;
      for (const el of [syncUrlInput, syncDirInput, syncLoginInput, syncPasswordInput, syncHistoryInput]) {
        el.addEventListener('input', syncCheckDirty);
      }
      const saveSyncForm = async () => {
        syncSaveBtn.disabled = true;
        const res = await rpc('/sync', { method: 'POST', body: { sync: syncFormValues() } });
        if (res.ok) {
          syncFormOriginal = {
            url: res.sync.url,
            dir: res.sync.dir,
            login: res.sync.login, password: res.sync.password,
            historyLimit: Number.isInteger(res.sync.historyLimit) ? res.sync.historyLimit : 10,
          };
          syncUrlInput.value = res.sync.url;
          syncDirInput.value = res.sync.dir;
          syncLoginInput.value = res.sync.login;
          syncPasswordInput.value = res.sync.password;
          syncHistoryInput.value = syncFormOriginal.historyLimit;
          showToast(L.syncSaved);
        } else {
          showToast(L.failed + ': ' + errText(res), 'error');
          syncCheckDirty();
        }
      };
      // “测试”：用表单当前值（先测再存）验证 WebDAV：连接与凭据 → 上传目录
      // （缺则自动建，等同上传时的行为）→ 文件列表；结果仿“代理”标签页的检测，
      // 一行显示各步耗时与云端备份文件数
      const syncTestState = h('p', { class: 'mt-2 text-ui-xs/relaxed text-foreground-subtle' });
      let syncTesting = false;
      const syncTestBtn = btnSmall(L.syncTest, () => { void runSyncTest(); }, 'shrink-0');
      const runSyncTest = async () => {
        if (syncTesting) return;
        // 没填 URL 不发请求（等超时才报“测试失败”的体验太差），立即提示
        if (!syncUrlInput.value.trim()) {
          syncTestState.className = 'mt-2 text-ui-xs/relaxed text-amber-500';
          syncTestState.textContent = L.syncTestEmpty;
          return;
        }
        syncTesting = true;
        syncTestBtn.disabled = true;
        syncTestBtn.textContent = L.syncTesting;
        syncTestState.textContent = '';
        syncTestState.className = 'mt-2 text-ui-xs/relaxed text-foreground-subtle';
        const res = await rpc('/sync/test', { method: 'POST', body: { sync: syncFormValues() } });
        syncTesting = false;
        syncTestBtn.disabled = false;
        syncTestBtn.textContent = L.syncTest;
        if (!res.ok) {
          syncTestState.className = 'mt-2 text-ui-xs/relaxed text-destructive';
          syncTestState.textContent = L.syncTestFailed + ': ' + errText(res);
          return;
        }
        const stepName = { connect: L.syncTestStepConnect, dir: L.syncTestStepDir, list: L.syncTestStepList };
        const parts = (res.targets || []).map((t) =>
          `${stepName[t.step] || t.step} ${t.ok ? '✓' + (t.ms != null ? ' ' + t.ms + 'ms' : '') : '✗ ' + (t.error || t.httpCode || '')}`.trim());
        const allOk = (res.targets || []).length > 0 && (res.targets || []).every((t) => t.ok);
        let host = syncUrlInput.value.trim();
        try { host = new URL(host).host; } catch { /* 非法输入保留原文 */ }
        syncTestState.className = 'mt-2 text-ui-xs/relaxed ' + (allOk ? 'text-foreground-subtle' : 'text-amber-500');
        syncTestState.textContent = `${host}：${parts.join(' · ')}`
          + (allOk && res.fileCount != null ? `（${L.syncTestFilesFound.replace('{n}', res.fileCount)}）` : '');
      };
      // 坚果云推荐行：外链经宿主 openExternal 打开系统浏览器（无该能力时只出纯文字）
      const JIANGUO_HELP = 'https://help.jianguoyun.com/?p=2064';
      const syncRecLine = h('p', { class: 'mt-1 text-ui-xs/relaxed text-foreground-subtle' });
      if (typeof window.zcode?.openExternal === 'function') {
        syncRecLine.append(
          h('span', {
            class: 'cursor-pointer underline-offset-4 hover:underline',
            title: JIANGUO_HELP,
            onClick: () => openExternal(JIANGUO_HELP),
          }, L.syncRecLink),
          L.syncRecSuffix);
      } else {
        syncRecLine.textContent = L.syncRecLink + L.syncRecSuffix;
      }
      // 同步内容开关（即时保存，上传/下载都按这里的勾选执行）
      const persistSyncInclude = async (partial) => {
        const res = await rpc('/sync', { method: 'POST', body: { include: partial } });
        if (!res.ok) showToast(L.failed + ': ' + errText(res), 'error');
        return res.ok;
      };
      const syncIncludeWrap = h('div');
      const renderSyncInclude = () => {
        const inc = savedSync.include || {};
        syncIncludeWrap.replaceChildren(
          settingRow(L.syncIncludeZcp, L.syncIncludeZcpDesc, inc.zcodepro !== false, async () => {
            const next = !(inc.zcodepro !== false);
            if (await persistSyncInclude({ zcodepro: next })) inc.zcodepro = next;
            renderSyncInclude();
          }),
          settingRow(L.syncIncludeModel, L.syncIncludeModelDesc, inc.model !== false, async () => {
            const next = !(inc.model !== false);
            if (await persistSyncInclude({ model: next })) inc.model = next;
            renderSyncInclude();
          }),
        );
      };
      renderSyncInclude();
      // 上次操作时间 + 上传/下载按钮；上传固定名与历史版本双写，下载弹云端版本列表
      const fmtSyncTime = (ts) => (ts ? new Date(ts).toLocaleString() : L.syncNever);
      const syncStatusLine = h('div', { class: 'text-ui-xs/relaxed text-foreground-subtle' });
      const renderSyncStatus = (s) => {
        syncStatusLine.textContent = `${L.syncLastPush} ${fmtSyncTime(s.lastPushAt)} · ${L.syncLastPull} ${fmtSyncTime(s.lastPullAt)}`;
      };
      renderSyncStatus(savedSync);
      const syncUploadBtn = btnSmall(L.syncUpload, () => { void runSyncPush(); }, 'shrink-0', 'primary');
      const syncDownloadBtn = btnSmall(L.syncDownload, () => { openSyncVersionPicker(); }, 'shrink-0');
      // “从云端下载”先弹版本列表（备份管理器的样子）：列出云端目录里的备份文件
      // （固定名 = 最新一版 + 带时间戳的历史），每行可导入到本机 / 从云端删除 /
      // 另存到本机磁盘；导入按文件名前缀决定覆盖哪一项，不受“同步内容”勾选影响
      const openSyncVersionPicker = () => {
        openDialog({
          title: L.syncPickTitle,
          description: L.syncPickDesc,
          width: 'max-w-2xl',
          dismissOnOutside: false,
          onMount: async ({ body: pickBody, content, close: closePicker }) => {
            // 标题栏 ✕（设置弹窗同款）；h2 也是拖拽把手，✕ 上要拦住 mousedown 冒泡
            const titleEl = content && content.firstElementChild;
            if (titleEl && titleEl.tagName === 'H2') {
              titleEl.classList.add('flex', 'w-full', 'items-center', 'justify-between');
              titleEl.replaceChildren(
                h('span', { class: 'flex min-w-0 items-center' }, L.syncPickTitle),
                h('button', {
                  type: 'button',
                  class: 'zcodepro-close',
                  title: L.close,
                  'aria-label': L.close,
                  onMousedown: (e) => { e.stopPropagation(); },
                  onClick: () => { closePicker(); },
                }, '✕'),
              );
            }
            const listWrap = h('div', { class: 'space-y-1' });
            pickBody.append(listWrap);
            const fmtSize = (n) => {
              if (!Number.isFinite(n) || n <= 0) return '';
              return n >= 1048576 ? (n / 1048576).toFixed(2) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
            };
            const setStatus = (el) => { listWrap.replaceChildren(el); };
            const setRowBusy = (btns, busy) => { for (const b of btns) b.disabled = busy; };
            const versionRow = (f) => {
              // 固定名（zcodepro.json / model.json）不含时间戳段，始终是最新一版；
              // 归属哪项同步内容由分组标题说明，行内不再重复
              const isLatest = !/-\d{4}-\d{2}-\d{2}T/.test(f.name);
              const importBtn = btnSmall(L.syncVerImport, () => { confirmImport(f, rowBtns, importBtn); }, 'shrink-0');
              const deleteBtn = btnSmall(L.syncVerDelete, () => { confirmDelete(f, rowBtns, isLatest); }, 'shrink-0');
              const saveBtn = btnSmall(L.syncVerSave, () => { void exportVersion(f, rowBtns, saveBtn); }, 'shrink-0');
              const rowBtns = [importBtn, deleteBtn, saveBtn];
              return h('div', { class: 'flex items-center gap-3 rounded-xl border border-border px-3 py-2' },
                h('div', { class: 'min-w-0 flex-1' },
                  h('div', { class: 'flex min-w-0 items-center gap-1.5' },
                    h('span', { class: 'truncate font-mono text-ui-xs text-foreground', title: f.name }, f.name),
                    ...(isLatest ? [h('span', { class: 'shrink-0 rounded border border-border px-1.5 text-ui-xs text-foreground-subtle' }, L.syncVerLatest)] : [])),
                  h('div', { class: 'mt-0.5 text-ui-xs/relaxed text-foreground-subtle' },
                    [fmtSize(f.size), f.lastModified ? new Date(f.lastModified).toLocaleString() : ''].filter(Boolean).join(' · '))),
                h('div', { class: 'flex shrink-0 items-center gap-1.5' }, importBtn, deleteBtn, saveBtn));
            };
            const loadList = async () => {
              setStatus(h('p', { class: 'text-ui-sm/relaxed text-foreground-subtle' }, L.syncPickLoading));
              const res = await rpc('/sync/versions', { method: 'POST', body: {} });
              if (!res.ok) {
                setStatus(h('p', { class: 'text-ui-sm text-destructive' }, L.failed + ': ' + errText(res)));
                return;
              }
              const files = res.files || [];
              if (!files.length) {
                setStatus(h('p', { class: 'text-ui-sm/relaxed text-foreground-subtle' }, L.syncPickEmpty));
                return;
              }
              // 按同步内容分组排列：组标题下固定名（最新）放最上面，历史版本按
              // 时间新→旧往下——两组文件多了也不会按时间交错混排
              const parts = [];
              for (const [prefix, label] of [['zcodepro', L.syncIncludeZcp], ['model', L.syncIncludeModel]]) {
                const group = files.filter((f) => f.name === `${prefix}.json` || f.name.startsWith(`${prefix}-`));
                if (!group.length) continue;
                const latest = group.find((f) => f.name === `${prefix}.json`);
                const history = group.filter((f) => f !== latest)
                  .sort((a, b) => ((b.lastModified || 0) - (a.lastModified || 0)) || b.name.localeCompare(a.name));
                parts.push(h('div', { class: 'px-1 pt-2 text-ui-xs font-medium text-foreground-subtle' },
                  `${label}${isZhLocale() ? '（' : ' ('}${group.length}${isZhLocale() ? '）' : ')'}`));
                for (const f of [latest, ...history]) {
                  if (f) parts.push(versionRow(f));
                }
              }
              listWrap.replaceChildren(...parts);
            };
            // 导入沿用原有的覆盖确认文案，并注明选中的是哪个文件
            const confirmImport = (f, rowBtns, importBtn) => {
              openDialog({
                title: L.syncConfirmTitle,
                width: 'sm:max-w-md',
                onMount: ({ body: confirmBody, close: closeConfirm }) => {
                  confirmBody.append(
                    h('p', { class: 'mb-2 truncate font-mono text-ui-xs text-foreground-subtle', title: f.name }, f.name),
                    h('p', { class: 'text-ui-sm/relaxed text-foreground-subtle' }, L.syncConfirmDesc),
                    dialogFooter(
                      btnSecondary(L.cancel, () => closeConfirm()),
                      btnPrimary(L.syncConfirmGo, () => { closeConfirm(); void importVersion(f, rowBtns, importBtn); }, 'min-w-24'),
                    ),
                  );
                },
              });
            };
            const importVersion = async (f, rowBtns, importBtn) => {
              setRowBusy(rowBtns, true);
              importBtn.textContent = L.syncVerImporting;
              const res = await rpc('/sync/version/apply', { method: 'POST', body: { file: f.name } });
              setRowBusy(rowBtns, false);
              importBtn.textContent = L.syncVerImport;
              if (!res.ok) {
                showToast(L.failed + ': ' + errText(res), 'error');
                return;
              }
              closePicker();
              renderSyncStatus(res.sync || {});
              // 该版本已落到本机：刷新弹窗内开关显示，并让常驻功能立即按新配置生效
              clearConfigCache();
              window.dispatchEvent(new CustomEvent('zcodepro:config-changed'));
              Object.assign(config, await getConfig(true));
              refreshRows();
              renderToolbarSwitch();
              const names = (res.applied || [])
                .map((k) => (k === 'model' ? L.syncIncludeModel : L.syncIncludeZcp))
                .join(isZhLocale() ? '、' : ', ');
              showToast(names ? `${L.syncDownloaded}（${names}）` : L.syncDownloaded, 'success');
            };
            const confirmDelete = (f, rowBtns, isLatest) => {
              openDialog({
                title: L.syncVerDeleteTitle,
                width: 'sm:max-w-md',
                onMount: ({ body: confirmBody, close: closeConfirm }) => {
                  confirmBody.append(
                    h('p', { class: 'text-ui-sm/relaxed text-foreground-subtle' },
                      L.syncVerDeleteDesc,
                      h('span', { class: 'font-mono' }, f.name)),
                    // 删“最新”文件会让旧版 zcode-pro 失去下载入口，多提醒一句
                    ...(isLatest ? [h('p', { class: 'mt-2 text-ui-xs/relaxed text-amber-500' }, L.syncVerDeleteLatestNote)] : []),
                    dialogFooter(
                      btnSecondary(L.cancel, () => closeConfirm()),
                      btnPrimary(L.syncVerDelete, () => { closeConfirm(); void deleteVersion(f, rowBtns); }, 'min-w-24'),
                    ),
                  );
                },
              });
            };
            const deleteVersion = async (f, rowBtns) => {
              setRowBusy(rowBtns, true);
              const res = await rpc('/sync/version/delete', { method: 'POST', body: { file: f.name } });
              setRowBusy(rowBtns, false);
              if (!res.ok) {
                showToast(L.failed + ': ' + errText(res), 'error');
                return;
              }
              showToast(L.syncVerDeleted, 'success');
              void loadList();
            };
            const exportVersion = async (f, rowBtns, saveBtn) => {
              setRowBusy(rowBtns, true);
              saveBtn.textContent = L.syncVerSaving;
              // 宿主会弹系统目录选择器选保存位置；用户取消时不作提示
              const res = await rpc('/sync/version/export', { method: 'POST', body: { file: f.name } });
              setRowBusy(rowBtns, false);
              saveBtn.textContent = L.syncVerSave;
              if (!res.ok) {
                if (res.code !== 'export-cancelled') showToast(L.failed + ': ' + errText(res), 'error');
                return;
              }
              showToast(`${L.syncVerSaved} ${res.path}`, 'success');
            };
            void loadList();
          },
        });
      };
      // 上传：云端固定名（最新）与时间戳历史版本由服务端一并写入云端；下载期间按钮也
      // 禁用（列表在变，选了也会过期）
      const runSyncPush = async () => {
        syncUploadBtn.disabled = true;
        syncDownloadBtn.disabled = true;
        const idleText = syncUploadBtn.textContent;
        syncUploadBtn.textContent = L.syncUploading;
        const res = await rpc('/sync/run', { method: 'POST', body: { direction: 'push' } });
        syncUploadBtn.disabled = false;
        syncDownloadBtn.disabled = false;
        syncUploadBtn.textContent = idleText;
        if (!res.ok) {
          showToast(L.failed + ': ' + errText(res), 'error');
          return;
        }
        renderSyncStatus(res.sync || {});
        showToast(res.pruned ? L.syncUploaded + (isZhLocale() ? '；' : '; ') + L.syncPruned.replace('{n}', res.pruned) : L.syncUploaded, 'success');
      };
      paneSync.append(
        h('p', { class: 'text-ui-sm/relaxed text-foreground-subtle' }, L.syncDesc),
        h('div', { class: 'mt-3 rounded-xl border border-border p-1' },
          syncFormRow('URL', syncUrlInput),
          // 登录与密码一行、上传目录与历史版本一行：短字段成对排，少占纵向空间
          h('div', { class: 'flex items-center gap-3 px-2 py-1.5' },
            syncLabel(L.syncLogin), syncLoginInput,
            syncLabel(L.syncPassword), syncPasswordInput),
          h('div', { class: 'flex items-center gap-3 px-2 py-1.5' },
            syncLabel(L.syncDir), syncDirInput,
            syncLabel(L.syncHistoryLimit), syncHistoryInput,
            h('span', { class: 'shrink-0 text-ui-xs text-foreground-subtle' }, L.syncHistoryLimitUnit)),
          h('div', { class: 'flex items-center justify-between gap-2 px-2 py-1.5' },
            h('div', { class: 'min-w-0' },
              h('p', { class: 'text-ui-xs/relaxed text-foreground-subtle' }, L.syncFormHint),
              syncRecLine),
            h('div', { class: 'flex shrink-0 items-center gap-1.5' }, syncSaveBtn, syncTestBtn))),
        syncTestState,
        h('div', { class: 'mt-2 divide-y divide-border rounded-xl border border-border' }, syncIncludeWrap),
        h('div', { class: 'mt-2 flex items-center justify-between gap-2 rounded-xl border border-border p-2' },
          h('div', { class: 'min-w-0' }, syncStatusLine),
          h('div', { class: 'flex shrink-0 items-center gap-1.5' }, syncUploadBtn, syncDownloadBtn)),
        h('p', { class: 'mt-2 text-ui-xs/relaxed text-foreground-subtle' }, L.syncHint),
      );

      // “调试”：开发模式开关 + 重载按钮。重载 = 构建 → 换新启动器进程（新 helper
      // 代码与新注入脚本）→ 各 ZCode 窗口检测到换代自动整页刷新重新注入；
      // ZCode 本体与所有会话不受影响，不用重启 ZCode
      const persistDevMode = async (v) => {
        const res = await rpc('/config', { method: 'POST', body: { devMode: v } });
        if (!res.ok) {
          showToast(L.failed + ': ' + errText(res), 'error');
          return false;
        }
        if (res.config) config.devMode = res.config.devMode;
        return true;
      };
      const devReloadBtn = btnSmall(L.devReload, () => { void runDevReload(); }, 'shrink-0', 'primary');
      const runDevReload = async () => {
        devReloadBtn.disabled = true;
        devReloadBtn.textContent = L.devReloading;
        // 旧进程应答后即退出，fetch 可能中断，成败都进入下面的兜底刷新
        try { await rpc('/dev/reload', { method: 'POST', body: {} }); } catch { /* ignore */ }
        // 兜底：正常情况下新启动器注入时本页会自动刷新；2 秒没动静（交接失败）
        // 就自己刷新，宁可多刷一次也不能停在旧代码 + 失效 token 上
        setTimeout(() => { try { location.reload(); } catch { /* ignore */ } }, 2000);
      };
      const devModeWrap = h('div');
      const renderDevPane = () => {
        const dev = config.devMode === true;
        devModeWrap.replaceChildren(
          h('p', { class: 'text-ui-sm/relaxed text-foreground-subtle' }, L.devModeDesc),
          h('div', { class: 'mt-3 divide-y divide-border rounded-xl border border-border' },
            settingRow(L.devMode, L.devModeRowDesc, dev, async () => {
              if (await persistDevMode(!dev)) renderDevPane();
            }),
            ...(dev ? [h('div', { class: 'flex items-center justify-between gap-2 px-2 py-1.5' },
              h('div', { class: 'min-w-0' },
                h('div', { class: 'text-ui-sm font-medium text-foreground' }, L.devReload),
                h('div', { class: 'mt-0.5 text-ui-xs/relaxed text-foreground-subtle' }, L.devReloadDesc)),
              devReloadBtn)] : []),
          ),
        );
      };
      renderDevPane();
      paneDebug.append(devModeWrap);

      // “视觉代理”：编辑 ~/.zcode/zcode-vision.json（zcode-vision 插件与 /vision-* 命令共用同一文件）。
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
      // 未装插件时的一键安装卡（与 Headroom 面板同款交互）：helper 单插件安装，
      // 装完 onInstalled 原地恢复面板。rtk/vision 面板共用。
      const pluginInstallCard = (pluginName, onInstalled) => {
        const installBtn = btnSmall(L.headroomInstall, () => { void runInstall(); }, 'shrink-0');
        const installState = h('div', { class: 'mt-0.5 truncate text-ui-xs/relaxed text-foreground-subtle' });
        const runInstall = async () => {
          installBtn.disabled = true;
          installBtn.textContent = L.headroomInstalling;
          installState.textContent = '';
          const res = await rpc('/plugins/update', { method: 'POST', body: { name: pluginName } });
          if (!res.ok) {
            installBtn.disabled = false;
            installBtn.textContent = L.headroomInstall;
            showToast(L.pluginsUpdateFailed + ': ' + errText(res), 'error');
            return;
          }
          if (onInstalled) await onInstalled();
          showToast(L.pluginInstallDone.replaceAll('{name}', pluginName), 'success');
        };
        return h('div', { class: 'mt-3 flex items-center justify-between gap-2 rounded-xl border border-border p-2' },
          h('div', { class: 'min-w-0' },
            h('div', { class: 'text-ui-sm font-medium text-foreground' }, L.pluginInstallCardTitle.replaceAll('{name}', pluginName)),
            h('div', { class: 'mt-0.5 text-ui-xs/relaxed text-foreground-subtle' }, L.pluginInstallCardDesc),
            installState),
          installBtn);
      };

      const renderVision = () => {
        if (!visionRes.ok) {
          paneVision.replaceChildren(
            h('p', { class: 'text-ui-sm/relaxed text-foreground-subtle' }, L.visionDesc),
            h('p', { class: 'mt-2 text-ui-sm text-destructive' }, L.visionLoadFailed + ': ' + errText(visionRes)),
          );
          return;
        }
        // 插件未装优先显示安装卡——判断只看钩子（visionRes.hook），与配置文件是否存在无关：
        // 配置是钩子消费的，没钩子就没功能；老用户卸载插件后 ~/.zcode/zcode-vision.json 仍在，
        // 若按配置存在与否分流会误入完整配置界面而毫无“未安装”提示
        if (!visionRes.hook) {
          paneVision.replaceChildren(
            h('p', { class: 'text-ui-sm/relaxed text-foreground-subtle' }, L.visionDesc),
            pluginInstallCard('zcode-vision', async () => {
              const meta = await rpc('/vision');
              if (meta.ok) Object.assign(visionRes, meta);
              renderVision();
            }),
          );
          return;
        }
        if (!visionCfg) {
          const initBtn = btnSmall(L.visionAddProxy, async () => {
            const res = await rpc('/vision', { method: 'POST', body: { config: VISION_DEFAULT_CFG } });
            if (res.ok) { visionCfg = structuredClone(res.config); renderVision(); }
            else showToast(L.failed + ': ' + errText(res), 'error');
          });
          paneVision.replaceChildren(
            h('p', { class: 'text-ui-sm/relaxed text-foreground-subtle' }, L.visionDesc),
            ...(visionRes.ok ? [] : [h('p', { class: 'mt-2 text-ui-sm text-destructive' }, L.visionLoadFailed + ': ' + errText(visionRes))]),
            // 信息卡（仅版本行；配置未建，启用开关随配置出现）
            h('div', { class: 'mt-3 rounded-xl border border-border p-2' },
              h('div', { class: 'flex flex-wrap items-center gap-2' },
                h('span', { class: 'shrink-0 whitespace-nowrap text-ui-xs/relaxed text-foreground-subtle' }, `插件 ${visionRes.pluginVersion || '—'}`))),
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
        // 接口地址 / API Key 是否显示走 provider-fields 的共用规则
        //（isManualConn：不跟随或供应商已删才显示，连接其余由跟随对象负责）
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
            // 供应商与模型走 provider-fields 共用逻辑：跟随会话时模型下拉为
            // 全部供应商模型汇总，具体供应商为其模型列表；已删 id 标注“已删除”
            field(L.visionUseProvider, comboField(p.useProvider || '',
              providerOptionsOf(titleGenProviders, L),
              (v, src) => {
                p.useProvider = v;
                saveVisionSoon();
                // 下拉切换后重渲染整个面板：模型下拉选项随新供应商变化，接口
                // 地址/API Key 字段按“不跟随或供应商已删才显示”重新显隐
                if (src === 'select') renderVision();
              },
              { placeholder: L.titleGenProviderSession, staleLabel: L.titleGenProviderDeleted })),
            // 跟随会话时模型下拉头部有“跟随当前会话当前模型”（值为空，
            // 插件 ≥1.6.1 在调用时解析为会话当前模型）；具体供应商为其模型列表
            field(L.visionModel, comboField(p.model || '',
              modelOptionsOf(p.useProvider, titleGenProviders, {
                followSession: (p.useProvider || '').trim() === 'session',
                followSessionLabel: L.titleGenModelFollowSession,
              }),
              (v) => { p.model = v; saveVisionSoon(); },
              {
                placeholder: modelPlaceholderOf(p.useProvider, L),
                emptyLabel: (p.useProvider || '').trim() === 'session'
                  ? L.titleGenModelFollowSession : L.titleGenModelEmpty,
              })),
            ...(isManualConn(p.useProvider, titleGenProviders) ? [
              field(L.visionBaseUrl, textIn(p.baseUrl, (v) => { p.baseUrl = v; saveVisionSoon(); })),
              field(L.visionApiKey + ' · ' + L.visionApiKeyHint, textIn(p.apiKey, (v) => { p.apiKey = v; saveVisionSoon(); }, { type: 'password' })),
            ] : []),
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
          // 信息卡：插件版本 + 启用图片识别开关（与 rtk/headroom 面板同款式）
          h('div', { class: 'mt-3 rounded-xl border border-border p-2' },
            h('div', { class: 'flex flex-wrap items-center gap-2' },
              h('span', { class: 'shrink-0 whitespace-nowrap text-ui-xs/relaxed text-foreground-subtle' }, `插件 ${visionRes.pluginVersion || '—'}`),
              h('div', { class: 'ml-auto' },
                settingRow(L.visionEnabled, '', visionCfg.enabled !== false, async () => {
                  visionCfg.enabled = !(visionCfg.enabled !== false);
                  await persistVision();
                  renderVision();
                })))),
          // 链模式 + 强制拦截开关合到一行（启用开关已上移信息卡）
          h('div', { class: 'mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-border p-1' },
            h('span', { class: 'ml-1.5 shrink-0 text-ui-sm font-medium text-foreground' }, L.visionMode),
            modeBtn('fallback', L.visionModeFallback, L.visionModeFallbackDesc),
            modeBtn('pipeline', L.visionModePipeline, L.visionModePipelineDesc),
            h('div', { class: 'ml-auto flex items-center gap-4' },
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

      // “rtk 压缩”：编辑 rtk 插件状态（~/.zcode-rtk 的 mode 与 whitelist，
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
      // rtk 本体（GitHub Releases 下载替换）的版本行与升级控件，渲染函数外创建一次。
      // 信息卡单行：版本行 + 弹性状态槽（空闲显示本体位置，检查更新/升级时被活动
      // 日志顶替，见 makeUpgradeControls 的 idleText）+ 检查更新按钮 + 启用开关
      const rtkVersionLine = h('span', { class: 'shrink-0 whitespace-nowrap text-ui-xs/relaxed text-foreground-subtle' });
      let rtkLocText = '';
      const renderRtkVersion = (meta) => {
        const v = String(meta.version || '').replace(/^rtk\s+/i, '').trim();
        rtkVersionLine.textContent = `插件 ${meta.pluginVersion || '—'}${v ? ` · rtk ${v}` : ''}`;
        rtkLocText = meta.binPath || '';
      };
      renderRtkVersion(rtkRes);
      const rtkUp = makeUpgradeControls({
        endpoint: '/rtk',
        idleText: () => rtkLocText,
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
      const rtkVersionCard = h('div', { class: 'mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border p-2' },
        rtkVersionLine, rtkUp.state, rtkUp.btn,
        h('div', { class: 'ml-auto shrink-0' }, rtkSwitchRow));
      const rtkBody = h('div');
      // 插件未装时的一键安装行（本体未装另有提示行），装完原地撤下
      const rtkPluginRow = h('div');
      const renderRtkPluginRow = () => {
        rtkPluginRow.replaceChildren(...(rtkRes.hook ? [] : [
          pluginInstallCard('rtk', async () => {
            const meta = await rpc('/rtk');
            if (meta.ok) {
              Object.assign(rtkRes, meta);
              // 版本行 span 与 rtkCfg 都是弹窗打开时的未装态快照，装完必须重算/重建
              renderRtkVersion(meta);
              // rtkCfg 整体重建（未装态时内置清单为空，不重建则白名单区块渲染旧空清单）
              rtkCfg = {
                installed: meta.installed !== false,
                version: meta.version || '',
                binPath: meta.binPath || '',
                mode: meta.mode === 'off' ? 'off' : 'hint',
                whitelist: Array.isArray(meta.whitelist) ? [...meta.whitelist] : [],
                builtinGit: Array.isArray(meta.builtinGit) ? [...meta.builtinGit] : [],
                builtinPlain: Array.isArray(meta.builtinPlain) ? [...meta.builtinPlain] : [],
              };
            }
            renderRtkPluginRow();
            renderRtk();
          }),
        ]));
      };
      renderRtkPluginRow();
      // 简介置顶（与 Headroom 面板一致），其下插件安装卡，再下版本卡（含启用 rtk 压缩开关），再下白名单
      paneRtk.append(
        h('p', { class: 'text-ui-sm/relaxed text-foreground-subtle' }, L.rtkDesc),
        rtkPluginRow,
        rtkVersionCard,
        rtkBody);
      const renderRtk = () => {
        // 插件未装：只显示安装卡，隐藏版本卡与全部设置项（与 vision/headroom 未装时一致）
        if (rtkRes.ok && !rtkRes.hook) {
          rtkVersionCard.style.display = 'none';
          rtkBody.replaceChildren();
          return;
        }
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
            : [h('div', { class: 'flex items-center gap-2' },
                h('p', { class: 'min-w-0 flex-1 text-ui-sm text-amber-500' }, L.rtkNotInstalled),
                // 一键安装本体：与“检查更新”同一条 helper 升级管线（未装则装到 ~/.local/bin）
                (() => {
                  const b = btnSmall(L.rtkInstallBin, () => { void run(); }, 'shrink-0');
                  const run = async () => {
                    b.disabled = true;
                    b.textContent = L.headroomInstalling;
                    const res = await rpc('/rtk', { method: 'POST', body: { upgrade: true } });
                    if (!res.ok) {
                      b.disabled = false;
                      b.textContent = L.rtkInstallBin;
                      showToast(L.failed + ': ' + errText(res), 'error');
                      return;
                    }
                    const done = await new Promise((resolve) => {
                      const iv = setInterval(async () => {
                        const s = await rpc('/rtk/upgrade');
                        if (s.ok && s.upgrade && !s.upgrade.running) { clearInterval(iv); resolve(s.upgrade); }
                      }, 1200);
                      // 超时也要 resolve：否则按钮永久停在“安装中…”
                      setTimeout(() => { clearInterval(iv); resolve(null); }, 10 * 60 * 1000);
                    });
                    if (done && !done.error && done.version) {
                      const meta = await rpc('/rtk');
                      if (meta.ok) {
                        Object.assign(rtkRes, meta);
                        rtkCfg = { ...rtkCfg, installed: meta.installed !== false, version: meta.version || '', binPath: meta.binPath || '' };
                      }
                      showToast(L.rtkBinInstalled, 'success');
                      renderRtk();
                    } else {
                      b.disabled = false;
                      b.textContent = L.rtkInstallBin;
                      showToast((done && done.error) || L.headroomInstallRetry, 'error');
                    }
                  };
                  return b;
                })())]),
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

      // “Headroom”：编辑 headroom 插件配置（~/.zcode/headroom.json，
      // /hr-* 命令与钩子共用同一文件）。压缩设备/省电切换经 helper 调钩子动作改
      // （立即生效；切换设备会重启代理）；监视间隔直写配置，监视器下一轮巡检生效。
      // 可整面重渲染：未装插件时显示安装卡，安装成功后原地恢复完整面板。
      // 版本行与本体升级控件（pip 通道）在渲染函数外创建一次，重渲染时复用同一组节点
      const hrVersionLine = h('span', { class: 'shrink-0 whitespace-nowrap text-ui-xs/relaxed text-foreground-subtle' });
      let hrLocText = '';
      // 启用开关（与 rtk 面板同款，版本卡右上角）：开 = ZCode 供应商走 headroom，
      // 关 = 直连上游；只改供应商地址，不动代理进程（headroom 可被其他程序共用）
      const hrSwitchRow = h('div');
      const renderHrVersion = (meta) => {
        hrVersionLine.textContent = `插件 ${meta.pluginVersion || '—'}${meta.version ? ` · headroom ${meta.version}` : ''}`;
        hrLocText = meta.binPath || '';
      };
      renderHrVersion(headroomRes);
      const hrUp = makeUpgradeControls({
        endpoint: '/headroom',
        idleText: () => hrLocText,
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
            const res = await rpc('/plugins/update', { method: 'POST', body: { name: 'headroom' } });
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
              // 版本行 span 在弹窗打开时按未装态算过一次，装完必须重算
              renderHrVersion(headroomRes);
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
          const action = reqBody && reqBody.action;
          const isStart = action === 'start' || action === 'restart';
          const isStop = action === 'stop';
          // 生命周期按钮：点击瞬间就显示等待提示 + 计时（不等 RPC 返回——
          // RPC 里 helper 要杀/拉进程，期间 3-10 秒界面不能毫无反应）
          // RPC 先发出（不等返回——期间界面要显示等待反馈）
          const rpcDone = rpc('/headroom', { method: 'POST', body: reqBody });
          let timerIv = null;
          if (isStart || isStop) {
            const wantUp = isStart;
            const msg = action === 'restart' ? L.hrRestarting : isStart ? L.hrStarting : L.hrStopping;
            const doneMsg = isStart ? L.hrStarted : L.hrStopped;
            const timeoutMs = isStart ? 90 * 1000 : 30 * 1000;
            const t0 = Date.now();
            const timerSpan = h('span', { class: 'text-ui-sm text-foreground-subtle/70' }, msg + ' (0s)');
            hrStatusLine.replaceChildren(timerSpan);
            timerIv = setInterval(() => {
              timerSpan.textContent = msg + ` (${Math.round((Date.now() - t0) / 1000)}s)`;
            }, 1000);
            // RPC 完成后进入轮询（RPC 执行实际的 stop/start，可能要 3-10 秒）。
            // 轮询出结果前 hrBusy 一直占着：期间再点开关或按钮直接忽略，否则
            // 每次点击都会重发 start、把计时和启动流程从头来过
            void (async () => {
              const kick = await rpcDone;
              if (!kick.ok) return; // 失败由主流程提示并复位
              while (Date.now() - t0 < timeoutMs) {
                await new Promise((r) => setTimeout(r, 2000));
                const st = await rpc('/headroom/status');
                if (!st.ok) continue;
                const up = !!(st.status && st.status.up);
                if (up === wantUp) {
                  clearInterval(timerIv);
                  hrBusy = false;
                  await hrRefresh();
                  showToast(doneMsg, isStart ? 'success' : undefined);
                  return;
                }
              }
              clearInterval(timerIv);
              hrBusy = false;
              if (isStart) showToast(L.hrStartTimeout, 'error');
              void hrRefresh();
            })();
          }
          const res = await rpcDone;
          if (!res.ok) {
            if (timerIv) clearInterval(timerIv);
            hrBusy = false;
            showToast(L.failed + ': ' + errText(res), 'error');
            void hrRefresh();
            return false;
          }
          if (res.config) Object.assign(hrCfg, res.config);
          if (warn) showToast(warn);
          // 非生命周期动作（backend/power）：稍等后刷一次
          if (!isStart && !isStop) {
            hrBusy = false;
            setTimeout(() => { void hrRefresh(); }, 1200);
          }
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
        // 启用开关不走 hrRun：与代理进程无关，点击即时生效，也不受生命周期等待锁影响
        const renderHrUsageSwitch = () => {
          const usageOn = !!(headroomRes.usage && headroomRes.usage.enabled);
          hrSwitchRow.replaceChildren(
            settingRow(L.pluginEnable, '', usageOn, async () => {
              const next = !usageOn;
              const res = await rpc('/headroom', { method: 'POST', body: { usage: next } });
              if (!res.ok) {
                showToast(L.failed + ': ' + errText(res), 'error');
                return;
              }
              if (res.usage) headroomRes.usage = res.usage;
              renderHrUsageSwitch();
              if (next && !res.changed && !(res.usage && res.usage.enabled)) showToast(L.hrUsageNone);
            }));
        };
        renderHrUsageSwitch();
        const hrRefreshBtn = btnSmall(L.headroomRefresh, () => { void hrRefresh(); });
        const hrStartBtn = btnSmall(L.headroomStart, () => { void hrRun({ action: 'start' }); });
        const hrRestartBtn = btnSmall(L.headroomRestart, () => { void hrRun({ action: 'restart' }); });
        const hrStopBtn = btnSmall(L.headroomStopAction, () => {
          // 停止会断开指向该代理的供应商连接，需二次确认（与“切换文件夹”同款确认弹窗）
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

        // 省电自动切换：三态胶囊（同“链模式”的标签按钮），与监视间隔同一行
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

        // 本体未装：一键安装（pip 全新安装通道，helper 同一条升级任务管线）；
        // 装完刷新 meta 并整面重渲染（版本行、本体状态、代理控制全部就位）
        const hrInstallBinBtn = (() => {
          const b = btnSmall(L.hrInstallBin, () => { void run(); }, 'shrink-0');
          let busy = false;
          const run = async () => {
            if (busy) return;
            busy = true;
            b.disabled = true;
            b.textContent = L.headroomInstalling;
            const res = await rpc('/headroom', { method: 'POST', body: { upgrade: true } });
            if (!res.ok) {
              b.disabled = false;
              b.textContent = L.hrInstallBin;
              showToast(L.failed + ': ' + errText(res), 'error');
              busy = false;
              return;
            }
            // pip 下载大包可持续数分钟，轮询后台任务到结束（超时 resolve，避免按钮卡死）
            const done = await new Promise((resolve) => {
              const iv = setInterval(async () => {
                const s = await rpc('/headroom/upgrade');
                if (s.ok && s.upgrade && !s.upgrade.running) { clearInterval(iv); resolve(s.upgrade); }
              }, 2000);
              setTimeout(() => { clearInterval(iv); resolve(null); }, 12 * 60 * 1000);
            });
            busy = false;
            if (done && !done.error && done.version) {
              const meta = await rpc('/headroom');
              if (meta.ok) {
                renderHrVersion(meta);
                Object.assign(headroomRes, meta);
              }
              showToast(L.hrBinInstalled, 'success');
              renderHeadroomPane();
            } else {
              b.disabled = false;
              b.textContent = L.hrInstallBin;
              showToast((done && done.error) || L.headroomInstallRetry, 'error');
            }
          };
          return b;
        })();

        paneHeadroom.append(
          h('p', { class: 'text-ui-sm/relaxed text-foreground-subtle' }, L.headroomDesc),
          ...(headroomRes.installed === false
            ? [h('div', { class: 'mt-2 flex items-center gap-2' },
                h('p', { class: 'min-w-0 flex-1 text-ui-sm text-amber-500' }, L.headroomBinMissing),
                hrInstallBinBtn)]
            : []),
          h('div', { class: 'mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border p-2' },
            hrVersionLine, hrUp.state, hrUp.btn,
            h('div', { class: 'ml-auto shrink-0' }, hrSwitchRow)),
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

      // “任务名提示词”（位于“行为”标签页的二级标签）：新会话开始作答时 →
      // 按自定义供应商/提示词生成标题并按手动重命名写库。配置读写走 /title-gen
      //（存 zcodepro.json）；供应商下拉数据走 /title-gen/providers（与视觉代理
      // 同源，但只列 helper 能直连调用的条目）。
      // 结构性改动（开关/供应商/协议）即时保存，提示词与文本输入防抖保存。
      let titleGenCfg = titleGenRes.ok && titleGenRes.titleGen && typeof titleGenRes.titleGen === 'object'
        ? structuredClone(titleGenRes.titleGen) : null;
      const titleGenDefaultPrompt = titleGenRes.ok && typeof titleGenRes.defaultPrompt === 'string'
        ? titleGenRes.defaultPrompt : '';
      let titleGenSaveTimer = null;
      const persistTitleGen = async () => {
        const res = await rpc('/title-gen', { method: 'POST', body: { titleGen: titleGenCfg } });
        clearConfigCache();
        if (!res.ok) showToast(L.failed + ': ' + errText(res), 'error');
        return res.ok;
      };
      const saveTitleGenSoon = () => {
        clearTimeout(titleGenSaveTimer);
        titleGenSaveTimer = setTimeout(() => { void persistTitleGen(); }, 500);
      };
      const renderTitleGenPane = () => {
        if (!titleGenCfg) {
          paneTitleGen.replaceChildren(
            h('p', { class: 'text-ui-sm/relaxed text-foreground-subtle' }, L.titleGenShortDesc),
            h('p', { class: 'mt-2 text-ui-sm text-destructive' }, L.visionLoadFailed + ': ' + errText(titleGenRes)),
          );
          return;
        }
        const inputCls = 'h-8 w-full rounded-lg border border-border bg-input px-2.5 text-ui-sm text-foreground outline-none transition-shadow placeholder:text-foreground-subtle focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40';
        const field = (labelText, node) => h('label', { class: 'block min-w-0' },
          h('span', { class: 'mb-1 block text-ui-xs font-medium text-foreground-subtle' }, labelText), node);
        // 供应商 / 模型 / 地址密钥共用 provider-fields 的规则（详见该模块说明）。
        // 换供应商后重渲染：模型下拉换成新供应商的模型、地址字段按模式显隐；
        // 手动输入过的模型保留（不在新列表里时显示为“手动输入”项，是否改选
        // 由用户决定）
        const showInlineConn = isManualConn(titleGenCfg.provider, titleGenProviders);
        const providerCombo = comboField(
          titleGenCfg.provider || '',
          providerOptionsOf(titleGenProviders, L),
          (v, src) => {
            titleGenCfg.provider = v;
            if (src === 'select') { void persistTitleGen(); renderTitleGenPane(); }
            else saveTitleGenSoon();
          },
          { placeholder: L.titleGenProviderSession, staleLabel: L.titleGenProviderDeleted });
        const modelCombo = comboField(
          titleGenCfg.model || '',
          // 跟随会话时选项表头部有“跟随当前会话当前模型”（值为空，生成时用
          // 会话当前模型），选了具体模型后也能再切回它
          modelOptionsOf(titleGenCfg.provider, titleGenProviders, {
            followSession: true,
            followSessionLabel: L.titleGenModelFollowSession,
          }),
          (v) => { titleGenCfg.model = v; saveTitleGenSoon(); },
          {
            placeholder: modelPlaceholderOf(titleGenCfg.provider, L),
            emptyLabel: (titleGenCfg.provider || '').trim() === 'session'
              ? L.titleGenModelFollowSession : L.titleGenModelEmpty,
          });
        // 接口地址 / API Key / 协议（显隐见上方 showInlineConn）：不跟随时由
        // 用户填写；供应商被删时展示保存的副本，仍可直连或改填
        const textIn = (value, onInput, { type = 'text', placeholder = '' } = {}) => {
          const n = h('input', { type, value: value || '', placeholder, class: inputCls });
          n.addEventListener('input', () => onInput(n.value));
          return n;
        };
        const formatSel = h('select', { class: inputCls },
          h('option', { value: 'anthropic' }, 'anthropic'),
          h('option', { value: 'openai' }, 'openai'));
        formatSel.value = titleGenCfg.format === 'openai' ? 'openai' : 'anthropic';
        formatSel.addEventListener('change', () => {
          titleGenCfg.format = formatSel.value;
          void persistTitleGen();
        });
        const inlineConnCard = h('div', {
          class: 'mt-2 grid grid-cols-1 gap-2 rounded-xl border border-border p-2 sm:grid-cols-3',
          style: showInlineConn ? '' : 'display:none',
        },
          field(L.titleGenBaseUrl, textIn(titleGenCfg.baseUrl, (v) => { titleGenCfg.baseUrl = v; saveTitleGenSoon(); }, { placeholder: 'https://…' })),
          field(L.titleGenApiKey, textIn(titleGenCfg.apiKey, (v) => { titleGenCfg.apiKey = v; saveTitleGenSoon(); }, { type: 'password' })),
          field(L.titleGenFormat, formatSel));
        // 提示词：留空 = 内置默认；“查看默认提示词”把默认值载入编辑框供修改
        const promptArea = h('textarea', {
          class: 'zcodepro-textarea zcodepro-textarea-sm', rows: '8',
          placeholder: L.titleGenPromptPlaceholder,
        });
        promptArea.value = titleGenCfg.prompt || '';
        promptArea.addEventListener('input', () => { titleGenCfg.prompt = promptArea.value; saveTitleGenSoon(); });
        // 测试：用示例首条消息实际生成一次（不写库），验证供应商/模型/提示词
        // 连通；示例文本随界面语言取中英文版
        const sampleText = isZhLocale()
          ? '帮我看下这个报错是什么原因：NullPointerException at com.example.OrderService.calculate(OrderService.java:87)'
          : 'Why does my Spring Boot app throw NullPointerException intermittently in OrderService.calculate?';
        const sampleInput = h('input', {
          type: 'text', class: inputCls + ' min-w-0 flex-1',
          value: sampleText,
        });
        let testBtn;
        const testState = h('span', { class: 'min-w-0 flex-1 truncate text-ui-xs/relaxed text-foreground-subtle' });
        testBtn = btnSmall(L.titleGenTest, async () => {
          testBtn.disabled = true;
          testBtn.textContent = L.titleGenTesting;
          testState.textContent = L.titleGenTesting;
          const res = await rpc('/title-gen/run', {
            method: 'POST',
            body: { text: sampleInput.value, test: true },
          });
          testBtn.disabled = false;
          testBtn.textContent = L.titleGenTest;
          if (res && res.ok) {
            testState.textContent = L.titleGenTestOk + res.title;
            showToast(res.title, 'success');
          } else {
            testState.textContent = (res && errText(res)) || L.titleGenTestFailed;
            testState.className = 'min-w-0 flex-1 truncate text-ui-xs/relaxed text-destructive';
            showToast(L.titleGenTestFailed + ': ' + (res ? errText(res) : ''), 'error');
          }
        }, 'shrink-0');
        paneTitleGen.replaceChildren(
          // 信息卡：一句话简介在左，启用开关右对齐
          h('div', { class: 'mt-3 flex items-center justify-between gap-2 rounded-xl border border-border p-2' },
            h('span', { class: 'min-w-0 text-ui-sm/relaxed text-foreground-subtle' }, L.titleGenShortDesc),
            h('div', { class: 'shrink-0' }, settingRow(L.titleGenEnabled, '', titleGenCfg.enabled === true, async () => {
              titleGenCfg.enabled = !(titleGenCfg.enabled === true);
              await persistTitleGen();
              renderTitleGenPane();
            }))),
          // 供应商 + 模型
          h('div', { class: 'mt-2 grid grid-cols-1 gap-2 rounded-xl border border-border p-2 sm:grid-cols-2' },
            field(L.titleGenProvider, providerCombo),
            field(L.titleGenModel, modelCombo)),
          inlineConnCard,
          // 提示词 + 载入默认
          h('div', { class: 'mt-2 rounded-xl border border-border p-2' },
            h('div', { class: 'mb-1 flex items-center justify-between gap-2' },
              h('span', { class: 'text-ui-xs font-medium text-foreground-subtle' }, L.titleGenPrompt),
              btnSmall(L.titleGenPromptReset, () => {
                promptArea.value = titleGenDefaultPrompt;
                titleGenCfg.prompt = titleGenDefaultPrompt;
                void persistTitleGen();
                promptArea.focus();
              })),
            promptArea),
          // 测试
          h('div', { class: 'mt-2 flex items-center gap-2 rounded-xl border border-border p-2' },
            sampleInput, testBtn),
          testState,
        );
      };
      renderTitleGenPane();

      body.append(
        statusLine,
        tablist,
        paneFeatures,
        paneAgents,
        paneStyles,
        panePerf,
        paneProxy,
        paneSync,
        paneVision,
        paneHeadroom,
        paneRtk,
        paneDebug,
      );
    },
  });
}
