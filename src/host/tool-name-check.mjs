// 工具名合规检查：有的模型服务（如 Meta）限制 MCP 工具名 64 字符，超长整包 400。
// 工具全名按 mcp__<服务器键名>__<工具名> 拼（插件提供的服务器中间还带插件名），
// 工具名由插件自己定、改不了，缩短服务器键名是唯一能动手的地方。
// zcodepro.json 的 toolNameMaps 存“服务器键名 → 短键名”，这里把它写到三处：
//   1. ~/.zcode/cli/config.json 的 mcp.servers（用户级 MCP）；
//   2. 已装插件的清单（插件缓存里的 .mcp.json 与 .zcode-plugin/plugin.json）；
//   3. ZCode 安装目录的源包清单（packages/<插件>/.mcp.json 等，插件安装时从这里生成缓存）。
// ZCode 升级、插件更新会把键名改回长名，所以 helper 每次启动都对一次；设置页按钮可手动跑。
import { copyFileSync, existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function readJson(file) {
  try {
    const text = readFileSync(file, 'utf8');
    return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text); // 记事本存的带 BOM 文件也能解析
  } catch {
    return null;
  }
}

// 原子写 + 覆盖前留 .zcodepro-backup（与同步导入、headroom 开关同款做法）
function writeJsonWithBackup(file, obj) {
  try { copyFileSync(file, file + '.zcodepro-backup'); } catch { /* 备份失败不阻塞 */ }
  const tmp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`; // 防多写者共用同一 .tmp 撕裂
  writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  renameSync(tmp, file);
}

// 把 servers 表里的长键名换成短名：目标短名已被占用就不动（不覆盖别人的服务器），
// 返回改过的 [{ from, to }]。导出以便测试。
export function renameServerKeys(servers, maps) {
  const changed = [];
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) return changed;
  if (!maps || typeof maps !== 'object') return changed;
  for (const [longName, shortName] of Object.entries(maps)) {
    if (!Object.prototype.hasOwnProperty.call(servers, longName)) continue;
    if (Object.prototype.hasOwnProperty.call(servers, shortName)) continue; // 短名已有配置，不动
    servers[shortName] = servers[longName];
    delete servers[longName];
    changed.push({ from: longName, to: shortName });
  }
  return changed;
}

// 列出一层子目录（目录不存在返回空）
function subDirs(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => join(dir, e.name));
  } catch {
    return [];
  }
}

// 收集要处理的清单文件：用户级配置单独按 mcp.servers 处理，其余按 mcpServers 处理
function collectManifestFiles({ dataRoot, sourcePackagesDir }) {
  const files = [];
  const cacheRoot = join(dataRoot, 'cli', 'plugins', 'cache');
  for (const marketDir of subDirs(cacheRoot)) {
    for (const pluginDir of subDirs(marketDir)) {
      for (const versionDir of subDirs(pluginDir)) {
        files.push(join(versionDir, '.mcp.json'));
        files.push(join(versionDir, '.zcode-plugin', 'plugin.json'));
      }
    }
  }
  if (sourcePackagesDir) {
    for (const pkgDir of subDirs(sourcePackagesDir)) {
      files.push(join(pkgDir, '.mcp.json'));
      files.push(join(pkgDir, '.zcode-plugin', 'plugin.json'));
    }
  }
  return files.filter((f) => existsSync(f));
}

// 跑一轮检查：返回 { scanned, changed: [文件 + from/to], warnings }。
// dryRun=true 只看不改（设置页“检查”用）。
export function applyToolNameMaps({ dataRoot, zcodeConfigFile, maps, sourcePackagesDir = '', dryRun = false } = {}) {
  const scanned = [];
  const changed = [];
  const warnings = [];
  const table = (maps && typeof maps === 'object' && !Array.isArray(maps)) ? maps : {};
  // 映射为空也照样扫一遍：报告“扫了 N 个文件、无需改动”，而不是给个 0 让用户以为没查到
  if (!Object.keys(table).length) warnings.push('没有配置工具名映射，只扫描未改动');

  // 1. 用户级 MCP：~/.zcode/cli/config.json 的 mcp.servers
  if (zcodeConfigFile && existsSync(zcodeConfigFile)) {
    const cfg = readJson(zcodeConfigFile);
    if (!cfg) {
      warnings.push(`${zcodeConfigFile} 无法解析，跳过`);
    } else {
      scanned.push(zcodeConfigFile);
      const mcp = (cfg.mcp && typeof cfg.mcp === 'object' && !Array.isArray(cfg.mcp)) ? { ...cfg.mcp } : null;
      if (mcp && mcp.servers && typeof mcp.servers === 'object' && !Array.isArray(mcp.servers)) {
        const servers = { ...mcp.servers };
        const hits = renameServerKeys(servers, table);
        if (hits.length) {
          if (!dryRun) {
            mcp.servers = servers;
            cfg.mcp = mcp;
            try { writeJsonWithBackup(zcodeConfigFile, cfg); } catch (err) { warnings.push(`${zcodeConfigFile} 写入失败（${err?.message || err}）`); }
          }
          for (const h of hits) changed.push({ file: zcodeConfigFile, ...h });
        }
      }
    }
  }

  // 2. 插件清单：顶层 mcpServers
  for (const file of collectManifestFiles({ dataRoot, sourcePackagesDir })) {
    const doc = readJson(file);
    if (!doc) { warnings.push(`${file} 无法解析，跳过`); continue; }
    scanned.push(file);
    if (!doc.mcpServers || typeof doc.mcpServers !== 'object' || Array.isArray(doc.mcpServers)) continue;
    const servers = { ...doc.mcpServers };
    const hits = renameServerKeys(servers, table);
    if (!hits.length) continue;
    if (!dryRun) {
      doc.mcpServers = servers;
      try { writeJsonWithBackup(file, doc); } catch (err) { warnings.push(`${file} 写入失败（${err?.message || err}）`); continue; }
    }
    for (const h of hits) changed.push({ file, ...h });
  }
  return { scanned: scanned.length, changed, warnings };
}

// 一行结果文案（设置页按钮下方显示）
export function toolNameCheckSummary(result) {
  const r = result || { scanned: 0, changed: [], warnings: [] };
  if (r.warnings && r.warnings.length) return `检查 ${r.scanned} 个文件，${r.changed.length} 处改短；${r.warnings[0]}`;
  if (!r.changed.length) return `检查 ${r.scanned} 个文件，服务器键名都合规，无需改动`;
  const names = [...new Set(r.changed.map((c) => `${c.from} → ${c.to}`))];
  return `检查 ${r.scanned} 个文件，把 ${r.changed.length} 处改短：${names.join('、')}`;
}
