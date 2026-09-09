# dsh-task-cleaner UX Shell 与交互契约（框架基线版）

## 1. 文档定位与范围

本文档是 UXDesignAgent 在“建立 Harness 标准框架基线（暂不实现清理业务）”中的设计阶段产物，供 FrontendDeveloperAgent 实现、TestAgent 验证，并经 ArchitectureAgent ADR 集成。

交付范围：

- 用户角色与核心用户旅程（J1–J5）。
- 命令级、候选项级、视图级交互状态机。
- CLI shell 契约（命令面、退出码、JSON 信封、文本输出、确认语义）。
- Web UI shell 契约（信息架构、页面结构、空/错/忙状态、响应式、可访问性）。
- View-model 契约（TS 类型、领域契约映射、UI 端口、实现规则）。

明确不做：

- 不实现、不规定真实扫描 / 隔离 / 恢复 / 删除业务算法。
- 不设计生产级永久删除路径：本基线的 CLI 命令面、Web 路由、view-model 中均不存在 purge/delete 永久删除能力；将来若要新增，必须走新的需求、安全不变量扩展和 UX 评审，不在此基线内。
- 不裁决安全不变量、数据 schema 或模块包路径；仅列出与 SecurityReview / DataEngineer / Architecture 产物的对接点。

## 2. 角色与约束输入

| 角色 | 场景 | 权限边界 |
|---|---|---|
| 任务操作者（人类） | 任务结束后查看 dry-run 结果，显式决定 quarantine，需要时 restore | 可发起显式、有范围的执行 |
| 自动化调用方（DSH 生命周期 / CI / agent runner） | 只读调用 dry-run / status / audit | 不能绕过确认；无“自动批准”路径 |
| 审计员 / 维护者 | 查看审计、配置、任务清理状态 | 只读审计；基线内配置只读展示 |

UX 必须遵守的约束（来自任务书与并行设计输入）：

- 默认 dry-run：任何执行入口都以“只读计划”为默认，执行必须先有显式决策。
- 默认拒绝：空候选集、无显式候选 ID、越界路径、symlink、Git tracked-file 等一律以安全拒绝呈现，不提供 --yes / --force / “全选执行” 类绕过开关。
- 可回滚优先：quarantine 是主要执行动作且可 restore；界面措辞不得暗示“清空/删除完成”。
- 审计可见：每个用户可见状态变化都能追溯到 audit 事件。
- 基线内所有执行均为 noop/stub；UI/CLI 只装配后端契约端口，不内联业务。

## 3. 用户旅程

### J1 查看任务清理计划（dry-run）

目标：任务结束后，用户看到“本次任务产生、可安全清理”的只读计划。

| 步骤 | 用户动作 | 系统/界面状态 | 出口条件 |
|---|---|---|---|
| 1 | 打开任务清理页 / 运行 `plan` | loading → 内容或空状态 | 有结果或明确空态 |
| 2 | 浏览候选 | 按类别分组展示路径、大小、风险与原因 | 用户理解每项为何被推荐 |
| 3 | （可选）查看被保护项 | protected 列表展示拒绝原因 | 用户能区分“可清理”与“被保护/越界” |
| 4 | 离开或进入 J2 | plan-ready | 用户作出决策或不决策 |

错误出口：任务 ID 不存在 / workspace 不可读 → error 状态 + 结构化错误码；不得渲染半成品计划。

### J2 显式执行 quarantine

目标：对计划中用户勾选的候选执行可回滚隔离。

| 步骤 | 用户动作 | 系统/界面状态 | 出口条件 |
|---|---|---|---|
| 1 | 勾选候选（≥1） | 行进入 selected；批量按钮随选中数启用 | 无勾选时执行入口禁用 |
| 2 | 触发 quarantine | 打开确认面板，列出精确路径/数量/字节 | 确认面板展示与选择一致 |
| 3 | 逐条核对并确认 | 勾选“我确认仅对上述 N 项执行”→ 提交 | 未确认时提交禁用 |
| 4 | 执行 | 行级 running；整体 running | 全部成功、部分失败或全部失败 |
| 5 | 查看结果 | succeeded / partial / failed + audit 入口 | 失败项可见原因与恢复动作 |

### J3 恢复隔离项（restore）

目标：从隔离区把已隔离文件恢复到原路径。

