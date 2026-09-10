import type { TaskMetadata, TaskMetadataPort } from '../../ports/task-metadata.js';

/**
 * Stub task-metadata provider for the baseline. The DSH adapter is the real
 * source of truth for task identity; this stub keeps app/domain decoupled
 * from the host until the cleanup implementation wires the real adapter.
 */
export class StubTaskMetadata implements TaskMetadataPort {
  private current: TaskMetadata | null = null;

  setCurrent(metadata: TaskMetadata | null): void {
    this.current = metadata;
  }

  async getCurrentTask(): Promise<TaskMetadata | null> {
    return this.current;
  }
}
