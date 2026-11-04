// 守护测试：src/host 发出的错误 code 必须都有 core.js errEn 表里的英文映射，
// 防止以后新加错误码漏英文文案（英文界面会直接显示 helper 的中文原文）。
// 零依赖，node scripts/test-err-codes.mjs（或 npm test）直接跑，全绿退出码 0。
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const core = readFileSync(join(root, 'src', 'inject', 'core.js'), 'utf8');

// errEn 表：从 errEn 声明到第一个独占行的 }; 之间取键
const start = core.indexOf('errEn');
if (start < 0) { console.error('FAIL: core.js 里找不到 errEn 表'); process.exit(1); }
const seg = core.slice(start, core.indexOf('\n};', start));
const enKeys = new Set();
for (const m of seg.matchAll(/^\s*'?([A-Za-z0-9._-]+)'?\s*:/gm)) enKeys.add(m[1]);

// src/host 全部错误码字面量：code: 'xxx' 与 .code = 'xxx'（=== 比较不命中）
const codes = new Set();
let hostAll = '';
for (const f of readdirSync(join(root, 'src', 'host'))) {
  if (!f.endsWith('.mjs')) continue;
  const text = readFileSync(join(root, 'src', 'host', f), 'utf8');
  hostAll += text;
  for (const m of text.matchAll(/code:\s*'([A-Za-z0-9._-]+)'/g)) codes.add(m[1]);
  for (const m of text.matchAll(/\.code\s*=\s*'([A-Za-z0-9._-]+)'/g)) codes.add(m[1]);
}

let failed = 0;
// 提取正则退化的守护：两表都应有几十个键，退化成 0 个（或个位数）时上面的
// “全部有映射”会假绿，这里按数量下限拦住
if (codes.size < 30 || enKeys.size < 30) {
  console.error(`FAIL: 错误码/errEn 提取疑似退化（codes=${codes.size} errEn=${enKeys.size}，应各有 30+ 个）`);
  failed = 1;
}
const missing = [...codes].filter((c) => !enKeys.has(c)).sort();
if (missing.length) {
  console.error('FAIL: 这些错误码缺 errEn 英文映射: ' + missing.join(', '));
  failed = 1;
} else {
  console.log(`ok: ${codes.size} 个错误码全部有英文映射`);
}
// 死键判定用全文子串（三元表达式等发射形态只有字面量本身，没有 code: 前缀）
const dead = [...enKeys].filter((k) => !hostAll.includes(k)).sort();
if (dead.length) console.log('提示: errEn 里没有发射方的键（可清理）: ' + dead.join(', '));
process.exit(failed);
