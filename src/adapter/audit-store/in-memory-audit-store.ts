import type { AuditEvent } from '../../domain/audit-event.js';
import type { AuditStorePort } from '../../ports/audit-store.js';

/**
 * In-memory audit store (R2). Append-only by construction: entries are never
 * mutated or removed. The monotonic `(run_id, seq)` sequence is assigned here
 * atomically so callers can never race or guess a sequence (S-06/S-08).
 */
export class InMemoryAuditStore implements AuditStorePort {
  private readonly events: AuditEvent[] = [];
  private readonly nextSeq = new Map<string, number>();

  async append(event: Omit<AuditEvent, 'seq'>): Promise<AuditEvent> {
    const seq = (this.nextSeq.get(event.runId) ?? 0) + 1;
    this.nextSeq.set(event.runId, seq);
    const stored: AuditEvent = { ...event, seq };
    this.events.push(stored);
    return stored;
  }

  async read(runId: string): Promise<readonly AuditEvent[]> {
    return this.events.filter((event) => event.runId === runId);
  }
}
