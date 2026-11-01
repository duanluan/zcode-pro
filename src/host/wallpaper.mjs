// zcode-pro wallpaper 子命令：壁纸引擎的命令行控制面（/wallpaper 命令与
// wallpaper 技能把模型引导到这里，经 Bash 调用）。校验与取值表（扩展名/大小/
// 数量/魔数/参数键与范围）复用 helper 的一份实现（bgMagicOk、mergeThemeConfig、
// BG_* 常量、BG_PARAM_KEYS）；提示文案里的数字与清单只是说明文字，不是第二处校验。
// 写入 zcodepro.json 后约 5 秒内生效（运行中的界面轮询配置）。
import { copyFileSync, existsSync, mkdirSync, openSync, closeSync, readSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import {
  loadConfig, saveConfig, mergeThemeConfig, configFileUnreadable,
  backgroundsDir, transcodeDir, listBgFiles, sanitizeBgName, bgMagicOk, cleanupBgTranscode,
  BG_EXT, VIDEO_EXT, BG_MAX_BYTES, VIDEO_MAX_BYTES, BG_MAX_COUNT,
  BG_MODES, BG_PARAM_KEYS, unlinkOrDefer, renameOrReplace, sweepDeferredBg,
} from './helper.mjs';

function usage() {
  return `zcode-pro wallpaper — 壁纸引擎命令行控制

用法:
  wallpaper list                          查看当前配置与图库文件
  wallpaper set none                      关闭壁纸
  wallpaper set library <图库文件名>       用图库里的某个文件
  wallpaper set folder <目录绝对路径>      用文件夹（原地读取，配合 rotate 轮换）
  wallpaper set url <http(s)地址>          图片网址
  wallpaper set web <http(s)地址>          网页壁纸
  wallpaper rotate <分钟> [--random|--sequential]
                                          定时轮换（0 = 不轮换，顺序或随机）
  wallpaper params <键=值>...              调画面/播放参数，可一次多项：
      maskOpacity=0.8    遮罩不透明度 0-0.99        blurPx=0        画面模糊 0-24
      panelOpacity=0.3   面板不透明度 0-1           fit=cover       cover/contain/fill/tile
      transition=fade    cut/fade 换壁纸转场        fpsCap=0        视频帧率上限 0/15/30/60
      videoVolume=0      视频音量 0-1               playbackRate=1  视频倍速 0.5-2
      pauseOnHidden=true 窗口最小化暂停             pauseOnBlur=false 窗口失焦暂停
      pauseOnBattery=false 电池供电暂停
  wallpaper upload [--select] <文件路径>... 把本机图片/视频复制进图库（--select 顺手设为壁纸）
  wallpaper delete <图库文件名>             从图库删除
`;
}

function ensureWritableConfig(file) {
  // 损坏判定与 helper 的 loadConfig/saveConfig 同一份（configFileUnreadable）：
  // 文件损坏时 loadConfig 只回默认值、saveConfig 会静默拒写，这里转成明确报错
  loadConfig(file);
  if (configFileUnreadable()) throw new Error('zcodepro.json 已损坏，拒绝写回以免清空配置；请先修复该文件');
}

function bgOf(cfg) {
  if (!cfg.theme || typeof cfg.theme !== 'object') cfg.theme = {};
  if (!cfg.theme.bg || typeof cfg.theme.bg !== 'object') cfg.theme.bg = {};
  return cfg.theme.bg;
}

// 类型检查挡明显打错（打错一个键不该把旋钮静默重置回默认），取值范围由
// mergeThemeConfig 统一校验（clamp + 默认值）
function applyParams(bg, pairs) {
  for (const [k, v] of pairs) {
    const kind = BG_PARAM_KEYS[k];
    if (!kind) throw new Error(`未知参数 ${k}，可用：${Object.keys(BG_PARAM_KEYS).join(', ')}`);
    if (v === '') throw new Error(`${k} 需要值，收到空值`);
    if (kind === 'number') {
      if (!Number.isFinite(Number(v))) throw new Error(`${k} 需要数值，收到: ${v}`);
      bg[k] = Number(v);
    } else if (kind === 'boolean') {
      if (v !== 'true' && v !== 'false') throw new Error(`${k} 需要 true/false，收到: ${v}`);
      bg[k] = v === 'true';
    } else {
      // Set = 枚举成员集：fpsCap 成员是数字（先试原值再试数值），fit/transition 是字符串
      const val = kind.has(v) ? v : Number(v);
      if (!kind.has(val)) throw new Error(`${k} 只支持 ${[...kind].join('/')}`);
      bg[k] = val;
    }
  }
}

function head16(file) {
  const fd = openSync(file, 'r');
  const head = Buffer.alloc(16);
  try { readSync(fd, head, 0, 16, 0); } finally { closeSync(fd); }
  return head;
}

export async function runWallpaperCli(argv, dataRoot) {
  const configFile = join(dataRoot, 'zcodepro.json');
  const op = argv[0];
  try {
    if (!op || op === '-h' || op === '--help') { console.log(usage()); return op ? 0 : 1; }

    if (op === 'list') {
      if (argv.length > 1) throw new Error('list 不接受参数');
      const cfg = loadConfig(configFile);
      console.log(JSON.stringify({ bg: bgOf(cfg), library: listBgFiles(dataRoot) }, null, 2));
      return 0;
    }

    if (op === 'set') {
      const mode = argv[1];
      if (!BG_MODES.has(mode)) throw new Error(`set 用法: wallpaper set none|library <文件>|folder <目录>|url <地址>|web <地址>（mode 收到: ${mode ?? '(空)'}）`);
      if (mode === 'none' ? argv.length > 2 : argv.length !== 3) throw new Error(`${mode} 模式用法: wallpaper set ${mode}${mode === 'none' ? '' : ' <值>'}`);
      ensureWritableConfig(configFile);
      const cfg = loadConfig(configFile);
      const bg = bgOf(cfg);
      bg.mode = mode;
      if (mode === 'library') {
        const file = sanitizeBgName(argv[2] || '');
        if (!file) throw new Error('library 模式需要图库文件名（可用 wallpaper list 查看）');
        if (!listBgFiles(dataRoot).some((f) => f.name === file)) throw new Error(`图库里没有 ${file}`);
        bg.file = file;
      } else if (mode === 'folder') {
        const folder = String(argv[2] || '').trim();
        if (!folder || !isAbsolute(folder) || !existsSync(folder) || !statSync(folder).isDirectory()) throw new Error('folder 需要已存在的目录绝对路径');
        bg.folder = folder;
      } else if (mode === 'url' || mode === 'web') {
        const url = String(argv[2] || '').trim();
        if (!/^https?:\/\/\S+$/i.test(url) || /[<>"'\\]/.test(url)) throw new Error(`${mode} 需以 http(s):// 开头且不含引号尖括号`);
        bg.url = url;
      }
      cfg.theme = mergeThemeConfig({ ...cfg.theme, bg });
      saveConfig(configFile, cfg);
      console.log(`已切换：mode=${mode}，约 5 秒后生效。当前配置：${JSON.stringify(cfg.theme.bg)}`);
      return 0;
    }

    if (op === 'rotate') {
      const raw = argv[1];
      const iv = Number(raw);
      if (raw === undefined || raw === '' || !Number.isFinite(iv) || iv < 0) throw new Error('rotate 用法: wallpaper rotate <分钟> [--random|--sequential]（0 = 不轮换，上限 1440，超出自动收敛）');
      const flags = argv.slice(2);
      const unknown = flags.filter((f) => f !== '--random' && f !== '--sequential');
      if (unknown.length) throw new Error(`rotate 不认识 ${unknown.join(' ')}，只支持 --random/--sequential`);
      if (flags.includes('--random') && flags.includes('--sequential')) throw new Error('--random 与 --sequential 只能选一个');
      ensureWritableConfig(configFile);
      const cfg = loadConfig(configFile);
      const bg = bgOf(cfg);
      bg.intervalMin = Math.round(iv);
      if (flags.includes('--random')) bg.folderRandom = true;
      if (flags.includes('--sequential')) bg.folderRandom = false;
      cfg.theme = mergeThemeConfig({ ...cfg.theme, bg });
      saveConfig(configFile, cfg);
      const out = cfg.theme.bg;
      console.log(`轮换已设置：间隔 ${out.intervalMin} 分钟（${out.intervalMin === 0 ? '不轮换' : '生效中'}），顺序 ${out.folderRandom === false ? '按列表' : '随机'}`);
      return 0;
    }

    if (op === 'params') {
      const pairs = argv.slice(1).map((s) => {
        const i = s.indexOf('=');
        if (i <= 0) throw new Error(`params 用法: wallpaper params <键=值>...（收到: ${s}）`);
        return [s.slice(0, i).trim(), s.slice(i + 1).trim()];
      });
      if (!pairs.length) throw new Error('params 至少要一个 键=值（可用键见 wallpaper -h）');
      ensureWritableConfig(configFile);
      const cfg = loadConfig(configFile);
      const bg = bgOf(cfg);
      applyParams(bg, pairs);
      cfg.theme = mergeThemeConfig({ ...cfg.theme, bg });
      saveConfig(configFile, cfg);
      console.log(`参数已更新，约 5 秒后生效：${JSON.stringify(cfg.theme.bg)}`);
      return 0;
    }

    if (op === 'upload') {
      const flags = argv.slice(1).filter((s) => s.startsWith('--'));
      const paths = argv.slice(1).filter((s) => !s.startsWith('--'));
      if (flags.some((f) => f !== '--select')) throw new Error(`upload 只支持 --select，收到: ${flags.join(' ')}`);
      if (!paths.length) throw new Error('upload 用法: wallpaper upload [--select] <文件路径>...');
      // --select 要写配置：在复制前先确认配置可写，免得文件入库了才报“拒绝写回”
      if (flags.includes('--select')) ensureWritableConfig(configFile);
      // 先全量校验再复制：中途报错不留半批文件在图库里
      const plan = [];
      const seen = new Set();
      for (const src of paths) {
        const name = sanitizeBgName(basename(src));
        if (!name) throw new Error(`不支持的文件类型：${src}（图片 ${[...BG_EXT].map((e) => e.slice(1)).join('/')}，视频 ${[...VIDEO_EXT].map((e) => e.slice(1)).join('/')}）`);
        if (seen.has(name)) throw new Error(`同批出现重复文件名 ${name}，请改名或分批上传（避免后一个静默覆盖前一个）`);
        seen.add(name);
        if (!isAbsolute(src)) throw new Error(`需要绝对路径：${src}`);
        if (!existsSync(src) || !statSync(src).isFile()) throw new Error(`文件不存在：${src}`);
        const size = statSync(src).size;
        const isVideo = VIDEO_EXT.has(name.slice(name.lastIndexOf('.')).toLowerCase());
        if (size > (isVideo ? VIDEO_MAX_BYTES : BG_MAX_BYTES)) throw new Error(`${name} 超出大小限制（${isVideo ? `视频 ${VIDEO_MAX_BYTES / 1048576}MB` : `图片 ${BG_MAX_BYTES / 1048576}MB`}）`);
        if (!size || !bgMagicOk(name, head16(src))) throw new Error(`${name} 内容与扩展名不符（防止改名绕过检查）`);
        plan.push({ src, name });
      }
      const dir = backgroundsDir(dataRoot);
      mkdirSync(dir, { recursive: true });
      const existing = new Set(listBgFiles(dataRoot).map((f) => f.name));
      let added = 0;
      for (const { name } of plan) { if (!existing.has(name)) added += 1; }
      if (existing.size + added > BG_MAX_COUNT) throw new Error(`图库最多 ${BG_MAX_COUNT} 个文件，请先删除一些再上传`);
      const done = [];
      for (const { src, name } of plan) {
        // 临时名+改名：复制中断不留半截文件，读方也不会看到混合字节
        const tmp = join(dir, `${name}.${Date.now().toString(36)}.tmp`);
        try {
          copyFileSync(src, tmp);
          renameOrReplace(tmp, join(dir, name));
        } catch (e) {
          unlinkOrDefer(tmp);
          throw e;
        }
        done.push(name);
      }
      sweepDeferredBg(dir);
      let selected = '';
      if (flags.includes('--select') && done.length) {
        const cfg = loadConfig(configFile);
        if (configFileUnreadable()) throw new Error(`文件已入库（${done.join(', ')}）但配置在上传期间变为不可读，未设为壁纸；修复配置后跑 wallpaper set library ${done[0]}`);
        const bg = bgOf(cfg);
        bg.mode = 'library';
        bg.file = done[0];
        cfg.theme = mergeThemeConfig({ ...cfg.theme, bg });
        saveConfig(configFile, cfg);
        selected = '，并已设为当前壁纸';
      }
      console.log(`已上传 ${done.length} 个文件${selected}：${done.join(', ')}`);
      return 0;
    }

    if (op === 'delete') {
      if (argv.length !== 2) throw new Error('delete 用法: wallpaper delete <图库文件名>');
      const name = sanitizeBgName(argv[1] || '');
      if (!name) throw new Error('delete 用法: wallpaper delete <图库文件名>');
      const dir = backgroundsDir(dataRoot);
      const file = join(dir, name);
      if (!existsSync(file)) throw new Error(`图库里没有 ${name}（可用 wallpaper list 查看）`);
      cleanupBgTranscode(dataRoot, file);
      unlinkOrDefer(file);
      sweepDeferredBg(dir);
      sweepDeferredBg(transcodeDir(dataRoot));
      console.log(`已删除 ${name}（如正在使用，约 5 秒后自动停用）`);
      return 0;
    }

    console.error(`未知操作: ${op}\n`);
    console.log(usage());
    return 1;
  } catch (err) {
    console.error(`wallpaper ${op ?? ''} 失败: ${err?.message || err}`);
    return 1;
  }
}

// —— /wallpaper 命令与 wallpaper 技能：写到 ZCode 用户目录（每次启动覆盖，随
// zcode-pro 版本更新）；setup --uninstall 移除 ————————————————————————
const COMMAND_MD = `---
description: 管理 zcode-pro 壁纸：换壁纸、开/关定时轮换、设文件夹或网页壁纸、调画面与播放参数、传删图库。示例：/wallpaper 换成海边那张
argument-hint: [壁纸需求]
---

按 wallpaper 技能（skills/wallpaper/SKILL.md）处理壁纸需求：$ARGUMENTS

用 Bash 执行 \`zcode-pro wallpaper ...\` 子命令完成操作（list / set / rotate / params / upload / delete，用法见技能）。改完报告改了哪些值。
`;

const SKILL_MD = `---
name: wallpaper
description: 控制 zcode-pro 的壁纸引擎：换壁纸、开/关定时轮换、设文件夹或网页壁纸、调画面（遮罩/模糊/缩放）与播放（音量/倍速/帧率/暂停）参数。当用户提到壁纸、换壁纸、背景图、轮换、视频壁纸、网页壁纸这类需求时使用。
---

# zcode-pro 壁纸控制

zcode-pro（ZCode 桌面版增强工具）内置壁纸引擎：图片、视频、网页铺在 ZCode 界面后方，带定时轮换、切换转场、暂停条件和画面调参。控制入口是 \`zcode-pro wallpaper\` 子命令，经 Bash 执行，写入后约 5 秒内自动生效。

## 子命令

| 命令 | 用途 |
|---|---|
| \`zcode-pro wallpaper list\` | 看当前配置和图库文件 |
| \`zcode-pro wallpaper set none\\|library <文件>\\|folder <目录>\\|url <地址>\\|web <地址>\` | 切换壁纸来源 |
| \`zcode-pro wallpaper rotate <分钟> [--random\\|--sequential]\` | 定时轮换（0 = 不轮换） |
| \`zcode-pro wallpaper params <键=值>...\` | 调画面（遮罩/模糊/面板/缩放）、转场、播放（音量/倍速/帧率）、暂停条件 |
| \`zcode-pro wallpaper upload [--select] <文件路径>...\` | 把本机图片/视频复制进图库（--select 顺手设为当前壁纸） |
| \`zcode-pro wallpaper delete <图库文件名>\` | 从图库删文件 |

\`zcode-pro wallpaper -h\` 查看 params 全部键与取值。上传限制：图片 ${BG_MAX_BYTES / 1048576}MB（${[...BG_EXT].map((e) => e.slice(1)).join('/')}），视频 ${VIDEO_MAX_BYTES / 1048576}MB（${[...VIDEO_EXT].map((e) => e.slice(1)).join('/')}），图库共 ${BG_MAX_COUNT} 个以内。

## 前置检查

- \`zcode-pro\` 不在 PATH 时，提示用户先跑一次 \`zcode-pro setup\`（或用绝对路径调用），然后停下。
- \`~/.zcode/zcodepro.json\`（Windows 即 \`%USERPROFILE%\\\\.zcode\\\\zcodepro.json\`）不存在时，说明这台机器没装 zcode-pro，告知用户先安装并用它启动 ZCode，然后停下。

## 配置字段（手动读改时参考；正常操作用上面的子命令）

配置 JSON 的 \`theme.bg\` 节（手动改时保留文件里其余所有内容）：

| 字段 | 含义 | 取值 |
|---|---|---|
| mode | 壁纸来源 | none / library / folder / url / web |
| file | 图库模式的当前文件名 | 图库里的文件名 |
| folder | 文件夹模式的目录 | 绝对路径 |
| folderRandom | 轮换顺序 | true 随机 / false 按列表 |
| intervalMin | 轮换间隔（分钟） | 0-1440，0 = 不轮换 |
| url | url/web 模式的地址 | http(s):// 开头 |
| maskOpacity / blurPx / panelOpacity | 遮罩 0-0.99 / 模糊 0-24 / 面板 0-1 | 数值 |
| fit / transition / fpsCap | 缩放 cover/contain/fill/tile / 转场 cut/fade / 帧率 0/15/30/60 | 枚举 |
| videoVolume / playbackRate | 音量 0-1 / 倍速 0.5-2 | 数值 |
| pauseOnHidden / pauseOnBlur / pauseOnBattery | 最小化/失焦/电池暂停 | true/false |
`;

export function installWallpaperDocs(dataRoot) {
  const cmdDir = join(dataRoot, 'commands');
  mkdirSync(cmdDir, { recursive: true });
  writeFileSync(join(cmdDir, 'wallpaper.md'), COMMAND_MD, 'utf8');
  const skillDir = join(dataRoot, 'skills', 'wallpaper');
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'SKILL.md'), SKILL_MD, 'utf8');
}

export function removeWallpaperDocs(dataRoot) {
  try { rmSync(join(dataRoot, 'commands', 'wallpaper.md'), { force: true }); } catch { /* ignore */ }
  try { rmSync(join(dataRoot, 'skills', 'wallpaper'), { recursive: true, force: true }); } catch { /* ignore */ }
}
