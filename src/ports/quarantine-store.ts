import type { QuarantineRecord, QuarantineRestore } from '../domain/quarantine-record.js';

/**
 * Quarantine store port (ADR-002 / R3).
 *
 * Ordering invariant (S-05): the full `pending` metadata must be persisted and
 * validated BEFORE the first file is moved. Entries are idempotent by
 * `(quarantineId, entryId)` so retries are safe (S-08). No purge/delete
 * primitive exists (S-07).
 */
export interface QuarantineStorePort {
  /** Persist `pending` metadata before any move. */
  stage(record: QuarantineRecord): Promise<void>;
  /** Idempotent commit: pending → quarantined after all moves verified. */
  commit(quarantineId: string): Promise<QuarantineRecord>;
  get(quarantineId: string): Promise<QuarantineRecord | null>;
  /** Idempotent restore entry. */
  restore(quarantineId: string, restore: QuarantineRestore): Promise<QuarantineRecord>;
}
