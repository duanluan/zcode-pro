// 划词翻译（/translate*）测试：函数级（配置/判定/签名/卡片解析）+ 假上游 LLM
// （请求体断言、思考档位、400 重试、流式）+ 起真服务的端点测试。
// 零依赖，node scripts/test-translate.mjs（或 npm test）直接跑，全绿退出码 0。
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  readTranslateConfig, writeTranslateConfig, validateTranslateConfig,
  isWordText, targetLangFor, renderTranslatePrompt, parseWordCard, guessSourceLang,
  youdaoSign, baiduSign, tencentHeaders, volcHeaders, aliyunSignature,
  translateJson, streamTranslateText, translateMt, appendTranslateHistory, readTranslateHistory,
} from '../src/host/translate-lib.mjs';
import { startHelper } from '../src/host/helper.mjs';
import { thinkingVariantsOf, normalizeThinking, thinkingLabel, ALL_THINKING_VARIANTS, adaptThinking, resolveThinkingOptions } from '../src/inject/thinking-levels.js';
import { applyThinking } from '../src/host/translate-lib.mjs';

const root = mkdtempSync(join(tmpdir(), 'zcodepro-translate-test-'));
const fakeHome = join(root, 'fake-home');
mkdirSync(join(fakeHome, '.zcode', 'v2'), { recursive: true });
process.env.HOME = fakeHome; // os.homedir() 跟着走，供应商表从 fakeHome/.zcode/v2 读

let failed = 0;
const assert = (cond, msg) => {
  if (!cond) { console.error('FAIL: ' + msg); failed = 1; }
  else console.log('ok: ' + msg);
};

// ———— 假上游：LLM（openai/anthropic 双格式）与 DeepLX ————
const upstreamHits = [];
let rejectEffort = false; // 打开时带 reasoning_effort 的请求回 400，验证无思考重试
const upstream = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    let doc = {};
    try { doc = body ? JSON.parse(body) : {}; } catch { doc = {}; }
    upstreamHits.push({ url: req.url, doc });
    if (req.url.startsWith('/v1/chat/completions')) {
      if (rejectEffort && doc.reasoning_effort) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end('{"error":"unknown field reasoning_effort"}');
        return;
      }
      if (doc.stream) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: '你' } }] }) + '\n\n');
        res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: '好' } }] }) + '\n\n');
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        phonetic: { uk: 'test-uk', us: 'test-us' },
        senses: [{ pos: 'n.', defs: ['测试名词'] }],
        examples: [{ src: 'this is a test', dst: '这是一个测试' }],
        forms: ['tests'],
      }) } }] }));
      return;
    }
    if (req.url.startsWith('/v1/messages')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ content: [{ type: 'thinking', thinking: '(思考块应被过滤)' }, { type: 'text', text: 'anthropic 文本' }], stop_reason: 'end_turn' }));
      return;
    }
    if (req.url.startsWith('/mt/translate')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: '你好' }));
      return;
    }
    res.writeHead(404);
    res.end('{}');
  });
});
await new Promise((r) => upstream.listen(0, '127.0.0.1', r));
const upPort = upstream.address().port;
const openaiConn = { format: 'openai', baseUrl: `http://127.0.0.1:${upPort}/v1`, apiKey: 'k', model: 'm1' };
const anthropicConn = { format: 'anthropic', baseUrl: `http://127.0.0.1:${upPort}`, apiKey: 'k', model: 'm1' };

