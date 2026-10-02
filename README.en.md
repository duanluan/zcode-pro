# ZCode Pro

[简体中文](README.md) | English

ZCode Pro enhances the ZCode desktop UI. Launch ZCode through the "ZCode Pro" launcher and the enhancements are enabled automatically; official app files are never modified, and ZCode returns to its original state after exit.

![Platform](https://img.shields.io/badge/platform-win%20%7C%20mac%20%7C%20linux%20%7C%20AUR-blue)

> **Opening settings: after launching ZCode Pro, right-click the settings button (gear) at the bottom of the ZCode sidebar to open the ZCode Pro settings window.**

## Features

### Custom project aliases

Set a custom display name for any project in the sidebar, for the UI only:

- Takes effect immediately, no refresh needed, and you can restore the original name anytime;
- The folder on disk, session records and all ZCode data stay untouched.

### Relocate project folder

Point a project at another folder to change where it lives:

- The sidebar project list, open tabs and local task history move together — no sessions are lost;
- The directory itself is never moved or modified.

### Open project folder

A new "Open folder" action in the project "More" menu opens the project directory in your system file manager.

### Session ordering

Drag sessions within the pinned, project and group lists to reorder them. The order is remembered and survives refreshes.

### File menu actions

Two new actions in the right-click menu of file links in chat:

- Open with default app: open the file with the system's default application;
- Reveal in file manager: show the file in your system file manager.

Can be toggled in the settings window.

### Copy image

Right-click an image in chat or the enlarged preview and choose "Copy image" to copy it to the system clipboard. Can be toggled in the settings window.

### UI style adjustments

The "Styles" tab in the settings window fine-tunes the UI. Number fields support mouse-wheel adjustment and changes apply instantly:

- Paragraph spacing: vertical spacing between turns and between paragraphs inside answers;
- Content width: max width of conversation content, in px or %;
- Question / answer line height: line height of question and answer text (multiplier);
- List spacing / list item spacing: list margins and spacing between list items;
- Quote & code spacing: space above and below quotes and code blocks.

All of the above can be reset to defaults with one click.

### Global prompt

The "Global Prompt" tab in the settings window edits the default instructions shared by all projects:

- Written to `~/.zcode/AGENTS.md` and injected into every session of every project;
- Takes effect from new sessions; a project's own `AGENTS.md` can extend or override the global rules;
- Clear the content and save to remove the global prompt.

### Vision proxy

When the main model cannot take image input (e.g. glm-5.3), images in chat are automatically sent to a vision model and the recognition result is injected into the conversation as text (requires the zcode-vision plugin). Edit it visually in the "Vision Proxy" tab of the settings window:

- Enable switch, chain mode (fallback / pipeline), compression threshold, proxy chain and recognition prompts;
- Shares the same configuration as the `/vision-*` commands; changes save automatically, take effect instantly, with one-click testing.

### rtk compression

The rtk plugin compresses output of common dev commands by 60–90% before it enters the context. Manage it in the "rtk Compression" tab of the settings window:

- Rewrite-hint switch: turn it off to stop the interception hints; you can still run `rtk <command>` manually to enjoy the compression;
- Command whitelist: commands passed through without hints (e.g. `docker`, `git:clone`).

Shares the same configuration as the `/rtk-*` commands; changes save automatically and take effect immediately.

### Plugin updates

- A "Plugin updates" card in the "Features" tab checks and updates installed plugins from the zcode-plugins marketplace in one click;
- Optional auto-update runs the updates automatically at startup;
- With auto-update off, new versions are reported once when detected.

### Settings entry

Right-click the settings button at the bottom of the ZCode sidebar to open the ZCode Pro settings window (left-click still opens the ZCode settings page). It has five tabs — "Features", "Styles", "Global Prompt", "Vision Proxy" and "rtk Compression" — to toggle each enhancement, adjust UI styles, edit the global prompt, manage companion plugins and check the runtime status. Settings apply instantly.

## Installation

Once installed, launch ZCode via the "ZCode Pro" shortcut in your app menu / Start menu, or the `zcode-pro` command in a terminal — the enhancements are enabled automatically in this mode; launching ZCode through its original entry does not load them. After launching, right-click the settings button at the bottom of the ZCode sidebar to open the ZCode Pro settings window.

### Linux / macOS

```bash
git clone https://github.com/duanluan/zcode-pro.git
cd zcode-pro && ./scripts/install.sh
```

- Installs to `~/.local`; use `PREFIX=` to choose another location;
- On Linux, registers an app-menu shortcut "ZCode Pro" (icon reused from the installed ZCode);
- Uninstall: `./scripts/install.sh --uninstall`.

### Windows

```powershell
git clone https://github.com/duanluan/zcode-pro.git
cd zcode-pro
powershell -ExecutionPolicy Bypass -File scripts\install.ps1          # Start menu shortcut
powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Desktop # plus a desktop shortcut
```

- Installs to `%LOCALAPPDATA%\ZCodePro`; shortcuts launch silently without a console window;
- Uninstall: `powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Uninstall`.

### AUR (Arch / Manjaro)

Installs `/usr/bin/zcode-pro` and a system-level app-menu shortcut. Depends on the [zcode](https://aur.archlinux.org/packages/zcode) package from the AUR.

```bash
yay -S zcode-pro
paru -S zcode-pro
# Manual installation
git clone https://aur.archlinux.org/zcode-pro.git && cd zcode-pro && makepkg -si
```

### Run without installing

No standalone Node.js required: when a system Node is missing, the runtime bundled with ZCode is used.

```bash
git clone https://github.com/duanluan/zcode-pro.git && cd zcode-pro
./bin/zcode-pro            # Linux / macOS (auto-detects /opt/ZCode, /Applications/ZCode.app)
bin\zcode-pro.cmd          # Windows (auto-detects %LOCALAPPDATA%\Programs\ZCode\ZCode.exe)
```

## Command-line options

```
zcode-pro [--cdp-port 9333] [--helper-port 47889] [--zcode-path <path>]
        [--inject-only] [--verbose]
```

| Option | Description |
| --- | --- |
| `--cdp-port` | Debug port, default 9333 (or env var `ZCODEPRO_CDP_PORT`) |
| `--helper-port` | Local helper service port, default 47889 (`ZCODEPRO_HELPER_PORT`) |
| `--zcode-path` | Explicit path to the ZCode executable (`ZCODEPRO_ZCODE_PATH`) |
| `--inject-only` | Attach to an instance already listening on the debug port instead of starting a new one |
| `--verbose` | Verbose logging |

## Configuration & data

- Feature switches and project aliases: `~/.zcode/zcodepro.json`
- Global prompt: `~/.zcode/AGENTS.md` (backed up before saving: `~/.zcode/AGENTS.md.zcodepro-backup`)
- Vision proxy settings (zcode-vision plugin): `~/.zcode/zcode-vision.json`
- rtk compression settings (rtk plugin): `~/.zcode-rtk/` (mode and whitelist)
- Config backup created when relocating a folder: `~/.zcode/v2/setting.json.zcodepro-backup`
- After uninstalling, just launch ZCode through its official entry — nothing to clean up.

## Known limitations

- If a task is running inside the project, stop it before relocating the folder;
- Checkpoint snapshots still reference the original path; restoring an old checkpoint may write back to the original directory.

## Plugin recommendation

[duanluan/zcode-plugins](https://github.com/duanluan/zcode-plugins) is a companion plugin marketplace for ZCode: AI code review, request compression and command-output compression plugins that save tokens. To install: ZCode → Plugin Marketplace → "Add" (top right) → Add plugin marketplace, and enter `duanluan/zcode-plugins`. Installed plugins can be checked and updated from ZCode Pro settings.

## Community

- QQ group: **428403354** ([join](https://qm.qq.com/q/WXuISJK3ug))
- WeChat group: add **ai4only** on WeChat to be invited

<p>
  <img src="assets/qq-group.png" width="200" alt="QQ group QR code" />
  &nbsp;&nbsp;
  <img src="assets/wechat-ai4only.png" width="200" alt="WeChat QR code (ai4only)" />
</p>
