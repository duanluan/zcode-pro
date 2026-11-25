// 思考档位的可选值：各模型的档位不同（GLM 是 low/high/max，MiMo 只有
// off/enabled，Meta 有 minimal…max 六档），档位数据来自 helper 的
// /translate/providers 里每个供应商的 modelReasoning（与 ZCode 界面同源，
// 读的是 v2/config.json 的 models.<id>.reasoning）。
// 设置页与翻译面板共用这里的计算，避免两处各写一套规则。

// 档位显示名：已知档位给本地化文案，未知档位原样显示
export function thinkingLabel(level, L) {
  const key = 'translateThinking_' + level;
  return L[key] || level;
}

// 取某供应商某模型支持的档位列表。
// providerId 为空或 'session' 时没有具体模型信息，返回 null 表示“未知”，
// 调用方应退回全部已知档位并提示用户
export function thinkingVariantsOf(providers, providerId, model) {
  // 跟随会话（provider 为 'session' 或空）时没有确定的供应商，但如果用户显式
  // 选了模型，就到所有供应商里按模型名找它的档位定义——模型名在各供应商间
  // 通常是唯一的，能查到就用，查不到才返回 null 让调用方退回全集
  if (!providerId || providerId === 'session') {
    const m = (model || '').trim();
    if (!m) return null;
    for (const p of providers || []) {
      const rr = p && p.modelReasoning ? p.modelReasoning[m] : null;
      if (rr && Array.isArray(rr.variants) && rr.variants.length) {
        return { variants: rr.variants.slice(), defaultVariant: rr.defaultVariant || rr.variants[0], supported: true };
      }
    }
    return null;
  }
  const entry = (providers || []).find((p) => p && p.id === providerId);
  if (!entry) return null;
  const models = Array.isArray(entry.models) ? entry.models : [];
  // 选定的模型优先；但刚换供应商时模型可能还是上一个供应商的名字（界面保留
  // 原值、等用户再选），它在当前供应商下不存在——此时不能据此判定“不支持思考”，
  // 要回退到该供应商的首个模型
  const want = String(model || '').trim();
  const modelInEntry = want && models.some((m) => String(m).toLowerCase() === want.toLowerCase());
  const effModel = modelInEntry ? want : (models[0] || want);
  const rr = effModel ? entry.modelReasoning?.[effModel] : null;
  if (rr && Array.isArray(rr.variants) && rr.variants.length) {
    return { variants: rr.variants.slice(), defaultVariant: rr.defaultVariant || rr.variants[0], supported: true };
  }
  // 供应商找到了、模型也在它的列表里，但没有档位记录：模型不支持思考
  if (effModel && modelInEntry) return { variants: [], defaultVariant: 'off', supported: false };
  // 模型不在该供应商下且首个模型也没有档位记录：当作未知（退回全集）
  return null;
}

// 已知档位的全集（模型信息拿不到时用于回退）
export const ALL_THINKING_VARIANTS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

// 把当前档位规整到可用档位里：能保留就保留，否则用模型默认档，再否则第一项
export function normalizeThinking(current, info) {
  if (!info) return current || 'off';
  if (!info.variants.length) return 'off';
  if (info.variants.includes(current)) return current;
  return info.variants.includes(info.defaultVariant) ? info.defaultVariant : info.variants[0];
}

// 档位强弱顺序：用于把一个档位“降级”到目标模型支持的最接近档位
// （如用户选了 max，目标模型只有 off/enabled，就映射成 enabled）
const STRENGTH_ORDER = ['off', 'enabled', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const strengthOf = (v) => {
  const i = STRENGTH_ORDER.indexOf(v);
  return i >= 0 ? i : 3; // 未知档位按中等看待
};

// 把 wanted 自适应映射到 variants 里最接近的一档：
// - wanted 本身支持：原样返回
// - wanted 比所有支持档位都强：取最强的那档（如 max → enabled）
// - wanted 比所有支持档位都弱：取最弱的那档
// - 中间情况：取不超过 wanted 的最强档（保留用户“保守一些”的意图）
// off 特殊处理：只要支持就保留 off（用户明确选“关思考”时不擅自打开）
export function adaptThinking(wanted, variants) {
  const list = Array.isArray(variants) ? variants.filter(Boolean) : [];
  if (!list.length) return 'off';
  if (!wanted || list.includes(wanted)) return wanted || list[0];
  if (wanted === 'off') return list.includes('off') ? 'off' : list[0];
  const w = strengthOf(wanted);
  // 不超过 wanted 的最强档
  const below = list.filter((v) => strengthOf(v) <= w).sort((a, b) => strengthOf(b) - strengthOf(a))[0];
  if (below) return below;
  // 支持的档位都比 wanted 强：取其中最弱的一档（尽量贴近用户想要的低思考）
  return list.slice().sort((a, b) => strengthOf(a) - strengthOf(b))[0];
}

// 统一入口：算某通道可用的思考档位。
// sessionInfo 是 /translate/session-model 的结果（跟随会话时的当前模型信息）。
// 返回 { variants, current, display, unsupported }：
// - variants：下拉里要列出的档位（跟随会话且有会话模型时，用会话模型支持的档位）
// - current：写入配置的档位（已自适应映射到 variants）
// - display：界面上应选中的档位（等于 current）
// - unsupported：模型明确不支持思考
export function resolveThinkingOptions(providers, channel, sessionInfo) {
  const ch = channel || {};
  const isSession = !ch.provider || ch.provider === 'session';
  const followingModel = isSession && !String(ch.model || '').trim();
  // 跟随会话当前模型：用会话里那个模型的档位
  if (followingModel && sessionInfo && Array.isArray(sessionInfo.variants) && sessionInfo.variants.length) {
    const variants = sessionInfo.variants.slice();
    return {
      variants,
      current: adaptThinking(ch.thinking || 'off', variants),
      display: adaptThinking(ch.thinking || 'off', variants),
      unsupported: false,
      sessionModelId: sessionInfo.modelId || '',
    };
  }
  const info = thinkingVariantsOf(providers, ch.provider, ch.model);
  if (info && !info.variants.length) {
    return { variants: [], current: 'off', display: 'off', unsupported: true, sessionModelId: '' };
  }
  const variants = info ? info.variants : ALL_THINKING_VARIANTS;
  const cur = adaptThinking(ch.thinking || 'off', variants);
  return { variants, current: cur, display: cur, unsupported: false, sessionModelId: '' };
}
