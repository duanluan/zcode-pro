// 本地辅助服务：注入到页面里的增强脚本通过 http://127.0.0.1:<port> 调用这里，
// 完成文件系统操作（页面沙箱内做不了的事）与配置持久化。
// 仅绑定 127.0.0.1，并通过每次启动随机生成的 token 鉴权。

import { createServer } from 'node:http';
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { readSettings, isProjectOpenInTabs } from './settings.mjs';

const VERSION = '0.1.0';

export function defaultConfig() {
  return {
    version: VERSION,
    features: {
      headerSettingsEntry: true, // 右上角下拉菜单中的“增强设置”入口
      projectAlias: true,       // 项目“更多”菜单中的“自定义别名” + 侧边栏按表渲染
    },
    // 项目路径（规范化，无尾分隔符）→ 自定义别名。只影响界面渲染，不改动任何真实数据。
    aliases: {},
  };
}

export function loadConfig(configFile) {
  try {
    if (!existsSync(configFile)) return defaultConfig();
    const saved = JSON.parse(readFileSyncText(configFile));
    return {
      ...defaultConfig(),
      ...saved,
      features: { ...defaultConfig().features, ...(saved.features || {}) },
      aliases: { ...((saved.aliases && typeof saved.aliases === 'object') ? saved.aliases : {}) },
    };
  } catch {
    return defaultConfig();
  }
}

function readFileSyncText(p) {
  return readFileSync(p, 'utf8');
}

export function saveConfig(configFile, config) {
  // 原子写：先写临时文件再改名，避免崩溃留下半截 JSON
  const tmp = configFile + '.tmp';
  writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf8');
  renameSync(tmp, configFile);
}

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-ZCodePro-Token',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 1 << 20) { rejectBody(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolveBody(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (e) { rejectBody(new Error('无效的 JSON 请求体')); }
    });
    req.on('error', rejectBody);
  });
}

export function startHelper({ port, token, dataRoot, state }) {
  const configFile = join(dataRoot, 'zcodepro.json');
  const settingsFile = join(dataRoot, 'v2', 'setting.json');

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    try {
      // 防 DNS rebinding：只接受回环 Host。恶意页面把域名解析到 127.0.0.1 时，
      // 浏览器发出的 Host 是攻击者域名，在此拒绝。
      const host = String(req.headers.host || '');
      if (!/^127\.0\.0\.1(:|$)/.test(host) && !/^localhost(:|$)/i.test(host)) {
        json(res, 403, { ok: false, error: 'forbidden host' });
        return;
      }
      if (req.method === 'OPTIONS') {
        json(res, 204, {});
        return;
      }
      if (token && req.headers['x-zcodepro-token'] !== token) {
        json(res, 401, { ok: false, error: 'unauthorized' });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/health') {
        const config = loadConfig(configFile);
        json(res, 200, { ok: true, app: 'zcodepro-helper', version: VERSION, features: config.features, injectedPages: state.injectedPages });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/config') {
        json(res, 200, { ok: true, config: loadConfig(configFile) });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/config') {
        const body = await readBody(req);
        const current = loadConfig(configFile);
        if (body && typeof body === 'object' && body.features && typeof body.features === 'object') {
          for (const key of Object.keys(defaultConfig().features)) {
            if (typeof body.features[key] === 'boolean') current.features[key] = body.features[key];
          }
        }
        saveConfig(configFile, current);
        json(res, 200, { ok: true, config: current });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/projects') {
        const settings = readSettings(settingsFile);
        const projects = (settings.recentProjects || []).map((p) => {
          let exists = false;
          try { exists = existsSync(p) && statSync(p).isDirectory(); } catch { /* ignore */ }
          return { path: p, name: basename(p.replace(/[\\/]+$/, '')), exists, openInTabs: isProjectOpenInTabs(settings, p) };
        });
        json(res, 200, { ok: true, projects });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/project/alias') {
        const body = await readBody(req);
        json(res, ...setAlias(body, configFile));
        return;
      }
      json(res, 404, { ok: false, error: 'not found' });
    } catch (err) {
      json(res, 500, { ok: false, error: String(err?.message || err) });
    }
  });

  return new Promise((resolveStarted, rejectStarted) => {
    server.once('error', rejectStarted);
    server.listen(port, '127.0.0.1', () => resolveStarted(server));
  });
}

// 设置/清除项目自定义别名（纯渲染层，不动磁盘与任何 ZCode 数据）。
// alias 传空字符串/null 即清除该项目条目。
export function setAlias(body, configFile) {
  const raw = typeof body?.path === 'string' ? body.path.trim() : '';
  // 先校验再 resolve：resolve 会把相对路径悄悄变绝对，绕过校验
  if (!raw || !isAbsolute(raw)) return [400, { ok: false, error: '无效的项目路径' }];
  const path = resolve(raw);
  const name = typeof body?.alias === 'string' ? body.alias.trim() : '';
  if (name) {
    if (name.length > 100) return [400, { ok: false, error: '别名过长（最多 100 字符）', code: 'invalid-name' }];
    if (/[\r\n\0]/.test(name)) return [400, { ok: false, error: '别名不能包含换行等控制字符', code: 'invalid-name' }];
  }
  const config = loadConfig(configFile);
  if (!config.aliases || typeof config.aliases !== 'object') config.aliases = {};
  if (name) config.aliases[path] = name;
  else delete config.aliases[path];
  try {
    saveConfig(configFile, config);
  } catch (err) {
    return [500, { ok: false, error: '保存配置失败: ' + (err?.message || err) }];
  }
  return [200, { ok: true, path, alias: name, aliases: config.aliases }];
}
