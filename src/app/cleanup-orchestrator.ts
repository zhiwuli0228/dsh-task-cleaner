import { randomUUID } from 'node:crypto';
import type { Config } from '../config.js';
import type { CleanupPlan, RestoreResult } from '../domain/artifact.js';
import type { AuditActor, AuditEvent, AuditOutcome, AuditPhase, AuditRefs } from '../domain/audit-event.js';
import { AUDIT_EVENT_SCHEMA_VERSION } from '../domain/common.js';
import type { QuarantineRecord } from '../domain/quarantine-record.js';
import type { DecisionContext, SafetyDecisionSummary, SafetyKernel } from '../domain/safety-kernel.js';
import type { AuditStorePort } from '../ports/audit-store.js';
import type { ClockPort } from '../ports/clock.js';
import type { FsPort } from '../ports/filesystem.js';
import type { GitPort } from '../ports/git.js';
import type { HashPort } from '../ports/hash.js';
import type { QuarantineStorePort } from '../ports/quarantine-store.js';
import type { TaskLifecyclePort } from '../ports/task-lifecycle.js';
import type { TaskMetadataPort } from '../ports/task-metadata.js';

export interface CleanupDeps {
  readonly fs: FsPort;
  readonly git: GitPort;
  readonly taskMetadata: TaskMetadataPort;
  readonly lifecycle: TaskLifecyclePort;
  readonly clock: ClockPort;
  readonly hash: HashPort;
  readonly audit: AuditStorePort;
  readonly quarantine: QuarantineStorePort;
  readonly safetyKernel: SafetyKernel;
}

export interface TaskStatus {
  readonly taskId: string;
  readonly runId: string;
  readonly phase: string;
  readonly dryRun: boolean;
}

/**
 * CleanupOrchestrator — application layer (ADR-002).
 *
 * This milestone ships NO real scanning/quarantine/restore/delete logic:
 * every action preserves the safety ordering invariants (audit-before-action,
 * quarantine write-before-move) and routes every decision through the
 * SafetyKernel, which is default-deny (S-01/S-07). Quarantine and restore are
 * both explicit denies; no file is ever moved.
 */
export class CleanupOrchestrator {
  private readyFlag = false;

  constructor(
    private readonly deps: CleanupDeps,
    private readonly config: Config,
  ) {}

  /** Readiness probe: set by the composition root after successful activation. */
  get ready(): boolean {
    return this.readyFlag;
  }

  markReady(): void {
    this.readyFlag = true;
  }

  /** Noop plan: no discovery implemented, so the plan is always empty and frozen. */
  async plan(taskId: string, runId: string): Promise<CleanupPlan> {
    return {
      planId: randomUUID(),
      manifestId: randomUUID(),
      taskId,
      runId,
      createdAt: this.deps.clock.nowIso(),
      status: 'frozen',
      candidates: [],
    };
  }

  /** Route a plan through the safety kernel (default deny). */
  async decide(plan: CleanupPlan): Promise<SafetyDecisionSummary> {
    return this.deps.safetyKernel.decide(plan, this.decisionContext(plan));
  }

  /**
   * Explicit deny. Writes the audit `intent` BEFORE any action, then records
   * the denial; nothing is ever moved in this milestone (S-07).
   */
  async quarantine(plan: CleanupPlan, actor: AuditActor): Promise<QuarantineRecord | null> {
    const summary = await this.decide(plan);
    const now = this.deps.clock.nowIso();

    await this.appendAudit(plan, actor, { phase: 'quarantine', action: 'quarantine', outcome: 'intent', now });

    const reason = summary.allowed === 0
      ? 'default_deny_no_allowable_candidates'
      : 'quarantine_not_implemented';
    await this.appendAudit(plan, actor, { phase: 'quarantine', action: 'quarantine', outcome: 'denied', now, reason });
    return null;
  }

  /** Noop restore: default-deny, no restore path ships in this milestone. */
  async restore(quarantineId: string, actor: AuditActor): Promise<RestoreResult> {
    const now = this.deps.clock.nowIso();
    const record = await this.deps.quarantine.get(quarantineId);
    const taskId = record?.taskId ?? '';
    const runId = record?.runId ?? '';
    const decisionId = record?.decisionId ?? '';

    await this.appendAuditByIds(taskId, runId, actor, {
      phase: 'restore',
      action: 'restore',
      outcome: 'intent',
      now,
    }, { quarantineId });
    await this.appendAuditByIds(taskId, runId, actor, {
      phase: 'restore',
      action: 'restore',
      outcome: 'denied',
      now,
      reason: 'default_deny_restore_not_implemented',
    }, { quarantineId });

    return {
      restoreId: randomUUID(),
      quarantineId,
      decisionId,
      requestedBy: actor.id,
      requestedAt: now,
      result: 'denied',
      failures: [],
    };
  }

  async status(taskId: string): Promise<TaskStatus> {
    const task = await this.deps.taskMetadata.getCurrentTask();
    return {
      taskId,
      runId: task?.runId ?? '',
      phase: 'idle',
      dryRun: this.config.dryRun,
    };
  }

  audit(runId: string): Promise<readonly AuditEvent[]> {
    return this.deps.audit.read(runId);
  }

  private decisionContext(plan: CleanupPlan): DecisionContext {
    return {
      taskId: plan.taskId,
      runId: plan.runId,
      workspaceRoot: this.config.workspaceRoot ?? '',
      now: this.deps.clock.nowIso(),
      dryRun: this.config.dryRun,
    };
  }

  private appendAudit(
    plan: CleanupPlan,
    actor: AuditActor,
    opts: { phase: AuditPhase; action: string; outcome: AuditOutcome; now: string; reason?: string },
  ): Promise<void> {
    return this.appendAuditByIds(plan.taskId, plan.runId, actor, opts, { manifestId: plan.manifestId, planId: plan.planId });
  }

  private async appendAuditByIds(
    taskId: string,
    runId: string,
    actor: AuditActor,
    opts: { phase: AuditPhase; action: string; outcome: AuditOutcome; now: string; reason?: string },
    refs?: AuditRefs,
  ): Promise<void> {
    const event: Omit<AuditEvent, 'seq'> = {
      schemaVersion: AUDIT_EVENT_SCHEMA_VERSION,
      eventId: randomUUID(),
      timestamp: opts.now,
      taskId,
      runId,
      phase: opts.phase,
      actor,
      eventSource: 'internal',
      action: opts.action,
      outcome: opts.outcome,
      dryRun: this.config.dryRun,
      targets: [],
      refs: {
        manifestId: refs?.manifestId,
        planId: refs?.planId,
        quarantineId: refs?.quarantineId,
        restoreId: refs?.restoreId,
      },
      failureReason: opts.outcome === 'denied' ? opts.reason ?? 'denied' : null,
      reason: opts.reason,
    };
    await this.deps.audit.append(event);
  }
}
