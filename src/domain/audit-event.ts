import type { AUDIT_EVENT_SCHEMA_VERSION } from './common.js';
import type { Timestamp } from './common.js';

export type AuditPhase = 'discover' | 'plan' | 'approve' | 'quarantine' | 'restore' | 'expire' | 'purge' | 'reconcile';
export type AuditActorType = 'user' | 'plugin' | 'cli' | 'system';
export type AuditEventSource = 'cli' | 'web' | 'dsh_event' | 'internal';
export type AuditOutcome = 'intent' | 'allowed' | 'denied' | 'failed';

export interface AuditActor {
  readonly type: AuditActorType;
  readonly id: string;
  readonly sessionRef?: string | null;
}

export interface AuditTargetIdentity {
  readonly dev: string;
  readonly ino: string;
  readonly sha256Before?: string;
}

export interface AuditTarget {
  readonly relPath: string;
  readonly realPath: string;
  readonly candidateId: string;
  readonly decisionId: string;
  readonly identity: AuditTargetIdentity;
}

export interface AuditRefs {
  readonly manifestId?: string;
  readonly planId?: string;
  readonly quarantineId?: string;
  readonly restoreId?: string;
}

/**
 * AuditEvent (R2): append-only, tamper-evident record of a safety-sensitive
 * action. `intent` is written before the action; `allowed`/`denied`/`failed`
 * after. A failed audit write means the action does not execute (S-06/S-08).
 */
export interface AuditEvent {
  readonly schemaVersion: typeof AUDIT_EVENT_SCHEMA_VERSION;
  readonly eventId: string;
  readonly seq: number;
  readonly timestamp: Timestamp;
  readonly taskId: string;
  readonly runId: string;
  readonly phase: AuditPhase;
  readonly actor: AuditActor;
  readonly eventSource: AuditEventSource;
  readonly action: string;
  readonly outcome: AuditOutcome;
  readonly dryRun: boolean;
  readonly targets: readonly AuditTarget[];
  readonly refs: AuditRefs;
  readonly failureReason?: string | null;
  readonly reason?: string;
}
