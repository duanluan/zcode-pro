// 供应商 / 模型 / 接口地址 / API Key 的共用选择逻辑：智能起名与视觉代理两个
// 设置面板共用，后续其他面板直接复用这里的组件与规则。供应商取值约定：
// - ''：不跟随（自填接口地址 + API Key + 协议直连）；
// - 'session'：跟随当前会话（连接由会话侧解析，不存地址密钥）；
// - 其余：供应商 id；已删的 id 保留为「已删除」选项，调用方靠保存的地址/
//   密钥副本继续直连。
import { h } from './core.js';

export const PROVIDER_FIELD_CLS = 'h-8 w-full rounded-lg border border-border bg-input px-2.5 text-ui-sm text-foreground outline-none transition-shadow placeholder:text-foreground-subtle focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40';

// 「下拉 + 手输」组合（供应商与模型选择共用）：下拉选择列表项，也可以直接
// 输入；当前值不在列表里（条目被删或手输 id）时保留为带 staleLabel 标注的
// 选项，不清空、不跳值；当前值为空时插入一个 emptyLabel 空选项，避免下拉框
// 假装选中第一项而配置里其实没选
export function comboField(current, options, onChange, { disabled = false, placeholder = '', staleLabel = '（手动输入）', emptyLabel = '' } = {}) {
  const sel = h('select', { class: PROVIDER_FIELD_CLS, disabled: disabled || undefined });
  const input = h('input', { type: 'text', value: current, placeholder, class: PROVIDER_FIELD_CLS, disabled: disabled || undefined });
  const sync = () => {
    const cur = input.value;
    const opts = [...options];
    if (cur && !opts.some((o) => o.value === cur)) opts.push({ value: cur, label: `${cur}${staleLabel}` });
    if (!cur && !opts.some((o) => o.value === '')) opts.unshift({ value: '', label: emptyLabel });
    sel.replaceChildren(...opts.map((o) => h('option', { value: o.value, title: o.value }, o.label)));
    sel.value = cur;
  };
  sel.addEventListener('change', () => { input.value = sel.value; onChange(sel.value, 'select'); });
  input.addEventListener('input', () => onChange(input.value, 'type'));
  input.addEventListener('blur', () => sync());
  sync();
  return h('div', { class: 'flex flex-col gap-1' }, sel, input);
}

// 供应商下拉选项：不跟随（自填地址）/ 跟随当前会话 / 供应商列表
export function providerOptionsOf(providers, L) {
  return [
    { value: '', label: L.titleGenProviderNone },
    { value: 'session', label: L.titleGenProviderSession },
    ...providers.map((p) => ({ value: p.id, label: p.name })),
  ];
}

// 模型下拉选项：具体供应商 = 该供应商的模型；跟随会话 = 汇总全部供应商的
// 模型（去重，方便快速选一个）；不跟随 / 已删供应商 = 空列表（纯手输）
export function modelOptionsOf(providerValue, providers) {
  const v = (providerValue || '').trim();
  const cur = providers.find((p) => p.id === v);
  if (cur) return cur.models.map((m) => ({ value: m, label: m }));
  if (v === 'session') return [...new Set(providers.flatMap((p) => p.models))].map((m) => ({ value: m, label: m }));
  return [];
}

// 模型输入框的提示文案（按供应商模式选）
export function modelPlaceholderOf(providerValue, L) {
  const v = (providerValue || '').trim();
  if (v === 'session') return L.titleGenModelSessionHint;
  if (v === '') return L.titleGenModelManualHint;
  return L.titleGenModelHint;
}

// 是否手动连接（不跟随，或供应商 id 已不在列表里）：调用方据此决定接口
// 地址 / API Key / 协议字段是否显示
export function isManualConn(providerValue, providers) {
  const v = (providerValue || '').trim();
  return v === '' || (v !== 'session' && !providers.some((p) => p.id === v));
}
