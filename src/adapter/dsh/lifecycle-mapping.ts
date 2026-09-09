import type { Agent } from '@deepseek-ai/dsh-agent';
import type { GoalChanged, GoalOperation } from '@deepseek-ai/dsh-goal';
import type { Session } from '@deepseek-ai/dsh-session';
import type {
  GoalRefLike,
  TaskLifecycleEvent,
  TaskLifecyclePhase,
} from '../../domain/task-lifecycle.js';

/**
 * Pure DSH → normalized lifecycle mapping (ADR-003). No host objects escape
 * this module: only plain domain vocabulary is returned.
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

export function mapGoalOperation(operation: GoalOperation): TaskLifecyclePhase | null {
  return GOAL_OPERATION_PHASE[operation];
}

export function goalRefOf(change: GoalChanged): GoalRefLike {
  return { id: String(change.ref.id), revision: change.ref.revision };
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
  const phase = mapGoalOperation(input.change.operation);
  if (!phase) return null;
  return {
    phase,
    source: 'goal',
    scope: {
      kind: 'goal',
      sessionId: String(input.agent.id),
      goalId: String(input.change.ref.id),
      goalRef: goalRefOf(input.change),
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

export function sessionDisposedToEvent(input: SessionDisposedInput): TaskLifecycleEvent {
  return {
    phase: 'aborted',
    source: 'session',
    scope: {
      kind: 'session',
      sessionId: String(input.session.id),
      cwd: input.session.header.cwd,
      timestamp: input.timestamp,
    },
    seq: input.seq,
  };
}
