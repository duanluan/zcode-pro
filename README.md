# ZCode Pro (zcode-pro)

ZCode 桌面版界面增强工具。通过「ZCode Pro」启动 ZCode 时自动启用增强；不修改官方应用文件，退出后 ZCode 恢复原状。

![平台](https://img.shields.io/badge/platform-win%20%7C%20mac%20%7C%20linux%20%7C%20AUR-blue)
![依赖](https://img.shields.io/badge/runtime-零依赖（复用%20ZCode%20内置%20Node）-green)

## 功能

### 项目自定义别名

为侧边栏中的项目设置自定义名称，仅用于界面显示：

- 即时生效，无需刷新，可随时恢复为原始名称；
- 磁盘目录、会话记录与所有 ZCode 数据保持不变。

### 项目切换文件夹

将项目指向另一个文件夹，用于调整项目的所在位置：

- 侧边栏项目列表、已打开标签页与本地任务历史一并迁移，会话记录不会丢失；
- 目录本身不会被移动或修改。

### 会话排序

在置顶、项目与分组中的会话列表里拖动会话即可调整顺序，顺序会被记住，刷新后保持不变。

### 界面样式调整

设置弹窗中的「样式调整」标签页可微调界面样式，数值框支持鼠标滚轮调节，改动立即生效：

- 段落间距：回合之间与答案内部段落之间的垂直间距；
- 内容宽度：会话内容的最大宽度，支持 px 或 %；
- 提问行高 / 回答行高：提问与回答正文的行高（倍数）；
- 列表间距 / 列表项间距：列表自身留白与列表项之间的间距；
- 引用与代码块间距：引用、代码块上下的留白。

以上均可一键恢复默认。

### 全局提示词

设置弹窗中的「全局提示词」标签页可直接编辑所有项目共享的默认指令：

- 写入 `~/.zcode/AGENTS.md`，自动注入所有项目的每次会话；
- 保存后从新会话起生效，项目内的 `AGENTS.md` 可继续补充或覆盖全局规则；
- 清空内容并保存即移除全局提示词。

### 设置入口

在 ZCode 设置页左侧导航底部提供「ZCode Pro」入口，分为「功能」「样式调整」与「全局提示词」三个标签页，可开关各项增强功能、调整界面样式、编辑全局提示词并查看运行状态，设置即时生效。

## 安装与使用

安装后，通过应用菜单 / 开始菜单中的「ZCode Pro」快捷方式或终端命令 `zcode-pro` 启动 ZCode，增强在该方式下自动生效；使用原有 ZCode 入口启动时不加载增强。

### Linux / macOS（一键脚本）

```bash
git clone https://github.com/duanluan/zcode-pro.git
cd zcode-pro && ./scripts/install.sh
```

- 安装至 `~/.local`，可通过 `PREFIX=` 指定其他位置；
- Linux 会注册应用菜单快捷方式「ZCode Pro」（图标复用已安装的 ZCode）；
- 卸载：`./scripts/install.sh --uninstall`。

### Windows（一键脚本）

```powershell
git clone https://github.com/duanluan/zcode-pro.git
cd zcode-pro
powershell -ExecutionPolicy Bypass -File scripts\install.ps1          # 开始菜单快捷方式
powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Desktop # 加桌面快捷方式
```

- 程序安装至 `%LOCALAPPDATA%\ZCodePro`，快捷方式静默启动，不显示控制台窗口；
- 卸载：`powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Uninstall`。

### AUR（Arch / Manjaro）

```bash
git clone https://aur.archlinux.org/zcode-pro.git && cd zcode-pro && makepkg -si
```

安装 `/usr/bin/zcode-pro` 与系统级应用菜单快捷方式，依赖 AUR 的 `zcode` 包。

### 手动运行（不安装）

```bash
git clone https://github.com/duanluan/zcode-pro.git && cd zcode-pro
./bin/zcode-pro            # Linux / macOS（自动探测 /opt/ZCode、/Applications/ZCode.app）
bin\zcode-pro.cmd          # Windows（自动探测 %LOCALAPPDATA%\Programs\ZCode\ZCode.exe）
```

无需单独安装 Node.js：缺少系统 Node 时自动使用 ZCode 内置运行时。

## 命令行选项

```
zcode-pro [--cdp-port 9333] [--helper-port 47889] [--zcode-path <路径>]
        [--inject-only] [--verbose]
```

| 选项 | 说明 |
| --- | --- |
| `--cdp-port` | 调试端口，默认 9333（也可用环境变量 `ZCODEPRO_CDP_PORT`） |
| `--helper-port` | 本地辅助服务端口，默认 47889（`ZCODEPRO_HELPER_PORT`） |
| `--zcode-path` | 显式指定 ZCode 可执行文件（`ZCODEPRO_ZCODE_PATH`） |
| `--inject-only` | 只接管已在监听调试端口的实例，不启动新实例 |
| `--verbose` | 详细日志 |

## 配置与数据

- 功能开关与项目别名：`~/.zcode/zcodepro.json`
- 全局提示词：`~/.zcode/AGENTS.md`（保存前一份备份：`~/.zcode/AGENTS.md.zcodepro-backup`）
- 切换文件夹时的配置备份：`~/.zcode/v2/setting.json.zcodepro-backup`
- 卸载后直接使用官方 ZCode 入口启动即可，无需清理系统位置。

## 已知限制

- 项目内存在正在运行的任务时，建议先停止再切换文件夹；
- 检查点快照仍引用原路径，恢复历史检查点可能写回原目录。
