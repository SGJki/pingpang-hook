# PingPang Hook

给 Codex 和 Claude Code 的本地系统声音 Hook：

- Codex 和 Claude Code 的命令型审批请求如果不命中黑名单，自动批准，不限制工具名称。
- 命中黑名单或非命令型审批请求时，播放 `Glass`，继续等待人工审批。
- Claude Code 处于 plan mode 时从不自动放行，一律提示人工审批。
- 代理完成本轮工作时，播放 `Hero`。

macOS 使用系统自带 `afplay` 和 `/System/Library/Sounds`，不需要安装依赖。Linux 会尝试 `paplay`，最后回退到终端响铃。

## 安装

```bash
node scripts/install.mjs
```

安装程序会把音效脚本放到 `~/.pingpang-hook/bin/pingpang-sound`，并以合并方式更新：

- `~/.codex/hooks.json`
- `~/.claude/settings.json`

已有 JSON 文件首次变更前会保留为同目录的 `.pingpang-hook.bak`。重复运行不会重复添加 Hook。

Codex 第一次启动时会要求在 `/hooks` 中审阅并信任新 Hook；这是 Codex 的安全机制。

安装后如果已存在旧 Hook 配置，请重新运行安装命令，让旧配置迁移到新的审批模式。

## 卸载

```bash
node scripts/uninstall.mjs
```

卸载仅删除本项目添加的命令 Hook，不会删除或覆盖已有的其他配置；保留的 `~/.pingpang-hook` 目录可手动删除。

## 自定义音效

安装后，用环境变量替换对应音效文件：

```bash
export PINGPANG_APPROVAL_SOUND=/System/Library/Sounds/Basso.aiff
export PINGPANG_COMPLETE_SOUND=/System/Library/Sounds/Glass.aiff
```

## 审批黑名单

Hook 内置以下高风险命令模式：`sudo`、`rm`、`git push`、`git reset --hard`、`git clean`、系统关机/重启、递归 `chmod`，以及将下载内容直接交给 shell 执行。

可以通过环境变量追加正则模式，每行一个（也支持逗号分隔）：

```bash
export PINGPANG_APPROVAL_BLACKLIST=$'deploy\\s+production\nterraform\\s+apply'
```

命令模式区分大小写不敏感。黑名单配置正则格式错误时，Hook 会放弃自动批准并播放提示音。

## 事件映射

| 工具 | 审批提示 | 完成提示 |
| --- | --- | --- |
| Codex | `PermissionRequest`（所有命令型请求） | `Stop` |
| Claude Code | `PermissionRequest`（所有命令型请求） | `Stop` |

`PermissionRequest` 在审批弹窗出现前立即执行。`Stop` 表示该代理已经结束当前响应；它不是退出整个终端会话才触发的事件。

Claude Code 的 `PermissionRequest` Hook 需要 Claude Code ≥ 2.0.45；自动放行时审批弹窗被直接跳过，会话中显示为 “Allowed by PermissionRequest hook”。两个平台的放行输出格式相同，黑名单判断逻辑也完全一致。

## 验证

```bash
npm test
```
