// 用量聚合回归测试：用假 rollout 记录跑真实的 /stats/usage 聚合逻辑。
// 零依赖，node scripts/test-usage-stats.mjs（或 npm test）直接跑，全绿退出码 0。
// 覆盖：速率摊算（窗口重叠、长调用摊回真实速率、无耗时点事件）、锚定不衰减
//（回答结束后停在最后的值）、官方滚动删除后记录保留不断档、新调用刷新、
// 重启后只剩存活文件的记录、会话树归属（子代理调用算进父会话）、
// turns=0 跳过分钟桶、会话 id 白名单降级全局、无记录会话为 0、
// 今日分桶按本地日期、半行不计入、zcodepro.json 跨进程写锁的悬挂接管与
// 释放保护、sanitizeBgName 文件名守卫。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { startHelper, withConfigLock, sanitizeBgName, collectUsageStats, setRolloutDirForTest } from '../src/host/helper.mjs';

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
startHelper({ port, token, dataRoot: root, state: {}, rolloutDir: rollout, listenTries: 5, visionFile: join(root, 'zcode-vision.json') });
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

// 今日分桶按本地日期：贴 0 点半与 23 点半两条记录（日期边界两侧），
// 旧实现取 ISO 串前 10 位（UTC 日期），非 UTC 时区至少漏算一条
const t0 = (await get('/stats/usage?turns=0')).global.todayTokens;
const midnight = new Date();
midnight.setHours(0, 0, 0, 0);
const dayRec = (offsetMin, inTok, outTok) => JSON.stringify({
  completedAt: new Date(midnight.getTime() + offsetMin * 60_000).toISOString(),
  durationMs: 1000,
  sessionId: 'sess_today',
  usage: { inputTokens: inTok, outputTokens: outTok },
});
writeFileSync(join(rollout, 'model-io-sess_today.jsonl'), dayRec(30, 100, 50) + '\n' + dayRec(23 * 60 + 30, 200, 100) + '\n');
const t1 = (await get('/stats/usage?turns=0')).global.todayTokens;
assert(t1 - t0 === 450, `今日分桶按本地日期（0:30 与 23:30 都计入）${t0}→${t1}`);

// 半行（写入中途的 JSONL）不计入，补齐整行后才计入
const halfFile = join(rollout, 'model-io-sess_half.jsonl');
writeFileSync(halfFile, rec(10_000, 5_000, 100, 100, 'sess_half').slice(0, 20));
const vHalf0 = (await get('/stats/usage?session=sess_half')).global.rate60;
assert(vHalf0.total === 0 && vHalf0.out === 0, `半行不计入 ${JSON.stringify(vHalf0)}`);
writeFileSync(halfFile, rec(10_000, 5_000, 100, 100, 'sess_half') + '\n');
const vHalf1 = (await get('/stats/usage?session=sess_half')).global.rate60;
assert(vHalf1.total === 3.3 && vHalf1.out === 1.7, `补齐整行后计入 ${JSON.stringify(vHalf1)}`);

// 文件截断（滚动清理）：退回全量重解析，不能沿用旧缓存的多记录
const truncFile = join(rollout, 'model-io-sess_trunc.jsonl');
const tRecA = rec(20_000, 5_000, 100, 100, 'sess_trunc');
writeFileSync(truncFile, tRecA + '\n' + rec(10_000, 5_000, 100, 100, 'sess_trunc') + '\n');
const vTrunc1 = (await get('/stats/usage?session=sess_trunc')).global.rate60;
assert(vTrunc1.total === 6.7 && vTrunc1.out === 3.3, `截断前两条计入 ${JSON.stringify(vTrunc1)}`);
writeFileSync(truncFile, tRecA + '\n');
const vTrunc2 = (await get('/stats/usage?session=sess_trunc')).global.rate60;
assert(vTrunc2.total === 3.3 && vTrunc2.out === 1.7, `截断后按剩余记录重算 ${JSON.stringify(vTrunc2)}`);

// 文件被删（官方滚动清理会删运行中会话的文件）：保留窗内记录不断档，
// 速率停在最后的值——修复前这里会回退到旧速率，运行中的会话就"明明在跑却没有速率"
rmSync(join(rollout, 'model-io-sess_test-a.jsonl'));
const v3 = (await get('/stats/usage?session=sess_test')).global.rate60;
assert(v3.total === 25 && v3.out === 8.3, `文件被滚动删除后速率不断档 ${JSON.stringify(v3)}`);

