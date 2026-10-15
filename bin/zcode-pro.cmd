@echo off
rem ZCode Pro 启动器（Windows）
rem 优先用 ZCode 自带的 Node 运行时（ELECTRON_RUN_AS_NODE），无需安装 Node.js。
setlocal
set "SCRIPT_DIR=%~dp0"
set "APP_DIR=%SCRIPT_DIR%.."
set "ENTRY=%APP_DIR%\cli.mjs"

where node >nul 2>nul
if %errorlevel%==0 (
  node --no-warnings "%ENTRY%" %*
  exit /b %errorlevel%
)

set "ZCODE_BIN=%ZCODEPRO_ZCODE_PATH%"
rem 用户级 ZCODEPRO_ZCODE_PATH（安装脚本 -ZCodePath 写入）不会传播到已运行的资源
rem 管理器，进程环境变量缺失时从注册表兜底读取，免去注销/重启（issue #1）。
if not exist "%ZCODE_BIN%" for /f "tokens=2*" %%A in (
  'reg query "HKCU\Environment" /v ZCODEPRO_ZCODE_PATH 2^>nul'
) do if not exist "%ZCODE_BIN%" if exist "%%B" set "ZCODE_BIN=%%B"
if not exist "%ZCODE_BIN%" set "ZCODE_BIN=%LOCALAPPDATA%\Programs\ZCode\ZCode.exe"
if not exist "%ZCODE_BIN%" set "ZCODE_BIN=%PROGRAMFILES%\ZCode\ZCode.exe"
rem Custom install dir: look up App Paths in registry (per-machine then per-user).
if not exist "%ZCODE_BIN%" for /f "tokens=2*" %%A in (
  'reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\zcode.exe" /ve 2^>nul ^|^|
   reg query "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\zcode.exe" /ve 2^>nul'
) do if not exist "%ZCODE_BIN%" if exist "%%B" set "ZCODE_BIN=%%B"
rem 最后兜底：ZCode 的 NSIS 安装器不写 App Paths、卸载表 DisplayIcon 常指向
rem uninstallerIcon.ico，从其所在目录推导 ZCode.exe（win11 虚拟机实测，issue #1）。
rem 逐条验证存在性、取第一个有效命中。src/host/paths.mjs 与 scripts/install.ps1
rem 也各自实现卸载表定位（匹配方式不完全相同），改推导规则需三处同步。
if not exist "%ZCODE_BIN%" for /f "tokens=2*" %%A in (
  'reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall" /s /v DisplayIcon 2^>nul ^| findstr /i "zcode" ^|^|
   reg query "HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall" /s /v DisplayIcon 2^>nul ^| findstr /i "zcode" ^|^|
   reg query "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall" /s /v DisplayIcon 2^>nul ^| findstr /i "zcode"'
) do if not defined ZCODEPRO_UNINST_DIR if exist "%%~dpBZCode.exe" set "ZCODEPRO_UNINST_DIR=%%~dpB"
if defined ZCODEPRO_UNINST_DIR set "ZCODE_BIN=%ZCODEPRO_UNINST_DIR%ZCode.exe"
if not exist "%ZCODE_BIN%" (
  echo [zcodepro] neither node nor ZCode executable found. Install Node.js ^>= 22 or set ZCODEPRO_ZCODE_PATH. 1>&2
  rem 快捷方式静默启动时看不到控制台输出，同步落盘诊断日志（issue #1）；日志超 512KB 轮转
  if not exist "%USERPROFILE%\.zcode" mkdir "%USERPROFILE%\.zcode" >nul 2>nul
  for %%I in ("%USERPROFILE%\.zcode\zcodepro.log") do if exist "%%~I" if %%~zI GTR 524288 move /y "%%~I" "%%~dpnI.log.old" >nul 2>nul
  echo [%DATE% %TIME%] neither node nor ZCode executable found >> "%USERPROFILE%\.zcode\zcodepro.log"
  exit /b 1
)
set "ELECTRON_RUN_AS_NODE=1"
"%ZCODE_BIN%" --no-warnings "%ENTRY%" %*
exit /b %errorlevel%
