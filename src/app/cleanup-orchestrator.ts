import { randomUUID } from 'node:crypto';
import type { Config } from '../config.js';
import type { CleanupPlan, RestoreResult } from '../domain/artifact.js';
import type { AuditActor, AuditEvent, AuditOutcome, AuditPhase } from '../domain/audit-event.js';
import { AUDIT_EVENT_SCHEMA_VERSION, QUARANTINE_RECORD_SCHEMA_VERSION } from '../domain/common.js';
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
 * every method is a noop/stub that preserves the safety ordering invariants
 * (audit-before-action, quarantine write-before-move) and routes every
 * decision through the SafetyKernel, which is default-deny (S-01/S-07).
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
   * Noop quarantine. Writes the audit `intent` BEFORE any action, then records
   * the default-deny outcome; nothing is ever moved in this milestone.
   */
  async quarantine(plan: CleanupPlan, actor: AuditActor): Promise<QuarantineRecord | null> {
    const summary = await this.decide(plan);
    const now = this.deps.clock.nowIso();

    await this.appendAudit(plan, actor, { phase: 'quarantine', action: 'quarantine', outcome: 'intent', now });

    if (summary.allowed === 0) {
      await this.appendAudit(plan, actor, {
        phase: 'quarantine',
        action: 'quarantine',
        outcome: 'denied',
        now,
        reason: 'default_deny_no_allowable_candidates',
      });
      return null;
    }

    // Real move + write-before-move staging is NOT implemented here; this
    // branch is unreachable under the default-deny kernel and exists only to
    // document the required ordering (S-05).
    const record: QuarantineRecord = {
      schemaVersion: QUARANTINE_RECORD_SCHEMA_VERSION,
      quarantineId: randomUUID(),
      taskId: plan.taskId,
      runId: plan.runId,
      manifestId: plan.manifestId,
      decisionId: summary.decisions[0]?.decisionId ?? '',
      createdAt: now,
      status: 'pending',
      entries: [],
      restore: null,
    };
    await this.deps.quarantine.stage(record);
    return this.deps.quarantine.commit(record.quarantineId);
  }

  /** Noop restore: default-deny, no restore path ships in this milestone. */
  async restore(quarantineId: string, actor: AuditActor): Promise<RestoreResult> {
    const now = this.deps.clock.nowIso();
    await this.appendAuditByIds('', '', actor, { phase: 'restore', action: 'restore', outcome: 'intent', now });
    await this.appendAuditByIds('', '', actor, {
      phase: 'restore',
      action: 'restore',
      outcome: 'denied',
      now,
      reason: 'default_deny_restore_not_implemented',
    });
    return {
      restoreId: randomUUID(),
      quarantineId,
      decisionId: '',
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
    refs?: { manifestId?: string; planId?: string },
  ): Promise<void> {
    const existing = await this.deps.audit.read(runId);
    const event: AuditEvent = {
      schemaVersion: AUDIT_EVENT_SCHEMA_VERSION,
      eventId: randomUUID(),
      seq: existing.length + 1,
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
        manifestId: refs?.manifestId || undefined,
        planId: refs?.planId || undefined,
      },
      failureReason: opts.outcome === 'denied' ? opts.reason ?? 'denied' : null,
      reason: opts.reason,
    };
    await this.deps.audit.append(event);
  }
}
