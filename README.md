# ZCode Pro

[English](README.en.md) | 简体中文

ZCode 桌面版界面增强工具。不修改客户端文件，通过 ZCode Pro 快捷方式或终端命令 `zcode-pro` 启动即可。

[![npm](https://img.shields.io/npm/v/zcode-pro?logo=npm&logoColor=white)](https://www.npmjs.com/package/zcode-pro) [![PyPI](https://img.shields.io/pypi/v/zcode-pro?logo=pypi&logoColor=white)](https://pypi.org/project/zcode-pro/) [![AUR 版本](https://img.shields.io/aur/version/zcode-pro?logo=archlinux&logoColor=white)](https://aur.archlinux.org/packages/zcode-pro) [![Windows](https://img.shields.io/badge/-Windows-0078D6?logo=data:image/svg%2Bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iI2ZmZmZmZiIgZD0iTTAsMEgxMS4zNzdWMTEuMzcySDBaTTEyLjYyMywwSDI0VjExLjM3MkgxMi42MjNaTTAsMTIuNjIzSDExLjM3N1YyNEgwWm0xMi42MjMsMEgyNFYyNEgxMi42MjMiLz48L3N2Zz4%3D)](https://github.com/duanluan/zcode-pro#-windows) [![macOS](https://img.shields.io/badge/-macOS-000000?logo=apple&logoColor=white)](https://github.com/duanluan/zcode-pro#-linux--macos) [![Linux](https://img.shields.io/badge/-Linux-FCC624?logo=linux&logoColor=black)](https://github.com/duanluan/zcode-pro#-linux--macos) [![QQ 群](https://img.shields.io/badge/QQ-428403354-12B7F5?logo=qq&logoColor=white)](https://github.com/duanluan/zcode-pro#-交流与反馈) [![微信](https://img.shields.io/badge/%E5%BE%AE%E4%BF%A1-ai4only-07C160?logo=wechat&logoColor=white)](https://github.com/duanluan/zcode-pro#-交流与反馈)

> ⚙️ **打开设置：启动 ZCode Pro 后，右键点击 ZCode 侧边栏底部的设置按钮（齿轮）即可打开 ZCode Pro 设置窗口。**

## ✨ 功能

按设置弹窗中的位置分组排列：分类列为弹窗标签页，带 `·` 的（如“行为 · 全局提示词”）为标签页内的二级子标签，顺序与下方“设置界面”的截图一致。

| 分类 | 功能 | 说明 |
| --- | --- | --- |
| 功能 | 项目菜单增强（打开文件夹 / 复制路径） | 项目“更多”菜单：在系统文件管理器中打开项目目录，或复制项目路径 |
| | ~~项目自定义别名~~（已停用） | 侧边栏显示自定义名称，仅界面显示，随时恢复；ZCode ≥ 3.16.1 已内置改名（项目菜单“编辑项目”），本功能自动停用并引导把已有别名迁移过去 |
| | ~~切换文件夹~~（已停用） | 将项目指向另一个文件夹，侧边栏、标签页与任务历史一并迁移；切换前先停止运行中的任务；历史检查点仍引用原路径；ZCode ≥ 3.16.1 官方已支持一个项目挂多个目录，本功能随之停用 |
| | 会话拖动排序 | 拖动调整置顶、项目与分组中的会话顺序，重启后不变 |
| | 会话快捷切换 | `alt+z` 在当前与上次会话间来回切换；按住 `alt` 按 `x`（上移）/ `c`（下移）在最近会话列表中选择（初始 10 条，`c` 到底再加载 5 条），`alt+e` 直接打开最近 10 条，`alt+r` 打开正在运行与运行完未查看的任务；方向键同样可选，`Enter` 或点击行切换；五个入口键可在 设置 → 快捷键 中修改 |
| | 重命名会话名锁定 | 手动重命名过的会话不再被自动标题覆盖，侧栏始终显示重命名后的名字 |
| | 已置顶分区可折叠 | 侧边栏“已置顶”标题可点击折叠/展开其任务列表 |
| | 文件菜单增强 | 会话中文件链接的右键菜单新增“默认应用打开”“打开所在目录” |
| | 复制图片 | 右键会话中的图片或放大的预览图，复制到剪贴板 |
| | 插件界面沙箱回收 | 插件卡片沙箱数量达到上限时释放最早创建的（正在查看的排最后），避免 64 个名额耗尽后新卡片打不开；被释放的旧卡片重新打开所在会话即恢复（上限在配置文件 sandboxReclaimBudget 调整） |
| | 插件卡片自动重试 | 名额腾出后自动补挂因 64 上限失败的插件卡片（自动点“重新加载”） |
| | 折叠时任务运行中提示 | 有会话在运行时，折叠的项目与“任务”“已置顶”等分区头显示与任务运行中同款的加载图标，全部结束后消失 |
| | 新标签页插件面板入口 | 官方“新标签页”只列官方面板与推荐的官方插件；本功能把第三方市场插件（headroom、rtk 等）的面板卡片加进去，点击在侧边面板打开 |
| | 复制表格 | 回答内容表格的工具条新增“复制表格”按钮：以富文本写入剪贴板，粘贴进 Excel / 富文本编辑器即被识别为表格（分列成格、不带边框与背景色）；纯文本场景自动降级为 Tab 分列 |
| | 插件更新 | 一键检查并更新 zcode-plugins 市场插件，可选启动时自动更新 |
| 快捷键 | 会话快捷键自定义 | 会话快捷切换的五个入口键（默认 `alt+z` / `x` / `c` / `e` / `r`）逐个修改：点“修改”后按下新键位（字母/数字）即生效，键位冲突会提示；可一键重置为默认 |
| 行为 | ZCode CLI | 技能清单检查：统计完整清单字符数并对照注入预算，超出时提示清单被降级为仅名称并给出建议预算；可配置技能系统、清单预算、额外技能目录与功能开关；工作区记忆仍在官方 设置 → Agent 能力 → 记忆 中配置，改动新会话起生效 |
| | 全局提示词 | 编辑所有项目共享的默认指令，新会话起生效 |
| | 任务名提示词 | 新会话开始作答时按所选供应商与提示词生成任务名（默认跟随当前会话、glm-5.3-flash，提问阶段的多条消息都计入），生成结果按手动重命名保存，官方自动标题不再覆盖；可在设置中选供应商、模型并编辑提示词，附测试按钮 |
| 外观 · 样式 | 侧栏菜单并入顶栏 | “新建任务 / 搜索 / 自动化 / 插件市场”收成顶部导航栏的图标按钮，对应界面打开时高亮 |
| | 字体调整 | 自定义界面字体（除终端外全部界面文字）、提问字体与回答字体 |
| | 侧栏间距调整 | 微调侧边栏项目间距与任务间距 |
| | 界面样式调整 | 微调段落间距、内容宽度、各类行高、列表/引用块/表格间距与单元格边距；聚焦输入框时高亮预览受影响区域 |
| 外观 · 状态栏 | 状态栏统计 | 提问输入框右下角和每轮回答最后显示统计项：上下文占用（占用高时变色）、提问次数、今日/累计 token、任务总数，全部取自官方数据；各项的顺序与显隐在 设置 → 外观 → 状态栏 调整 |
| | 每轮回答 token 用量 | 在每条回答末尾操作按钮的时间后面显示该轮的输入/输出 token 与缓存命中率（本地记录只保留最近一段，更早的回答不标注） |
| 外观 · 主题 | 界面皮肤 | 内置 11 套知名编辑器主题配色（Dracula / Nord / Tokyo Night / Catppuccin / Gruvbox / One Dark / Solarized / Rosé Pine / Everforest / Night Owl / Kanagawa），自动匹配 ZCode 的浅色 / 深色模式；另可自定义主题：浅色、深色各选 5 个颜色生成整套配色，改色实时生效 |
| 外观 · 背景图 | 背景图 | 整窗铺背景，四种来源：无背景 / 本地图库（可传多张、点选当前、可单删）/ 文件夹（原地读取，按间隔定时轮换，可选随机或按文件名顺序）/ 网址（可按间隔定时刷新，配合随机图 API）；遮罩不透明度（图片向主题背景色淡化程度）、图片模糊、面板不透明度（左栏、中栏与右栏的不透明程度）三个滑杆调节；左栏 / 中栏 / 右栏透出背景，弹窗与菜单保持不透明保可读；图库随 WebDAV 同步的 zcode-pro 组一起上传（覆盖式，不留历史版本） |
| 性能 | 空闲项目内存回收 | 长时间未使用且无任务运行的项目自动释放其占用的内存，启动后也会自动回收一次未使用的项目；会话记录不受影响，再次打开时自动恢复（时长可调） |
| 代理 | 软件代理 | 为插件更新安装与本体升级设置 HTTP 代理，附连通性检测 |
| 同步 | 设置同步 | 手动把 ZCode Pro 设置与模型设置备份到 WebDAV，或在新电脑上恢复；仅在点击时传输 |
| Vision | 视觉代理 | 主模型不识图时自动交给视觉模型识别图片，识别描述带给主模型；可视化编辑代理链（zcode-vision 插件） |
| Headroom | Headroom 压缩 | 管理压缩设备、省电切换与代理运行状态，headroom 本体检查更新与升级（headroom 插件） |
| rtk | rtk 压缩 | 管理改写提醒与命令白名单，rtk 本体检查更新与一键升级（rtk 插件） |

各项功能均可在设置弹窗中开关或调整，ZCode 3.16.1 与 3.15.x 均可使用。

## 🎛 设置界面

右键点击 ZCode 侧边栏底部的设置按钮（齿轮）即可打开设置窗口，各标签页如下：

| 功能 | 快捷键 | 行为 · 全局提示词 |
| --- | --- | --- |
| <img src="docs/settings/01-features.png" width="280"> | <img src="docs/settings/02-shortcuts.png" width="280"> | <img src="docs/settings/03-behavior-global-prompt.png" width="280"> |

| 行为 · 任务名提示词 | 外观 · 样式 | 外观 · 状态栏 |
| --- | --- | --- |
| <img src="docs/settings/04-behavior-task-title.png" width="280"> | <img src="docs/settings/05-style-tweaks.png" width="280"> | <img src="docs/settings/06-style-status-bar.png" width="280"> |

| 性能 | 代理 | 同步 |
| --- | --- | --- |
| <img src="docs/settings/07-performance.png" width="280"> | <img src="docs/settings/08-proxy.png" width="280"> | <img src="docs/settings/09-sync.png" width="280"> |

| Vision | Headroom | rtk |
| --- | --- | --- |
| <img src="docs/settings/10-vision.png" width="280"> | <img src="docs/settings/11-headroom.png" width="280"> | <img src="docs/settings/12-rtk.png" width="280"> |

> 后三个标签页（Vision / Headroom / rtk）来自同名插件，未安装时显示一键安装卡，装好后恢复完整设置。

## 📦 安装与使用

> **版本匹配**：ZCode ≥ 3.16.1 请使用 **zcode-pro 1.1.0**（npm / PyPI / AUR 最新发布版）；ZCode ≤ 3.15.x 请使用 **zcode-pro 0.20.3**（旧版仍可用）。

安装后，通过应用菜单 / 开始菜单中的“ZCode Pro”快捷方式或终端命令 `zcode-pro` 启动 ZCode，增强在该方式下自动生效；使用原有 ZCode 入口启动时不加载增强。

### 📦 npm / PyPI

运行时优先复用 ZCode 自带的运行时；未找到 ZCode 时回退系统 Node.js（≥ 22）。

```bash
# 方式一：npm 安装/卸载
npm install -g zcode-pro
zcode-pro setup --uninstall  # 卸载前先撤销快捷方式（如创建过）
npm uninstall -g zcode-pro
# 方式二：pip 安装/卸载
pip install zcode-pro
zcode-pro setup --uninstall  # 卸载前先撤销快捷方式（如创建过）
pip uninstall zcode-pro

# 通过命令启动
zcode-pro
# 添加开始菜单快捷方式
zcode-pro setup
# 添加开始菜单快捷方式 + 桌面快捷方式
zcode-pro setup --desktop
# 撤销添加快捷方式
zcode-pro setup --uninstall
```

### 🐧 Linux / macOS

- 安装至 `~/.local`，可通过 `PREFIX=` 指定其他位置；
- Linux 会注册应用菜单快捷方式“ZCode Pro”（图标复用已安装的 ZCode）；
- 已通过 AUR 安装时请勿再使用本脚本（脚本会检测并拒绝），用户级安装会遮蔽系统级入口；
- 卸载：`./scripts/install.sh --uninstall`。

```bash
git clone https://github.com/duanluan/zcode-pro.git
cd zcode-pro && ./scripts/install.sh
```

### 🪟 Windows

使用 **PowerShell (管理员)** 运行：
```powershell
git clone https://github.com/duanluan/zcode-pro.git
cd zcode-pro

# 添加开始菜单快捷方式
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
# 添加开始菜单快捷方式 + 桌面快捷方式
powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Desktop
# ZCode 装在非默认目录且自动定位不到时，显式指定其路径（持久保存，卸载时清除）
powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Desktop -ZCodePath "D:\ProgramFiles\Zcode\ZCode.exe"

# 卸载
powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Uninstall
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

无需单独安装 Node.js：优先使用 ZCode 内置运行时，缺少系统 Node 时亦能运行；ZCode 安装在默认或自定义目录均可（自动探测，必要时查注册表）。

```bash
git clone https://github.com/duanluan/zcode-pro.git && cd zcode-pro

# Linux / macOS（自动探测 /opt/ZCode、/Applications/ZCode.app）
./bin/zcode-pro
# Windows（自动探测默认安装位置，找不到时查注册表）
bin\zcode-pro.cmd

# 手动添加开始菜单快捷方式（--desktop 同时添加桌面快捷方式，--uninstall 撤销添加快捷方式）
./bin/zcode-pro setup
bin\zcode-pro.cmd setup
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
| `setup [--desktop] [--uninstall]` | 安装/撤销本机快捷方式（`--desktop` 同时加桌面） |

各选项也可用环境变量 `ZCODEPRO_*` 覆盖。

配置与数据位置：

| 内容 | 位置 |
| --- | --- |
| 功能开关、项目别名、软件代理 | `~/.zcode/zcodepro.json` |
| 启动诊断日志（Windows 快捷方式静默启动排查） | `~/.zcode/zcodepro.log` |
| 全局提示词 | `~/.zcode/AGENTS.md` |
| ZCode 行为配置（技能清单预算等） | `~/.zcode/cli/config.json` |
| 视觉代理（zcode-vision 插件） | `~/.zcode/zcode-vision.json` |
| rtk 压缩（rtk 插件） | `~/.zcode-rtk/` |
| Headroom（headroom 插件） | `~/.zcode/headroom.json` |

卸载后直接使用官方 ZCode 入口启动即可，无需清理系统位置。

## 🔌 插件推荐

[duanluan/zcode-plugins](https://github.com/duanluan/zcode-plugins) 是配套的 ZCode 插件市场，提供 AI 代码评审、对话请求压缩、命令输出压缩等插件，可显著节省 token。安装方式：ZCode → 插件市场 → 右上角“添加”→ 添加插件市场，填写 `duanluan/zcode-plugins`。已安装的插件可在 ZCode Pro 设置中一键检查并更新。

## 💬 交流与反馈

- QQ 群：**428403354**（[点击加入](https://qm.qq.com/q/WXuISJK3ug)）
- 微信群：添加微信 **ai4only** 邀请进群

<p>
  <img src="https://raw.githubusercontent.com/duanluan/zcode-pro/main/assets/qq-group.png" width="200" alt="QQ 群二维码" />
  &nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/duanluan/zcode-pro/main/assets/wechat-ai4only.png" width="200" alt="微信二维码（ai4only）" />
</p>
