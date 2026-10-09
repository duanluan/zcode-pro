# ZCode Pro

[简体中文](README.md) | English

ZCode Pro enhances the ZCode desktop UI. No client files are modified; just launch via the ZCode Pro shortcut.

![AUR](https://img.shields.io/aur/version/zcode-pro) ![Platform](https://img.shields.io/badge/platform-win%20%7C%20mac%20%7C%20linux%20%7C%20AUR-blue)

> **Opening settings: after launching ZCode Pro, right-click the settings button (gear) at the bottom of the ZCode sidebar to open the ZCode Pro settings window.**

## ✨ Features

| Feature | Description |
| --- | --- |
| Custom project alias | Show a custom name for a project in the sidebar; UI-only, revert anytime |
| Switch project folder | Point a project at another folder; sidebar, tabs and task history follow. Stop running tasks before switching; historical checkpoints still reference the original path |
| Open folder / Copy path | Project "More" menu: open the project directory in the file manager, or copy its path |
| Session drag ordering | Reorder sessions in Pinned, Projects and Groups; persists across refreshes |
| Session quick switch | `alt+z` toggles between the current and the last session; hold `alt` and press `x` / `c` to pick from recent sessions, release `alt` to switch (like `alt+tab`) |
| Keep renamed session titles | Sessions you renamed keep their custom title; auto-generated titles no longer overwrite it in the sidebar |
| Running indicator on collapsed projects | Spins a collapsed project's icon while any of its sessions is still running; stops when they all finish |
| Idle project memory reclaim | Projects unused for a while with no running tasks release their memory automatically, and unused ones are reclaimed once after startup; sessions are untouched and reload when reopened (durations adjustable) |
| Sidebar menu in the top bar | Turns the sidebar menu (New task / Search / Automations / Plugin store) into icon buttons next to the top-bar arrows: hover shows the name, highlighted while its view is open, shortcuts still work |
| Collapsible Pinned section | The sidebar "Pinned" header collapses/expands its task list; the state is remembered |
| File menu actions | Adds "Open with default app" and "Reveal in file manager" to file links in chat |
| Copy image | Right-click an image in chat or the enlarged preview to copy it to the clipboard |
| UI style adjustments | Fine-tune paragraph spacing, content width, line heights, list/quote/table spacing and cell padding; focusing an input highlights the affected areas; applies instantly |
| Sidebar spacing | Fine-tune sidebar project spacing and task spacing; applies instantly |
| Global prompt | Edit default instructions shared by all projects; applies to new sessions |
| Software proxy | Set an HTTP proxy for plugin updates/installs and tool upgrades, with connectivity test |
| Vision proxy | Automatically hand images to vision models for recognition when the main model cannot see them, and feed the descriptions to the main model; visual chain editor (zcode-vision plugin) |
| rtk compression | Manage rewrite hints and the command whitelist; check and upgrade the rtk program (rtk plugin) |
| Headroom | Manage compression device, power-save switching and proxy status; check and upgrade the headroom program (headroom plugin) |
| Plugin updates | Check and update zcode-plugins marketplace plugins in one click, optional auto-update on startup |

All features can be toggled or adjusted in the settings window.

## 📦 Installation

Once installed, launch ZCode via the "ZCode Pro" shortcut in your app menu / Start menu, or the `zcode-pro` command in a terminal — the enhancements are enabled automatically in this mode; launching ZCode through its original entry does not load them. After launching, right-click the settings button at the bottom of the ZCode sidebar to open the ZCode Pro settings window.

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

```powershell
git clone https://github.com/duanluan/zcode-pro.git
cd zcode-pro
powershell -ExecutionPolicy Bypass -File scripts\install.ps1          # Start menu shortcut
powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Desktop # plus a desktop shortcut
```

- Installs to `%LOCALAPPDATA%\ZCodePro`; shortcuts launch silently without a console window;
- Uninstall: `powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Uninstall`.

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

No standalone Node.js required: when a system Node is missing, the runtime bundled with ZCode is used.

```bash
git clone https://github.com/duanluan/zcode-pro.git && cd zcode-pro
./bin/zcode-pro            # Linux / macOS (auto-detects /opt/ZCode, /Applications/ZCode.app)
bin\zcode-pro.cmd          # Windows (auto-detects %LOCALAPPDATA%\Programs\ZCode\ZCode.exe)
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

Each option can also be overridden with a `ZCODEPRO_*` environment variable.

Configuration and data locations:

| Content | Location |
| --- | --- |
| Feature switches, aliases, software proxy | `~/.zcode/zcodepro.json` |
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
  <img src="assets/qq-group.png" width="200" alt="QQ group QR code" />
  &nbsp;&nbsp;
  <img src="assets/wechat-ai4only.png" width="200" alt="WeChat QR code (ai4only)" />
</p>
