// 功能二：项目“更多”下拉菜单中新增“自定义别名”。
// 识别方式：菜单内存在带 data-testid（值中含项目绝对路径）且文案为“移除/Remove”的菜单项。
// 项目路径优先从 data-testid 提取；提取失败时回退为按项目名匹配 helper 返回的最近项目列表。
import { rpc, getConfig, itemsOf, itemText } from '../core.js';
import { appendAliasItem } from './alias.js';

const REMOVE_TEXTS = ['移除', 'Remove'];

// data-testid 实测格式为 "<前缀>-<绝对路径>"（如 workspace-close-/home/x/y），
// 也兼容 ":"、"=" 等分隔符与 Windows 盘符路径。
function extractPathFromTestId(testid) {
  let m = testid.match(/[-:=,|](\/.+)$/); // Unix 绝对路径
  if (m) return m[1];
  m = testid.match(/[-:=,|]([A-Za-z]:\\.*)$/); // Windows 盘符路径
  return m ? m[1] : null;
}

function basenameOf(p) {
  return String(p || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '';
}

async function resolveProjectPath(removeItem) {
  const testid = removeItem.getAttribute('data-testid') || '';
  const extracted = extractPathFromTestId(testid);
  if (!extracted) return null;
  // 与 helper 的最近项目列表核对（仅用于确认路径有效；任务派生的项目可能不在列表中）
  const res = await rpc('/projects');
  if (res.ok && Array.isArray(res.projects)) {
    const norm = (p) => String(p).replace(/[\\/]+$/, '');
    const hit = res.projects.find((p) => norm(p.path) === norm(extracted));
    if (hit) return hit;
  }
  return { path: extracted, name: basenameOf(extracted) };
}

export function handleProjectMenu(content) {
  if (content.querySelector('[data-zcodepro-item="alias"]')) return;
  const items = itemsOf(content);
  const removeItem = items.find(
    (el) => el.hasAttribute('data-testid') && REMOVE_TEXTS.some((x) => itemText(el).startsWith(x))
  );
  if (!removeItem) return;
  void (async () => {
    const config = await getConfig();
    if (config.features && config.features.projectAlias === false) return;
    const project = await resolveProjectPath(removeItem);
    if (!project) return;
    appendAliasItem(content, removeItem, project);
  })();
}
