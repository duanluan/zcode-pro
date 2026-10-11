# ZCode Pro 一键安装（Windows）
# 默认：复制程序到 %LOCALAPPDATA%\ZCodePro，并在开始菜单创建“ZCode Pro”快捷方式
#       （快捷方式经 wscript 静默启动，不常驻控制台窗口；图标复用已安装的 ZCode）。
# 用法：powershell -ExecutionPolicy Bypass -File scripts\install.ps1 [-Desktop] [-ZCodePath <ZCode.exe>] [-Uninstall]
#   -Desktop              额外在桌面创建快捷方式
#   -ZCodePath <路径>     ZCode 安装在非默认目录时指定其 ZCode.exe 全路径；
#                         校验后持久化到用户环境变量（HKCU\Environment），卸载时清除
#   -Uninstall            卸载（删除程序与快捷方式）
param(
  [switch]$Desktop,
  [string]$ZCodePath = "",
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
  # -ZCodePath 持久化的用户环境变量一并清除
  Remove-ItemProperty -Path "HKCU:\Environment" -Name "ZCODEPRO_ZCODE_PATH" -ErrorAction SilentlyContinue
  Write-Host "[zcode-pro] 已卸载。"
  exit 0
}

# 自定义 ZCode 路径：校验并持久化。注意已运行的资源管理器不会继承新写入的用户
# 环境变量，启动器（zcode-pro.cmd / paths.mjs）会直接从注册表兜底读取，无需注销。
$customZcode = ""
if ($ZCodePath) {
  $customZcode = [IO.Path]::GetFullPath($ZCodePath)
  if (-not (Test-Path -LiteralPath $customZcode)) {
    throw "指定的 -ZCodePath 不存在: $customZcode"
  }
  if ((Split-Path -Leaf $customZcode) -ine "ZCode.exe") {
    throw "-ZCodePath 必须指向 ZCode.exe，当前: $customZcode"
  }
  New-ItemProperty -Path "HKCU:\Environment" -Name "ZCODEPRO_ZCODE_PATH" -Value $customZcode `
    -PropertyType String -Force | Out-Null
  Write-Host "[zcode-pro] 已保存自定义 ZCode 路径: $customZcode"
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
  # 图标来源用独立变量跟踪：$lnk.IconLocation 读回的是旧 .lnk 的值（非空），
  # 不能作为“本次未设置”的判断依据
  $iconSet = $false
  $iconCandidates = @("$env:LOCALAPPDATA\Programs\ZCode\ZCode.exe", "$env:ProgramFiles\ZCode\ZCode.exe")
  if ($customZcode) { $iconCandidates = @($customZcode) + $iconCandidates }
  foreach ($c in $iconCandidates) {
    if (Test-Path $c) { $lnk.IconLocation = $c; $iconSet = $true; break }
  }
  # Custom install dir: fall back to registry (App Paths per-machine/per-user,
  # then uninstall-table DisplayIcon) so the shortcut still gets ZCode's icon.
  if (-not $iconSet) {
    foreach ($key in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\zcode.exe',
                       'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\zcode.exe')) {
      $ap = Get-ItemProperty -Path $key -Name '(default)' -ErrorAction SilentlyContinue
      if ($ap) {
        $exe = [string]$ap.'(default)'
        $exe = $exe.Trim('"').Trim()
        if ($exe -and (Test-Path $exe)) { $lnk.IconLocation = $exe; break }
      }
    }
  }
  if (-not $iconSet) {
    foreach ($hive in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
                       'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall',
                       'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall')) {
      # DisplayName 实际形如 “ZCode 3.14.5”（带版本号），前缀匹配而非全等；
      # bin/zcode-pro.cmd 与 src/host/paths.mjs 也各自实现卸载表定位（此处按
      # DisplayName 匹配且同 hive 只取首个，与那两处不完全相同），改规则需同步
      $hit = Get-ChildItem $hive -ErrorAction SilentlyContinue |
        ForEach-Object { Get-ItemProperty $_.PSPath } |
        Where-Object { $_.DisplayName -like 'ZCode*' -and $_.DisplayIcon } |
        Select-Object -First 1
      if ($hit) {
        $exe = ([string]$hit.DisplayIcon).Trim() -replace ',\d+$', ''
        $exe = $exe.Trim('"')
        # NSIS 安装器的 DisplayIcon 常是 uninstallerIcon.ico：优先取同目录的 ZCode.exe
        if ($exe -match '\.ico$' -and (Test-Path $exe)) {
          $sibling = Join-Path (Split-Path -Parent $exe) 'ZCode.exe'
          if (Test-Path $sibling) { $exe = $sibling }
        }
        if (Test-Path $exe) { $lnk.IconLocation = $exe; break }
      }
    }
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