// ———— 函数级：配置 ————
const cfgFile = join(root, 't.json');
{
  const cfg = readTranslateConfig(cfgFile);
  assert(cfg.enabled === true && cfg.trigger.mode === 'ctrl-drag', '缺省配置补默认值');
  assert(cfg.channel.type === 'llm' && cfg.channel.provider === 'session', '默认通道为跟随会话的 LLM');
  assert(cfg.prompts.length === 3 && cfg.prompts[0].id === 'quick', '默认三套提示词');
  assert(cfg.mt.services.youdao && typeof cfg.mt.services.youdao === 'object', '机翻服务表归一');
}
{
  const [cfg, err] = validateTranslateConfig({ trigger: { mode: 'alt-drag' }, channel: { thinking: 'high' } });
  assert(!err && cfg.trigger.mode === 'alt-drag' && cfg.channel.thinking === 'high', '合法局部配置通过校验');
  for (const [bad, msg] of [
    [validateTranslateConfig({ trigger: { mode: 'x' } })[1], 'trigger.mode 非法被拒'],
    [validateTranslateConfig({ channel: { thinking: 'x' } })[1], 'thinking 非法被拒'],
    [validateTranslateConfig({ mt: { services: { nope: {} } } })[1], '未知机翻服务被拒'],
    [validateTranslateConfig({ prompts: [] })[1], '空提示词列表被拒'],
    [validateTranslateConfig({ panel: { theme: 'neon' } })[1], 'panel.theme 非法被拒'],
  ]) assert(!!bad, msg);
  const [themed, terr] = validateTranslateConfig({ panel: { theme: 'dark' } });
  assert(!terr && themed.panel.theme === 'dark', 'panel.theme 合法值通过校验');
  // 面板尺寸：宽度与高度都可保存（高度 0 = 未设置）
  const [sized, szErr] = validateTranslateConfig({ panel: { width: 600, height: 420 } });
  assert(!szErr && sized.panel.width === 600 && sized.panel.height === 420, 'panel 宽度与高度都能保存');
  assert(validateTranslateConfig({ panel: { height: 0 } })[0].panel.height === 0, '高度 0 表示未设置');
  assert(validateTranslateConfig({ panel: { width: 5000 } })[0].panel.width === 1200, '宽度超上限时钳到 1200');
}
{
  writeTranslateConfig(cfgFile, { targetLang: 'en', customKey: '保留' });
  const cfg = readTranslateConfig(cfgFile);
  assert(cfg.targetLang === 'en' && cfg.customKey === '保留', '合并写保留未知键');
  assert((statSync(cfgFile).mode & 0o777) === 0o600, '配置文件权限 0600');
  writeTranslateConfig(cfgFile, { targetLang: 'zh' });
  assert(readTranslateConfig(cfgFile).customKey === '保留', '再次合并写仍保留未知键');
}

// ———— 函数级：文本判定与提示词 ————
assert(isWordText('hello') && isWordText('don\'t') && !isWordText('hello world') && !isWordText('你好'), '单词判定');
assert(targetLangFor('你好世界', 'zh') === 'en' && targetLangFor('hello', 'zh') === 'zh', '中文源自动转英目标');
assert(renderTranslatePrompt('译成{target}', 'zh') === '译成简体中文', '提示词占位渲染');
assert(guessSourceLang('hello world') === 'en' && guessSourceLang('你好世界') === 'zh', '源语言判定：英/中');
assert(guessSourceLang('こんにちは') === 'ja' && guessSourceLang('Привет') === 'ru', '源语言判定：日/俄');
assert(guessSourceLang('12345') === '', '纯数字猜不出返回空串');

// ———— 函数级：词典卡片解析 ————
{
  const card = parseWordCard('```json\n{"phonetic":{"uk":"ʌk","us":"ʌs"},"senses":[{"pos":"n.","defs":["卡片"]}],"examples":[{"src":"s","dst":"d"}],"forms":["boxes"]}\n```', 'box');
  assert(card.phonetic.uk === 'ʌk' && card.senses[0].defs[0] === '卡片' && card.examples[0].dst === 'd', '围栏 JSON 卡片解析');
  assert(card.tts.includes('dictvoice') && card.tts.includes('box'), '卡片带词典发音链接');
  const bad = parseWordCard('模型闲聊没有 JSON', 'box');
  assert(bad.senses.length === 0 && bad.word === 'box', '无 JSON 时卡片字段为空不抛错');
}

