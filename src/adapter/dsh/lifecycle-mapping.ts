import type { Agent } from '@deepseek-ai/dsh-agent';
import type { GoalChanged, GoalOperation } from '@deepseek-ai/dsh-goal';
import type { Session } from '@deepseek-ai/dsh-session';
import type { TaskLifecycleEvent, TaskLifecyclePhase } from '../../domain/task-lifecycle.js';

/**
 * Pure DSH → normalized lifecycle mapping (ADR-003). No host objects escape
 * this module: only plain domain vocabulary is returned.
 *
 * Every field read from host payloads is treated as untrusted (M2): guards
 * validate the shape and return `null` rather than throwing, so a malformed
 * event can never propagate an uncaught exception into the host.
 */

const GOAL_OPERATION_PHASE: Readonly<Record<GoalOperation, TaskLifecyclePhase | null>> = {
  create: 'started',
  resume: 'started',
  complete: 'completed',
  block: 'blocked',
  pause: 'paused',
  clear: 'cleared',
  edit: null,
};

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isGoalOperation(value: unknown): value is GoalOperation {
  return typeof value === 'string' && value in GOAL_OPERATION_PHASE;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

export function mapGoalOperation(operation: GoalOperation): TaskLifecyclePhase | null {
  return GOAL_OPERATION_PHASE[operation] ?? null;
}

export interface GoalEventInput {
  readonly agent: Agent;
  readonly change: GoalChanged;
  /** Monotonic sequence assigned by the adapter. */
  readonly seq: number;
  /** Epoch milliseconds. */
  readonly timestamp: number;
}

export function goalChangedToEvent(input: GoalEventInput): TaskLifecycleEvent | null {
  const agentRec = asRecord(input.agent);
  const changeRec = asRecord(input.change);
  const refRec = asRecord(changeRec?.ref);

  const sessionId = agentRec?.id;
  const operation = changeRec?.operation;
  const goalId = refRec?.id;
  const revision = refRec?.revision;

  if (!isNonEmptyString(sessionId)) return null;
  if (!isGoalOperation(operation)) return null;
  if (!isNonEmptyString(goalId)) return null;
  if (!isFiniteNumber(revision)) return null;

  const phase = mapGoalOperation(operation);
  if (!phase) return null;

  return {
    phase,
    source: 'goal',
    scope: {
      kind: 'goal',
      sessionId,
      goalId,
      goalRef: { id: goalId, revision },
      timestamp: input.timestamp,
    },
    seq: input.seq,
  };
}

export interface SessionDisposedInput {
  readonly session: Session;
  /** Monotonic sequence assigned by the adapter. */
  readonly seq: number;
  /** Epoch milliseconds. */
  readonly timestamp: number;
}

export function sessionDisposedToEvent(input: SessionDisposedInput): TaskLifecycleEvent | null {
  const sessionRec = asRecord(input.session);
  const headerRec = asRecord(sessionRec?.header);

  const sessionId = sessionRec?.id;
  if (!isNonEmptyString(sessionId)) return null;

  const cwd = typeof headerRec?.cwd === 'string' ? headerRec.cwd : undefined;

  return {
    phase: 'aborted',
    source: 'session',
    scope: {
      kind: 'session',
      sessionId,
      cwd,
      timestamp: input.timestamp,
    },
    seq: input.seq,
  };
}
