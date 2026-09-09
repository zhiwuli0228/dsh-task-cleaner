# Closed-Loop Engineering Workflow

每个 Requirement 必须沿同一状态机推进：

```text
frame → plan → superspec → eval-red → implement → review → verify → trace → gate → accepted
                         ↑          │         │          │
                         └──────────┴─────────┴──────────┘ feedback
```

## States and mandatory outputs

1. **Frame**：稳定 Requirement ID、目标、非目标、范围、风险等级和 Human Gate 条件。
2. **Plan**：依赖、实施步骤、验证策略、回滚与停止条件；计划变化必须记录原因。
3. **Superspec**：行为、边界、错误、timeout、limits、安全、兼容性、可观测性和 WHEN/THEN 场景。
4. **Eval Red**：先建立失败的自动测试、可执行 Eval 或明确的外部验收程序；声明式 YAML 只能算 baseline。
5. **Implement**：只实现 Superspec 和 Plan 覆盖的最小变更，禁止顺手扩张范围。
6. **Review**：独立记录 correctness、security、spec conformance、test adequacy、compatibility、maintainability 和 traceability。
7. **Verify**：记录环境、提交、命令/步骤、结果和所有 skipped checks；失败必须回流到最早受影响阶段。
8. **Trace**：更新 `docs/harness/traces/traceability-ledger.json`，保证 Requirement → Spec → Task → Code → Test/Eval → Trace 双向可查。
9. **Gate**：需要人工确认的变化必须存在明确决策记录；Agent 不得自行写入 Accepted。
10. **Accepted**：只有治理检查、必需验证和 Human Gate 全部通过后才能进入。

## Feedback rules

- Review 发现需求理解错误：返回 Frame 或 Superspec。
- Review 发现测试缺口：返回 Eval Red。
- Verify 发现实现缺陷：返回 Implement，并保留失败证据。
- 外部环境不可用：状态为 `acceptance_pending`，不得标记 accepted。
- 范围、安全、凭据、兼容性、ADR 或工具面变化：立即停止并请求 Human Gate。

## Governance root

本仓库的 Harness 治理唯一规范根是 `docs/harness/`。仓库根不得存在 `.harness/`；
`tools/governance/` 是治理校验器，`scripts/verify-harness.ps1` 是本仓库的本地完整入口。

## Entry command

```powershell
./scripts/verify-harness.ps1
```
