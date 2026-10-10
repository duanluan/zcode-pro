#!/usr/bin/env node
// ZCode Pro 启动器（npm 全局安装用，跨平台 Node 版；查找逻辑与 bin/zcode-pro shell 版一致）。
// 优先用 ZCode 自带的 Node 运行时（ELECTRON_RUN_AS_NODE），避免系统 node 过旧
// （<22.5 缺 node:sqlite、<22 缺全局 WebSocket）时启动失败；
// 找不到 ZCode 可执行文件时回退当前 node 进程（npm 环境必有 node）。
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// 动态导入必须用 URL 对象：Windows 上绝对路径（C:\...）会被当作 c: 协议报错
const cliUrl = new URL('../cli.mjs', import.meta.url);
const cliPath = fileURLToPath(cliUrl);
const argv = process.argv.slice(2);

async function runWithZcodeRuntime() {
  const { resolveZcodeExecutable } = await import('../src/host/paths.mjs');
  const zcodeBin = resolveZcodeExecutable('');
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
  // 预检：注册表等来源找到的 ZCode 可能不完整（缺 resources/ICU 数据等），以 Node
  // 模式跑不起来的直接抛错回退系统 node，避免启动器跟着报难懂的错误退出
  const pre = spawnSync(zcodeBin, ['-e', 'process.exit(0)'], { env, stdio: 'ignore' });
  if (pre.status !== 0) throw new Error(`ZCode 运行时不可用（${zcodeBin}）`);
  await new Promise((resolve, reject) => {
    const child = spawn(zcodeBin, [cliPath, ...argv], { stdio: 'inherit', env });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) process.kill(process.pid, signal);
      else process.exit(code ?? 0);
    });
    resolve();
  });
}

try {
  await runWithZcodeRuntime();
} catch {
  await import(cliUrl);
}
