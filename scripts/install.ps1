# ZCode Pro 一键安装（Windows）
# 默认：复制程序到 %LOCALAPPDATA%\ZCodePro，并在开始菜单创建「ZCode Pro」快捷方式
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
$wsh = New-Object -ComObject WScript.Shell
function New-ZcodeProShortcut([string]$path) {
  $lnk = $wsh.CreateShortcut($path)
  # 经 wscript 静默启动 vbs → cmd → node，避免常驻控制台窗口
  $lnk.TargetPath = "$env:SystemRoot\System32\wscript.exe"
  $lnk.Arguments = "`"$dest\bin\zcode-pro.vbs`""
  $lnk.WorkingDirectory = "$dest"
  $lnk.Description = "ZCode 桌面版增强启动器（CDP 注入，不修改应用文件）"
  foreach ($c in @("$env:LOCALAPPDATA\Programs\ZCode\ZCode.exe", "$env:ProgramFiles\ZCode\ZCode.exe")) {
    if (Test-Path $c) { $lnk.IconLocation = $c; break }
  }
  $lnk.Save()
}
New-ZcodeProShortcut $startMenu
if ($Desktop) { New-ZcodeProShortcut $desktopLnk }

Write-Host "[zcode-pro] 安装完成：$dest"
Write-Host "  开始菜单已新增「ZCode Pro」；点它即带增强启动 ZCode。"
Write-Host "  用原版 ZCode 图标启动则不带增强（此时 zcode-pro 会提示先关闭原版再经它启动）。"
