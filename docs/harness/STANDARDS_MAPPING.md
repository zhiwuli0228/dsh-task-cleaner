# dsh-task-cleaner 标准来源清单与既有标准 → 本项目结构映射

本文档是 LZWW-2「建立 Harness 标准框架基线」的标准盘点与映射的仓库内正本
（canonical copy）。设计阶段的逐项映射结论原载于 Multica issue 评论
（ProductAnalysisAgent，2026-09-09）；评审要求证据可脱离平台核验，故落库
于此。标准来源项目仅用于语义、流程、门禁与证据链标准，不复制其 Go 技术栈
或根级 `.harness/` 布局。

## 1. 标准来源清单

参考标准项目：`E:\009workspace\codex\dv-troubleshooting`（盘点时本机访问，
Go 项目，含完整 closed-loop engineering 标准基线）。其治理语义映射如下，
原始绝对路径仅作为发现期访问记录，不作为仓库内引用。

| 来源（参考项目） | 语义/职责 | 本项目映射目标 |
|---|---|---|
| `AGENTS.md`（根） | 代理入口指南、必读顺序、不可协商规则 | `AGENTS.md`（根，适配改写，引用重定向至 `docs/harness/`） |
| `.harness/WORKFLOW.md` | 闭环工作流状态机与反馈回流 | `docs/harness/WORKFLOW.md` |
| `.harness/DONE_DEFINITION.md` | 完成定义（implemented vs accepted） | `docs/harness/DONE_DEFINITION.md` |
| `.harness/CHECKLIST.md` | 评审清单（六段双向可追溯等） | `docs/harness/CHECKLIST.md` |
| `.harness/TOOL_POLICY.md` | 工具策略（只读默认、破坏性需人授权） | `docs/harness/TOOL_POLICY.md` |
| `.harness/closed-loop-registry.json` | 变更登记 `change_id → state_path → covered_paths` | `docs/harness/closed-loop-registry.json` |
| `.harness/human-gates.json` | 人工门禁决策记录 | `docs/harness/human-gates.json` |
| `.harness/traceability.schema.json` | 追溯账本 JSON Schema（六段） | `docs/harness/traceability.schema.json` |
| `.harness/discovery-baseline.json` | 基线发现 | `docs/harness/discovery-baseline.json` |
| `.harness/templates/*`（6 个） | 阶段模板 | `docs/harness/templates/*` |
| `.harness/task-templates/*`（2 个） | 任务模板 | `docs/harness/task-templates/*` |
| `.harness/changes/<id>/` | 每个变更的完整证据链 | `docs/harness/changes/<id>/`（含 `state.json`） |
| `.harness/snapshots/*` | 哈希命名状态/账本快照 | `docs/harness/snapshots/*` |
| `.codex/skills/closed-loop-engineering/` | 闭环技能 + `check_workflow.py` 校验器 | `.codex/skills/closed-loop-engineering/`（SKILL.md 指针）+ `tools/governance/`（TS 校验器） |
| `scripts/verify-harness.ps1` | 本地校验入口 | `scripts/verify-harness.ps1`（目标路径改为 `docs/harness/`；Go 步骤替换为 TS 等价） |
| `cmd/harness-check/main.go` | 追溯校验器 | `tools/governance/`（TS：load/validate/validateAcceptedDocuments/layoutGuard） |
| `openspec/` | spec-driven 变更结构 | `openspec/`（根级，开放问题 #1 裁决） |
| `evals/` | 声明式可执行验收 | `evals/`（根级，开放问题 #1 裁决） |
| `docs/09-traces/` | 决策/审计/评测/实现/评审/追踪 | `docs/harness/traces/` |
| `docs/09-traces/traceability-ledger.json` | 追溯账本 | `docs/harness/traces/traceability-ledger.json`（开放问题 #2 裁决） |
| `go.mod`/`go.sum`/`cmd/*`/`internal/*` | Go 技术栈 | 不复制（TypeScript/Node/ESM + tsc + vitest） |
| `.harness` 根级位置 | 治理根位于仓库根 | 不照搬；治理根为 `docs/harness/` |

## 2. 变更证据链文件集

单个变更目录 `docs/harness/changes/<id>/` 的证据链遵循参考项目文件集语义：

`classification.md → brainstorm.md → implementation-plan.md → superspec.md →
eval-red-*.md → implementation-*.md → plan-review/plan-gate → design-review/
design-gate → code-review-* → adoption-gate-* → openspec-mapping.md →
verification-*.md → trace-*.md → workflow-readiness-*.md → state.json`

对应闭环相位机（`tools/governance/workflow-checker.ts`）：
`registered → brainstormed → plan_reviewed → plan_confirmed → design_reviewed
→ design_confirmed → eval_red → implemented → code_reviewed → verified →
traced → workflow_ready`。本里程碑按门禁只推进到 `registered`，Review/Verify
与 human gate 证据齐备后才继续推进。

## 3. 防回归门禁（强制布局落地保障）

- Harness 校验脚本与 `verify-harness.ps1` 针对 `docs/harness/` 路径工作。
- 测试/CI 断言仓库根不存在 `.harness/`，并断言 Harness 工件全部落在
  `docs/harness/` 下（`tools/governance/layout-guard.ts`）。
- 不引入 Go 工具链；构建/校验统一走 npm 脚本与 TypeScript。

## 4. 开放问题裁决记录（设计阶段）

| # | 问题 | 裁决 | 记录位置 |
|---|---|---|---|
| 1 | openspec/evals 落位 | 根级 `openspec/`、`evals/`（工具约定，非治理框架） | ADR-001 |
| 2 | traceability-ledger 落位 | `docs/harness/traces/traceability-ledger.json` | ADR-001/005；DataEngineer 数据契约 |
| 3 | TS 校验器模块边界 | `tools/governance/` 库 + CLI，不进 `src/` | ADR-005 |
| 4 | check_workflow 工具链 | TS 移植（`tools/governance/workflow-checker.ts`） | ADR-005；DevOpsAgent |
| 5 | skill 打包形态 | 仓库规范 `.codex/skills/closed-loop-engineering/`（SKILL.md 指针） | ADR-005；DevOpsAgent |

## 5. 与验收条件的对应

- install/build/typecheck/lint/test 与 `verify-harness.ps1` 全绿为本地门禁。
- 插件在锁定 DSH `0.1.2-rc.1` headless profile 中可加载（ADR-003）。
- 仓库不存在可执行的生产级永久删除路径/API（S-07）。
- realpath/workspace 边界/symlink/Git tracked-file 保护以端口接口与测试
  基架表达；真实只读谓词与负向矩阵的里程碑归属见 LZWW-2 范围裁决。
- 除 `src/adapter/dsh/` 外，业务模块不直接依赖 DSH 内部实现。
- ADR-001..005 状态为 Proposed，经 human gate 后转 Accepted。
