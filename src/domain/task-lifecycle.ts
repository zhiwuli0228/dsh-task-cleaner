/**
 * Host-independent task lifecycle vocabulary (ADR-003).
 *
 * The DSH adapter maps `goal/changed` / `session/disposed` events into these
 * normalized events; domain and ports never see DSH types directly.
 */

export type TaskScopeKind = 'goal' | 'session' | 'turn';

export type TaskLifecyclePhase =
  | 'started'
  | 'completed'
  | 'aborted'
  | 'paused'
  | 'blocked'
  | 'cleared';

/** Host-independent goal reference (mirrors DSH GoalRef without importing it). */
export interface GoalRefLike {
  readonly id: string;
  readonly revision: number;
}

export interface TaskScope {
  readonly kind: TaskScopeKind;
  readonly sessionId?: string;
  readonly goalId?: string;
  readonly goalRef?: GoalRefLike;
  /** Canonical workspace path resolved by the adapter (untrusted until validated). */
  readonly workspace?: string;
  readonly cwd?: string;
  /** Epoch milliseconds. */
  readonly timestamp: number;
}

export interface TaskLifecycleEvent {
  readonly phase: TaskLifecyclePhase;
  readonly scope: TaskScope;
  readonly source: TaskScopeKind;
  /** Monotonic within the adapter instance. */
  readonly seq: number;
}
