"""zcode-pro 命令入口：定位 ZCode 自带的 Node 运行时（找不到再用系统 node），
运行随包内置的启动器 cli.mjs（查找逻辑与 bin/zcode-pro shell 版一致）。
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

from . import __version__

APP_DIR = Path(__file__).resolve().parent / "app"
CLI_MJS = APP_DIR / "cli.mjs"


def _zcode_candidates() -> list[str]:
    candidates: list[str] = []
    env_path = os.environ.get("ZCODEPRO_ZCODE_PATH")
    if env_path:
        candidates.append(env_path)
    if sys.platform == "win32":
        local_appdata = os.environ.get("LOCALAPPDATA", "")
        program_files = os.environ.get("ProgramFiles", "")
        if local_appdata:
            candidates.append(str(Path(local_appdata) / "Programs" / "ZCode" / "ZCode.exe"))
        if program_files:
            candidates.append(str(Path(program_files) / "ZCode" / "ZCode.exe"))
    else:
        home = Path.home()
        candidates.extend(
            [
                "/opt/ZCode/zcode",
                "/usr/lib/zcode/zcode",
                "/usr/share/zcode/zcode",
                "/usr/local/ZCode/zcode",
                "/Applications/ZCode.app/Contents/MacOS/ZCode",
                str(home / "Applications" / "ZCode.app" / "Contents" / "MacOS" / "ZCode"),
                "/usr/sbin/zcode",
                "/usr/bin/zcode",
            ]
        )
    return candidates


def _find_zcode_binary() -> str | None:
    for path in _zcode_candidates():
        if path and os.path.isfile(path) and os.access(path, os.X_OK):
            return path
    return None


def _runtime_ok(zcode_bin: str) -> bool:
    """预检 ZCode 自带运行时是否可用：注册表等来源找到的可执行文件可能不完整
    （缺 resources/ICU 数据等），以 Node 模式跑不起来就回退系统 node。"""
    env = dict(os.environ, ELECTRON_RUN_AS_NODE="1")
    try:
        return subprocess.run(
            [zcode_bin, "-e", "process.exit(0)"],
            env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        ).returncode == 0
    except OSError:
        return False


def main() -> int:
    zcode_bin = _find_zcode_binary()
    if zcode_bin and _runtime_ok(zcode_bin):
        # 用 ZCode 内置的 Node 运行时执行启动器（ELECTRON_RUN_AS_NODE 使其表现为纯 Node）
        env = dict(os.environ, ELECTRON_RUN_AS_NODE="1")
        return subprocess.run([zcode_bin, str(CLI_MJS), *sys.argv[1:]], env=env).returncode
    node_bin = shutil.which("node")
    if node_bin:
        return subprocess.run([node_bin, str(CLI_MJS), *sys.argv[1:]]).returncode
    print(
        "[zcodepro] 未找到 node，也未找到 ZCode 可执行文件。请安装 Node.js >= 22 或设置 ZCODEPRO_ZCODE_PATH。",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
