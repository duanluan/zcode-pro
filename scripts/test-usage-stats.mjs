// 用量聚合回归测试：用假 rollout 记录跑真实的 /stats/usage 聚合逻辑。
// 零依赖，node scripts/test-usage-stats.mjs（或 npm test）直接跑，全绿退出码 0。
// 覆盖：速率摊算（窗口重叠、长调用摊回真实速率、无耗时点事件）、锚定不衰减
//（回答结束后停在最后的值）、删新留旧回退、新调用刷新、数据清空归零、
// turns=0 跳过分钟桶、会话 id 白名单降级全局、无记录会话为 0。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startHelper } from '../src/host/helper.mjs';

const root = mkdtempSync(join(tmpdir(), 'zcodepro-usage-test-'));
const rollout = join(root, 'rollout');
mkdirSync(rollout, { recursive: true });

const T = Date.now();
const rec = (endedAgoMs, durMs, inTok, outTok, session, extra = {}) => JSON.stringify({
  completedAt: new Date(T - endedAgoMs).toISOString(),
  ...(durMs != null ? { durationMs: durMs } : {}),
  sessionId: session,
  usage: { inputTokens: inTok, outputTokens: outTok },
  ...extra,
});

// sess_test：最近一次调用（45 秒前完成、耗时 30 秒）+ 更早一次（20 分钟前）
writeFileSync(join(rollout, 'model-io-sess_test-a.jsonl'), rec(45_000, 30_000, 1000, 500, 'sess_test') + '\n');
writeFileSync(join(rollout, 'model-io-sess_test-b.jsonl'), rec(20 * 60_000, 20_000, 600, 400, 'sess_test') + '\n');
// sess_other2：30 秒前完成（用于区分会话口径与全局口径）
writeFileSync(join(rollout, 'model-io-sess_other2.jsonl'), rec(30_000, 30_000, 300, 300, 'sess_other2') + '\n');
// sess_long：2 分钟的长调用，12000 输出摊回真实速率 100/s
writeFileSync(join(rollout, 'model-io-sess_long.jsonl'), rec(1_000, 120_000, 0, 12000, 'sess_long') + '\n');
// sess_pt：无 durationMs 的点事件
writeFileSync(join(rollout, 'model-io-sess_pt.jsonl'), rec(10_000, null, 60, 60, 'sess_pt') + '\n');
// sess_big：total 5500 的调用（分钟桶只收 total>=5000 的主对话流调用）
writeFileSync(join(rollout, 'model-io-sess_big.jsonl'), rec(20_000, 10_000, 4500, 1000, 'sess_big') + '\n');

const port = 47901;
const token = 'test-token';
startHelper({ port, token, dataRoot: root, state: {}, rolloutDir: rollout, listenTries: 5 });
// 断言失败中途退出也清掉临时目录（正常走不到结尾的 rmSync）
process.on('exit', () => { try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ } });

const get = async (p) => {
  const r = await fetch(`http://127.0.0.1:${port}${p}`, { headers: { 'X-ZCodePro-Token': token } });
  return r.json();
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 20; i++) {
  try { await get('/health'); break; } catch { await sleep(100); }
}

let failed = 0;
const assert = (cond, msg) => {
  if (!cond) { console.error('FAIL: ' + msg); failed = 1; }
  else console.log('ok: ' + msg);
};

// 锚定速率是确定性值：(1000+500)/60 = 25/s 总量，500/60 ≈ 8/s 输出
const v1 = (await get('/stats/usage?session=sess_test')).global.rate60;
assert(v1.total === 25 && v1.out === 8.3, `锚定速率确定性值 ${JSON.stringify(v1)}`);
await sleep(1500);
const v2 = (await get('/stats/usage?session=sess_test')).global.rate60;
assert(v2.total === 25 && v2.out === 8.3, `时间流逝不衰减（回答结束后停在最后的值）${JSON.stringify(v2)}`);

// 长调用按窗口重叠摊算后等于真实速率：120s/12000 输出 → 100/s
const vLong = (await get('/stats/usage?session=sess_long')).global.rate60;
assert(vLong.total === 100 && vLong.out === 100, `长调用摊回真实速率 ${JSON.stringify(vLong)}`);

// 无 durationMs 的点事件在窗口内全额计入
const vPt = (await get('/stats/usage?session=sess_pt')).global.rate60;
assert(vPt.total === 2 && vPt.out === 1, `点事件全额计入 ${JSON.stringify(vPt)}`);

// 会话口径与全局口径分开：非法会话 id 按全局处理（全部记录的窗口贡献：
// 长调用 6000 + sess_test 800 + other2 600 + 点事件 120 + big 5500 = 13020/60）
const vBad = (await get('/stats/usage?session=../../etc')).global.rate60;
assert(vBad.total === 217 && vBad.out === 127.1, `非法会话 id 降级全局 ${JSON.stringify(vBad)}`);

// turns=0 跳过分钟桶；默认建桶（total>=5000 的调用入桶）
const noTurns = await get('/stats/usage?turns=0&session=sess_big');
assert(Array.isArray(noTurns.recentTurns) && noTurns.recentTurns.length === 0, 'turns=0 不建分钟桶');
const withTurns = await get('/stats/usage?session=sess_big');
assert(withTurns.recentTurns.length >= 1 && withTurns.recentTurns[0].out === 1000, '默认路径建分钟桶');

// 无记录的会话为 0
const vNone = (await get('/stats/usage?session=sess_none')).global.rate60;
assert(vNone.total === 0 && vNone.out === 0, `无记录会话为 0 ${JSON.stringify(vNone)}`);

// 最近的记录被删（滚动清理）：回退到剩下最近一条的速率，不归零
rmSync(join(rollout, 'model-io-sess_test-a.jsonl'));
const v3 = (await get('/stats/usage?session=sess_test')).global.rate60;
assert(v3.total === 16.7 && v3.out === 6.7, `删新留旧回退到旧速率 ${JSON.stringify(v3)}`);

// 新调用完成：锚前移、数值刷新
writeFileSync(join(rollout, 'model-io-sess_test-a.jsonl'), rec(5_000, 10_000, 2000, 600, 'sess_test') + '\n');
const v4 = (await get('/stats/usage?session=sess_test')).global.rate60;
assert(v4.total === 43.3 && v4.out === 10, `新调用刷新速率 ${JSON.stringify(v4)}`);

// 数据全没了：归零
rmSync(join(rollout, 'model-io-sess_test-a.jsonl'));
rmSync(join(rollout, 'model-io-sess_test-b.jsonl'));
const v5 = (await get('/stats/usage?session=sess_test')).global.rate60;
assert(v5.total === 0 && v5.out === 0, `数据清空归零 ${JSON.stringify(v5)}`);

rmSync(root, { recursive: true, force: true });
console.log(failed ? 'FAILED' : 'all ok');
process.exit(failed);
