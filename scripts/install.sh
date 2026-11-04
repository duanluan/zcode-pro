#!/bin/sh
# ZCode Pro 一键安装（Linux / macOS）
# 从本仓库安装启动器与快捷方式：
#   - 程序文件 → $PREFIX/share/zcode-pro（默认 $HOME/.local/share/zcode-pro）
#   - 命令     → $PREFIX/bin/zcode-pro（symlink）
#   - Linux    → 应用菜单快捷方式“ZCode Pro”（$XDG_DATA_HOME/applications）
# 用法：./scripts/install.sh [--uninstall]
#   PREFIX=/opt/zcode-pro sudo -E ./scripts/install.sh   # 装到系统位置（可选）
set -e

PREFIX=${PREFIX:-$HOME/.local}
DESTDIR=${DESTDIR:-}
SHARE="$DESTDIR$PREFIX/share/zcode-pro"
BIN="$DESTDIR$PREFIX/bin"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_DIR=$(dirname -- "$SCRIPT_DIR")
OS=$(uname -s)

uninstall() {
  if [ ! -d "$SHARE" ] && [ ! -e "$BIN/zcode-pro" ]; then
    echo "[zcode-pro] 在 PREFIX=$PREFIX 下未发现安装（当前 DESTDIR=$DESTDIR）。" >&2
    echo "  若安装时指定了 PREFIX，请用相同 PREFIX 重试，如：sudo PREFIX=/opt/zcode-pro $0 --uninstall" >&2
    exit 1
  fi
  rm -rf "$SHARE"
  rm -f "$BIN/zcode-pro"
  if [ "$OS" = "Linux" ]; then
    rm -f "$DESTDIR${XDG_DATA_HOME:-$HOME/.local/share}/applications/zcode-pro.desktop"
    # 桌面条目按 setup.mjs 的 desktopDir 同款定位（xdg-user-dir 跟随本地化目录名，
    # 如 ~/桌面），只删带 setup 归属标记的，同名的外来文件不动
    DESKTOP_DIR=$(xdg-user-dir DESKTOP 2>/dev/null | head -n 1)
    if [ -z "$DESKTOP_DIR" ]; then
      if [ -d "$HOME/Desktop" ]; then DESKTOP_DIR=$HOME/Desktop; else DESKTOP_DIR=$HOME/桌面; fi
    fi
    DENTRY="$DESTDIR$DESKTOP_DIR/zcode-pro.desktop"
    if [ -f "$DENTRY" ] && grep -q 'X-ZCodePro-Setup=true' "$DENTRY"; then
      rm -f "$DENTRY"
    fi
    update-desktop-database "${XDG_DATA_HOME:-$HOME/.local/share}/applications" 2>/dev/null || true
  fi
  # zcode-pro setup 装进 ZCode 数据目录的壁纸命令/技能一并清掉（与 setup --uninstall 同款清单）
  ZP_DATA="${ZCODE_DATA_BASE_DIR:-$HOME}/.zcode"
  rm -f "$ZP_DATA/commands/wallpaper.md"
  rm -rf "$ZP_DATA/skills/wallpaper"
  echo "[zcode-pro] 已卸载。"
}

case "${1:-}" in
  -h|--help)
    echo "用法: $0 [--uninstall]  （可用 PREFIX= 覆盖安装前缀，DESTDIR= 供打包测试）"
    exit 0
    ;;
  --uninstall)
    uninstall
    exit 0
    ;;
  "")
    ;;
  *)
    echo "未知参数: $1" >&2
    exit 1
    ;;
esac

# 已装 AUR 版时拒绝安装：~/.local 手动安装会遮蔽系统级安装（同名快捷方式优先级更高、
# PATH 更靠前），表现为快捷方式与终端命令一直运行旧版。--uninstall 不受限——
# AUR 用户正需要它清理残留。
if [ -z "$DESTDIR" ] && command -v pacman >/dev/null 2>&1 && pacman -Q zcode-pro >/dev/null 2>&1; then
  echo "[zcode-pro] 检测到已安装 AUR 包 zcode-pro（$(pacman -Q zcode-pro)），请勿混用两种安装方式：" >&2
  echo "  - 继续用 AUR：无需本脚本，直接使用 /usr/bin/zcode-pro 与系统级快捷方式；" >&2
  echo "  - 改用手动安装：先 sudo pacman -R zcode-pro，再重新运行本脚本；" >&2
  echo "  - 清理旧手动安装残留：./scripts/install.sh --uninstall" >&2
  exit 1
fi

if [ ! -f "$REPO_DIR/dist/inject.js" ]; then
  echo "[zcode-pro] 缺少 dist/inject.js：请使用完整仓库（含构建产物）运行本脚本。" >&2
  exit 1
fi

# 1. 程序文件
mkdir -p "$SHARE"
rm -rf "$SHARE/bin" "$SHARE/src" "$SHARE/cli.mjs" "$SHARE/dist"
mkdir -p "$SHARE/dist"
cp -R "$REPO_DIR/bin" "$SHARE/bin"
cp -R "$REPO_DIR/src" "$SHARE/src"
cp "$REPO_DIR/cli.mjs" "$REPO_DIR/package.json" "$REPO_DIR/LICENSE" "$SHARE/"
cp "$REPO_DIR/dist/inject.js" "$SHARE/dist/inject.js"
chmod +x "$SHARE/bin/zcode-pro"

# 2. 命令
mkdir -p "$BIN"
ln -sfn "$SHARE/bin/zcode-pro" "$BIN/zcode-pro"

# 3. Linux 应用菜单快捷方式（点“ZCode Pro”= 带增强启动 ZCode）
if [ "$OS" = "Linux" ]; then
  APP_DIR="$DESTDIR${XDG_DATA_HOME:-$HOME/.local/share}/applications"
  mkdir -p "$APP_DIR"
  # 替换值先做 sed 转义（\、&、分隔符 |），PREFIX 含这些字符不会写坏菜单文件；
  # 模板 Exec 整体带引号，PREFIX 含空格也不断词（与 setup.mjs 的 desktopEntry 一致）
  BIN_SED=$(printf '%s' "$BIN" | sed -e 's/[\\&|]/\\&/g')
  sed "s|@bindir@|$BIN_SED|" "$REPO_DIR/packaging/zcode-pro.desktop" > "$APP_DIR/zcode-pro.desktop"
  # KDE 等环境要求用户目录下 .desktop 带执行位才允许启动
  chmod 755 "$APP_DIR/zcode-pro.desktop"
  update-desktop-database "$APP_DIR" 2>/dev/null || true
fi

echo "[zcode-pro] 安装完成：$SHARE"
echo "  命令: $BIN/zcode-pro"
if [ "$OS" = "Linux" ]; then
  echo "  应用菜单已新增“ZCode Pro”（图标复用已安装的 ZCode）。"
fi
echo "  之后从菜单点“ZCode Pro”或终端运行 zcode-pro 即可带增强启动 ZCode；"
echo "  用原版 ZCode 图标启动则不带增强（检测到这种情况时 zcode-pro 会提示重启）。"
case ":$PATH:" in
  *":$BIN:"*) ;;
  *) echo "  注意: $BIN 不在 PATH 中，终端命令不可用（不影响快捷方式）。请把它加入 PATH。" ;;
esac
