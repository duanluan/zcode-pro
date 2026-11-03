// 会话 ID 识别回归测试：断言 session-link.js 的 matchIds 切分文本的结果。
// 零依赖，node scripts/test-session-link.mjs（或 npm test）直接跑，全绿退出码 0。
// 覆盖：sess_/session_ 两种前缀、连字符 id、单词/下划线边界不误吞、
// 尾随连字符不吞、"session_" 后至少一个字符、多段文本切分位置。
import assert from 'node:assert/strict';
import { matchIds } from '../src/inject/features/session-link.js';

const id1 = 'sess_ed948434-1290-4a86-b6a2-81019ce4894d';
const id2 = 'session_abc123';

// 单个 ID：位置与原文一致
assert.deepEqual(matchIds(`见 ${id1} 与 ${id2} 两个会话`), [
  { start: 2, end: 2 + id1.length, id: id1 },
  { start: 5 + id1.length, end: 5 + id1.length + id2.length, id: id2 },
]);
// 纯 ID、无 ID、空串
assert.deepEqual(matchIds(id2), [{ start: 0, end: id2.length, id: id2 }]);
assert.deepEqual(matchIds('没有会话 id 的普通文本'), []);
assert.deepEqual(matchIds(''), []);
// 边界：单词/下划线连着不算（mysession_x、a_sess_x），连字符连着算（文档里常见）
assert.deepEqual(matchIds('mysession_x 不算'), []);
assert.deepEqual(matchIds('a_sess_x 不算'), []);
assert.deepEqual(matchIds('前缀-sess_abc1234 算一个').map((m) => m.id), ['sess_abc1234']);
// 尾随连字符/下划线不吞进 ID
assert.deepEqual(matchIds('sess_abc123- 是连字符').map((m) => m.id), ['sess_abc123']);
assert.deepEqual(matchIds('sess_abc123_ 同理').map((m) => m.id), ['sess_abc123']);
// 前缀后至少一个字符：裸 "sess_" 不算
assert.deepEqual(matchIds('sess_ 结尾'), []);
// 同一段文本反复调用结果稳定（游标正确复位）
const twice = `x ${id1} y`;
assert.deepEqual(matchIds(twice), matchIds(twice));

console.log('session-link matchIds: all assertions passed');