| 步骤 | 用户动作 | 系统/界面状态 | 出口条件 |
|---|---|---|---|
| 1 | 进入隔离区，勾选记录 | 行进入 selected | ≥1 条勾选 |
| 2 | 触发 restore | 确认面板显示原路径与隔离路径 | 确认后提交 |
| 3 | 执行 | running → restored / conflict / failed | 冲突项显示原路径被占用等错误 |
| 4 | 核对 | restored 行从待恢复列表移出并留有审计 | 无歧义 |

### J4 审计与排障

目标：回答“发生过什么、为什么、哪一项失败了”。

- 审计视图按时间倒序，可按 task-id / 事件类型 / 结果过滤。
- 候选/记录失败行的“查看详情”直接跳到对应 audit 事件。
- 导出/复制采用 CLI `audit --format json` 或页面“复制 JSON”动作；两者输出同构。

### J5 查看配置与基线状态

- 配置页只读展示：dry-run 默认开启、workspace 根、受保护规则计数、版本。
- 基线不提供配置编辑 UI；编辑入口以 disabled + reason 呈现（如“策略编辑在后续版本开放”），防止用户误以为可改。

## 4. 交互状态机

### 4.1 命令/会话级状态

状态值（CLI 与 Web 共用语义）：

`idle → loading → plan-ready | noop | empty | error → awaiting-decision → running → succeeded | partial | failed | cancelled`

| 状态 | 含义 | 用户可做什么 | 渲染要求 |
|---|---|---|---|
| idle | 尚未发起 | 发起读取/计划 | — |
| loading | 读取/扫描/计算中 | 可取消（仅 CLI 中断） | 骨架/进度，禁止假数据 |
| noop | 后端 stub 未产生动作 | 查看空结果 | 明示“未写入任何变更” |
| plan-ready | dry-run 计划就绪 | 勾选、跳过、进入确认 | 只读计划 |
| awaiting-decision | 已勾选待确认 | 核对、提交、取消 | 精确回显选择 |
| running | 执行中 | 等待 / 中断 | 进度 + 行级状态，禁用重复提交 |
| succeeded | 全部成功 | 查看结果 / 审计 | 成功摘要 |
| partial | 部分成功 | 查看失败行与恢复路径 | 分状态统计，禁止整体成功文案 |
| failed | 全部失败 | 重试或查审计 | 错误码 + 原因 |
| cancelled | 用户中断 | 重新开始 | 明确“未完成”，无歧义 |

禁止转换：

- plan-ready → running 必须经过 awaiting-decision，且候选 ID 集合与提交一致。
- running 中不允许再次提交（防重复执行）。
- failed/partial 不自动重试；重试必须是显式新动作。

### 4.2 候选项级状态

`offered → selected → running → quarantined | restored | skipped | failed | denied`

| 状态 | 可见语义 | 行动作 |
|---|---|---|
| offered | 出现在 dry-run 计划中 | 勾选 / 跳过 / 看原因 |
| selected | 用户勾选但未提交 | 取消勾选 |
| running | 该行正在隔离/恢复 | 无（disabled） |
| quarantined | 已隔离，可恢复 | 去隔离区恢复 |
| restored | 已恢复到原路径 | 查看审计 |
| skipped | 用户明确跳过 | 可在新计划中重新出现 |
| failed | 该行失败 | 查看错误、复制错误码 |
| denied | safety kernel 拒绝 | 查看拒绝原因（不可绕行） |

约束：

- 行状态只由端口返回的 VM 决定；前端不得根据用户勾选猜测状态。
- 展示层不提供“把 denied 改成可执行”的任何动作。

### 4.3 视图级状态

每个视图都具备五种标准态：`loading / empty / error / content / busy(confirming)`。

| 视图 | 空态 | 错误态 | 忙态 |
|---|---|---|---|
| 计划 | “本次任务未发现可清理项”+ 返回/重扫 | 无法生成计划（错误码） | 确认面板打开 / 执行中 |
| 隔离区 | “隔离区为空” | 列表加载失败 | restore 执行中 |
| 审计 | 无事件（区分“从未发生”与“筛选无结果”） | 读取失败 | 展开详情加载 |
| 配置 | 不可用（异常） | 读取失败 | — |

## 5. CLI shell 契约

### 5.1 命令面（v0 基线）

二进制建议名：`dsh-task-cleaner`（最终包名随 Architecture ADR）。