// 新调用完成：锚前移、数值刷新。同名重建的新旧记录并存，旧记录按窗口重叠摊算
//（45 秒前完成的调用在新锚 60 秒窗内还剩 20 秒重叠：1500×2/3=1000 摊进总量）
writeFileSync(join(rollout, 'model-io-sess_test-a.jsonl'), rec(5_000, 10_000, 2000, 600, 'sess_test') + '\n');
const v4 = (await get('/stats/usage?session=sess_test')).global.rate60;
assert(v4.total === 60 && v4.out === 15.6, `新调用刷新速率（含旧记录窗口重叠）${JSON.stringify(v4)}`);

// 文件全删：保留窗内仍不断档
rmSync(join(rollout, 'model-io-sess_test-a.jsonl'));
rmSync(join(rollout, 'model-io-sess_test-b.jsonl'));
const v5 = (await get('/stats/usage?session=sess_test')).global.rate60;
assert(v5.total === 60 && v5.out === 15.6, `文件全删后保留窗内不断档 ${JSON.stringify(v5)}`);

// 进程重启（缓存清空）后只剩存活文件的记录：全删完 → 归零
setRolloutDirForTest(rollout);
const v6 = (await get('/stats/usage?session=sess_test')).global.rate60;
assert(v6.total === 0 && v6.out === 0, `重启后无存活文件则归零 ${JSON.stringify(v6)}`);

// 媒体路由鉴权与校验（媒体元素带不了鉴权请求头，认 URL 上的 ?t= token）
const mediaGet = (p) => fetch(`http://127.0.0.1:${port}${p}`).then((r) => r.status);
const st1 = await mediaGet('/bg/file/a.png');
assert(st1 === 401, `媒体无 token 401（实际 ${st1}）`);
const st2 = await mediaGet('/bg/file/a.png?t=wrong');
assert(st2 === 401, `媒体错 token 401（实际 ${st2}）`);
const st3 = await mediaGet(`/bg/file/a.png?t=${encodeURIComponent(token)}`);
assert(st3 === 404, `媒体带 token 但文件不存在 404（实际 ${st3}）`);
const st4 = await mediaGet(`/bg/transcode/file/bad.mp4?t=${encodeURIComponent(token)}`);
assert(st4 === 400, `转码文件名格式不符 400（实际 ${st4}）`);
const st5 = await mediaGet(`/bg/folder/file/a.png?dir=/etc&t=${encodeURIComponent(token)}`);
assert(st5 === 400, `未配置的 dir 400（实际 ${st5}）`);

// 媒体文件真实服务：Range 分段 206 / 越界 416 / If-Modified-Since 命中 304
mkdirSync(join(root, 'backgrounds'), { recursive: true });
writeFileSync(join(root, 'backgrounds', 'x.png'), '0123456789');
const mediaUrl = `http://127.0.0.1:${port}/bg/file/x.png?t=${encodeURIComponent(token)}`;
const rRange = await fetch(mediaUrl, { headers: { Range: 'bytes=0-9' } });
assert(rRange.status === 206 && (await rRange.text()) === '0123456789', `Range 分段 206 且内容正确（实际 ${rRange.status}）`);
const rOver = await fetch(mediaUrl, { headers: { Range: 'bytes=100-200' } });
assert(rOver.status === 416, `Range 越界 416（实际 ${rOver.status}）`);
const lm = rRange.headers.get('last-modified') || '';
const r304 = await fetch(mediaUrl, { headers: { 'If-Modified-Since': lm } });
assert(r304.status === 304, `If-Modified-Since 命中 304（实际 ${r304.status}）`);

// 未来时间戳（时钟回拨等）：锚钳到当下、记录不计入速率
writeFileSync(join(rollout, 'model-io-sess_fut.jsonl'), JSON.stringify({
  completedAt: new Date(T + 3600_000).toISOString(),
  durationMs: 1000,
  sessionId: 'sess_fut',
  usage: { inputTokens: 100, outputTokens: 100 },
}) + '\n');
const vf = (await get('/stats/usage?session=sess_fut')).global.rate60;
assert(vf.total === 0 && vf.out === 0, `未来时间戳不计入速率 ${JSON.stringify(vf)}`);

// Anthropic 原始口径（snake_case）：总输入 = input_tokens + cache_read + cache_write
writeFileSync(join(rollout, 'model-io-sess_anth.jsonl'), JSON.stringify({
  completedAt: new Date(T - 10_000).toISOString(),
  durationMs: 5000,
  sessionId: 'sess_anth',
  response: { usage: { input_tokens: 100, cache_read_input_tokens: 200, cache_write_input_tokens: 50, output_tokens: 50 } },
}) + '\n');
const vAnth = (await get('/stats/usage?session=sess_anth')).global.rate60;
assert(vAnth.total === 6.7 && vAnth.out === 0.8, `snake_case 三字段相加为总输入 ${JSON.stringify(vAnth)}`);

