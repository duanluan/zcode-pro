// mcp-bridge.mjs 集成测试：同一项目多客户端共用一份服务、不同项目各自一份、
// initialize 只发给服务一次、全部断开后空闲自退、语言服务器起不来时清坏缓存自愈、
// 保温上限 2 份（踢最久未用）。零依赖，node scripts/test-mcp-bridge.mjs 直接跑，
// 全绿退出码 0。HOME 指进沙箱：自愈读写 ~/.serena 都落在沙箱里。
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bridgePath = join(root, 'src', 'host', 'mcp-bridge.mjs');
const sandbox = mkdtempSync(join(tmpdir(), 'zcodepro-bridge-test-'));
process.env.HOME = join(sandbox, 'fake-home');
mkdirSync(process.env.HOME, { recursive: true });
for (const p of ['projA', 'projB', 'projC', 'projD']) mkdirSync(join(sandbox, p));

let failed = 0;
const assert = (cond, msg) => {
  if (!cond) { console.error('FAIL: ' + msg); failed = 1; }
  else console.log('ok: ' + msg);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 假服务：NDJSON MCP（应答 initialize 与任意请求），并把每次拉起写进计数文件——
// 断言“共用一份/各用各的”就看这个计数
const servicePath = join(sandbox, 'fake-service.mjs');
writeFileSync(servicePath, `
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
const home = process.env.HOME;
appendFileSync(home + '/spawns.txt', process.argv[2] + '\\n');
writeFileSync(home + '/pid-' + process.argv[2].replace(/[^a-z0-9]/gi, '_') + '.txt', String(process.pid));
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => {
  buf += c;
  let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    let m; try { m = JSON.parse(line); } catch { continue; }
    if (m.id === undefined || m.id === null) continue;
    if (m.method === 'initialize') {
      appendFileSync(home + '/inits.txt', '1\\n');
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { ok: true } }) + '\\n');
    } else if (m.method === 'heal-me') {
      // 模拟 serena：往 $HOME/.serena/logs/<日期>/ 写一条带失败标记的日志
      const d = new Date();
      const day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const dir = home + '/.serena/logs/' + day;
      try { mkdirSync(dir, { recursive: true }); } catch {}
      appendFileSync(dir + '/mcp_test.txt',
        'ERROR Language server startup (ls_id=java) failed after 1.106 seconds\\n' +
        'LanguageServerManagerInitialisationError: Failed to start 1 language server(s): java\\n' +
        \"command: ['java', '-jar', 'x', '-data', '/fake/EclipseJDTLS/workspaces/abc123def/data_dir']\\n\");
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { ok: true } }) + '\\n');
    } else {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { ok: true } }) + '\\n');
    }
  }
});
`);

// 一个桥客户端：spawn 桥，按行收发 JSON-RPC
function startClient(cwd, idleMs) {
  const child = spawn(process.execPath, [bridgePath, '--', process.execPath, servicePath, '$CWD'], {
    cwd,
    env: { ...process.env, MCP_BRIDGE_IDLE_MS: String(idleMs ?? 60000) },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const out = { child, lines: [], waiters: [] };
  let buf = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (c) => {
    buf += c;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      out.lines.push(line);
      for (const w of out.waiters.splice(0)) w();
    }
  });
  return out;
}
async function rpc(c, method, timeoutMs = 8000) {
  const id = Math.floor(Math.random() * 1e9);
  c.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params: {} }) + '\n');
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const hit = c.lines.find((l) => { try { return JSON.parse(l).id === id; } catch { return false; } });
    if (hit) return JSON.parse(hit);
    await new Promise((r) => { c.waiters.push(r); setTimeout(r, 100); });
  }
  return null;
}
const spawns = () => { try { return readFileSync(join(process.env.HOME, 'spawns.txt'), 'utf8').trim().split('\n').filter(Boolean); } catch { return []; } };
const inits = () => { try { return readFileSync(join(process.env.HOME, 'inits.txt'), 'utf8').trim().split('\n').filter(Boolean).length; } catch { return 0; } };
const pidAlive = (tag) => {
  try {
    const pid = Number(readFileSync(join(process.env.HOME, 'pid-' + tag.replace(/[^a-z0-9]/gi, '_') + '.txt'), 'utf8'));
    process.kill(pid, 0);
    return true;
  } catch { return false; }
};

// —— 同项目共享：两个客户端（projA）→ 一份服务、initialize 只发一次 ——
const a1 = startClient(join(sandbox, 'projA'), 600);
const a2 = startClient(join(sandbox, 'projA'), 600);
const r1 = await rpc(a1, 'initialize');
const r2 = await rpc(a2, 'initialize');
await sleep(600);
assert(r1 && r1.result && r2 && r2.result, '两个同项目客户端都拿到 initialize 应答');
assert(spawns().length === 1, `同项目只拉起一份服务（实际 ${spawns().length}）`);
assert(inits() === 1, `initialize 只发给服务一次（实际 ${inits()}）`);
const t1 = await rpc(a1, 'tools/call');
const t2 = await rpc(a2, 'tools/call');
assert(t1 && t1.result && t2 && t2.result, '两个客户端的普通请求都被应答');

// —— 异项目隔离：projB 另拉一份 ——
const b1 = startClient(join(sandbox, 'projB'), 600);
const rb = await rpc(b1, 'initialize');
await sleep(400);
assert(rb && rb.result, '异项目客户端拿到应答');
assert(spawns().length === 2, `不同项目各用各的服务（实际 ${spawns().length}）`);

// —— 空闲自退：全部断开后按 IDLE_MS 退出 ——
for (const c of [a1, a2, b1]) { try { c.child.stdin.end(); } catch { /* ignore */ } }
await sleep(2500); // IDLE_MS=600 的桥 + 服务退出要一小会儿
assert(spawns().length === 2 && !pidAlive(spawns()[0]) && !pidAlive(spawns()[1]), '全部断开后服务空闲自退');

// —— 保温上限 2 份：第三个项目的守护方踢掉最久未用的一个 ——
const c1 = startClient(join(sandbox, 'projA'));
const d1 = startClient(join(sandbox, 'projB'));
await rpc(c1, 'initialize');
await rpc(d1, 'initialize');
await sleep(300);
const e1 = startClient(join(sandbox, 'projC'));
await rpc(e1, 'initialize');
await sleep(2500); // 被踢的守护方走优雅关闭
const sockDir = join(tmpdir(), 'zcode-mcp-bridge-' + process.getuid());
const socks = existsSync(sockDir) ? readdirSync(sockDir).filter((n) => n.endsWith('.sock')) : [];
assert(socks.length <= 2, `保温上限 2 份（当前套接字 ${socks.length} 个）`);

// —— 坏缓存自愈：语言服务器起不来 → 清掉日志里那个工作区缓存 ——
const wsDir = join(process.env.HOME, '.serena', 'language_servers', 'static', 'EclipseJDTLS', 'workspaces', 'abc123def');
mkdirSync(wsDir, { recursive: true });
writeFileSync(join(wsDir, 'stale.txt'), 'x');
const f1 = startClient(join(sandbox, 'projD'));
const rf = await rpc(f1, 'initialize');
await rpc(f1, 'heal-me');
await sleep(9000); // 自愈监视 5 秒一轮
assert(rf && rf.result, '自愈场景的客户端拿到应答');
assert(!existsSync(wsDir), '损坏的工作区缓存被自动清掉');

for (const c of [c1, d1, e1, f1]) { try { c.child.kill(); } catch { /* ignore */ } }
rmSync(sandbox, { recursive: true, force: true });
console.log(failed ? 'FAILED' : 'all ok');
process.exit(failed);