| 命令 | 必填/可选输入 | 行为契约（shell 层） | 副作用 |
|---|---|---|---|
| `plan`（别名 `dry-run`） | `--task-id`（省略时取最近结束任务，由 task metadata 端口提供） | 返回只读 CleanupPlan；默认即 dry-run | 无文件变更；如 audit 端口可用则记 dry-run 事件 |
| `quarantine` | `--task-id` + `--candidate-id`（可重复，≥1） | 仅对显式列出的候选执行；空列表直接安全拒绝 | 可回滚隔离（基线为 noop/stub） |
| `restore` | `--record-id`（≥1，可重复） | 仅恢复显式列出的隔离记录 | 基线为 noop/stub |
| `status` | `--task-id` 可选 | 任务清理状态摘要 | 无 |
| `audit` | `--task-id` / `--since` / `--limit` 可选 | 审计事件列表（倒序、可游标分页） | 无 |
| `config show` | 无 | 只读配置摘要 | 无 |

明确禁止的开关：`--yes`、`--force`、`-y`、`--all`、`--delete`、`--purge`。契约测试应断言这些词不在命令面中。

### 5.2 输出与渲染

- 默认人类可读文本；`--format json` 输出稳定机器契约。
- stdout 只承载最终结果；进度/诊断写 stderr。
- 颜色仅 TTY 自动开启（`--color auto|always|never`）；非 TTY 输出逐字节稳定。
- 列表排序确定性：按 workspace-relative path 升序（audit 按时间倒序、同时间按 event id）。

文本输出示例（dry-run）：

```text
Dry-run plan  plan_01J2...  (no changes written)
Task:        tsk_20260909_001
Workspace:   /ws/tasks/tsk_20260909_001
Candidates:  12  (4.2 MB)
  tmp/          6 files  980 KB
  cache/        4 files  2.1 MB
  log/          2 files  1.1 MB
Protected:     0 Git-tracked, 2 outside-workspace (ignored)
Decision:      pending — quarantine requires explicit --candidate-id
```

### 5.3 JSON 信封

所有 `--format json` 输出使用统一信封：

```ts
{
  schemaVersion: "cli.v1",
  command: "plan" | "quarantine" | "restore" | "status" | "audit" | "config",
  status: VmStatus,
  data: VmPlan | VmCommandResult | VmAuditPage | VmConfigSummary | null,
  meta: {
    taskId?: string,
    planId?: string,
    ts: string,          // RFC3339
    dryRun: true,        // 基线恒为 true
    cliVersion: string
  },
  errors: VmError[]
}
```

### 5.4 退出码

| 码 | 含义 |
|---|---|
| 0 | 成功（含安全 noop：无可执行动作/无候选） |
| 1 | 运行时/端口失败 |
| 2 | 用法错误（未知命令、缺参、非法组合） |
| 3 | 安全拒绝（SafetyDecision=deny） |
| 4 | 部分成功（部分候选失败） |
| 130 | 中断 |

### 5.5 确认语义（执行路径）

- TTY：执行前必须显示精确回显并等待显式确认。
- 非 TTY / 管道：不静默跳过确认；缺显式候选 ID 时以退出码 3 拒绝，并提示补齐参数或改用 Web/交互端完成决策。
- 任何执行都必须能对应到 audit 中的显式决策事件（载体语义由架构/后端细化；UX 只要求“没有它就不能执行”）。

## 6. Web UI shell 契约

### 6.1 信息架构与路由

Web 是本地伴生 UI（单机、绑定当前 workspace/任务上下文；多用户/鉴权模型不在本基线，需架构另议时重做 UX）。

| 视图 | 建议路由 | 内容 |
|---|---|---|
| 总览 | `/` | 最近任务、清理状态摘要、dry-run 常开提示 |
| 计划 | `/tasks/:taskId/plan` | 候选表 + 确认/执行 |
| 隔离区 | `/quarantine` | 可恢复记录 + restore |
| 审计 | `/audit` | 事件日志 + 过滤 + 详情 |
| 配置 | `/settings` | 只读配置摘要 |

导航：左侧栏（≥1024px）+ 顶部任务上下文条；窄屏折叠为可展开抽屉。

### 6.2 页面结构

- 计划页：任务信息头（task id、workspace、生成时间、dry-run 徽标）→ 摘要统计卡 → 候选分组表 → 底部批量操作条（仅在选中 ≥1 时启用）。
- 候选列：勾选、workspace-relative path、类别、大小、mtime、风险/原因、状态、行动作。
- 隔离区页：原路径、隔离路径、隔离时间、大小、record id、restore 按钮、状态。
- 审计页：时间、task id、actor、事件类型、结果、scope；行点击展开详情。

### 6.3 确认面板

