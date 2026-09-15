# ZCode Pro (zcode-pro)

ZCode 桌面版界面增强工具。参考 [CodexPlusPlus](https://github.com/BigPizzaV3/CodexPlusPlus) 的思路——**不修改官方 `app.asar`、不向安装目录写入任何补丁**，随 ZCode Pro 启动自动生效。与 Codex++ 不同的是：**没有独立的管理工具**，所有配置直接在 ZCode 自身的界面里完成（右上角下拉菜单 → 「ZCode Pro 设置」）。

![平台](https://img.shields.io/badge/platform-win%20%7C%20mac%20%7C%20linux%20%7C%20AUR-blue)
![依赖](https://img.shields.io/badge/runtime-零依赖（复用%20ZCode%20内置%20Node）-green)

## 功能

### 1. 右上角菜单 · 「ZCode Pro 设置」入口

在 ZCode 右上角窗口下拉菜单（新建任务 / 打开工作区 / …）底部新增 **「ZCode Pro 设置」** 项，点击后弹出的设置弹窗完全复用 ZCode 自身的弹窗样式（设计令牌级别的观感一致），可在其中开关各项增强功能，即改即生效（无需重启）。

### 2. 项目「更多」菜单 · 自定义别名（零风险）

只想让界面里的项目名顺眼、又不想动磁盘？用 **「自定义别名…」**：

- 只替换侧边栏项目行的渲染文本，磁盘目录、`setting.json`、任务索引等一切真实数据**原样不动**（helper 现在完全不写这些文件）；
- 即时生效、无需刷新；随时在弹窗中清空恢复真实名称；
- 注意：终端、文件管理器等一切按真实路径展示的地方仍显示原名。

## 工作原理

```
zcode-pro (启动器, Node ≥22 或 ZCode 内置运行时)
  ├─ 以 --remote-debugging-port=<port> 启动 ZCode（已带调试端口的实例则直接复用）
  ├─ 把增强脚本 dist/inject.js 加载进页面（新开页面自动生效）
  │    └─ 页面内：观察 Radix 弹层 → 克隆原生菜单项/复用应用样式令牌构建弹窗
  └─ 本地辅助服务 127.0.0.1:<helperPort>（随机 Token 鉴权，仅回环地址）
       └─ 页面脚本通过 fetch 调用：配置读写 / 项目别名（纯配置，不触碰文件系统）
```

- 不修改 `/opt/ZCode`（或 win/mac 安装目录）中的任何文件；
- 退出 zcode-pro 不影响 ZCode 本体（增强随下次通过 zcode-pro 启动而恢复）；
- zcode-pro **绝不会主动关闭正在运行的 ZCode**；若检测到已有实例未开调试端口，只会提示你手动重启。

## 安装与使用

装好后的使用习惯只有一条：**像往常一样打开「ZCode Pro」**——应用菜单 / 开始菜单里的快捷方式，或终端里的 `zcode-pro` 命令。它启动的就是 ZCode 本体，只是带上了增强；点原来的 ZCode 图标启动的是不带增强的原版。

### Linux / macOS（一键脚本）

```bash
git clone https://github.com/duanluan/zcode-pro.git
cd zcode-pro && ./scripts/install.sh
```

- 安装到 `~/.local`（可用 `PREFIX=/opt/zcode-pro sudo -E ./scripts/install.sh` 装到系统位置）；
- Linux 会注册应用菜单快捷方式「ZCode Pro」（图标复用已安装的 ZCode）；
- 卸载：`./scripts/install.sh --uninstall`。

### Windows（一键脚本）

```powershell
git clone https://github.com/duanluan/zcode-pro.git
cd zcode-pro
powershell -ExecutionPolicy Bypass -File scripts\install.ps1          # 开始菜单快捷方式
powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Desktop # 加桌面快捷方式
```

- 程序装到 `%LOCALAPPDATA%\ZCodePro`；快捷方式经 `wscript` 静默启动，不常驻控制台窗口；
- 卸载：`powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Uninstall`。

### AUR（Arch / Manjaro）

```bash
git clone https://aur.archlinux.org/zcode-pro.git && cd zcode-pro && makepkg -si
```

安装 `/usr/bin/zcode-pro` 与系统级应用菜单快捷方式（依赖 AUR 的 `zcode` 包；本仓库 `packaging/aur/zcodepro/PKGBUILD` 为其源头）。

### 手动运行（不安装）

```bash
git clone https://github.com/duanluan/zcode-pro.git && cd zcode-pro
./bin/zcode-pro            # Linux / macOS（自动探测 /opt/ZCode、/Applications/ZCode.app）
bin\zcode-pro.cmd          # Windows（自动探测 %LOCALAPPDATA%\Programs\ZCode\ZCode.exe）
```

无需安装 Node.js：启动器会在系统无 node 时自动以 `ELECTRON_RUN_AS_NODE=1` 复用 ZCode 自带的 Node 运行时。

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

- 增强功能开关与别名对照表：`~/.zcode/zcodepro.json`（受 `ZCODE_DATA_BASE_DIR` 影响，与 ZCode 数据根目录语义一致）
- 彻底卸载：直接用官方入口启动 ZCode 即可，无需清理任何系统位置。

## 开发

```bash
npm run build          # esbuild 打包增强脚本到 dist/inject.js
./bin/zcode-pro -v       # 带日志启动
```

代码结构：

```
src/host/    启动器（Node）：paths 跨平台探测 / cdp 客户端 / helper HTTP 服务 / setting.json 只读
src/inject/  增强脚本（浏览器端）：core 工具 / ui 弹窗组件 / features 各增强功能
dist/        构建产物（随仓库分发，AUR 包直接使用）
packaging/   应用菜单快捷方式与 AUR PKGBUILD
scripts/     一键安装/卸载脚本（Linux/macOS/Windows）
```
