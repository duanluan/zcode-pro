# ZCode Pro

[English](README.en.md) | 简体中文

ZCode 桌面版界面增强工具。不修改客户端文件，通过 ZCode Pro 快捷方式启动即可。

![AUR 版本](https://img.shields.io/aur/version/zcode-pro) ![平台](https://img.shields.io/badge/platform-win%20%7C%20mac%20%7C%20linux%20%7C%20AUR-blue)

> ⚙️ **打开设置：启动 ZCode Pro 后，右键点击 ZCode 侧边栏底部的设置按钮（齿轮）即可打开 ZCode Pro 设置窗口。**

## ✨ 功能

| 功能 | 说明 |
| --- | --- |
| 项目自定义别名 | 侧边栏显示自定义名称，仅界面显示，随时恢复 |
| 切换文件夹 | 将项目指向另一个文件夹，侧边栏、标签页与任务历史一并迁移；切换前建议先停止运行中的任务，历史检查点仍引用原路径 |
| 打开文件夹 / 复制路径 | 项目「更多」菜单：在系统文件管理器中打开项目目录，或复制项目路径 |
| 会话拖动排序 | 拖动置顶、项目与分组中的会话调整顺序，刷新后保持 |
| 会话快捷切换 | `alt+z` 在当前与上次会话间来回切换；按住 `alt` 按 `x` / `c` 弹出最近会话列表选择，松开 `alt` 切换（类 `alt+tab`） |
| 折叠项目运行提示 | 折叠的项目里仍有会话在运行时，项目图标旋转提示，全部结束后恢复 |
| 侧栏菜单并入顶栏 | 「新建任务 / 搜索 / 自动化 / 插件市场」收成顶部导航栏的图标按钮：悬停显示名称，对应界面打开时高亮，快捷键照常可用 |
| 已置顶分区可折叠 | 侧边栏「已置顶」标题可点击折叠/展开其任务列表，状态记住 |
| 文件菜单增强 | 会话中文件链接的右键菜单新增「默认应用打开」「打开所在目录」 |
| 复制图片 | 右键会话中的图片或放大的预览图，复制到剪贴板 |
| 界面样式调整 | 微调段落间距、内容宽度、行高、列表与代码块留白，即改即生效 |
| 侧栏间距调整 | 微调侧边栏项目间距与任务间距，即改即生效 |
| 全局提示词 | 编辑所有项目共享的默认指令，新会话起生效 |
| 软件代理 | 为插件更新安装与本体升级设置 HTTP 代理，附连通性检测 |
| 视觉代理 | 主模型不识图时自动交给视觉模型识别图片，识别描述带给主模型；可视化编辑代理链（zcode-vision 插件） |
| rtk 压缩 | 管理改写提醒与命令白名单，rtk 本体检查更新与一键升级（rtk 插件） |
| Headroom | 管理压缩设备、省电切换与代理运行状态，headroom 本体检查更新与升级（headroom 插件） |
| 插件更新 | 一键检查并更新 zcode-plugins 市场插件，可选启动时自动更新 |

各项功能均可在设置弹窗中开关或调整。

## 📦 安装与使用

安装后，通过应用菜单 / 开始菜单中的「ZCode Pro」快捷方式或终端命令 `zcode-pro` 启动 ZCode，增强在该方式下自动生效；使用原有 ZCode 入口启动时不加载增强。

### 🐧 Linux / macOS

- 安装至 `~/.local`，可通过 `PREFIX=` 指定其他位置；
- Linux 会注册应用菜单快捷方式「ZCode Pro」（图标复用已安装的 ZCode）；
- 已通过 AUR 安装时请勿再使用本脚本（脚本会检测并拒绝），用户级安装会遮蔽系统级入口；
- 卸载：`./scripts/install.sh --uninstall`。

```bash
git clone https://github.com/duanluan/zcode-pro.git
cd zcode-pro && ./scripts/install.sh
```

### 🪟 Windows

- 程序安装至 `%LOCALAPPDATA%\ZCodePro`，快捷方式静默启动，不显示控制台窗口；
- 卸载：`powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Uninstall`。

```powershell
git clone https://github.com/duanluan/zcode-pro.git
cd zcode-pro
powershell -ExecutionPolicy Bypass -File scripts\install.ps1          # 开始菜单快捷方式
powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Desktop # 加桌面快捷方式
```

### 📦 AUR

安装 `/usr/bin/zcode-pro` 与系统级应用菜单快捷方式，依赖 AUR 的 [zcode](https://aur.archlinux.org/packages/zcode) 包。

```bash
yay -S zcode-pro
paru -S zcode-pro
# 手动安装方式
git clone https://aur.archlinux.org/zcode-pro.git && cd zcode-pro && makepkg -si
```

从手动安装（`install.sh`）迁移到 AUR 前，请先在原仓库执行 `./scripts/install.sh --uninstall` 清理 `~/.local` 下的旧文件，再安装本包；否则旧的用户级快捷方式会一直遮蔽系统级入口，实际运行的仍是旧版本。

### 🚀 手动运行（不安装）

无需单独安装 Node.js：缺少系统 Node 时自动使用 ZCode 内置运行时。

```bash
git clone https://github.com/duanluan/zcode-pro.git && cd zcode-pro
./bin/zcode-pro            # Linux / macOS（自动探测 /opt/ZCode、/Applications/ZCode.app）
bin\zcode-pro.cmd          # Windows（自动探测 %LOCALAPPDATA%\Programs\ZCode\ZCode.exe）
```

## 📖 参考

命令行选项（`zcode-pro --help` 查看全部）：

| 选项 | 说明 |
| --- | --- |
| `--cdp-port` | 调试端口，默认 9333 |
| `--helper-port` | 本地辅助服务端口，默认 47889 |
| `--zcode-path` | 显式指定 ZCode 可执行文件 |
| `--inject-only` | 只接管已在运行的实例，不启动新实例 |
| `--verbose` | 详细日志 |

各选项也可用环境变量 `ZCODEPRO_*` 覆盖。

配置与数据位置：

| 内容 | 位置 |
| --- | --- |
| 功能开关、项目别名、软件代理 | `~/.zcode/zcodepro.json` |
| 全局提示词 | `~/.zcode/AGENTS.md` |
| 视觉代理（zcode-vision 插件） | `~/.zcode/zcode-vision.json` |
| rtk 压缩（rtk 插件） | `~/.zcode-rtk/` |
| Headroom（headroom 插件） | `~/.zcode/headroom.json` |

卸载后直接使用官方 ZCode 入口启动即可，无需清理系统位置。

## 🔌 插件推荐

[duanluan/zcode-plugins](https://github.com/duanluan/zcode-plugins) 是配套的 ZCode 插件市场，提供 AI 代码评审、对话请求压缩、命令输出压缩等插件，可显著节省 token。安装方式：ZCode → 插件市场 → 右上角「添加」→ 添加插件市场，填写 `duanluan/zcode-plugins`。已安装的插件可在 ZCode Pro 设置中一键检查并更新。

## 💬 交流与反馈

- QQ 群：**428403354**（[点击加入](https://qm.qq.com/q/WXuISJK3ug)）
- 微信群：添加微信 **ai4only** 邀请进群

<p>
  <img src="assets/qq-group.png" width="200" alt="QQ 群二维码" />
  &nbsp;&nbsp;
  <img src="assets/wechat-ai4only.png" width="200" alt="微信二维码（ai4only）" />
</p>