- 精确回显：N 项、总字节、路径清单（>10 项可展开）。
- 措辞“将隔离以下文件（可从隔离区恢复）”，不使用“删除/清空”作为主按钮文案。
- 勾选“我确认仅对上述 N 项执行”后提交按钮才启用；安全拒绝原因以错误面板逐条显示，不提供绕过。
- ESC / 取消：关闭面板并保留勾选，焦点返回触发按钮。

### 6.4 空/错/忙态与反馈

- 空态给下一步动作；筛选空态与真实空态文案不同。
- 错误态显示错误码、人类可读信息、恢复动作（重试/查审计）；禁止只显示“出错了”。
- 执行中：整表 disabled + 行级状态 + “正在隔离/恢复”；禁止重复提交；成功后焦点移到结果摘要。

### 6.5 响应式

- 断点：≥1280 桌面表格；1024–1279 减密列；768–1023 保留核心列 + 详情展开；<768 表格变卡片流。
- 表格横向滚动仅作为中间态，最终断点必须给卡片布局；触控目标 ≥ 44px。

### 6.6 可访问性（最低验收）

- 语义化地标与单一 h1；每页有文档标题。
- 异步完成/错误用 `aria-live="polite"`（危险结果 `assertive`）播报摘要。
- 模态：焦点圈闭、ESC 关闭、关闭后焦点归还触发元素。
- 所有状态不以颜色为唯一信号（错误=图标+文本+代码）。
- 键盘可达全部动作；表单控件有 label；对比度 WCAG AA。

## 7. View-model 契约

### 7.1 领域映射

| 领域契约（数据/后端侧） | View-model | 增加内容（仅展示） |
|---|---|---|
| ArtifactCandidate | VmCandidate | 选择态、可执行动作、格式化标签 |
| CleanupPlan | VmPlan | 计数摘要、dry-run 徽标语义 |
| SafetyDecision | VmDecisionSummary | 仅展示拒绝/批准结果 |
| QuarantineRecord | VmQuarantineRecord | 展示路径、可恢复标志 |
| RestoreResult | VmRestoreResult | 状态 + 错误 |
| AuditEvent | VmAuditEvent | scope/detail 展示标签 |

### 7.2 类型定义（建议签名，字段名以 Data/Architecture 定稿为准）

```ts
export type VmStatus =
  | "idle" | "loading" | "noop" | "plan-ready" | "awaiting-decision"
  | "running" | "succeeded" | "partial" | "failed" | "cancelled" | "denied";

export interface VmError {
  code: string;          // 稳定错误码，如 "ERR_SAFETY_DENY"
  message: string;       // 人类可读
  scope?: string;        // candidateId / recordId / taskId
}

export interface VmCounts {
  offered: number;
  quarantined: number;
  restored: number;
  failed: number;
  denied: number;
  skipped: number;
  bytesOffered: number;
}

export interface VmTaskSummary {
  taskId: string;
  workspaceLabel: string;
  finishedAt: string | null;
  cleanupState: "none" | "plan-ready" | "quarantined" | "partial" | "restored" | "failed";
  counts: VmCounts;
}

export type VmCandidateState =
  | "offered" | "selected" | "running" | "quarantined"
  | "restored" | "skipped" | "failed" | "denied";

export interface VmCandidate {
  candidateId: string;
  state: VmCandidateState;
  path: string;            // workspace-relative
  pathLabel: string;       // 转义/缩写后的展示文本
  category: "tmp" | "cache" | "log" | "intermediate" | "unknown";
  sizeBytes: number;
  modifiedAt: string;      // RFC3339
  riskTags: string[];      // 如 "symlink" | "git-tracked" | "outside-workspace"
  reasonCodes: string[];
  selected: boolean;       // UI 勾选态，不是后端决策
  error?: VmError;
}

export interface VmPlan {
  planId: string;
  taskId: string;
  generatedAt: string;
  dryRun: true;
  scopeLabel: string;
  candidates: VmCandidate[];
  protectedHits: Array<{ path: string; reasonCode: string; label: string }>;
  summary: VmCounts;
}

export interface VmDecisionSummary {
  planId: string;
  candidateIds: string[];
  actor: string;
  decidedAt: string;
  outcome: "approved" | "denied";
  reasonCodes: string[];
}

export interface VmQuarantineRecord {
  recordId: string;
  originalPath: string;
  originalPathLabel: string;
  quarantinePath: string;
  quarantinePathLabel: string;
  quarantinedAt: string;
  sizeBytes: number;
  restored: boolean;
  restoredAt: string | null;
  error?: VmError;
}

export interface VmRestoreResult {
  recordId: string;
  status: "restored" | "conflict" | "failed";
  originalPathLabel: string;
  error?: VmError;
}

export interface VmAuditEvent {
  eventId: string;
  ts: string;
  taskId: string | null;
  actor: string;
  eventType: string;       // dry-run | quarantine | restore | safety-deny | ...
  outcome: "succeeded" | "partial" | "failed" | "denied";
  scopeLabel: string;
}

export interface VmAuditPage {
  events: VmAuditEvent[];
  nextCursor: string | null;
}

export interface VmConfigSummary {
  dryRunDefault: true;
  workspaceRootLabel: string;
  protectedPatternCount: number;
  version: string;
}

export interface VmCommandResult {
  command: string;
  status: VmStatus;
  summary: VmCounts | null;
  updatedAt: string;
}
```

