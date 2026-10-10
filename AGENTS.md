# zcode-pro 项目约定

## 版本号策略（重要）

- 版本号四处保持一致：`package.json`、`src/host/helper.mjs` 的 `VERSION`、`zcode_pro/__init__.py` 的 `__version__`、`packaging/aur/zcodepro/PKGBUILD` 的 `pkgver`。
- **未推送的改动不要动版本号**；决定推送（发布）时，在推送前一次性升级，同一批改动只升一次。
- **修复刚发布版本自身的问题（回归/样式补丁）时，覆盖当前版本**：同版本号重打 tag、覆盖 Release 资产、AUR 升 pkgrel，而不是新开版本号；只有面向用户的新功能/独立修复才升版本。
- 小改（修复/优化）升 patch，新功能升 minor；以用户可感知的变化为准。

## 发布链路（每次发布依次执行）

1. 三处版本号一次性升级 → commit → push main
2. `git tag vX.Y.Z` 并推送；`git archive --format=tar.gz --prefix='zcode-pro-X.Y.Z/' vX.Y.Z` 生成源码包
3. `gh release create vX.Y.Z <源码包>`（Release 说明面向用户，不提实现细节）
4. `../aur-packages` 仓库：更新 `packages/zcode-pro/PKGBUILD`（pkgver + 新 sha256sums；如有变更需同步 `packaging/aur/zcodepro/` 下的 `zcode-pro.install` 等附带文件）与 `.SRCINFO`（`makepkg --printsrcinfo`），commit + push
5. `../aur-packages/scripts/sync-aur-packages.sh zcode-pro` 推送 AUR（完成后用 AUR key `ls-remote` 确认 ref 前进；后台执行时注意核对，曾出现静默未推的情况，前台重跑即可）
6. 验证：Release 资产 URL 返回 200

## 发布 npm / PyPI（tag 推送后自动执行）

- 推送 `vX.Y.Z` tag 会触发 `.github/workflows/publish.yml`：npm 与 PyPI 两个 job 各自校验版本号一致、已发布则自动跳过；也可在 Actions 页面手动 `workflow_dispatch` 补发当前版本（用于密钥配好后补发存量版本）。
- 依赖仓库密钥 `NPM_TOKEN`（Granular 令牌，需勾选 Bypass 2FA，包范围先给 All packages，包名存在后可收敛为仅 zcode-pro）与 `PYPI_API_TOKEN`（PyPI API token），缺任一则对应 job 失败，配好后手动触发即可。
- npm 发布过程中 registry 会短暂出现 `0.0.0-stage` 占位版本，属正常暂存现象，稍后自动变为真实版本，无需人工确认。
- 本地验证打包：`npm pack`（应含 dist/inject.js 等）；`python -m build --outdir dist-py` 后将 wheel 装入虚拟环境跑 `zcode-pro --help`。

## 其他约定

- 默认分支为 main（全局 `init.defaultBranch=main` 已设置）。
- README 面向用户：不口语化、不暴露实现细节、不设“开发”章节；提交信息可含技术细节。
- README 中不得出现“CDP 注入 / DevTools 协议”等字样；CLI 选项表与源码注释除外。
- 测试脚本在 `/tmp/zcodepro-test/`（临时目录可能被系统清理，按需重建；t10=别名，t11=切换文件夹，t12=全局提示词；导入路径以仓库实际路径为准）。
- 涉及弹窗/对话框的验证需真实 GUI，无法自动化时明确告知用户手动验证。
