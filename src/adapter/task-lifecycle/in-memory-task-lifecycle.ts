import type { TaskLifecycleEvent } from '../../domain/task-lifecycle.js';
import type { TaskLifecycleListener, TaskLifecyclePort } from '../../ports/task-lifecycle.js';

/**
 * In-memory task lifecycle bus. The DSH adapter publishes normalized events
 * here; app/domain subscribe without host coupling (ADR-003).
 */
export class InMemoryTaskLifecycle implements TaskLifecyclePort {
  private readonly listeners = new Set<TaskLifecycleListener>();

  subscribe(listener: TaskLifecycleListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(event: TaskLifecycleEvent): void {
    for (const listener of this.listeners) {
      void listener(event);
    }
  }
}
