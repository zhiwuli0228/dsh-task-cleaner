import type { TaskLifecycleEvent } from '../domain/task-lifecycle.js';

export type TaskLifecycleListener = (event: TaskLifecycleEvent) => void | Promise<void>;

/**
 * Host-independent task lifecycle port (ADR-003). The DSH adapter publishes
 * normalized events here; app/domain subscribe without knowing the host.
 */
export interface TaskLifecyclePort {
  subscribe(listener: TaskLifecycleListener): () => void;
  publish(event: TaskLifecycleEvent): void;
}
