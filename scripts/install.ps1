# ZCode Pro 一键安装（Windows）
# 默认：复制程序到 %LOCALAPPDATA%\ZCodePro，并在开始菜单创建“ZCode Pro”快捷方式
#       （快捷方式经 wscript 静默启动，不常驻控制台窗口；图标复用已安装的 ZCode）。
# 用法：powershell -ExecutionPolicy Bypass -File scripts\install.ps1 [-Desktop] [-Uninstall]
#   -Desktop    额外在桌面创建快捷方式
#   -Uninstall  卸载（删除程序与快捷方式）
param(
  [switch]$Desktop,
  [switch]$Uninstall
)
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $env:LOCALAPPDATA "ZCodePro"
$startMenu = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\ZCode Pro.lnk"
$desktopDir = [Environment]::GetFolderPath("Desktop")
$desktopLnk = Join-Path $desktopDir "ZCode Pro.lnk"

if ($Uninstall) {
  Remove-Item -Recurse -Force $dest -ErrorAction SilentlyContinue
  Remove-Item $startMenu -ErrorAction SilentlyContinue
  Remove-Item $desktopLnk -ErrorAction SilentlyContinue
  Write-Host "[zcode-pro] 已卸载。"
  exit 0
}

if (-not (Test-Path "$repo\dist\inject.js")) {
  throw "缺少 dist\inject.js：请使用完整仓库（含构建产物）运行本脚本。"
}

# 1. 程序文件
New-Item -ItemType Directory -Force -Path "$dest\dist" | Out-Null
Copy-Item -Recurse -Force "$repo\bin" $dest
Copy-Item -Recurse -Force "$repo\src" $dest
Copy-Item -Force "$repo\cli.mjs", "$repo\package.json", "$repo\LICENSE" $dest
Copy-Item -Force "$repo\dist\inject.js" "$dest\dist\"

# 2. 快捷方式
# 优先经 wscript+vbs 静默启动；部分机器（精简系统/安全软件/组件禁用）WSH 的
# WScript.Shell.Run 报 0x800A01AD，检测到即降级为 cmd 最小化启动（不依赖 WSH，
# 代价是启动瞬间任务栏短暂闪一个最小化控制台）
$wsh = $null
$wshOk = $false
try {
  $wsh = New-Object -ComObject WScript.Shell
  $wsh.Run("cmd /c exit 0", 0, $true) | Out-Null
  $wshOk = $true
} catch {
  if (-not $wsh) {
    Write-Host "[zcode-pro] 本机无法创建快捷方式（WScript.Shell 不可用）。"
    Write-Host "  可直接运行 $dest\bin\zcode-pro.cmd 启动，或先修复 Windows Script Host 后重装。"
    throw
  }
  Write-Host "[zcode-pro] 注意：本机 Windows Script Host 异常，快捷方式将改用 cmd 方式启动（启动时会短暂显示最小化控制台窗口）。"
}
function New-ZcodeProShortcut([string]$path) {
  $lnk = $wsh.CreateShortcut($path)
  if ($wshOk) {
    # 经 wscript 静默启动 vbs → cmd → node，避免常驻控制台窗口
    $lnk.TargetPath = "$env:SystemRoot\System32\wscript.exe"
    $lnk.Arguments = "`"$dest\bin\zcode-pro.vbs`""
  } else {
    $lnk.TargetPath = "$env:SystemRoot\System32\cmd.exe"
    $lnk.Arguments = "/c start `"ZCodePro`" /min `"$dest\bin\zcode-pro.cmd`""
    $lnk.WindowStyle = 7
  }
  $lnk.WorkingDirectory = "$dest"
  $lnk.Description = "ZCode 桌面版增强启动器（自定义别名等，不修改客户端文件）"
  foreach ($c in @("$env:LOCALAPPDATA\Programs\ZCode\ZCode.exe", "$env:ProgramFiles\ZCode\ZCode.exe")) {
    if (Test-Path $c) { $lnk.IconLocation = $c; break }
  }
  $lnk.Save()
}
if ($wsh) {
  New-ZcodeProShortcut $startMenu
  if ($Desktop) { New-ZcodeProShortcut $desktopLnk }
}

Write-Host "[zcode-pro] 安装完成：$dest"
Write-Host "  开始菜单已新增“ZCode Pro”；点它即带增强启动 ZCode。"
Write-Host "  用原版 ZCode 图标启动则不带增强（此时 zcode-pro 会提示先关闭原版再经它启动）。"