// ———— 函数级：机翻签名 ————
{
  const s = youdaoSign('ak', 'sk', '12345678901234567890123', '1', '2');
  const expect = createHash('sha256').update('ak' + '1234567890' + '23' + '4567890123' + '1' + '2' + 'sk').digest('hex');
  assert(s === expect, '有道 v3 签名按截断规则计算（>20 字符取首10+长度+末10）');
  assert(baiduSign('id', 'sk', '文本', '9').length === 32, '百度 md5 签名为 32 位 hex');
  const th = tencentHeaders({ secretId: 'id', secretKey: 'sk', timestamp: 1700000000, body: '{"a":1}' });
  assert(th.Authorization.startsWith('TC3-HMAC-SHA256 Credential=id/2023-11-14/tmt/tc3_request') && th['X-TC-Action'] === 'TextTranslate', '腾讯 TC3 签名头结构');
  const th2 = tencentHeaders({ secretId: 'id', secretKey: 'sk', timestamp: 1700000000, body: '{"a":1}' });
  assert(th.Authorization === th2.Authorization, '腾讯签名确定性（同输入同输出）');
  const vh = volcHeaders({ accessKeyId: 'id', secretAccessKey: 'sk', xDate: '20260101T000000Z', body: '{"a":1}' });
  assert(vh.Authorization.startsWith('HMAC-SHA256 Credential=id/20260101/cn-north-1/translate/request') && vh['X-Date'] === '20260101T000000Z', '火山 V4 签名头结构');
  const al = aliyunSignature({ Action: 'TranslateGeneral', AccessKeyId: 'id' }, 'sk');
  assert(al.signature.length === 28 && !al.canonical.includes(' '), '阿里 HMAC-SHA1 签名为 base64 且 canonical 无空格');
}

// ———— LLM 调用：请求体断言、思考档位、400 重试、流式 ————
{
  upstreamHits.length = 0;
  const r = await translateJson(openaiConn, { text: 'test', isWord: true, prompt: 'P', targetLang: 'zh', thinking: 'off' });
  assert(r.kind === 'dict' && r.dict.senses[0].defs[0] === '测试名词', 'openai 单词出词典卡片');
  const hit = upstreamHits[upstreamHits.length - 1];
  assert(hit.doc.messages[0].role === 'system' && hit.doc.messages[1].content === 'test', 'openai 请求带 system 与原文');

  await translateJson(openaiConn, { text: 'a longer paragraph of english text', isWord: false, prompt: 'P', targetLang: 'zh', thinking: 'high' });
  assert(upstreamHits[upstreamHits.length - 1].doc.reasoning_effort === 'high', 'openai 思考档位映射 reasoning_effort');

  const ar = await translateJson(anthropicConn, { text: 'a longer paragraph of english text', isWord: false, prompt: 'P', targetLang: 'zh', thinking: 'low' });
  const ah = upstreamHits[upstreamHits.length - 1];
  assert(ah.doc.thinking.budget_tokens === 2048 && ah.doc.max_tokens > 2048, 'anthropic 思考档位映射思考预算且 max_tokens 更大');
  assert(ar.trans.text === 'anthropic 文本', 'anthropic 思考块被过滤只取文本');

  rejectEffort = true;
  const before = upstreamHits.length;
  const rr = await translateJson(openaiConn, { text: 'another paragraph here', isWord: false, prompt: 'P', targetLang: 'zh', thinking: 'high' });
  assert(rr.trans.text.includes('测试名词') || rr.trans.text.length > 0, '思考参数被拒 400 时去掉参数重试成功');
  assert(upstreamHits.length - before === 2, '400 重试共发两次请求');
  rejectEffort = false;

  const events = [];
  await streamTranslateText(openaiConn, { text: 'streaming paragraph', isWord: false, prompt: 'P', targetLang: 'zh', thinking: 'off' }, (o) => events.push(o), null);
  assert(events[0].type === 'meta' && events.some((e) => e.type === 'delta' && e.text === '你') && events[events.length - 1].type === 'done' && events[events.length - 1].text === '你好', '流式事件序列 meta/delta/done');
}

