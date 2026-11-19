// idle-busy 的 Windows 判定回归：会话自己的 zcode-cli worker（含嵌套）空闲时不算
// 用户命令；worker 名下仍有在跑的命令时照常判忙；子代理会话 id 沿父链归属到项目。
// 直接喂 Win32_Process 形状的数据，不碰系统。
import { classifyIdleBusyWindows, normWinPath, parsePsTime, isAgentWorkerCmdline } from '../src/host/helper.mjs';

let failed = 0;
const assert = (cond, msg) => {
  if (!cond) { console.error('FAIL: ' + msg); failed = 1; }
  else console.log('ok: ' + msg);
};
const P = (pid, ppid, name, cmdline) => ({ pid, ppid, name, cmdline });
const paths = ['/w/a', '/w/b'];
const lookup = async (id) => ({
  sess_a: '/w/a', sess_b: '/w/b',
  sess_other: '/w/other',       // 归属明确但不在本轮请求里
}[id]);
const run = (procs, lk = lookup, ps = paths) => classifyIdleBusyWindows(procs, ps, lk);

const base = [
  P(10, 1, 'zcode-cli.exe', 'zcode-cli.exe'),
  P(11, 10, 'zcode-cli.exe', 'zcode-cli.exe'), // 空闲 worker
];

let r = await run(base);
assert(r.scan === true && r.busy.length === 0, '空闲 worker 不判忙');

r = await run([...base, P(12, 11, 'cmd.exe', 'cmd.exe /c build.bat sess_a')]);
assert(r.busy.includes('/w/a') && !r.busy.includes('/w/b'), 'worker 名下在跑的命令按会话归属判忙');

r = await run([...base, P(13, 10, 'powershell.exe', 'powershell.exe -c deploy sess_b')]);
assert(r.busy.includes('/w/b') && !r.busy.includes('/w/a'), '会话直接子进程里的用户命令判忙');

r = await run([...base, P(14, 10, 'node.exe', 'node C:/Users/x/.zcode/cli/plugins/foo/mcp.mjs')]);
assert(r.busy.length === 0, '插件/MCP 基础设施不判忙');

r = await run([...base, P(15, 10, 'foo.exe', 'foo.exe')]);
assert(r.busy.length === 2, '归属不明的子进程全部判忙');

// 拿不到命令行的 worker：只能按名字识别，不能把它算成归属不明的用户进程
r = await run([P(10, 1, 'zcode-cli.exe', 'zcode-cli.exe'), P(11, 10, 'zcode-cli.exe', '')]);
assert(r.busy.length === 0, '命令行缺失的空闲 worker 不判忙');

// worker 的完整命令行带应用安装路径（含 Programs/ZCode）：仍按名字认成 worker
r = await run([
  P(10, 1, 'zcode-cli.exe', 'C:/Users/x/AppData/Local/Programs/ZCode/zcode-cli.exe'),
  P(11, 10, 'zcode-cli.exe', 'C:/Users/x/AppData/Local/Programs/ZCode/zcode-cli.exe'),
]);
assert(r.busy.length === 0, '完整路径（含 Programs/ZCode）的 worker 不判忙');

// 嵌套子代理：worker 下再挂 worker，空闲时仍应放过；有命令时归属到对应会话
r = await run([...base, P(16, 11, 'zcode-cli.exe', 'zcode-cli.exe')]);
assert(r.busy.length === 0, '嵌套空闲 worker 不判忙');

r = await run([...base, P(16, 11, 'zcode-cli.exe', 'zcode-cli.exe'), P(17, 16, 'cmd.exe', 'cmd.exe /c x sess_b')]);
assert(r.busy.includes('/w/b') && !r.busy.includes('/w/a'), '嵌套 worker 名下的命令按会话归属判忙');

r = await run([...base, P(16, 11, 'zcode-cli.exe', '')]);
assert(r.busy.length === 0, '嵌套 worker 命令行缺失不判忙');

r = await run([...base, P(18, 11, 'node.exe', 'node C:/Users/x/.zcode/cli/plugins/foo/mcp.mjs')]);
assert(r.busy.length === 0, 'worker 名下只有基础设施子进程不判忙');

// 子代理会话 id 不在任务索引里：查得到的归属到项目，查不到的才全量判忙
r = await run([...base, P(19, 11, 'cmd.exe', 'cmd.exe /c test sess_subagent_agent_abc')], async (id) => (
  id === 'sess_subagent_agent_abc' ? '/w/a' : lookup(id)
));
assert(r.busy.includes('/w/a') && !r.busy.includes('/w/b'), '子代理会话 id 归属到它的项目');

r = await run([...base, P(20, 11, 'cmd.exe', 'cmd.exe /c test sess_only_other')], async () => '/w/other');
assert(r.busy.length === 0, '不属于本轮项目的会话命令不影响本轮判定');

r = await run([...base, P(21, 11, 'cmd.exe', 'cmd.exe /c test sess_unknown')], async () => undefined);
assert(r.busy.length === 2, '归属不明的会话 id 全部判忙');

// session_ 前缀与含点号的 id（新版应用、ID 字符集回归）
r = await run([...base, P(22, 11, 'cmd.exe', 'cmd.exe /c test session_abc.def-01')], async (id) => (
  id === 'session_abc.def-01' ? '/w/a' : undefined
));
assert(r.busy.includes('/w/a'), 'session_ 前缀和点号 id 能正确匹配');

// 路径归一与 ps time 解析
assert(normWinPath('C:\\X\\Y\\') === 'c:/x/y', 'Windows 路径归一：反斜杠/尾斜杠/大小写');
assert(normWinPath('\\\\?\\C:\\X\\Y') === 'c:/x/y', 'Windows 路径归一：\\\\?\\ 长路径前缀');
assert(parsePsTime('0:05') === 5, 'ps time：分:秒');
assert(parsePsTime('1:02:03') === 3723, 'ps time：时:分:秒');
assert(parsePsTime('2-01:02:03') === 2 * 86400 + 3723, 'ps time：天数前缀');
assert(parsePsTime('') === 0, 'ps time：空值');

// argv[0] 兜底识别 worker（含带引号、含空格的安装路径）
assert(isAgentWorkerCmdline('zcode-cli'), 'argv[0] 兜底：裸名');
assert(isAgentWorkerCmdline('C:/Users/x/AppData/Local/Programs/ZCode/zcode-cli.exe --foo'), 'argv[0] 兜底：完整路径');
assert(isAgentWorkerCmdline('"C:/Program Files/ZCode/zcode-cli.exe" --foo'), 'argv[0] 兜底：带引号的含空格路径');
assert(!isAgentWorkerCmdline('node /opt/ZCode/resources/glm/zcode.cjs app-server'), 'argv[0] 兜底：node 命令不是 worker');
assert(!isAgentWorkerCmdline(''), 'argv[0] 兜底：空命令行');

process.exit(failed);
