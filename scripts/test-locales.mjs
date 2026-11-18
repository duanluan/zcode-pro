// 多语言字典回归：ZCode 支持的五种语言，界面文案键集合、占位符、错误码映射
// 与 t()/errText 的选择都必须一致。零依赖，node scripts/test-locales.mjs 直接跑。
import { jaErrors } from '../src/inject/locales/ja.js';
import { koErrors } from '../src/inject/locales/ko.js';
import { ruErrors } from '../src/inject/locales/ru.js';
import { titleGenLocaleFromSettings } from '../src/host/helper.mjs';

let failed = 0;
const assert = (cond, msg) => {
  if (!cond) { console.error('FAIL: ' + msg); failed = 1; }
  else console.log('ok: ' + msg);
};

const LOCALES = ['zh-CN', 'en-US', 'ja-JP', 'ko-KR', 'ru-RU'];
const placeholders = (s) => [...String(s).matchAll(/\{[A-Za-z0-9_]+\}/g)]
  .map((m) => m[0]).sort().join(',');

const dicts = {};
const texts = {};
for (const loc of LOCALES) {
  globalThis.window = { localStorage: { getItem: () => loc } };
  Object.defineProperty(globalThis, 'navigator', { value: { language: loc }, configurable: true });
  const mod = await import(`../src/inject/core.js?locale=${encodeURIComponent(loc)}`);
  dicts[loc] = mod.t();
  texts[loc] = (code) => mod.errText({ code, error: '中文原始错误' });
}

const base = Object.keys(dicts['zh-CN']);
assert(base.length > 600, '中文界面文案已加载（' + base.length + ' 条）');
for (const loc of LOCALES.slice(1)) {
  const keys = Object.keys(dicts[loc]);
  const missing = base.filter((k) => !(k in dicts[loc]));
  const extra = keys.filter((k) => !(k in dicts['zh-CN']));
  assert(missing.length === 0 && extra.length === 0, `${loc} 键集合与中文一致（缺 ${missing.length} / 多 ${extra.length}）`);
  let phBad = 0;
  let emptyBad = 0;
  for (const k of base) {
    const want = placeholders(dicts['zh-CN'][k]);
    if (placeholders(dicts[loc][k]) !== want) phBad++;
    if (dicts['zh-CN'][k].trim() && !String(dicts[loc][k] || '').trim()) emptyBad++;
  }
  assert(phBad === 0, `${loc} 占位符全部保留（不一致 ${phBad} 条）`);
  assert(emptyBad === 0, `${loc} 非空文案没有空值（空值 ${emptyBad} 条）`);
}

assert(dicts['zh-CN'].tabFeatures === '功能' && dicts['en-US'].tabFeatures === 'Features', 't() 按界面语言返回中文/英文');
assert(dicts['ja-JP'].tabFeatures === '機能' && dicts['ko-KR'].tabFeatures === '기능' && dicts['ru-RU'].tabFeatures === 'Функции', 't() 按界面语言返回日/韩/俄文');
assert(texts['zh-CN']('not-found') === '中文原始错误', '中文界面保留 helper 原始错误');
for (const loc of ['en-US', 'ja-JP', 'ko-KR', 'ru-RU']) {
  const msg = texts[loc]('not-found');
  // 日语里的汉字是正常书写，不能按「含 CJK 即中文」判断；韩语/俄语才检查是否残留中文
  const leaker = loc !== 'ja-JP' && /[\u4e00-\u9fff]/.test(msg);
  assert(msg && msg !== '中文原始错误' && !leaker, `${loc} 错误码有对应语言文案`);
}

const errMaps = { ja: jaErrors, ko: koErrors, ru: ruErrors };
const errKeys = Object.keys(jaErrors);
assert(errKeys.length > 80, '错误码映射已加载（实际 ' + errKeys.length + ' 条）');
for (const [lang, map] of Object.entries(errMaps)) {
  const keys = Object.keys(map);
  const miss = errKeys.filter((k) => !(k in map));
  const extra = keys.filter((k) => !(k in jaErrors));
  let empty = 0;
  for (const k of keys) if (!String(map[k] || '').trim()) empty++;
  assert(miss.length === 0 && extra.length === 0, `${lang} 错误码键集合一致（缺 ${miss.length} / 多 ${extra.length}）`);
  assert(empty === 0, `${lang} 错误码文案没有空值（空值 ${empty} 条）`);
}

// 宿主侧标题语言：ZCode 3.18.2 的 uiLocale* 优先于旧 locale/localePreference
//（旧字段对 ja/ko/ru 只写 en-US，先读旧字段会把三种语言都判成英文）
assert(titleGenLocaleFromSettings({
  uiLocale: 'ja-JP', uiLocalePreference: 'ja-JP', locale: 'en-US', localePreference: 'en-US',
}) === 'ja', '标题语言优先读 uiLocalePreference（日语）');
assert(titleGenLocaleFromSettings({
  uiLocale: 'ko-KR', uiLocalePreference: 'system', locale: 'en-US', localePreference: 'system',
}) === 'ko', 'uiLocalePreference=system 时用已解析的 uiLocale（韩语）');
assert(titleGenLocaleFromSettings({ uiLocale: 'ru-RU', uiLocalePreference: 'ru-RU' }) === 'ru', '俄语');
assert(titleGenLocaleFromSettings({ locale: 'zh-CN', localePreference: 'zh-CN' }) === 'zh', '旧版只有 locale 字段时仍识别中文');
assert(titleGenLocaleFromSettings({}) === '', '没有语言字段返回空串（由调用方回退）');

console.log(failed ? '有失败' : 'all ok');
process.exit(failed ? 1 : 0);