// ———— 机翻适配器：deeplx 走假上游，其余验凭据缺失 ————
{
  writeTranslateConfig(cfgFile, { mt: { services: { deeplx: { apiUrl: `http://127.0.0.1:${upPort}/mt` } } } });
  const r = await translateMt(cfgFile, 'deeplx', { text: 'hi', targetLang: 'zh' });
  assert(r.paragraphs[0] === '你好', 'deeplx 适配器走假上游取回译文');
  let err = '';
  try { await translateMt(cfgFile, 'baidu', { text: 'hi', targetLang: 'zh' }); } catch (e) { err = e.message; }
  assert(err.includes('未配置'), '凭据缺失给出可读错误');
}

// ———— 思考档位：随模型变化 ————
{
  const providers = [
    { id: 'glm', models: ['glm-5.3', 'glm-5.2'], modelReasoning: { 'glm-5.3': { variants: ['low', 'high', 'max'], defaultVariant: 'max' }, 'glm-5.2': undefined } },
    { id: 'mimo', models: ['mimo-pro'], modelReasoning: { 'mimo-pro': { variants: ['off', 'enabled'], defaultVariant: 'enabled' } } },
  ];
  const g = thinkingVariantsOf(providers, 'glm', 'glm-5.3');
  assert(g && g.supported && g.variants.join() === 'low,high,max', 'GLM 档位取自模型定义');
  const mimo = thinkingVariantsOf(providers, 'mimo', 'mimo-pro');
  assert(mimo && mimo.variants.join() === 'off,enabled', 'MiMo 只有开关两档');
  const noSupport = thinkingVariantsOf(providers, 'glm', 'glm-5.2');
  assert(noSupport && noSupport.supported === false && noSupport.variants.length === 0, '模型无档位定义视为不支持思考');
  assert(thinkingVariantsOf(providers, 'session', '') === null, '跟随会话且未选模型时档位未知（返回 null）');
  // 跟随会话 + 显式选模型：跨供应商按模型名找档位（设置页常见组合）
  assert(thinkingVariantsOf(providers, 'session', 'mimo-pro')?.variants.join() === 'off,enabled', '跟随会话但显式选了模型，按模型名查到档位');
  assert(thinkingVariantsOf(providers, 'session', 'glm-5.3')?.variants.join() === 'low,high,max', '跟随会话时 GLM 模型也能查到');
  // 刚切供应商时 model 还是空的：要用该供应商首个模型的档位，不能退化成全集
  assert(thinkingVariantsOf(providers, 'glm', '')?.variants.join() === 'low,high,max', '模型为空时用首个模型查档位');
  assert(thinkingVariantsOf(providers, 'mimo', '')?.variants.join() === 'off,enabled', '模型为空时 MiMo 只给开关两档');
  assert(normalizeThinking('high', g) === 'high', '档位在支持列表内时保留');
  assert(normalizeThinking('medium', g) === 'max', '档位不在列表内时回退模型默认档');
  assert(normalizeThinking('high', noSupport) === 'off', '不支持思考时规整为关');
  assert(normalizeThinking('high', null) === 'high', '档位未知时不改动');
  assert(ALL_THINKING_VARIANTS.includes('xhigh') && !ALL_THINKING_VARIANTS.includes('enabled'), '回退档位全集不含 enabled');
  assert(thinkingLabel('low', { translateThinking_low: '思考：低' }) === '思考：低', '已知档位用本地化文案');
  assert(thinkingLabel('weird', {}) === 'weird', '未知档位原样显示');
}

