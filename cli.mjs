// ZCode Pro 启动器入口。
// 推荐以 ELECTRON_RUN_AS_NODE=1 <zcode 可执行文件> cli.mjs 的方式运行，
// 这样无需安装任何 Node.js 环境即可使用（ZCode 自带 Node 运行时）。
import { run } from './src/host/main.mjs';

run(process.argv.slice(2)).catch((err) => {
  console.error('[zcodepro] 致命错误:', err?.stack || err);
  process.exit(1);
});
