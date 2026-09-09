import type { AuditEvent } from '../domain/audit-event.js';

/**
 * Audit store port (ADR-002 / R2). Append-only; a failed append means the
 * guarded action does NOT execute (S-06/S-08).
 */
export interface AuditStorePort {
  /**
   * Append an event; the store assigns the monotonic `seq` per run atomically
   * and returns the stored event (S-06/S-08).
   */
  append(event: Omit<AuditEvent, 'seq'>): Promise<AuditEvent>;
  read(runId: string): Promise<readonly AuditEvent[]>;
}
