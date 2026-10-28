// 技能清单检查：扫描本地与插件技能，按 ZCode 注入清单的条目格式拼出完整清单，
// 统计字符数是否超出 skills.metadataBudget（超预算时 ZCode 会把清单降级成仅名称）。
// 条目格式、描述 250 字符截断、默认预算 20000 均于 2026-10-28 反查 ZCode 程序
// （resources/glm/zcode.cjs 的 buildSkillsContent/formatSkillLine）核对，升级后需复核。
// 估算只要够判断超没超预算即可，不要求与程序逐字符一致（frontmatter 续行的
// 折叠方式等按常规处理）。
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';

export const DEFAULT_METADATA_BUDGET = 20000;
const DESC_LIMIT = 250; // description - when_to_use 合并后截断到 250 字符
const DESC_LOAD_LIMIT = 1024; // description 超 1024 字符的技能加载失败（丢弃）
const HEADER = 'The following skills are available for use with the Skill tool:\n\n';

// SKILL.md frontmatter：只取顶层 key: value（缩进行忽略，>/| 折叠续行）；
// 没有 frontmatter 返回 null
function parseFrontmatter(text) {
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(text);
  if (!m) return null;
  const out = {};
  let cur = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):[ \t]*(.*)$/.exec(line);
    if (kv) {
      cur = kv[1];
      out[cur] = /^[>|][+-]?$/.test(kv[2]) ? '' : kv[2].trim();
      continue;
    }
    if (cur && /^\s+\S/.test(line)) out[cur] = (out[cur] ? out[cur] + ' ' : '') + line.trim();
  }
  return out;
}

// 一个技能目录 → 清单条目；按 ZCode 的两级失败模型处理：
// 无 frontmatter 用目录名（可加载但描述为空）；有 frontmatter 而缺
// name/description 或 description 超长则加载失败（不进清单）
function loadSkill(dir) {
  const path = join(dir, 'SKILL.md');
  if (!existsSync(path)) return null;
  const fm = parseFrontmatter(readFileSync(path, 'utf8'));
  let name;
  let description = '';
  let whenToUse = '';
  if (fm) {
    name = (fm.name || '').trim();
    description = (fm.description || '').trim();
    whenToUse = (fm.when_to_use || '').trim();
    if (!name || !description || description.length > DESC_LOAD_LIMIT) return null;
  } else {
    name = basename(dir);
  }
  return { name, description, whenToUse, path };
}

const listDirs = (dir) => {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && (!d.name.startsWith('.') || d.name === '.system') && d.name !== 'node_modules')
      .map((d) => join(dir, d.name));
  } catch {
    return [];
  }
};

// 扫一个技能根目录：每个直接子目录里有 SKILL.md 即一个技能
function scanRoot(root, pluginId) {
  const out = [];
  for (const dir of listDirs(root)) {
    const entry = loadSkill(dir);
    if (entry) {
      // 插件技能的限定名形如 插件名:技能名，与裸名不同还附“也可以用裸名加载”
      if (pluginId) entry.qualifiedName = `${pluginId}:${entry.name}`;
      out.push(entry);
    }
  }
  return out;
}

// 插件缓存目录按 <市场>/<插件>/<版本>/skills 布局，同一插件只取最高版本
function pluginVersionDirs(cacheDir) {
  const byPlugin = new Map();
  for (const marketDir of listDirs(cacheDir)) {
    const market = basename(marketDir);
    for (const pluginDir of listDirs(marketDir)) {
      const plugin = basename(pluginDir);
      const key = `${market}/${plugin}`;
      const versions = listDirs(pluginDir).map((v) => basename(v));
      if (!versions.length) continue;
      versions.sort((a, b) => {
        const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
        const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
          if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
        }
        return 0;
      });
      byPlugin.set(key, { market, plugin, versionDir: join(pluginDir, versions[versions.length - 1]) });
    }
  }
  return [...byPlugin.values()];
}

// 发现顺序（与 ZCode 一致）：显式配置的目录 → ~/.zcode/skills → ~/.agents/skills
// → 启用中的插件（最低优先级）。同一技能名出现在多个路径时清单里都算（条目身份
// 是文件路径），这里不做同名去重。项目内的 .zcode/.agents 技能随项目而变，不计入。
export function scanSkills({ dataRoot, roots = [], pluginsEnabled = true, enabledPlugins = {}, suppressedBuiltins = [] }) {
  const userRoots = [
    ...roots,
    join(dataRoot, 'skills'),
    join(dirname(dataRoot), '.agents', 'skills'),
  ];
  const entries = [];
  for (const root of userRoots) entries.push(...scanRoot(root));
  const pluginEntries = [];
  if (pluginsEnabled) {
    for (const { market, plugin, versionDir } of pluginVersionDirs(join(dataRoot, 'cli', 'plugins', 'cache'))) {
      const id = `${plugin}@${market}`;
      if (enabledPlugins[id] === false || suppressedBuiltins.includes(plugin) || suppressedBuiltins.includes(id)) continue;
      pluginEntries.push(...scanRoot(join(versionDir, 'skills'), plugin));
    }
  }
  return { entries, pluginEntries };
}

// 清单条目行（ZCode formatSkillLine）
function formatLine(e) {
  const display = e.qualifiedName ?? e.name;
  const alias = e.qualifiedName && e.qualifiedName !== e.name ? ` (also loadable as ${e.name})` : '';
  const desc = e.whenToUse ? `${e.description} - ${e.whenToUse}` : e.description;
  const cut = desc.length > DESC_LIMIT ? `${desc.slice(0, DESC_LIMIT - 1)}...` : desc;
  return `- ${display}: ${cut}${alias} (file: ${e.path})`;
}

// 完整清单字符数（含表头）——ZCode 拿这个长度和预算比，超了就降级成仅名称
function fullContentChars(entries) {
  const lines = [...entries]
    .sort((a, b) => (a.qualifiedName ?? a.name).localeCompare(b.qualifiedName ?? b.name))
    .map(formatLine);
  return (HEADER + lines.join('\n')).length;
}

export function skillStats(opts) {
  const { entries, pluginEntries } = scanSkills(opts);
  const all = [...entries, ...pluginEntries];
  const fullChars = fullContentChars(all);
  const budget = Number.isFinite(opts.budget) && opts.budget >= 0 ? opts.budget : DEFAULT_METADATA_BUDGET;
  return {
    total: all.length,
    userCount: entries.length,
    pluginCount: pluginEntries.length,
    fullChars,
    budget,
    defaultBudget: DEFAULT_METADATA_BUDGET,
    degraded: fullChars > budget,
    // 建议预算：完整清单加 20% 余量，向上取整到千
    suggested: Math.ceil((fullChars * 1.2) / 1000) * 1000,
  };
}