// ———— 思考档位自适应（跟随会话时按会话模型的档位映射） ————
{
  const onOff = ['off', 'enabled'];
  const ds = ['off', 'low', 'high', 'max'];
  const meta = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
  // 用户意图 → 目标模型档位
  assert(adaptThinking('max', onOff) === 'enabled', 'max 映射到只有开关的模型：enabled');
  assert(adaptThinking('high', onOff) === 'enabled', 'high 同样映射到 enabled');
  assert(adaptThinking('off', onOff) === 'off', 'off 原样保留');
  assert(adaptThinking('max', ds) === 'max', '目标支持 max 时原样保留');
  assert(adaptThinking('xhigh', ds) === 'high', 'xhigh 降级到不超过它的最强档 high');
  assert(adaptThinking('high', meta) === 'high', '目标支持 high 时原样保留');
  assert(adaptThinking('max', meta) === 'max', '六档模型保留 max');
  assert(adaptThinking('medium', ['low', 'high']) === 'low', '没有不超过的中档时取更弱的 low');
  assert(adaptThinking('minimal', ['high', 'max']) === 'high', '都比 wanted 强时取支持的最弱一档');
  assert(adaptThinking('off', ['enabled']) === 'enabled', '目标不支持关思考时退回其首个档');

  // resolveThinkingOptions：跟随会话当前模型时用会话模型的档位
  const providers = [{ id: 'glm', models: ['glm-5.3'], modelReasoning: { 'glm-5.3': { variants: ['low', 'high', 'max'], defaultVariant: 'max' } } }];
  const chFollow = { type: 'llm', provider: 'session', model: '', thinking: 'max' };
  const sess = { providerId: 'xiaomi-mimo', modelId: 'mimo-v2.6-pro', variants: ['off', 'enabled'] };
  const r1 = resolveThinkingOptions(providers, chFollow, sess);
  assert(r1.variants.join() === 'off,enabled', '跟随会话：下拉只列会话模型支持的档位');
  assert(r1.current === 'enabled', '跟随会话：存的 max 自适应成 enabled');
  assert(r1.sessionModelId === 'mimo-v2.6-pro', '跟随会话：返回会话模型名');
  // 会话模型是六档时 max 保留
  const r2 = resolveThinkingOptions(providers, chFollow, { modelId: 'muse', variants: meta });
  assert(r2.current === 'max', '跟随会话：六档模型保留 max');
  // 没拿到会话信息时退回按供应商查
  const r3 = resolveThinkingOptions(providers, { type: 'llm', provider: 'glm', model: 'glm-5.3', thinking: 'max' }, null);
  assert(r3.variants.join() === 'low,high,max' && r3.current === 'max', '无会话信息时按供应商档位');
}

// ———— 思考参数注入请求体（titleGen / vision 共用 applyThinking） ————
{
  // anthropic：档位换算成思考预算，且 max_tokens 必须大于预算
  const a = { model: 'm', max_tokens: 2048, messages: [] };
  applyThinking(a, 'anthropic', 'https://api.anthropic.com', 'high');
  assert(a.thinking?.type === 'enabled' && a.thinking.budget_tokens === 12288, 'anthropic 高档位 → 预算 12288');
  assert(a.max_tokens > a.thinking.budget_tokens, 'max_tokens 大于思考预算');
  // off 不写键（非智谱）
  const b = { model: 'm', max_tokens: 2048, messages: [] };
  applyThinking(b, 'anthropic', 'https://api.anthropic.com', 'off');
  assert(b.thinking === undefined, 'anthropic off 时不写思考键');
  // 智谱 anthropic：off 要显式 disabled（GLM-4.5+ 默认开）
  const c = { model: 'm', max_tokens: 2048, messages: [] };
  applyThinking(c, 'anthropic', 'https://open.bigmodel.cn/api/anthropic', 'off');
  assert(c.thinking?.type === 'disabled', '智谱 off 时显式发 disabled');
  // openai 兼容：reasoning_effort 原样
  const d = { model: 'm', messages: [] };
  applyThinking(d, 'openai', 'https://api.openai.com', 'low');
  assert(d.reasoning_effort === 'low', 'openai 档位原样发 reasoning_effort');
  // 智谱 openai：只发开/关
  const e = { model: 'm', messages: [] };
  applyThinking(e, 'openai', 'https://open.bigmodel.cn/api/paas/v4', 'high');
  assert(e.thinking?.type === 'enabled' && !e.reasoning_effort, '智谱 openai 只发 thinking.type');
}

