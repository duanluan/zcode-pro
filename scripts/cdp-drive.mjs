// CDP 极简驱动：对带 --remote-debugging-port 的 ZCode 实例截图/执行 JS/点击。
// 用途见 docs/dev-second-instance-test.md（虚拟屏 + 第二实例的 UI 端到端测试）。
// 用法: node scripts/cdp-drive.mjs <命令> [参数]
//   pages                         列出页面 target
//   shot [文件名]                  截图到 $SHOTS_DIR（默认 ./cdp-shots）
//   eval "<JS>"                   在页面里执行 JS 并打印结果
//   rightclick-gear               右键齿轮（data-testid=task-settings-button）开增强设置弹窗
//   click-text "<文本>"            点击文本完全匹配的叶子元素（tab 切换等）
//   wait-text "<文本> [毫秒]"      等待文本出现在页面
//   row-state "<文本片段>"         找含该文本的设置行，读开关状态（data-state / aria-checked）
//   toggle-row "<文本片段>"        点击该设置行（触发行开关）
// 环境变量: CDP_PORT（默认 9444）、SHOTS_DIR（默认 ./cdp-shots）
import { writeFileSync, mkdirSync } from 'node:fs';

const CDP = process.env.CDP_PORT || '9444';
const SHOTS = process.env.SHOTS_DIR || './cdp-shots';
mkdirSync(SHOTS, { recursive: true });

async function listPages() {
  const res = await fetch(`http://127.0.0.1:${CDP}/json/list`);
  return res.json();
}

async function connect() {
  const pages = (await listPages()).filter((p) => p.type === 'page' && !String(p.url).startsWith('devtools://'));
  if (!pages.length) throw new Error('没有页面 target');
  const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
  return { ws, send };
}

async function evaluate(send, expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error('JS 异常: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r.result?.result?.value;
}

const [cmd, ...rest] = process.argv.slice(2);
const arg = rest.join(' ');
const { ws, send } = await connect();
try {
  if (cmd === 'shot') {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    const f = `${SHOTS}/${arg || Date.now()}.png`;
    writeFileSync(f, Buffer.from(r.result.data, 'base64'));
    console.log('saved ' + f);
  } else if (cmd === 'eval') {
    console.log(JSON.stringify(await evaluate(send, arg), null, 1));
  } else if (cmd === 'pages') {
    console.log(JSON.stringify((await listPages()).map((p) => ({ type: p.type, url: p.url, title: p.title })), null, 1));
  } else if (cmd === 'rightclick-gear') {
    console.log('rightclick-gear: ' + await evaluate(send, `(() => {
      const btn = document.querySelector('[data-testid="task-settings-button"]');
      if (!btn) return 'no-gear';
      btn.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: window }));
      return 'ok';
    })()`));
  } else if (cmd === 'click-text') {
    console.log('click-text: ' + await evaluate(send, `(() => {
      const want = ${JSON.stringify(arg)};
      const els = [...document.querySelectorAll('button,div,span,a')].filter((e) => e.childElementCount === 0 && e.textContent.trim() === want);
      if (!els.length) return 'not-found';
      els[els.length - 1].click();
      return 'clicked';
    })()`));
  } else if (cmd === 'wait-text') {
    const [txt, msS] = rest;
    const ms = Number(msS) || 15000;
    const t0 = Date.now();
    let found = false;
    while (Date.now() - t0 < ms) {
      found = await evaluate(send, `document.body.innerText.includes(${JSON.stringify(txt)})`);
      if (found) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    console.log('wait-text: ' + (found ? 'found' : 'timeout'));
  } else if (cmd === 'row-state' || cmd === 'toggle-row') {
    const info = await evaluate(send, `(() => {
      const frag = ${JSON.stringify(arg)};
      const name = [...document.querySelectorAll('div')].find((e) => e.childElementCount === 0 && e.textContent.includes(frag) && e.className.includes('font-medium'));
      if (!name) return { found: false };
      const row = name.closest('.cursor-pointer');
      const track = row?.querySelector('[data-zcodepro-switch]');
      ${cmd === 'toggle-row' ? 'if (row) row.click();' : ''}
      return { found: true, text: name.textContent.trim(), state: track?.getAttribute('data-state'), aria: row?.querySelector('[role="switch"]')?.getAttribute('aria-checked') };
    })()`);
    console.log(JSON.stringify(info, null, 1));
  } else {
    console.log('未知命令: ' + cmd + '（见文件头注释）');
  }
} finally {
  ws.close();
}
