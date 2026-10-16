# 2026-10-16 发布前验证

- SDK 原有 59 项单元测试与严格消费者声明检查均通过。
- 同一套 59 项测试也在 Harness 实际使用的 Node 24.18.1 下通过。
- 已将 npm pack 产物接入本机 DSH 插件，补齐 13 个新 API 的 wrapper、service、DSH 与 MCP 工具，总工具数 23。
- 插件 972 项测试全部通过；Node 24 下关键 138 项通过。
- 安装后的中国区、国际区各 13 个 API 调用通过，26 次 MCP 对照一致，原 profile / 活动 / 睡眠共 6 项通过。中国区首轮连接异常、无重新登录的第二轮通过，首轮根因未确认。
- 已修正仓库 metadata，并将 build 改为跨平台的 `tsc --build --clean && tsc`。

完整结果见插件开发 worktree 的 `docs/testing/health-release-readiness-2026-10-16.md`；脱敏机器证据为同目录的 `health-release-evidence-2026-10-16.json`。

维护包现已标识为 `@likenttt/garmin-connect@1.7.0`，并提供 Git 安装所需的 `prepare` 构建。插件将以 `garmin-connect` 依赖键锁定本仓库的不可变 Git 提交，避免依赖尚未发布的 scoped npm 包。Git 源的干净安装结果以插件的最终报告为准。本轮未发布 npm。