// ———— 思考档位：智能配置（内置模型推荐规则） ————
{
  // 内置规则按「最后一个匹配胜出」匹配模型 ID；这里用最小规则集验证算法本身
  const rules = [
    { modelMatch: '.*', config: { optionSpecs: { reasoningLevel: { values: ['disabled', 'enabled'] } } } },
    { modelMatch: '.*deepseek.*', config: { optionSpecs: { reasoningLevel: { values: ['disabled', 'low', 'high', 'max'] } } } },
    { modelMatch: '.*deepseek-r1.*', config: { optionSpecs: { reasoningLevel: { values: ['disabled', 'high'] } } } },
  ];
  const pick = (model) => {
    let hit = null;
    for (const r of rules) {
      try { if (new RegExp(r.modelMatch).test(model)) hit = r; } catch { /* 跳过非法正则 */ }
    }
    const vals = hit?.config?.optionSpecs?.reasoningLevel?.values;
    return Array.isArray(vals) ? vals.map((v) => (v === 'disabled' ? 'off' : v)) : null;
  };
  assert(pick('mimo-v2.6-pro').join() === 'off,enabled', '无具体规则时落到 .* 兜底');
  assert(pick('deepseek-v4.1-flash').join() === 'off,low,high,max', '具体规则覆盖兜底');
  assert(pick('deepseek-r1-mini').join() === 'off,high', '多条命中时最后一条胜出');
  assert(pick('unknown-x')?.join() === 'off,enabled', '未知模型仍能拿到兜底档位');
}

// ———— 历史记录 ————
{
  appendTranslateHistory(cfgFile, { text: 'word', kind: 'dict', label: '会话 · m1' }, 2);
  appendTranslateHistory(cfgFile, { text: 'sentence one', kind: 'trans', label: 'x' }, 2);
  appendTranslateHistory(cfgFile, { text: 'sentence two', kind: 'trans', label: 'x' }, 2);
  const items = readTranslateHistory(cfgFile);
  assert(items.length === 2 && items[0].text === 'sentence two', '历史上限裁剪且新的在前');
}

