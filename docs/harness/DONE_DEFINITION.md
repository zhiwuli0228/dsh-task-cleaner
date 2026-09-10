# Definition of Done

## Implemented

Requirement 只有在以下条件全部满足时才能标记 `implemented`：

- Requirement ID 已进入追溯账本。
- Plan 和 Superspec 已完成并引用相同 Requirement ID。
- 规范行为具有自动测试或可执行 Eval，且包含失败路径。
- 代码通过 typecheck、lint、单元测试和构建。
- Review 无未解决的高严重度问题。
- Trace 已链接 Spec、Task、Code、Test/Eval 和实现记录。

## Accepted

在 `implemented` 基础上，还必须满足：

- 必需的真实环境、集成或 Golden E2E 已执行并留下可复现证据。
- 所有 skipped check 均不属于 acceptance requirement。
- Human Gate 已明确批准里程碑、ADR 状态及所有例外。
- `tools/governance` 校验无错误。

缺少真实环境或人工验收时只能标记 `acceptance_pending`。声明式 Eval、计划执行的 CI 或
“预期通过”都不能作为已执行证据。

## Prohibited completion claims

- 不得因代码已提交、PR 已合并或单元测试通过而声明里程碑完成。
- 不得把 Agent 写入文档的 `Accepted` 当作 Human Gate。
- 不得推断或补写没有原始记录的历史验证结果。
