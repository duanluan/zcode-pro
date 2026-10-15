#!/usr/bin/env node
// ZCode Pro 启动器（npm 全局安装用，跨平台 Node 版；查找逻辑与 bin/zcode-pro shell 版一致）。
// 优先用 ZCode 自带的 Node 运行时（ELECTRON_RUN_AS_NODE），避免系统 node 过旧
// （<22.5 缺 node:sqlite、<22 缺全局 WebSocket）时启动失败；
// 找不到 ZCode 可执行文件时回退当前 node 进程（npm 环境必有 node）。
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// 动态导入必须用 URL 对象：Windows 上绝对路径（C:\...）会被当作 c: 协议报错
const cliPath = fileURLToPath(new URL('../cli.mjs', import.meta.url));
const argv = process.argv.slice(2);

async function runWithZcodeRuntime() {
  const { resolveZcodeExecutable } = await import('../src/host/paths.mjs');
  const zcodeBin = resolveZcodeExecutable('');
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
  // 预检：注册表等来源找到的 ZCode 可能不完整（缺 resources/ICU 数据等），以 Node
  // 模式跑不起来的直接抛错回退系统 node，避免启动器跟着报难懂的错误退出
  // --no-warnings：node:sqlite 的 ExperimentalWarning 每次启动必然刷屏、用户
  // 常误当成报错（在模块加载阶段同步打印，进程内拦不住），由调用方加旗标关闭
  const pre = spawnSync(zcodeBin, ['-e', 'process.exit(0)'], { env, stdio: 'ignore' });
  if (pre.status !== 0) throw new Error(`ZCode 运行时不可用（${zcodeBin}）`);
  await new Promise((resolve, reject) => {
    const child = spawn(zcodeBin, ['--no-warnings', cliPath, ...argv], { stdio: 'inherit', env });
    // spawn 成功才挂退出转发并 resolve。spawn 失败的 error 事件晚一拍才发，同步
    // resolve 会把 reject 变成空操作（失败被吞、进程静默退 0、回退分支不触发）；
    // 且失败后 exit 是否触发文档未定义，退出转发提前挂载可能把回退拉起的进程
    // 退成 0。失败时只走 reject → 回退分支
    child.once('spawn', () => {
      child.on('exit', (code, signal) => {
        if (signal) process.kill(process.pid, signal);
        else process.exit(code ?? 0);
      });
      resolve();
    });
    child.once('error', reject);
  });
}

try {
  await runWithZcodeRuntime();
} catch {
  // 回退系统 node。不能在本进程 import cli.mjs：本进程没有 --no-warnings 旗标
  //（进程已启动，无法追加），node:sqlite 的实验特性警告会刷屏——用户误当报错。
  // 同样以带旗标的子进程重跑（npm 环境必有 node，spawn 自身路径可靠）
  const child = spawn(process.execPath, ['--no-warnings', cliPath, ...argv], {
    stdio: 'inherit', env: process.env,
  });
  child.once('error', (err) => {
    console.error(`[zcodepro] failed to launch: ${err?.message || err}`);
    process.exit(1);
  });
  // 退出转发同样等 spawn 成功再挂（理由见 runWithZcodeRuntime 内注释）
  child.once('spawn', () => {
    child.on('exit', (code, signal) => {
      if (signal) process.kill(process.pid, signal);
      else process.exit(code ?? 0);
    });
  });
}