// ———— HTTP 端点：起真服务 ————
writeFileSync(join(fakeHome, '.zcode', 'v2', 'config.json'), JSON.stringify({
  provider: { p1: { name: '测试供应商', options: { baseURL: `http://127.0.0.1:${upPort}/v1`, apiKey: 'k' }, models: { m1: {} } } },
}));
writeFileSync(join(fakeHome, '.zcode', 'v2', 'provider_config.json'), JSON.stringify({ config: {
  providerOrder: ['p1', 'p2'],
  providerConfigRules: { providerRules: [
    { providerId: 'p2', providerName: '只记档位的供应商', config: { api: { baseUrl: 'http://127.0.0.1:9/v1', type: 'openai' }, access: { apiKey: 'k2' } } },
  ] },
  // p2 的模型不在 config.json 的 models 表里，档位只记在这里（Meta Muse 就是这种）
  modelConfigRules: { providerModelRules: [
    { providerId: 'p2', modelId: 'only-in-rules', config: { optionSpecs: { reasoningLevel: { values: ['minimal', 'high', 'max'] } } } },
  ] },
} }));
{
  const port = 47907;
  const token = 'translate-token';
  startHelper({ port, token, dataRoot: join(fakeHome, '.zcode'), state: {}, agentsFile: join(root, 'AG.md'), visionFile: join(root, 'v.json'), translateFile: cfgFile, listenTries: 5 });
  const base = `http://127.0.0.1:${port}`;
  const H = { 'X-ZCodePro-Token': token, 'Content-Type': 'application/json' };
  for (let i = 0; i < 40; i++) {
    try { await fetch(base + '/health', { headers: H }); break; }
    catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  const j = async (path, opts = {}) => (await fetch(base + path, { ...opts, headers: H })).json();

  assert((await j('/translate')).ok === true, 'GET /translate 返回配置');
  assert((await j('/translate', { method: 'POST', body: JSON.stringify({ config: { trigger: { mode: 'alt-drag' } } }) })).ok === true, 'POST /translate 保存配置');
  assert((await j('/translate')).config.trigger.mode === 'alt-drag', '保存后配置生效');
  assert((await j('/translate', { method: 'POST', body: JSON.stringify({ config: { trigger: { mode: 'bad' } } }) })).ok === false, '非法配置 400');
  const prov = await j('/translate/providers');
  assert(prov.ok && prov.providers.some((p) => p.id === 'p1') && !('apiKey' in prov.providers[0]) && Array.isArray(prov.services) && prov.services.length === 9, 'providers 列供应商（剔密钥）+ 9 家机翻状态');
  {
    // 档位只记在 providerModelRules 的供应商也要带出 modelReasoning
    const p2 = prov.providers.find((p) => p.id === 'p2');
    assert(p2 && p2.modelReasoning?.['only-in-rules']?.variants.join() === 'minimal,high,max', 'providerModelRules 里的档位进入供应商表');
    assert(p2 && p2.modelReasoning['only-in-rules'].defaultVariant === 'minimal', '无 default 时取首个档位');
  }

  assert((await j('/translate/do', { method: 'POST', body: JSON.stringify({}) })).ok === false, '空 text 400');
  const badMt = await j('/translate/do', { method: 'POST', body: JSON.stringify({ text: 'hi', channel: { type: 'mt', service: 'tencent' } }) });
  assert(badMt.ok === false && /未配置/.test(badMt.error || ''), '未配置机翻通道报可读错误');
  const dict = await j('/translate/do', { method: 'POST', body: JSON.stringify({ text: 'test', channel: { type: 'llm', provider: 'p1', model: 'm1' } }) });
  assert(dict.ok && dict.kind === 'dict' && dict.dict.senses[0].defs[0] === '测试名词', '单词划词走 LLM 出词典卡片');
  const mtOk = await j('/translate/do', { method: 'POST', body: JSON.stringify({ text: 'hi', channel: { type: 'mt', service: 'deeplx' } }) });
  assert(mtOk.ok && mtOk.trans.text === '你好', 'deeplx 通道经端点返回译文');

  // SSE 流式：fetch 逐块读 data: 行
  const sseResp = await fetch(base + '/translate/do', { method: 'POST', headers: H, body: JSON.stringify({ text: 'some english paragraph for streaming', stream: true, channel: { type: 'llm', provider: 'p1', model: 'm1' } }) });
  assert(sseResp.headers.get('content-type').includes('text/event-stream'), '流式响应 content-type 为 event-stream');
  const sseText = await sseResp.text();
  const evts = sseText.split('\n\n').filter((x) => x.startsWith('data: ')).map((x) => JSON.parse(x.slice(6)));
  assert(evts[0].type === 'meta' && evts.some((e) => e.type === 'delta') && evts[evts.length - 1].type === 'done', 'SSE 事件序列完整');

  // 单词 + stream=true：服务端必须回普通 JSON（词典卡片不走 SSE），客户端靠
  // content-type 识别后按 result 处理。这条是“模型没有返回内容”的回归防线
  const wordResp = await fetch(base + '/translate/do', { method: 'POST', headers: H, body: JSON.stringify({ text: 'test', stream: true, channel: { type: 'llm', provider: 'p1', model: 'm1' } }) });
  const wordCt = wordResp.headers.get('content-type') || '';
  const wordDoc = await wordResp.json();
  assert(!wordCt.includes('text/event-stream') && wordDoc.ok && wordDoc.kind === 'dict', '单词请求 stream=true 时回普通 JSON 词典卡片（不是 SSE）');
  assert(wordDoc.dict.senses[0].defs[0] === '测试名词', '单词 JSON 里带完整词条');

  await j('/translate/history', { method: 'POST', body: JSON.stringify({ text: 'endpoint word', kind: 'dict', label: 'p1 · m1' }) });
  const hist = await j('/translate/history');
  assert(hist.ok && hist.items[0].text === 'endpoint word', '历史经端点读写');

  const test = await j('/translate/test', { method: 'POST', body: JSON.stringify({ channel: { type: 'mt', service: 'deeplx' } }) });
  assert(test.ok && test.output === '你好', '通道测试端点走 deeplx');

  const unauth = await fetch(base + '/translate', { headers: { 'Content-Type': 'application/json' } });
  assert(unauth.status === 401, '缺 token 401');
}

rmSync(root, { recursive: true, force: true });
upstream.close();
console.log(failed ? 'FAILED' : 'all ok');
process.exit(failed);
