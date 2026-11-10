# 第二实例虚拟屏 UI 测试

在不打扰正在使用的 ZCode 实例的前提下，起一个隔离的第二实例做设置弹窗与功能的端到端测试：真实点击界面、截图核对、验证配置写入和 MCP 加载。整套流程零模型调用（截图核对可借 zcode-vision 的 `vision_ask` 代看）。

## 三个关键机制（踩过的坑）

1. **单实例锁在默认 userData**。锁文件是 `~/.config/ZCode/SingletonLock`，光给 `--user-data-dir` 挪不走它，第二实例会静默退出（退出码 0、日志无报错）。必须用 `XDG_CONFIG_HOME` 把 userData 整体挪走，第二实例才开得起来。
2. **要套用当前配置**。用 `ZCODE_DATA_BASE_DIR` 指向 `~/.zcode` 的一份拷贝；全新数据根会停在首页（登录/初始化状态），进不到会话。拷贝时剔掉大缓存即可：`v2/checkpoints`、`v2/logs`、`cli/artifacts`、`cli/log`、`cli/image-cache`（约 7.8G 剔到 2.5G）。
3. **`~/.zcode/cli/config.json`（用户级配置）固定读 home**，不随 `ZCODE_DATA_BASE_DIR` 迁移。已实测：改数据根拷贝里的这份文件，`zcode plugins list` 读的仍是 home 那份。功能代码里写这个文件按 home 定位（同 `zcodeDataRoot()` 的做法）才不会写错地方。

## 步骤

```bash
# 1) 拷数据根（套用当前配置）
mkdir -p /var/tmp/ztest/base
rsync -a --exclude='v2/checkpoints/' --exclude='v2/logs/' --exclude='cli/artifacts/' \
      --exclude='cli/log/' --exclude='cli/image-cache/' \
      ~/.zcode/ /var/tmp/ztest/base/.zcode/

# 2) 虚拟屏
Xvfb :99 -screen 0 1600x1000x24 &

# 3) 第二实例（端口、目录按需换；setsid 让它脱离终端存活）
setsid nohup env DISPLAY=:99 \
  XDG_CONFIG_HOME=/var/tmp/ztest/config \
  ZCODE_DATA_BASE_DIR=/var/tmp/ztest/base \
  /opt/ZCode/zcode --remote-debugging-port=9444 \
  --user-data-dir=/var/tmp/ztest/udata --disable-gpu \
  > /var/tmp/ztest/zcode.log 2>&1 < /dev/null &

# 4) 等 CDP 就绪后注入 zcode-pro（仓库源码即改即生效）
curl -s --max-time 3 http://127.0.0.1:9444/json/version   # 有输出即就绪
ZCODE_DATA_BASE_DIR=/var/tmp/ztest/base ZCODEPRO_DEV=1 \
  node cli.mjs --inject-only --cdp-port 9444 --helper-port 47901 &
```

## 驱动 UI（scripts/cdp-drive.mjs）

```bash
node scripts/cdp-drive.mjs pages                    # 看页面 target
node scripts/cdp-drive.mjs shot 01-initial          # 截图
node scripts/cdp-drive.mjs eval "document.title"    # 页面里执行 JS
node scripts/cdp-drive.mjs rightclick-gear          # 右键齿轮开增强设置弹窗
node scripts/cdp-drive.mjs click-text "Headroom"    # 切 tab（文本全匹配）
node scripts/cdp-drive.mjs row-state "Serena"       # 读设置行开关状态
node scripts/cdp-drive.mjs toggle-row "Serena"      # 点设置行翻转开关
```

关键选择器：齿轮入口 `data-testid="task-settings-button"`（右键才弹增强弹窗，左键是原生设置）；弹窗 `[data-zcodepro-settings]`；tab 按钮 `button[role=tab]`；开关轨道 `[data-zcodepro-switch]` 的 `data-state` 就是开/关。

## 验证生效

- 配置写入：直接读 `~/.zcode/cli/config.json`（home 那份，见上文机制 3）。
- MCP 加载：测试实例里点开一个已有会话（`task-item-*` 元素），然后 `ps` 找该会话拉起的 MCP 进程、看参数；serena 激活的项目看 `~/.serena/logs/<日期>/*.txt` 里的 `RegisteredProject[project_root=...]`。
- 截图核对：模型看不了图时，把截图路径交给 zcode-vision 的 `vision_ask` 代看。

## 清理

按 pid 精确杀测试实例进程树、`Xvfb :99`、注入进程；不要碰正在用的主实例（它的 serena 进程和测试实例的同名，按 ppid 区分）。沙箱大件（base/config/udata）可删，截图和日志留着做证据。
