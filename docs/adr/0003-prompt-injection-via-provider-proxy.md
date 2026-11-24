# 提示词注入经供应商代理改写请求体实现

参考项目 chiina66/zcode-prompt-inject 的做法是改官方源码重新打包，在 `ContextBuilder` 里加一个 `# Global System Prompt` 稳定段。zcode-pro 不改客户端文件，这条路用不了：本机官方构建（3.16）的 `setting.json` 里没有 `globalSystemPrompt`，也没有追加提示词的启动参数或环境变量；内部的 `customSystemPrompt` 是替换语义，设了它官方身份段和 Harness 说明整段消失，不是追加。决策：提示词注入放在 zcode-pro 自己的供应商代理里，转发请求之前把正文追加到已有的 system 内容末尾。只对走本机转发的供应商生效。

## Considered Options

- 写 `~/.zcode/AGENTS.md`：官方把它作为 `injectionTarget:"meta_user"` 的段注入，实际效果是在对话层插入 `<system-reminder>`，到不了 system 层，放弃。
- 走官方 `UserPromptSubmit` 钩子返回 `additionalContext`：每轮都会执行，也不用碰代理，但实际效果同样是在对话层插入系统提醒，还要用户单独授信任，放弃。
- 修改 `~/.zcode/v2/setting.json` 的提示词字段：本机构建里没有可追加的字段，`customSystemPrompt` 会顶掉官方身份段，放弃。
- 改 `zcode.cjs`：升级被覆盖，和“不改客户端文件”的定位冲突，放弃。

## Consequences

- 只有开启供应商代理的供应商才带着这段正文。打开注入时需要同时开启该供应商的转发，这会改写 `v2/config.json` 与 `v2/provider_config.json` 里的 baseUrl（改写前留 `.zcodepro-backup`）。
- 代理从“纯转发”变成“可选的请求改写”：要缓冲完整请求体、按实际请求形态解析、改完再发。请求侧的流式上传失去意义；响应侧 SSE 按块转出不变。
- 各家请求体格式不同（OpenAI 风格把 system 放在 messages 里，Anthropic 用顶层 `system` 字符串），追加逻辑要按实际见到的形态分别处理。
- 修改正文后下一次请求就带上新内容，不需要重启，也不需要新开会话。
- 支持三种协议：Anthropic messages（顶层 `system`，字符串或内容块数组）、OpenAI chat completions（`messages` 里的 system 消息）、OpenAI responses（`input` 里的 system/developer 消息）。按请求体形状判断，不看供应商配置里的协议字段——同一供应商的不同接口形状可能不同。
- 追加时不加任何包裹标记，用户自己写的正文是什么样就追加什么；想要分节标题由用户自己在正文里写。
- 只处理带对话的请求（有 system 内容且有非空 messages）。计 token 之类的附带请求原样转发。
- 主对话与子代理的区分依据是 system 内容里有没有 `# Harness`：主对话有，子代理（`Zic` 组装的 system）没有。默认只注入主对话，用户可在界面上放开到子代理。
- 界面上不提供“移除官方安全说明段”的选项，默认也不做。移除 `SECURITY_NOTICE` 的效果只有降低模型对破坏性请求的拒绝意愿，不在这个工具的范围内。
