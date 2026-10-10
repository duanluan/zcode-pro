@echo off
rem ZCode Pro 启动器（Windows）
rem 优先用 ZCode 自带的 Node 运行时（ELECTRON_RUN_AS_NODE），无需安装 Node.js。
setlocal
set "SCRIPT_DIR=%~dp0"
set "APP_DIR=%SCRIPT_DIR%.."
set "ENTRY=%APP_DIR%\cli.mjs"

where node >nul 2>nul
if %errorlevel%==0 (
  node "%ENTRY%" %*
  exit /b %errorlevel%
)

set "ZCODE_BIN=%ZCODEPRO_ZCODE_PATH%"
if not exist "%ZCODE_BIN%" set "ZCODE_BIN=%LOCALAPPDATA%\Programs\ZCode\ZCode.exe"
if not exist "%ZCODE_BIN%" set "ZCODE_BIN=%PROGRAMFILES%\ZCode\ZCode.exe"
rem Custom install dir: look up App Paths in registry (per-machine then per-user).
if not exist "%ZCODE_BIN%" for /f "tokens=2*" %%A in (
  'reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\zcode.exe" /ve 2^>nul ^|^|
   reg query "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\zcode.exe" /ve 2^>nul'
) do if not exist "%ZCODE_BIN%" if exist "%%B" set "ZCODE_BIN=%%B"
if not exist "%ZCODE_BIN%" (
  echo [zcodepro] 未找到 node，也未找到 ZCode 可执行文件。请安装 Node.js ^>= 22 或设置 ZCODEPRO_ZCODE_PATH。 1>&2
  exit /b 1
)
set "ELECTRON_RUN_AS_NODE=1"
"%ZCODE_BIN%" "%ENTRY%" %*
exit /b %errorlevel%
