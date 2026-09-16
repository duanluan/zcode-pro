// “ZCode Pro 增强设置”弹窗：功能开关 + 运行状态。
// 开关立即写入 helper 的配置文件（~/.zcode/zcodepro.json），下次打开菜单即生效。
import { h, t, rpc, getConfig, clearConfigCache, HELPER_URL } from '../core.js';
import { openDialog, dialogFooter, btnPrimary, settingRow, ensureStyle } from '../ui.js';
import { refreshAliases } from './alias.js';

export function openSettingsDialog() {
  ensureStyle();
  const L = t();
  openDialog({
    title: L.settingsTitle,
    width: 'max-w-lg',
    onMount: async ({ body, close }) => {
      const health = await rpc('/health');
      const config = health.ok ? { features: health.features } : await getConfig();

      const setFeature = async (key, value) => {
        const res = await rpc('/config', { method: 'POST', body: { features: { [key]: value } } });
        clearConfigCache();
        if (!res.ok) {
          body.querySelector('[data-zcodepro-status]').replaceChildren(
            h('span', { class: 'text-ui-sm text-destructive' }, L.failed + ': ' + (res.error || ''))
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

      body.append(
        statusLine,
        h('div', { class: 'mt-4' }, rows),
        ...(pluginCard ? [pluginCard] : [])
      );
      body.append(
        dialogFooter(btnPrimary(L.close, () => close()))
      );
    },
  });
}
