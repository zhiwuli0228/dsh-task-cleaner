import type { AuditEvent } from '../domain/audit-event.js';

/**
 * Audit store port (ADR-002 / R2). Append-only; a failed append means the
 * guarded action does NOT execute (S-06/S-08).
 */
export interface AuditStorePort {
  append(event: AuditEvent): Promise<void>;
  read(runId: string): Promise<readonly AuditEvent[]>;
}
