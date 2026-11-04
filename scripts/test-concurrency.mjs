// 并发竞争回归测试：隔离 helper 实例上并发同名/异名上传、并发增删同名文件。
// 零依赖，node scripts/test-concurrency.mjs（或 npm test）直接跑，全绿退出码 0。
// HOME 指进沙箱；helper 跑在独立端口 + 临时 dataRoot，不碰真实环境。
// 覆盖：同名并发上传不互相写坏（落盘文件是某一份完整内容，不是混合字节）、
// 异名并发全部入库、增删竞态下服务不崩不挂。
import { mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startHelper } from '../src/host/helper.mjs';

const root = mkdtempSync(join(tmpdir(), 'zcodepro-conc-test-'));
process.env.HOME = join(root, 'fake-home');
mkdirSync(process.env.HOME, { recursive: true });

let failed = 0;
const assert = (cond, msg) => {
  if (!cond) { console.error('FAIL: ' + msg); failed = 1; }
  else console.log('ok: ' + msg);
};

const port = 47903;
const token = 'conc-token';
startHelper({ port, token, dataRoot: root, state: {}, agentsFile: join(root, 'AGENTS.md'), visionFile: join(root, 'v.json'), listenTries: 5 });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 30; i++) {
  try { await fetch(base + '/health', { headers: { 'X-ZCodePro-Token': token } }); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
}

// 合法 PNG 头 + 各自的标识字节（魔数校验过、内容可辨识）
const pngOf = (mark) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(mark.repeat(64))]);
const upload = (name, buf) => fetch(base + '/bg', {
  method: 'POST',
  headers: { 'X-ZCodePro-Token': token, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name, data: 'data:image/png;base64,' + buf.toString('base64') }),
}).then((r) => r.json());

// —— 同名并发：10 路同时写 a.png，落盘必须是某一份完整内容 ——
const payloads = Array.from({ length: 10 }, (_, i) => pngOf(String.fromCharCode(65 + i)));
const rs = await Promise.all(payloads.map((buf) => upload('a.png', buf)));
assert(rs.every((r) => r.ok), `同名并发上传全部受理（失败 ${rs.filter((r) => !r.ok).length} 个）`);
const landed = readFileSync(join(root, 'backgrounds', 'a.png'));
const complete = payloads.some((buf) => landed.length === buf.length && landed.equals(buf));
assert(complete, `落盘文件是某一份完整内容（长度 ${landed.length}，非混合字节）`);

// —— 异名并发：10 路不同名全部入库 ——
const rs2 = await Promise.all(payloads.map((buf, i) => upload(`f${i}.png`, buf)));
assert(rs2.every((r) => r.ok), '异名并发上传全部成功');
assert(existsSync(join(root, 'backgrounds', 'f0.png')) && existsSync(join(root, 'backgrounds', 'f9.png')), '异名文件全部落盘');

// —— 增删竞态：同名上传与删除同时打，服务不崩、收尾健康 ——
await Promise.all([
  upload('race.png', payloads[0]),
  fetch(base + '/bg/delete', {
    method: 'POST',
    headers: { 'X-ZCodePro-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'race.png' }),
  }).then((r) => r.json()),
  upload('race.png', payloads[1]),
]);
const h = await fetch(base + '/health', { headers: { 'X-ZCodePro-Token': token } });
assert(h.status === 200, '增删竞态后服务健康');

rmSync(root, { recursive: true, force: true });
console.log(failed ? 'FAILED' : 'all ok');
process.exit(failed);
