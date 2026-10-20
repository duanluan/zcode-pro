// 读取已安装 ZCode 的版本号：从可执行文件旁边的 resources/app.asar（macOS 为
// Contents/Resources/app.asar）头部解析内嵌 package.json 的 version 字段。
// asar 结构：偏移 0–15 为头部尺寸描述，偏移 12 处的 u32 是头部 JSON 长度，
// JSON 紧跟在偏移 16；files["package.json"] 的 offset 相对 16+jsonLen，且实测
// 存在 4 字节对齐补位，因此多读几字节、从首个 '{' 开始截取再解析。
// 读取失败一律返回空串：调用方把空串当作“版本未知”，不启用按版本的分支。
import { closeSync, openSync, readSync } from 'node:fs';
import { dirname, join } from 'node:path';

// 本启动器常以 ELECTRON_RUN_AS_NODE 方式复用 ZCode 二进制运行，该模式下 Electron
// 的 fs 仍带 asar 补丁：.asar 路径被当作归档目录而非普通文件，按字节偏移读头部会
// 全部落空（实测 3.16.1 下读到空串）。noAsar 开关（Electron 官方 API）关闭该拦截；
// 纯 Node 运行时没有这个属性，赋值无副作用
process.noAsar = true;

export function zcodeAsarPath(exePath) {
  if (!exePath) return '';
  // Electron 约定：Linux/Windows 资源目录在可执行文件旁；macOS 在 Contents/Resources
  const dir = process.platform === 'darwin'
    ? join(dirname(exePath), '..', 'Resources')
    : join(dirname(exePath), 'resources');
  return join(dir, 'app.asar');
}

export function readZcodeVersion(exePath) {
  let fd = 0;
  try {
    fd = openSync(zcodeAsarPath(exePath), 'r');
    const head = Buffer.alloc(16);
    if (readSync(fd, head, 0, 16, 0) !== 16) return '';
    const jsonLen = head.readUInt32LE(12);
    // 头部异常大小说明不是预期的 asar（或文件损坏），直接放弃
    if (jsonLen <= 0 || jsonLen > 64 * 1024 * 1024) return '';
    const hdr = Buffer.alloc(jsonLen);
    if (readSync(fd, hdr, 0, jsonLen, 16) !== jsonLen) return '';
    const entry = JSON.parse(hdr.toString('utf8')).files?.['package.json'];
    if (!entry || entry.unpacked || typeof entry.offset !== 'string') return '';
    const base = 16 + jsonLen + Number(entry.offset);
    const buf = Buffer.alloc(entry.size + 8);
    readSync(fd, buf, 0, buf.length, base);
    const text = buf.toString('utf8');
    const start = text.indexOf('{');
    if (start < 0) return '';
    const version = JSON.parse(text.slice(start, start + entry.size)).version;
    return typeof version === 'string' ? version : '';
  } catch {
    return '';
  } finally {
    if (fd) { try { closeSync(fd); } catch { /* ignore */ } }
  }
}
