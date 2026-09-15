# PingPang Hook

本地系统声音 Hook：为 Codex 和 Claude Code 的审批请求提供「黑名单外自动放行、命中黑名单时响铃等待人工审批」的能力，并在代理完成本轮时播放完成音。

## 运行

```bash
npm test                                      # node:test，22 个用例
npx pingpang-hook [install] [--home dir]      # 安装/迁移到真实或指定 HOME
npx pingpang-hook uninstall [--home dir]
node scripts/install.mjs [--home dir]         # 源码仓库中的等价入口
node scripts/uninstall.mjs [--home dir]
```

无构建步骤、无生产依赖；开发测试使用 `c8`。脚本要求 Node ≥ 18（ESM、`node:` 前缀导入）。

## 目录与约定

- `bin/pingpang-sound` — Hook 本体。按 `argv[2]` 分模式：`codex-approval`、`claude-approval`（黑名单判断 + 放行 JSON + 审批日志）、`approval`（仅响铃的遗留模式）、`complete`（完成音）。
- `bin/pingpang-hook.mjs` — npm/npx 公共 CLI；默认 `install`，支持 `uninstall`、`--home` 和帮助信息。
- `scripts/config.mjs` — 安装/卸载逻辑；对用户配置**合并而非覆盖**，已有命令与期望不一致时原地迁移。
- `scripts/install.mjs` / `scripts/uninstall.mjs` — CLI 入口。
- `test/` — 冒烟式测试：通过 `spawnSync` 直接驱动脚本，断言 stdout/退出码；测试里把 `HOME` 固定到临时目录。

关键不变量（改动时必须保持）：

1. `codex-approval` 的外部行为不允许变化——它已被线上 `~/.codex/hooks.json` 使用。
2. 黑名单正则出错时只能「不放行 + 响铃」，绝不能变成自动批准。
3. 安装器幂等：重复运行不新增、不破坏用户已有配置；首次变更前留 `.pingpang-hook.bak`。
4. 平台配置路径：Codex `~/.codex/hooks.json`；Claude Code `~/.claude/settings.json`；共享数据在 `~/.pingpang-hook/`（脚本 + `blacklist` + `hook.log` 审批日志）。
5. 黑名单来源按叠加顺序：内置模式（始终生效）→ `~/.pingpang-hook/blacklist`（目前仅 `claude-approval` 读取）→ `PINGPANG_APPROVAL_BLACKLIST` 环境变量。
6. 审批日志只进文件、不进审批链路：每次审批请求向 `~/.pingpang-hook/hook.log` 追加一行 JSON（`source` 区分平台）；写日志失败必须静默忽略，绝不能改变 stdout/stderr/退出码或审批决定；超过约 5 MB 时滚动为 `hook.log.1`。

## 当前状态与下一步

- Claude Code 已启用全部机制（自动放行 + 黑名单文件 + plan mode 保护）。
- Codex 仅启用自动放行；**有意暂不读取黑名单文件**，待用户验证稳定后放开：去掉 `bin/pingpang-sound` 中 `blacklistPatterns()` 里的 `event === "claude-approval"` 门控（代码内有注释标记）。
- 放行输出两端格式一致：`{hookSpecificOutput:{hookEventName:"PermissionRequest",decision:{behavior:"allow"}}}`。
- 审批日志已对两端启用：所有审批请求记入 `~/.pingpang-hook/hook.log`（JSONL，`source` 字段区分 `codex`/`claude`），用于复盘和确定黑名单。
- npm 包 `pingpang-hook@0.1.0` 的公开包元数据、`bin` 入口和发布白名单已就绪；正式发布仍待 npm 账号认证后执行，当前不能视为 live verified。
