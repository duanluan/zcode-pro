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
    description: L.settingsSubtitle,
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
        class: 'flex items-center gap-2 text-ui-sm ' + (health.ok ? 'text-foreground-subtle' : 'text-destructive'),
        'data-zcodepro-status': '1',
      },
        h('span', {
          class: 'inline-block size-2 rounded-full ' + (health.ok ? 'bg-emerald-500' : 'bg-destructive'),
        }),
        health.ok ? L.statusOk : L.statusDown,
        health.ok ? h('span', { class: 'text-foreground-subtle/70' }, ` · ${L.version} ${health.version} · ${L.injectedPages} ${health.injectedPages ?? 0}`) : null
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
          settingRow(L.featureEntry, L.featureEntryDesc, f.headerSettingsEntry !== false, async () => {
            const next = !(f.headerSettingsEntry !== false);
            if (await setFeature('headerSettingsEntry', next)) f.headerSettingsEntry = next;
            refreshRows();
          })
        );
      };
      refreshRows();

      body.append(
        statusLine,
        h('div', { class: 'mt-4' }, rows),
        h('p', { class: 'mt-3 text-ui-xs/relaxed text-foreground-subtle' }, HELPER_URL)
      );
      body.append(
        dialogFooter(btnPrimary(L.close, () => close()))
      );
    },
  });
}
