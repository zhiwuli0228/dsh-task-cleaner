import type { AuditEvent } from '../../domain/audit-event.js';
import type { AuditStorePort } from '../../ports/audit-store.js';

/**
 * In-memory audit store (R2). Append-only by construction: entries are never
 * mutated or removed. A production adapter will persist JSONL and enforce the
 * `(run_id, seq)` monotonicity invariant.
 */
export class InMemoryAuditStore implements AuditStorePort {
  private readonly events: AuditEvent[] = [];

  async append(event: AuditEvent): Promise<void> {
    this.events.push(event);
  }

  async read(runId: string): Promise<readonly AuditEvent[]> {
    return this.events.filter((event) => event.runId === runId);
  }
}
