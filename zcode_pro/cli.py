"""zcode-pro 命令入口：定位 ZCode 自带的 Node 运行时（找不到再用系统 node），
运行随包内置的启动器 cli.mjs（查找逻辑与 bin/zcode-pro shell 版一致）。
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

from . import __version__

APP_DIR = Path(__file__).resolve().parent / "app"
CLI_MJS = APP_DIR / "cli.mjs"


def _reg_query(*args: str) -> str:
    try:
        out = subprocess.run(["reg", "query", *args], capture_output=True, text=True, timeout=10)
        return out.stdout or ""
    except OSError:
        return ""


def _reg_value(line: str) -> str:
    """取 REG_SZ / REG_EXPAND_SZ 之后的值，%VAR% 按当前环境变量展开。"""
    parts = re.split(r"REG_(?:EXPAND_)?SZ\s+", line, maxsplit=1)
    if len(parts) < 2:
        return ""
    return re.sub(r"%([^%]+)%", lambda m: os.environ.get(m.group(1), m.group(0)), parts[1]).strip()


def _win_registry_candidates() -> list[str]:
    """Windows 注册表兜底，与 bin/zcode-pro.cmd、src/host/paths.mjs 的推导规则
    同步维护（改一处要三处一起改）：自定义目录安装时固定路径找不到，安装器会在
    注册表留有登记。"""
    found: list[str] = []

    def push(raw: str) -> str:
        # 去引号与 ",N" 图标序号后缀（与 paths.mjs 的 push 同款清理）
        p = re.sub(r",\d+$", "", str(raw).strip().strip('"'))
        if p.lower().endswith(".exe"):
            found.append(p)
        return p

    # 用户级 ZCODEPRO_ZCODE_PATH 不会传播到已运行的进程，从注册表兜底读取
    val = _reg_value(_reg_query("HKCU\\Environment", "/v", "ZCODEPRO_ZCODE_PATH"))
    if val:
        found.append(val)
    # App Paths：安装器注册的可执行文件全路径（ShellExecute 同款查找）
    for root in ("HKLM", "HKCU"):
        val = _reg_value(_reg_query(root + "\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\zcode.exe", "/ve"))
        if val:
            push(val)
    # 卸载表 DisplayIcon：ZCode 的 NSIS 安装器不写 App Paths、DisplayIcon 常指向
    # uninstallerIcon.ico，从其所在目录推导 ZCode.exe
    for key in (
        "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
        "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
        "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    ):
        for line in _reg_query(key, "/s", "/v", "DisplayIcon").splitlines():
            seg = _reg_value(line)
            if not seg or "zcode" not in seg.lower():
                continue
            clean = push(seg)
            if "\\" in clean or "/" in clean:
                push(str(Path(clean).parent / "ZCode.exe"))
                push(str(Path(clean).parent / "zcode.exe"))
    return found


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
        candidates.extend(_win_registry_candidates())
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


def _exit_code(rc: int) -> int:
    """子进程被信号杀死时 returncode 为负（-N），SystemExit(-N) 会落成 256-N；
    按 shell 惯例转成 128+N。"""
    return rc if rc >= 0 else 128 - rc


def main() -> int:
    zcode_bin = _find_zcode_binary()
    if zcode_bin and _runtime_ok(zcode_bin):
        # 用 ZCode 内置的 Node 运行时执行启动器（ELECTRON_RUN_AS_NODE 使其表现为纯 Node）
        env = dict(os.environ, ELECTRON_RUN_AS_NODE="1")
        return _exit_code(subprocess.run([zcode_bin, "--no-warnings", str(CLI_MJS), *sys.argv[1:]], env=env).returncode)
    node_bin = shutil.which("node")
    if node_bin:
        return _exit_code(subprocess.run([node_bin, "--no-warnings", str(CLI_MJS), *sys.argv[1:]]).returncode)
    print(
        "[zcodepro] 未找到 node，也未找到 ZCode 可执行文件。请安装 Node.js >= 22 或设置 ZCODEPRO_ZCODE_PATH。",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
