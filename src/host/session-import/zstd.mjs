// dsh 的会话文件由多个 zstd frame 追加写而成。Node 自带的 zstdDecompress 只解
// 第一个 frame，这里按帧头切分后逐个解压，再按顺序拼起来。
import * as zlib from 'node:zlib';

const { zstdDecompressSync } = zlib;

const ZSTD_MAGIC = 0xfd2fb528;
const SKIPPABLE_MASK = 0xfffffff0;
const SKIPPABLE_MAGIC = 0x184d2a50;

function frameEnd(buf, off) {
  if (off + 4 > buf.length) throw new Error('zstd 文件被截断');
  let p = off;
  const magic = buf.readUInt32LE(p);
  p += 4;
  if ((magic & SKIPPABLE_MASK) === SKIPPABLE_MAGIC) {
    if (p + 4 > buf.length) throw new Error('zstd 跳过帧被截断');
    const size = buf.readUInt32LE(p);
    p += 4;
    if (p + size > buf.length) throw new Error('zstd 跳过帧长度越界');
    return p + size;
  }
  if (magic !== ZSTD_MAGIC) throw new Error('不是 zstd 文件');

  if (p >= buf.length) throw new Error('zstd 帧头被截断');
  const fhd = buf[p++];
  const fcsFlag = fhd >> 6;
  const singleSegment = (fhd >> 5) & 1;
  const checksum = (fhd >> 2) & 1;
  const dictFlag = fhd & 3;
  if (!singleSegment) p += 1;
  p += [0, 1, 2, 4][dictFlag];
  p += fcsFlag === 0 ? (singleSegment ? 1 : 0) : [2, 4, 8][fcsFlag - 1];
  if (p > buf.length) throw new Error('zstd 帧头长度越界');

  for (;;) {
    if (p + 3 > buf.length) throw new Error('zstd 块头被截断');
    const head = buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16);
    p += 3;
    const last = head & 1;
    const type = (head >> 1) & 3;
    const size = head >>> 3;
    if (type === 3) throw new Error('zstd 块类型无效');
    p += type === 1 ? 1 : size;
    if (p > buf.length) throw new Error('zstd 块长度越界');
    if (last) break;
  }
  if (checksum) p += 4;
  if (p > buf.length) throw new Error('zstd 校验长度越界');
  return p;
}

export function zstdDecompressAll(buf) {
  if (typeof zstdDecompressSync !== 'function') {
    const err = new Error('当前 Node 不支持 zstd 解压（需要 22.15 及以上）');
    err.code = 'zstd-unavailable';
    throw err;
  }
  const chunks = [];
  let off = 0;
  while (off < buf.length) {
    const end = frameEnd(buf, off);
    if (end <= off) throw new Error('zstd 帧长度无效');
    chunks.push(zstdDecompressSync(buf.subarray(off, end)));
    off = end;
  }
  return Buffer.concat(chunks);
}
