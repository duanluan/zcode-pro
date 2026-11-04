@echo off
rem ZCode Pro 启动器（Windows）
rem 优先用 ZCode 自带的 Node 运行时（ELECTRON_RUN_AS_NODE），无需安装 Node.js；
rem ZCode 找不到或运行时预检跑不起来时回退系统 node（需要 >= 22，旧版缺全局 WebSocket）。
rem 退出码原样透出（脚本/CI 可靠判断成败），流程用 goto 串，避免括号块里
rem %errorlevel% 在解析期展开拿不到真实退出码。
setlocal
set "SCRIPT_DIR=%~dp0"
set "APP_DIR=%SCRIPT_DIR%.."
set "ENTRY=%APP_DIR%\cli.mjs"

rem —— 定位 ZCode 可执行文件（与 src/host/paths.mjs、scripts/install.ps1 的
rem 推导规则同步，改一处要三处一起改）——
rem 已知限制：reg query 对 REG_EXPAND_SZ 值返回未展开的 %VAR% 字面量（paths.mjs
rem 的 valueAfter 会展开）。cmd 里没有可靠的二次展开方式（call set 对本身含 % 的
rem 路径同样会拆坏），这里不展开；本项目安装脚本写的都是 REG_SZ，不受影响。
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
rem 逐条验证存在性、取第一个有效命中。
if not exist "%ZCODE_BIN%" for /f "tokens=2*" %%A in (
  'reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall" /s /v DisplayIcon 2^>nul ^| findstr /i "zcode" ^|^|
   reg query "HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall" /s /v DisplayIcon 2^>nul ^| findstr /i "zcode" ^|^|
   reg query "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall" /s /v DisplayIcon 2^>nul ^| findstr /i "zcode"'
) do if not defined ZCODEPRO_UNINST_DIR if exist "%%~dpBZCode.exe" set "ZCODEPRO_UNINST_DIR=%%~dpB"
if defined ZCODEPRO_UNINST_DIR set "ZCODE_BIN=%ZCODEPRO_UNINST_DIR%ZCode.exe"

rem —— 优先 ZCode 运行时：预检能跑再正式跑（预检失败说明运行时不可用，回退 node）——
if exist "%ZCODE_BIN%" (
  set "ELECTRON_RUN_AS_NODE=1"
  "%ZCODE_BIN%" -e "process.exit(0)" >nul 2>nul
  if not errorlevel 1 goto run_zcode
)

where node >nul 2>nul
if errorlevel 1 goto fail
node --no-warnings "%ENTRY%" %*
exit /b %errorlevel%

:run_zcode
"%ZCODE_BIN%" --no-warnings "%ENTRY%" %*
exit /b %errorlevel%

:fail
echo [zcodepro] Neither Node.js nor the ZCode executable was found. Install Node.js ^>= 22 or set ZCODEPRO_ZCODE_PATH. 1>&2
rem 快捷方式静默启动时看不到控制台输出，同步落盘诊断日志（issue #1）；日志超 524KB 轮转。
rem 日志目录与 src/host/main.mjs 的 winLog 保持一致（ZCODE_DATA_BASE_DIR 可迁移数据根）
set "ZP_LOGDIR=%ZCODE_DATA_BASE_DIR%\.zcode"
if "%ZP_LOGDIR%"=="\.zcode" set "ZP_LOGDIR=%USERPROFILE%\.zcode"
if not exist "%ZP_LOGDIR%" mkdir "%ZP_LOGDIR%" >nul 2>nul
for %%I in ("%ZP_LOGDIR%\zcodepro.log") do if exist "%%~I" if %%~zI GTR 524288 move /y "%%~I" "%%~dpnI.log.old" >nul 2>nul
echo [%DATE% %TIME%] neither node nor ZCode executable found >> "%ZP_LOGDIR%\zcodepro.log"
exit /b 1
