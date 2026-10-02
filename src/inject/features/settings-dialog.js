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
    // 宽度类必须用宿主样式表已有的工具类（注入的类名不会生成 CSS）：
    // sm:max-w-3xl 不存在会失去约束拉满全屏；max-w-2xl=42rem 存在且尺寸合适
    width: 'max-w-2xl',
    overlay: 'none',
    draggable: true,
    posKey: 'settings',
    dismissOnOutside: false,
    onMount: async ({ body, close }) => {
      const health = await rpc('/health');
      const config = await getConfig(true);
      const agentsRes = await rpc('/agents');
      const visionRes = await rpc('/vision');
      const rtkRes = await rpc('/rtk');

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

      // 底部推荐卡片：插件市场 + QQ 交流群，同一行两列（依赖宿主 openExternal 打开系统浏览器）
      let recCards = null;
      if (typeof window !== 'undefined' && typeof window.zcode?.openExternal === 'function') {
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
        const recCard = (title, desc, url) => h('div', {
          class: 'flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-border p-3 transition-colors hover:bg-surface-hover',
          onClick: () => {
            try { void window.zcode.openExternal(url); } catch { /* ignore */ }
          },
        },
          h('div', { class: 'min-w-0' },
            h('div', { class: 'truncate text-ui-sm font-medium text-foreground' }, title),
            h('div', { class: 'mt-0.5 truncate text-ui-xs/relaxed text-foreground-subtle' }, desc)),
          extIcon());
        recCards = h('div', { class: 'mt-3 grid grid-cols-2 gap-2' },
          recCard(L.plugTitle, L.plugDesc, 'https://github.com/duanluan/zcode-plugins'),
          recCard(L.qqGroupTitle, L.qqGroupDesc, 'https://qm.qq.com/q/WXuISJK3ug'));
      }

      // 标签页切换：功能（现有内容）/ 样式调整 / 全局提示词 / 视觉代理
      let activeTab = 'features';
      // 插件更新卡片：显示 duanluan-zcode-plugins 市场状态，一键更新（helper /plugins/* 端点）；
      // 状态异步加载，打开弹窗不等待
      const pluginsStatusLine = h('span', { class: 'text-ui-xs/relaxed text-foreground-subtle' }, '…');
      const pluginsBtn = btnSecondary(L.pluginsCheckNow, () => { void runPluginsUpdate(); }, 'h-7 px-3 text-ui-xs');
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
      const pluginsCard = h('div', { class: 'mt-3 flex items-center justify-between gap-2 rounded-xl border border-border p-3' },
        h('div', { class: 'min-w-0' },
          h('div', { class: 'truncate text-ui-sm font-medium text-foreground' }, L.pluginsUpdateTitle),
          h('div', { class: 'mt-0.5 truncate text-ui-xs/relaxed text-foreground-subtle' }, pluginsStatusLine)),
        pluginsBtn);
      const paneFeatures = h('div', { role: 'tabpanel', class: 'mt-4' },
        h('div', {}, rows),
        pluginsCard,
        ...(recCards ? [recCards] : []),
      );
      const paneStyles = h('div', { role: 'tabpanel', class: 'mt-4', style: 'display:none' });
      const paneAgents = h('div', { role: 'tabpanel', class: 'mt-4', style: 'display:none' });
      const paneVision = h('div', { role: 'tabpanel', class: 'mt-4', style: 'display:none' });
      const paneRtk = h('div', { role: 'tabpanel', class: 'mt-4', style: 'display:none' });
      const panes = { features: paneFeatures, styles: paneStyles, agents: paneAgents, vision: paneVision, rtk: paneRtk };
      const tabDefs = [
        ['features', L.tabFeatures],
        ['styles', L.tabStyles],
        ['agents', L.tabAgents],
        ['vision', L.tabVision],
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

      // 「视觉代理」：编辑 ~/.zcode/zcode-vision.json（zcode-vision 插件与 /vision-* 命令共用同一文件）。
      // 代理列表顺序即执行链；结构性改动（开关/模式/排序/删增）即时保存，文本输入防抖保存。
      // 注意：保存时链按全部代理重建——若用 /vision-chain 配过子集链，会被这里覆盖（两套入口语义如此，面板以列表为准）。
      const VISION_DEFAULT_CFG = {
        enabled: true,
        chainMode: 'fallback',
        chain: ['glm-flash'],
        proxies: [
          { name: 'glm-flash', baseUrl: 'https://open.bigmodel.cn/api/anthropic', model: 'glm-5.3-flash', apiKey: '', format: 'anthropic', prompt: '请详细描述这张图片的全部内容。若是界面或图表截图，请先把所有错误、警告、异常状态逐字引用出来（含完整原文），再描述整体布局、文字与关键数据。' },
        ],
        pollMs: 3000,
        apiTimeoutMs: 60000,
        compressThresholdKB: 1024,
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
      const renderVision = () => {
        if (!visionCfg) {
          const initBtn = btnSecondary(L.visionAddProxy, async () => {
            const res = await rpc('/vision', { method: 'POST', body: { config: VISION_DEFAULT_CFG } });
            if (res.ok) { visionCfg = structuredClone(res.config); renderVision(); }
            else showToast(L.failed + ': ' + errText(res), 'error');
          }, 'h-7 px-3 text-ui-xs');
          paneVision.replaceChildren(
            h('p', { class: 'text-ui-sm/relaxed text-foreground-subtle' }, L.visionDesc),
            ...(visionRes.ok ? [] : [h('p', { class: 'mt-2 text-ui-sm text-destructive' }, L.visionLoadFailed + ': ' + errText(visionRes))]),
            h('div', { class: 'mt-3 flex justify-end' }, initBtn),
          );
          return;
        }
        const field = (labelText, node) => h('label', { class: 'block min-w-0' },
          h('span', { class: 'mb-1 block text-ui-xs font-medium text-foreground-subtle' }, labelText), node);
        const smallBtn = (text, onClick, extra = '') => btnSecondary(text, onClick, 'h-7 px-2.5 text-ui-xs ' + extra);
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
        const cards = visionCfg.proxies.map((p, i) => h('div', { class: 'mt-2 rounded-xl border border-border p-3' },
          h('div', { class: 'flex flex-wrap items-center gap-2' },
            h('span', { class: 'shrink-0 rounded-md bg-surface px-1.5 py-0.5 text-ui-xs tabular-nums text-foreground-subtle' }, String(i + 1)),
            textIn(p.name, (v) => { p.name = v; saveVisionSoon(); }, { placeholder: L.visionName }),
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
              const n = h('input', { type: 'text', value: p.useProvider || '', placeholder: L.visionUseProviderHint, class: visionInputCls });
              n.addEventListener('input', () => { p.useProvider = n.value.trim(); saveVisionSoon(); });
              return n;
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
          h('div', { class: 'mt-3 rounded-xl border border-border p-1.5' },
            settingRow(L.visionEnabled, L.visionEnabledDesc, visionCfg.enabled !== false, async () => {
              visionCfg.enabled = !(visionCfg.enabled !== false);
              await persistVision();
              renderVision();
            }),
          ),
          h('div', { class: 'mt-2 flex items-center gap-1.5 rounded-xl border border-border p-1.5' },
            h('span', { class: 'ml-1.5 shrink-0 text-ui-sm font-medium text-foreground' }, L.visionMode),
            modeBtn('fallback', L.visionModeFallback, L.visionModeFallbackDesc),
            modeBtn('pipeline', L.visionModePipeline, L.visionModePipelineDesc),
            (() => {
              const n = h('input', { type: 'number', min: '0', step: '128', title: L.visionCompressKBHint,
                class: 'ml-auto h-7 w-28 rounded-lg border border-border bg-input px-2 text-right text-ui-xs tabular-nums text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40' });
              n.value = String(Number.isFinite(visionCfg.compressThresholdKB) ? visionCfg.compressThresholdKB : 1024);
              n.addEventListener('change', () => {
                visionCfg.compressThresholdKB = Math.max(0, Math.round(Number(n.value) || 0));
                n.value = String(visionCfg.compressThresholdKB);
                void persistVision();
              });
              return h('label', { class: 'flex shrink-0 items-center gap-1.5', title: L.visionCompressKBHint },
                h('span', { class: 'text-ui-xs font-medium text-foreground-subtle' }, L.visionCompressKB), n);
            })()),
          ...cards,
          h('div', { class: 'mt-2 flex items-center justify-between' },
            smallBtn('+ ' + L.visionAddProxy, () => {
              // 名称留空时 helper 校验会拒绝保存；等用户输入名称后防抖保存
              visionCfg.proxies.push({ name: '', baseUrl: 'https://open.bigmodel.cn/api/anthropic', model: 'glm-5.3-flash', apiKey: '', format: 'anthropic', prompt: '' });
              renderVision();
            }),
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
          }
        : null;
      const persistRtk = async (partial) => {
        const res = await rpc('/rtk', { method: 'POST', body: partial });
        if (!res.ok) showToast(L.failed + ': ' + errText(res), 'error');
        return res.ok;
      };
      const rtkInputCls = 'h-8 w-full rounded-lg border border-border bg-input px-2.5 text-ui-sm text-foreground outline-none transition-shadow placeholder:text-foreground-subtle focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40';
      const renderRtk = () => {
        if (!rtkCfg) {
          paneRtk.replaceChildren(
            h('p', { class: 'text-ui-sm/relaxed text-foreground-subtle' }, L.rtkDesc),
            h('p', { class: 'mt-2 text-ui-sm text-destructive' }, L.rtkLoadFailed + ': ' + errText(rtkRes)),
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
        paneRtk.replaceChildren(
          h('p', { class: 'text-ui-sm/relaxed text-foreground-subtle' }, L.rtkDesc),
          ...(rtkCfg.installed
            ? [h('p', { class: 'mt-2 text-ui-xs text-foreground-subtle' },
                `${rtkCfg.version || 'rtk'}${rtkCfg.binPath ? ' · ' + rtkCfg.binPath : ''}`)]
            : [h('p', { class: 'mt-2 text-ui-sm text-amber-500' }, L.rtkNotInstalled)]),
          h('div', { class: 'mt-3 rounded-xl border border-border p-1.5' },
            settingRow(L.rtkEnabled, L.rtkEnabledDesc, rtkCfg.mode === 'hint', async () => {
              const next = rtkCfg.mode === 'hint' ? 'off' : 'hint';
              if (await persistRtk({ mode: next })) {
                rtkCfg.mode = next;
                renderRtk();
              }
            })),
          h('div', { class: 'mt-2 rounded-xl border border-border p-3' },
            h('div', { class: 'text-ui-sm font-medium text-foreground' }, L.rtkWhitelistTitle),
            h('p', { class: 'mt-1 text-ui-xs/relaxed text-foreground-subtle' }, L.rtkWhitelistDesc),
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
              btnSecondary(L.rtkWhitelistAdd, () => { void addEntry(); }, 'h-7 shrink-0 px-3 text-ui-xs'),
              btnSecondary(L.rtkWhitelistClear, () => {
                void (async () => {
                  if (rtkCfg.whitelist.length === 0) return;
                  if (await persistRtk({ whitelist: [] })) {
                    rtkCfg.whitelist = [];
                    renderRtk();
                    showToast(L.rtkWhitelistCleared);
                  }
                })();
              }, 'h-7 shrink-0 px-3 text-ui-xs'))),
        );
      };
      renderRtk();

      body.append(
        statusLine,
        tablist,
        paneFeatures,
        paneStyles,
        paneAgents,
        paneVision,
        paneRtk,
      );
      body.append(
        dialogFooter(btnPrimary(L.close, () => close()))
      );
    },
  });
}
