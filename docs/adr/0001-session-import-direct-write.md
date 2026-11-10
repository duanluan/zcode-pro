# 会话导入直接写会话库和任务索引

ZCode 自带的 Claude 历史迁移走 `session/create` 的 `importedHistory` 协议，但只接受 user/assistant 文字消息，来源枚举只有 `claudeCode` 和 `sharedContext`，无法表达 Codex、dsh、pi，也保留不了工具调用、图片和原始时间。因此 zcode-pro 的会话导入选择直接写 `~/.zcode/cli/db/db.sqlite` 的 `session` / `message` / `part`，再写 `~/.zcode/v2/tasks-index.sqlite` 的 `tasks` 与分组记账行，写入结构仿照官方导入和现有任务。

## Considered Options

- 复用官方 `importedHistory` 协议：来源和内容都受限，放弃。
- 只写会话库，等任务索引同步器补任务行：有延迟，受每工作区 200 条限制，同步字段也不可控，放弃。
- 修改 `zcode.cjs` 增加来源枚举：升级会被覆盖，放弃。

## Consequences

- 需要跟着 ZCode 的两套 SQLite 表结构走，客户端升级后要回归。这和现有的切换文件夹功能是同一类风险。
- 两个库不能放在同一个事务里，写入顺序固定为会话库在前；任务索引写入失败时删掉刚写的会话行。
- 写完不会自动刷新界面，导入完成后只弹提示，任务在下次打开或刷新后出现。
