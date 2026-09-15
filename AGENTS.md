# zcode-pro 项目约定

## 版本号策略（重要）

- 版本号三处保持一致：`package.json`、`src/host/helper.mjs` 的 `VERSION`、`packaging/aur/zcodepro/PKGBUILD` 的 `pkgver`。
- **未推送的改动不要动版本号**；决定推送（发布）时，在推送前一次性升级，同一批改动只升一次。
- 小改（修复/优化）升 patch，新功能升 minor；以用户可感知的变化为准。

## 发布链路（每次发布依次执行）

1. 三处版本号一次性升级 → commit → push main
2. `git tag vX.Y.Z` 并推送；`git archive --format=tar.gz --prefix='zcode-pro-X.Y.Z/' vX.Y.Z` 生成源码包
3. `gh release create vX.Y.Z <源码包>`（Release 说明面向用户，不提实现细节）
4. `../aur-packages` 仓库：更新 `packages/zcode-pro/PKGBUILD`（pkgver + 新 sha256sums）与 `.SRCINFO`（`makepkg --printsrcinfo`），commit + push
5. `../aur-packages/scripts/sync-aur-packages.sh zcode-pro` 推送 AUR（完成后用 AUR key `ls-remote` 确认 ref 前进；后台执行时注意核对，曾出现静默未推的情况，前台重跑即可）
6. 验证：Release 资产 URL 返回 200

## 其他约定

- 默认分支为 main（全局 `init.defaultBranch=main` 已设置）。
- README 面向用户：不口语化、不暴露实现细节、不设「开发」章节；提交信息可含技术细节。
- 提交信息格式：`<type>: 标题` + 中文功能项列表（`-` 逐条，项间空行）。
- README 中不得出现「CDP 注入 / DevTools 协议」等字样；CLI 选项表与源码注释除外。
- 测试脚本在 `/tmp/zcodepro-test/`（临时目录可能被系统清理，按需重建；t10=别名，t11=切换文件夹；导入路径以仓库实际路径为准）。
- 涉及弹窗/对话框的验证需真实 GUI，无法自动化时明确告知用户手动验证。