### 7.3 UI 端口（shell 只依赖这些函数）

```ts
export interface UxShellPorts {
  loadPlan(taskId: string | null): Promise<VmPlan>;          // dry-run，只读
  applyQuarantine(req: { taskId: string; candidateIds: string[] }): Promise<VmCommandResult>;
  applyRestore(req: { recordIds: string[] }): Promise<VmCommandResult>;
  loadTaskStatus(taskId: string): Promise<VmTaskSummary>;
  loadQuarantine(): Promise<VmQuarantineRecord[]>;
  loadAudit(filter: AuditFilter): Promise<VmAuditPage>;
  loadConfig(): Promise<VmConfigSummary>;
}
```

这些函数在实现阶段由组合根绑定到后端 noop/stub use-case；shell 不得绕过端口自行触碰文件系统或清理 API。

### 7.4 实现规则

- R1（只呈现，不计算）：状态、计数、风险、可执行动作全部来自端口返回的 VM；组件不得重算决策或安全结论。
- R2（无删除面）：shell 中不存在任何永久删除命令/路由/按钮/VM 字段；端口集合里没有 delete/purge。
- R3（勾选与状态分离）：`selected` 只是 UI 暂态；执行前必须由端口重新校验候选 ID。
- R4（错误完整）：失败必须带错误码与可读信息；scope 尽量定位到候选/记录。
- R5（确定性）：列表按 path 升序；格式化（字节、时间）放独立纯函数模块，组件调用它，不做内联计算。
- R6（无自动重试）：partial/failed 之后的重试必须是显式用户动作。

## 8. 前端/测试验收点

供 FrontendDeveloperAgent 自检、TestAgent 验证：

1. 状态机测试：覆盖 4.1/4.2 中全部合法转换与禁止转换（含 plan-ready 直跳 running 必须失败）。
2. 五视图 × 四态（loading/empty/error/content）各至少一条契约测试；确认面板 focus/ESC 行为。
3. 命令面测试：CLI 帮助与解析中不存在 --yes/--force/delete/purge；quarantine 空候选退出码为 3。
4. JSON 契约测试：信封 schemaVersion/status/data/meta/errors 稳定；退出码映射正确；非 TTY 文本输出确定性。
5. VM 测试：用领域契约 fixture 映射到 VM，断言字段映射与展示规则；VM 可 JSON 序列化。
6. 可访问性 smoke：每视图键盘可达、aria-live 区域、模态焦点管理、非颜色单信号。
7. 响应式断言：断点下表格→卡片切换、无横向溢出阻塞操作。

## 9. 移交、依赖与开放假设

- 集成点：包/目录结构、插件生命周期入口、端口与组合根以 ArchitectureAgent ADR 为准；字段名与 schema 以 DataEngineer/Backend 定稿为准；冲突时安全不变量优先于交互便利。
- 待 Frontend 落地：CLI shell、Web shell、VM 映射、状态机与上述测试；落地时不得引入清理业务实现。
- 假设 A1：Web UI 为单机伴生界面，与 CLI 共用同一 workspace 上下文；如架构决定 C/S 或鉴权模型，需 UX 追加会话与多用户状态。
- 假设 A2：交互对象是“任务结束后”的清理环节，task id 与 workspace 边界由 task metadata/filesystem adapter 提供。
- 假设 A3：基线 dry-run 由 stub/fixture 支撑，展示契约不受业务实现影响。
- 开放项：无阻塞。CLI/Web 的精确文案库、i18n、主题不在本契约内，由前端实现时确定。
- 本文件的建议落位为 `docs/design/ux-shell-contract.md`（最终路径随架构 ADR；docs/harness/ 治理文件约束不影响产品设计文档落位）。