// 分钟桶：两条大调用（total>=5000）不同分钟 → 两桶，按完成时间倒序、分项合计正确
writeFileSync(join(rollout, 'model-io-sess_bucket.jsonl'),
  JSON.stringify({ completedAt: new Date(T - 120_000).toISOString(), durationMs: 5000, sessionId: 'sess_bucket', usage: { inputTokens: 4000, outputTokens: 2000 } }) + '\n'
  + JSON.stringify({ completedAt: new Date(T - 60_000).toISOString(), durationMs: 5000, sessionId: 'sess_bucket', usage: { inputTokens: 5000, outputTokens: 1000 } }) + '\n');
const vBucket = await get('/stats/usage?session=sess_bucket');
const bt = vBucket.recentTurns;
assert(bt.length === 2 && bt[0].ts > bt[1].ts, `两桶且按完成时间倒序（实际 ${bt.length} 桶）`);
assert(bt.reduce((a, b) => a + b.in, 0) === 9000 && bt.reduce((a, b) => a + b.out, 0) === 3000, '分钟桶 in/out 合计正确');

// 并发保存配置：10 个并发 POST 各写不同的 features 键，读改写不互相覆盖
await Promise.all(Array.from({ length: 10 }, (_, i) =>
  fetch(`http://127.0.0.1:${port}/config`, {
    method: 'POST',
    headers: { 'X-ZCodePro-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ features: { [`fuzz${i}`]: true } }),
  }).then((r) => r.json())));
const merged = await get('/config');
assert(Array.from({ length: 10 }, (_, i) => merged.config.features[`fuzz${i}`] === true).every(Boolean), '10 个并发保存的键全部存活（读改写无丢失）');
// 注：上面这条在 Node 单线程下恒过，抓不住锁回归；真正抓锁的是下面两个分支

// —— zcodepro.json 跨进程写锁：悬挂锁接管与释放保护 ——
const lockCfg = join(root, 'lockcase', 'zcodepro.json');
mkdirSync(join(root, 'lockcase'), { recursive: true });
const lockDir = lockCfg + '.lock';
const readHolder = () => JSON.parse(readFileSync(join(lockDir, 'holder.json'), 'utf8'));

// 悬挂锁接管：持有者 pid 已死的锁目录要被写入方拆掉接管，写完释放自己的锁
const dead = spawnSync(process.execPath, ['-e', '']); // 跑完即死，拿它的 pid 当死进程
mkdirSync(lockDir);
writeFileSync(join(lockDir, 'holder.json'), JSON.stringify({ pid: dead.pid, token: 'dead-holder' }));
let takenOver = null;
await withConfigLock(lockCfg, () => { takenOver = readHolder(); });
assert(takenOver && takenOver.pid === process.pid && takenOver.token !== 'dead-holder',
  `悬挂锁（持有者 pid ${dead.pid} 已死）被接管（实际 ${JSON.stringify(takenOver)}）`);
assert(!existsSync(lockDir), '接管方写完释放自己的锁');

// 释放时不删别人的锁：持锁期间被别人接管（持有者信息换成别的 token）后，
// 释放逻辑不能把别人的锁目录删掉
await withConfigLock(lockCfg, () => {
  writeFileSync(join(lockDir, 'holder.json'), JSON.stringify({ pid: process.pid, token: 'intruder' }));
});
assert(existsSync(lockDir) && readHolder().token === 'intruder', '释放时不删别人的锁（token 不匹配的锁目录保留）');
rmSync(lockDir, { recursive: true, force: true });

// —— sanitizeBgName 文件名守卫：拒绝/接受表 ——
const nameTable = [
  ['.hidden.png', null], // 点开头
  ['a/b.png', 'ab.png'], // 含路径分隔符：剥掉分隔符后按剩余名判断（名字变了，列目录的二次清洗会滤掉）
  ['a\\b.png', 'ab.png'],
  [decodeURIComponent('%2e%2e%2fevil.png'), null], // %2e%2e%2f 形态解码后是 ../evil.png，剥掉分隔符仍点开头
  ['CON.png', null], ['nul.jpg', null], ['com1.jpeg', null], // Windows 设备名
  ['file.txt', null], ['evil.exe', null], // 扩展名白名单外
  ['正常名.png', '正常名.png'], ['photo.JPEG', 'photo.JPEG'], // 正常名（大写扩展名在白名单内、原样保留）
];
for (const [input, want] of nameTable) {
  assert(sanitizeBgName(input) === want,
    `sanitizeBgName(${JSON.stringify(input)}) === ${JSON.stringify(want)}（实际 ${JSON.stringify(sanitizeBgName(input))}）`);
}

// —— 会话树归属：子代理的模型调用算进父会话速率（记录带父子共享的 traceId）——
// 直接调聚合函数注入会话树 trace（HTTP 路径的 trace 来自官方库 session 表）
const TR = 'trace-tree';
writeFileSync(join(rollout, 'model-io-sess_tparent.jsonl'), rec(10_000, 5_000, 1000, 120, 'sess_tparent', { traceId: TR }) + '\n');
writeFileSync(join(rollout, 'model-io-sess_subagent_agent_t.jsonl'), rec(5_000, 5_000, 1000, 60, 'sess_subagent_agent_t', { traceId: TR }) + '\n');
const tree = collectUsageStats('sess_tparent', false, TR).global.rate60;
assert(tree.out === 3 && tree.total === 36.3, `子代理调用算进父会话（期望 3/36.3，实得 ${tree.out}/${tree.total}）`);
const solo = collectUsageStats('sess_tparent', false, '').global.rate60;
assert(solo.out === 2 && solo.total === 18.7, `拿不到 trace 时只算本会话（期望 2/18.7，实得 ${solo.out}/${solo.total}）`);

// —— 官方口径每轮用量（model_usage 假库）：TPS/命中率按 Token 调试同款公式 ——
try {
  const { DatabaseSync } = await import('node:sqlite');
  mkdirSync(join(root, 'cli', 'db'), { recursive: true });
  const db = new DatabaseSync(join(root, 'cli', 'db', 'db.sqlite'));
  db.exec('CREATE TABLE model_usage (session_id TEXT, query_source TEXT, status TEXT, completed_at INTEGER,'
    + ' duration_ms INTEGER, time_to_first_token_ms INTEGER, input_tokens INTEGER, output_tokens INTEGER,'
    + ' reasoning_tokens INTEGER, cache_read_input_tokens INTEGER, cache_creation_input_tokens INTEGER, computed_total_tokens INTEGER)');
  const ins = db.prepare('INSERT INTO model_usage VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  ins.run('sess_mu', 'main_turn', 'completed', 1000, 10_000, 2_000, 1000, 80, 0, 900, 50, 1080);
  ins.run('sess_mu', 'main_turn', 'completed', 2000, 5_000, null, 2000, 100, 0, 1900, 0, 2100);
  ins.run('sess_mu', 'title_gen', 'completed', 3000, 1_000, 100, 500, 10, 0, 0, 0, 510); // 辅助调用不计
  // 非流式/整段返回的请求：首 token 时机贴着结束（只差 25ms），速率按全程算，
  // 不能让 25ms 的净生成时长把速率顶到几万 tok/s
  ins.run('sess_nostream', 'main_turn', 'completed', 5000, 26_760, 26_735, 2000, 961, 0, 0, 0, 2961);
  db.close();
  const mu = await get('/stats/turns?session=sess_mu');
  assert(mu.rounds.length === 2, `辅助调用不进主轮（期望 2 条，实得 ${mu.rounds.length}）`);
  assert(mu.rounds[0].tps === 10 && mu.rounds[0].hitRate === 0.9, `TPS/命中率按官方公式（实得 ${mu.rounds[0].tps}/${mu.rounds[0].hitRate}）`);
  assert(mu.rounds[1].tps === 20, '无首 token 时机按全程算速率（100 输出 ÷ 5 秒）');
  assert(mu.summary.requests === 2 && mu.summary.totalIn === 3000 && mu.summary.totalOut === 180, `汇总正确（实得 ${JSON.stringify(mu.summary)}）`);
  assert(Math.round(mu.summary.tps * 10) === 138, `汇总速率=窗口内 Σ输出 ÷ Σ生成秒数（180 ÷ 13，实得 ${mu.summary.tps}）`);
  const usage = await get('/stats/usage?turns=0&session=sess_mu');
  assert(usage.sessionSummary && usage.sessionSummary.requests === 2, 'stats/usage 携带会话汇总');
  const ns = await get('/stats/turns?session=sess_nostream');
  assert(Math.round(ns.rounds[0].tps * 10) === 359 && ns.summary.tps === ns.rounds[0].tps,
    `首 token 贴着结束的请求按全程算速率（期望 35.9，实得 ${ns.rounds[0].tps}）`);
} catch (err) {
  assert(false, 'model_usage 假库测试装配失败: ' + (err && err.message));
}

rmSync(root, { recursive: true, force: true });
console.log(failed ? 'FAILED' : 'all ok');
process.exit(failed);
