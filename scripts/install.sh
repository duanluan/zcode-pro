#!/bin/sh
# ZCode Pro 一键安装（Linux / macOS）
# 从本仓库安装启动器与快捷方式：
#   - 程序文件 → $PREFIX/share/zcode-pro（默认 $HOME/.local/share/zcode-pro）
#   - 命令     → $PREFIX/bin/zcode-pro（symlink）
#   - Linux    → 应用菜单快捷方式「ZCode Pro」（$XDG_DATA_HOME/applications）
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
    update-desktop-database "${XDG_DATA_HOME:-$HOME/.local/share}/applications" 2>/dev/null || true
  fi
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

# 3. Linux 应用菜单快捷方式（点「ZCode Pro」= 带增强启动 ZCode）
if [ "$OS" = "Linux" ]; then
  APP_DIR="$DESTDIR${XDG_DATA_HOME:-$HOME/.local/share}/applications"
  mkdir -p "$APP_DIR"
  sed "s|@bindir@|$BIN|" "$REPO_DIR/packaging/zcode-pro.desktop" > "$APP_DIR/zcode-pro.desktop"
  update-desktop-database "$APP_DIR" 2>/dev/null || true
fi

echo "[zcode-pro] 安装完成：$SHARE"
echo "  命令: $BIN/zcode-pro"
if [ "$OS" = "Linux" ]; then
  echo "  应用菜单已新增「ZCode Pro」（图标复用已安装的 ZCode）。"
fi
echo "  之后从菜单点「ZCode Pro」或终端运行 zcode-pro 即可带增强启动 ZCode；"
echo "  用原版 ZCode 图标启动则不带增强（检测到这种情况时 zcode-pro 会提示重启）。"
case ":$PATH:" in
  *":$BIN:"*) ;;
  *) echo "  注意: $BIN 不在 PATH 中，终端命令不可用（不影响快捷方式）。请把它加入 PATH。" ;;
esac
