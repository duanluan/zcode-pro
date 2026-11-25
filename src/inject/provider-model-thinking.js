// 供应商 + 模型 + 思考级别「三件套」的共用封装：设置页里的翻译通道、
// 视觉代理、自动重命名三处都用同一套，避免各写一份下拉与档位映射逻辑。
//
// 分工：
// - 供应商 / 模型的下拉选项与“已删除 / 手动输入”标注沿用 provider-fields.js
// - 思考级别的可用档位与自动转换沿用 thinking-levels.js（如 max 遇到只支持
//   开关的模型自动降为 enabled）
//
// 三处差异只在“怎么存”，所以调用方传入 value（当前配置）与 onChange（写回），
// 本模块只负责生成 DOM、算档位、必要时触发重绘。
import { h } from './core.js';
import { comboField, providerOptionsOf, modelOptionsOf, modelPlaceholderOf, isManualConn } from './provider-fields.js';
import { thinkingLabel, resolveThinkingOptions } from './thinking-levels.js';

// 统一的字段包装（标签在上、控件在下），与设置页各处的 field() 视觉一致
export function fieldBlock(labelText, node) {
  return h('label', { class: 'block min-w-0' },
    h('span', { class: 'mb-1 block text-ui-xs font-medium text-foreground-subtle' }, labelText),
    node);
}

// 生成「供应商 + 模型 + 思考级别」三个字段。
//
// 参数：
// - providers: 供应商表（来自 /title-gen/providers 或 /translate/providers）
// - L: 文案字典
// - provider / model / thinking: 当前值（字符串）
// - withManual: 是否提供“不跟随（自填地址）”选项。翻译与 vision 需要
//   （vision 有 baseUrl/apiKey 手填卡），自动重命名也会用到，故默认 true
// - sessionInfo: /translate/session-model 的结果，用于“跟随会话当前模型”时
//   按会话模型的实际档位自适应（拿不到则按供应商表推断）
// - labels: { provider, model, thinking } 三个字段的标题，各页文案不同
// - onChange(patch): 值变化时回调，patch 形如 { provider, model, thinking }
//   patch.thinking 是已按模型档位自适应后的值，调用方直接存即可
// - requestRender: 换供应商/模型后需要重绘整块（模型下拉随供应商变、
//   思考档位随模型变）。传入则调用它，不传则只更新回调
//
// 返回：{ fields: [DOM, DOM, DOM], refresh(): 重新计算并重建 }
export function providerModelThinkingFields({
  providers,
  L,
  provider = '',
  model = '',
  thinking = 'off',
  sessionInfo = null,
  withManual = true,
  labels,
  onChange,
  requestRender = null,
}) {
  const field = fieldBlock;
  const LBL = labels || {
    provider: L.titleGenProvider,
    model: L.titleGenModel,
    thinking: L.translateThinking,
  };
  // 当前三件套的状态；每次变更后同步，供思考档位计算与回调使用
  const state = { provider, model, thinking };

  // 供应商选项：withManual 时含“不跟随（自填地址）”，否则只有会话与具体供应商
  const providerOpts = withManual
    ? providerOptionsOf(providers, L)
    : [{ value: 'session', label: L.titleGenProviderSession },
       ...providers.map((p) => ({ value: p.id, label: p.name }))];

  const providerCombo = comboField(
    state.provider || '',
    providerOpts,
    (v, src) => {
      state.provider = v;
      // 只在切到“跟随会话”时清空模型（跟随会话的模型由会话决定，留着旧供应商
      // 的模型名没有意义）。切到另一个具体供应商时保留原模型名——与原实现一致，
      // 同名模型（如多个供应商都有 glm-5.3）不会被误清
      if (v === 'session') state.model = '';
      // 换供应商后档位可能不再合法：立即按新模型的档位自适应
      const opts = resolveThinkingOptions(providers, state, sessionInfo);
      state.thinking = opts.current;
      onChange({ provider: state.provider, model: state.model, thinking: state.thinking });
      if (src === 'select' && requestRender) requestRender();
    },
    { placeholder: L.titleGenProviderSession, staleLabel: L.titleGenProviderDeleted },
  );

  const modelCombo = comboField(
    state.model || '',
    modelOptionsOf(state.provider, providers, {
      followSession: (state.provider || '').trim() === 'session',
      followSessionLabel: L.titleGenModelFollowSession,
    }),
    (v, src) => {
      state.model = v.trim();
      const opts = resolveThinkingOptions(providers, state, sessionInfo);
      state.thinking = opts.current;
      onChange({ provider: state.provider, model: state.model, thinking: state.thinking });
      if (src === 'select' && requestRender) requestRender();
    },
    {
      placeholder: modelPlaceholderOf(state.provider, L),
      emptyLabel: (state.provider || '').trim() === 'session'
        ? L.titleGenModelFollowSession : L.titleGenModelEmpty,
    },
  );

  // 思考级别：可选档位来自所选模型（跟随会话时用会话模型），当前值已自适应。
  // 模型不支持思考时 variants 为空：此时仍要显示一个「关」选项，否则下拉框
  // 全空白，用户看不出发生了什么
  const opts = resolveThinkingOptions(providers, state, sessionInfo);
  const variants = opts.variants.length ? opts.variants : ['off'];
  const thinkSel = h('select', {
    class: 'h-8 w-full rounded-lg border border-border bg-input px-2.5 text-ui-sm text-foreground outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40',
    title: opts.unsupported ? L.translateThinkingUnsupported : L.translateThinking,
    disabled: opts.unsupported ? true : undefined,
  },
  ...variants.map((k) => {
    const o = h('option', { value: k }, thinkingLabel(k, L));
    if (opts.display === k) o.selected = true;
    return o;
  }));
  thinkSel.addEventListener('change', () => {
    state.thinking = thinkSel.value;
    onChange({ provider: state.provider, model: state.model, thinking: state.thinking });
  });

  const providerFieldEl = field(LBL.provider, providerCombo);
  const modelFieldEl = field(LBL.model, modelCombo);
  const thinkingFieldEl = field(LBL.thinking, thinkSel);

  return {
    fields: [providerFieldEl, modelFieldEl, thinkingFieldEl],
    // 外部（如拿到新的 sessionInfo 后）可调用它重新算一次档位并回写
    syncThinking() {
      const o = resolveThinkingOptions(providers, state, sessionInfo);
      if (o.current !== state.thinking) {
        state.thinking = o.current;
        onChange({ provider: state.provider, model: state.model, thinking: state.thinking });
      }
      return o.current;
    },
    getState() { return { ...state }; },
    isManual: () => isManualConn(state.provider, providers),
  };
}
