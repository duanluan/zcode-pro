// “ZCode Pro 增强设置”弹窗：功能开关 + 样式调整 + 运行状态。
// 顶部标签页切换（视觉参考侧栏「分组/项目」切换）；配置写入 helper（~/.zcode/zcodepro.json）。
import { h, t, rpc, getConfig, clearConfigCache, errText, HELPER_URL } from '../core.js';
import { openDialog, dialogFooter, btnPrimary, btnSecondary, settingRow, ensureStyle, showToast, numberField, unitField } from '../ui.js';
import { refreshAliases } from './alias.js';
import { applyStyles, STYLE_DEFAULTS } from './styles.js';

export function openSettingsDialog() {
  ensureStyle();
  const L = t();
  openDialog({
    title: L.settingsTitle,
    width: 'max-w-lg',
    overlay: 'none',
    draggable: true,
    posKey: 'settings',
    dismissOnOutside: false,
    onMount: async ({ body, close }) => {
      const health = await rpc('/health');
      const config = await getConfig(true);
      const agentsRes = await rpc('/agents');

      const setFeature = async (key, value) => {
        const res = await rpc('/config', { method: 'POST', body: { features: { [key]: value } } });
        clearConfigCache();
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
          settingRow(L.featureAlias, L.featureAliasDesc, f.projectAlias !== false, async () => {
            const next = !(f.projectAlias !== false);
            if (await setFeature('projectAlias', next)) f.projectAlias = next;
            refreshRows();
            // 关闭后立即还原真实名称；开启则按表重新渲染
            await refreshAliases();
          }),
          settingRow(L.featureRelocate, L.featureRelocateDesc, f.projectRelocate !== false, async () => {
            const next = !(f.projectRelocate !== false);
            if (await setFeature('projectRelocate', next)) f.projectRelocate = next;
            refreshRows();
          }),
          settingRow(L.featureTaskOrder, L.featureTaskOrderDesc, f.taskOrder !== false, async () => {
            const next = !(f.taskOrder !== false);
            if (await setFeature('taskOrder', next)) f.taskOrder = next;
            refreshRows();
          }),
          settingRow(L.featureFileActions, L.featureFileActionsDesc, f.fileActions !== false, async () => {
            const next = !(f.fileActions !== false);
            if (await setFeature('fileActions', next)) f.fileActions = next;
            refreshRows();
          }),
          settingRow(L.featurePinnedExpand, L.featurePinnedExpandDesc, f.pinnedKeepCollapsed !== false, async () => {
            const next = !(f.pinnedKeepCollapsed !== false);
            if (await setFeature('pinnedKeepCollapsed', next)) f.pinnedKeepCollapsed = next;
            refreshRows();
          }),
        );
      };
      refreshRows();

      // 推荐卡片：作者自己的 ZCode 插件合集（依赖宿主 openExternal 打开系统浏览器）
      let pluginCard = null;
      if (typeof window !== 'undefined' && typeof window.zcode?.openExternal === 'function') {
        const ns = 'http://www.w3.org/2000/svg';
        const icon = h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
          'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
          class: 'size-4 shrink-0 text-foreground-subtle' });
        for (const d of ['M15 3h6v6', 'M10 14 21 3', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6']) {
          const p2 = document.createElementNS(ns, 'path');
          p2.setAttribute('d', d);
          icon.append(p2);
        }
        pluginCard = h('div', {
          class: 'mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-surface-hover',
          onClick: () => {
            try { void window.zcode.openExternal('https://github.com/duanluan/zcode-plugins'); } catch { /* ignore */ }
          },
        },
          h('div', { class: 'min-w-0 flex-1' },
            h('div', { class: 'text-ui-sm font-medium text-foreground' }, L.plugTitle),
            h('div', { class: 'mt-0.5 text-ui-xs/relaxed text-foreground-subtle' }, L.plugDesc)),
          icon);
      }

      // 标签页切换：功能（现有内容）/ 样式调整 / 全局提示词
      let activeTab = 'features';
      const paneFeatures = h('div', { role: 'tabpanel', class: 'mt-4' },
        h('div', {}, rows),
        ...(pluginCard ? [pluginCard] : []),
      );
      const paneStyles = h('div', { role: 'tabpanel', class: 'mt-4', style: 'display:none' });
      const paneAgents = h('div', { role: 'tabpanel', class: 'mt-4', style: 'display:none' });
      const panes = { features: paneFeatures, styles: paneStyles, agents: paneAgents };
      const tabDefs = [
        ['features', L.tabFeatures],
        ['styles', L.tabStyles],
        ['agents', L.tabAgents],
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
      const styleCell = (name, tip, key, { min = 0, max = 48, step = 1, unit = 'px' } = {}) => {
        const field = numberField({
          value: typeof savedStyles[key] === 'number' ? savedStyles[key] : null,
          fallback: STYLE_DEFAULTS[key],
          min, max, step,
          onCommit: (v) => persistStyles({ [key]: v }),
        });
        return {
          field,
          el: h('div', { class: 'flex items-center justify-between gap-2 p-2.5' },
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
      const widthCell = {
        field: widthField,
        el: h('div', { class: 'flex items-center justify-between gap-2 p-2.5' },
          h('span', { class: 'min-w-0 truncate text-ui-sm font-medium text-foreground', title: L.contentWidthDesc }, L.contentWidthName),
          widthField.el),
      };
      const cells = [
        widthCell,
        styleCell(L.rowGapName, L.rowGapDesc, 'rowGap'),
        styleCell(L.userLineHeightName, L.userLineHeightDesc, 'userLineHeight', { min: 1, max: 3, step: 0.05, unit: 'x' }),
        styleCell(L.lineHeightName, L.lineHeightDesc, 'lineHeight', { min: 1, max: 3, step: 0.05, unit: 'x' }),
        styleCell(L.listSpacingName, L.listSpacingDesc, 'listSpacing'),
        styleCell(L.listItemSpacingName, L.listItemSpacingDesc, 'listItemSpacing'),
        styleCell(L.quoteCodeSpacingName, L.quoteCodeSpacingDesc, 'quoteCodeSpacing'),
      ];
      paneStyles.append(
        h('div', { class: 'grid grid-cols-2 gap-2 rounded-xl border border-border p-1.5' },
          ...cells.map((c) => h('div', { class: 'rounded-lg transition-colors hover:bg-surface-hover' }, c.el))),
        h('div', { class: 'mt-2 flex justify-end' },
          btnSecondary(L.resetDefault, () => {
            for (const c of cells) c.field.reset();
            persistStyles({ rowGap: null, listSpacing: null, listItemSpacing: null, quoteCodeSpacing: null, lineHeight: null, userLineHeight: null, contentWidth: null });
          }, 'h-7 px-3 text-ui-xs')),
      );

      // 「全局提示词」：编辑 ~/.zcode/AGENTS.md（helper /agents 端点读写）。
      // 大段文本不做即存即生效——显式保存；未修改时保存按钮禁用
      const agentsArea = h('textarea', {
        class: 'zcodepro-textarea',
        placeholder: L.agentsPlaceholder,
        spellcheck: 'false',
      });
      const agentsSaveBtn = btnPrimary(L.agentsSave, () => { void saveAgents(); }, 'h-7 px-3 text-ui-xs');
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

      body.append(
        statusLine,
        tablist,
        paneFeatures,
        paneStyles,
        paneAgents,
      );
      body.append(
        dialogFooter(btnPrimary(L.close, () => close()))
      );
    },
  });
}
