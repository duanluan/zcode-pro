# ZCode Pro

[简体中文](README.md) | English

ZCode Pro enhances the ZCode desktop UI. No client files are modified; just launch via the ZCode Pro shortcut or the `zcode-pro` terminal command.

[![npm](https://img.shields.io/npm/v/zcode-pro?logo=npm&logoColor=white)](https://www.npmjs.com/package/zcode-pro) [![PyPI](https://img.shields.io/pypi/v/zcode-pro?logo=pypi&logoColor=white)](https://pypi.org/project/zcode-pro/) [![AUR](https://img.shields.io/aur/version/zcode-pro?logo=archlinux&logoColor=white)](https://aur.archlinux.org/packages/zcode-pro) [![Windows](https://img.shields.io/badge/-Windows-0078D6?logo=data:image/svg%2Bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iI2ZmZmZmZiIgZD0iTTAsMEgxMS4zNzdWMTEuMzcySDBaTTEyLjYyMywwSDI0VjExLjM3MkgxMi42MjNaTTAsMTIuNjIzSDExLjM3N1YyNEgwWm0xMi42MjMsMEgyNFYyNEgxMi42MjMiLz48L3N2Zz4%3D)](https://github.com/duanluan/zcode-pro#-windows) [![macOS](https://img.shields.io/badge/-macOS-000000?logo=apple&logoColor=white)](https://github.com/duanluan/zcode-pro#-linux--macos) [![Linux](https://img.shields.io/badge/-Linux-FCC624?logo=linux&logoColor=black)](https://github.com/duanluan/zcode-pro#-linux--macos) [![QQ](https://img.shields.io/badge/QQ-428403354-12B7F5?logo=qq&logoColor=white)](https://github.com/duanluan/zcode-pro#-community) [![WeChat](https://img.shields.io/badge/WeChat-ai4only-07C160?logo=wechat&logoColor=white)](https://github.com/duanluan/zcode-pro#-community)

> **Opening settings: after launching ZCode Pro, right-click the settings button (gear) at the bottom of the ZCode sidebar to open the ZCode Pro settings window.**

## ✨ Features

| Feature | Description |
| --- | --- |
| Custom project alias | Show a custom name for a project in the sidebar; UI-only, revert anytime; renaming is built into ZCode ≥ 3.16.1 (project menu "Edit project") — the feature disables itself there and offers to migrate existing aliases |
| Switch project folder | Point a project at another folder; sidebar, tabs and task history follow. Stop running tasks before switching; historical checkpoints still reference the original path |
| Open folder / Copy path | Project "More" menu: open the project directory in the file manager, or copy its path |
| Session drag ordering | Reorder sessions in Pinned, Projects and Groups; persists across refreshes |
| Session quick switch | `alt+z` toggles between the current and the last session; hold `alt` and press `x` (up) / `c` (down) to pick from recent sessions, release `alt` to switch (like `alt+tab`) |
| Keep renamed session titles | Sessions you renamed keep their custom title; auto-generated titles no longer overwrite it in the sidebar |
| Task name prompt | When a new session starts answering, generates the task name with a provider and prompt you choose (following the current session and glm-5.3-flash by default; every question sent before the first answer counts), saved as a manual rename the built-in auto title never overrides; provider, model and prompt are editable in settings, with a test button |
| Running indicator while collapsed | While any session is running, collapsed projects and the "Tasks" / "Pinned" section headers show the same loader the running task row uses; it disappears when all finish; on pre-3.16.1 builds projects are briefly re-expanded in the background every 60 seconds to re-check |
| Idle project memory reclaim | Projects unused for a while with no running tasks release their memory automatically, and unused ones are reclaimed once after startup; sessions are untouched and reload when reopened (durations adjustable) |
| Plugin card sandbox reclaim | Releases the oldest plugin-card sandboxes once the cap is hit (the one being viewed goes last), so new cards keep opening after the 64-slot pool fills up; released cards come back when their session is reopened (cap adjustable) |
| Sidebar menu in the top bar | Turns "New task / Search / Automations / Plugin store" into icon buttons in the top navigation bar: hover shows the name, highlighted while its view is open, shortcuts still work |
| Collapsible Pinned section | The sidebar "Pinned" header collapses/expands its task list; the state is remembered |
| File menu actions | Adds "Open with default app" and "Reveal in file manager" to file links in chat |
| Copy image | Right-click an image in chat or the enlarged preview to copy it to the clipboard |
| UI style adjustments | Fine-tune paragraph spacing, content width, line heights, list/quote/table spacing and cell padding; focusing an input highlights the affected areas; applies instantly |
| Sidebar spacing | Fine-tune sidebar project spacing and task spacing; applies instantly |
| Font adjustment | Custom UI font (all interface text except the terminal), question font and answer font; applies instantly |
| Global prompt | Edit default instructions shared by all projects; applies to new sessions |
| Software proxy | Set an HTTP proxy for plugin updates/installs and tool upgrades, with connectivity test |
| Settings sync | Manually back up ZCode Pro settings and model settings to WebDAV, or restore them on a new computer; transfers only on click |
| Vision proxy | Automatically hand images to vision models for recognition when the main model cannot see them, and feed the descriptions to the main model; visual chain editor (zcode-vision plugin) |
| rtk compression | Manage rewrite hints and the command whitelist; check and upgrade the rtk program (rtk plugin) |
| Headroom | Manage compression device, power-save switching and proxy status; check and upgrade the headroom program (headroom plugin) |
| Plugin updates | Check and update zcode-plugins marketplace plugins in one click, optional auto-update on startup |

All features can be toggled or adjusted in the settings window; works on both ZCode 3.16.1 and 3.15.x.

## 📦 Installation

> **Version match**: for ZCode ≥ 3.16.1 use **zcode-pro 1.0.0** (latest npm / PyPI / AUR release); for ZCode ≤ 3.15.x use **zcode-pro 0.20.3** (the previous release, still available).

Once installed, launch ZCode via the "ZCode Pro" shortcut in your app menu / Start menu, or the `zcode-pro` command in a terminal — the enhancements are enabled automatically in this mode; launching ZCode through its original entry does not load them. After launching, right-click the settings button at the bottom of the ZCode sidebar to open the ZCode Pro settings window.

### 📦 npm / PyPI

At runtime the Node runtime bundled with ZCode is preferred; if ZCode cannot be found, system Node.js (≥ 22) is used.

```bash
# Option 1: install/uninstall via npm
npm install -g zcode-pro
npm uninstall -g zcode-pro
# Option 2: install/uninstall via pip
pip install zcode-pro
pip uninstall zcode-pro

# Launch via the command
zcode-pro
# Add a Start-menu shortcut
zcode-pro setup
# Add a Start-menu shortcut + a desktop shortcut
zcode-pro setup --desktop
# Undo the shortcuts
zcode-pro setup --uninstall
```

### 🐧 Linux / macOS

```bash
git clone https://github.com/duanluan/zcode-pro.git
cd zcode-pro && ./scripts/install.sh
```

- Installs to `~/.local`; use `PREFIX=` to choose another location;
- On Linux, registers an app-menu shortcut "ZCode Pro" (icon reused from the installed ZCode);
- Do not use this script while the AUR package is installed (the script detects this and refuses): the user-level install would shadow the system-wide one;
- Uninstall: `./scripts/install.sh --uninstall`.

### 🪟 Windows

Run with **PowerShell (Admin)**:
```powershell
git clone https://github.com/duanluan/zcode-pro.git
cd zcode-pro

# Add a Start-menu shortcut
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
# Add a Start-menu shortcut + a desktop shortcut
powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Desktop
# ZCode in a non-default directory that auto-detection misses? Pass its path (persisted, removed on uninstall)
powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Desktop -ZCodePath "D:\ProgramFiles\Zcode\ZCode.exe"

# Uninstall
powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Uninstall
```

### 📦 AUR (Arch / Manjaro)

Installs `/usr/bin/zcode-pro` and a system-level app-menu shortcut. Depends on the [zcode](https://aur.archlinux.org/packages/zcode) package from the AUR.

```bash
yay -S zcode-pro
paru -S zcode-pro
# Manual installation
git clone https://aur.archlinux.org/zcode-pro.git && cd zcode-pro && makepkg -si
```

If you previously installed via `install.sh`, run `./scripts/install.sh --uninstall` in that repository clone before switching to the AUR package. Leftover user-level files would keep shadowing the system-wide entry, and you would keep launching the old version.

### 🚀 Run without installing

No standalone Node.js required: the runtime bundled with ZCode is preferred and used even without a system Node; works whether ZCode is installed in the default or a custom directory (auto-detected, falling back to the registry).

```bash
git clone https://github.com/duanluan/zcode-pro.git && cd zcode-pro

# Linux / macOS (auto-detects /opt/ZCode, /Applications/ZCode.app)
./bin/zcode-pro
# Windows (auto-detects default locations, falls back to the registry)
bin\zcode-pro.cmd

# Manually add a Start-menu shortcut (--desktop also adds a desktop shortcut, --uninstall undoes)
./bin/zcode-pro setup
bin\zcode-pro.cmd setup
```

## 📖 Reference

Command-line options (see `zcode-pro --help` for all):

| Option | Description |
| --- | --- |
| `--cdp-port` | Debug port, default 9333 |
| `--helper-port` | Local helper port, default 47889 |
| `--zcode-path` | Explicit path to the ZCode executable |
| `--inject-only` | Attach to a running instance only; do not launch a new one |
| `--verbose` | Verbose logging |
| `setup [--desktop] [--uninstall]` | Install/undo local shortcuts (`--desktop` also adds a desktop one) |

Each option can also be overridden with a `ZCODEPRO_*` environment variable.

Configuration and data locations:

| Content | Location |
| --- | --- |
| Feature switches, aliases, software proxy | `~/.zcode/zcodepro.json` |
| Startup diagnostics log (silent shortcut launches, Windows) | `~/.zcode/zcodepro.log` |
| Global prompt | `~/.zcode/AGENTS.md` |
| Vision proxy (zcode-vision plugin) | `~/.zcode/zcode-vision.json` |
| rtk compression (rtk plugin) | `~/.zcode-rtk/` |
| Headroom (headroom plugin) | `~/.zcode/headroom.json` |

After uninstalling, just start ZCode from the official entry; no system cleanup is needed.

## 🔌 Plugin recommendation

[duanluan/zcode-plugins](https://github.com/duanluan/zcode-plugins) is a companion plugin marketplace for ZCode: AI code review, request compression and command-output compression plugins that save tokens. To install: ZCode → Plugin Marketplace → "Add" (top right) → Add plugin marketplace, and enter `duanluan/zcode-plugins`. Installed plugins can be checked and updated from ZCode Pro settings.

## 💬 Community

- QQ group: **428403354** ([join](https://qm.qq.com/q/WXuISJK3ug))
- WeChat group: add **ai4only** on WeChat to be invited

<p>
  <img src="https://raw.githubusercontent.com/duanluan/zcode-pro/main/assets/qq-group.png" width="200" alt="QQ group QR code" />
  &nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/duanluan/zcode-pro/main/assets/wechat-ai4only.png" width="200" alt="WeChat QR code (ai4only)" />
</p>
