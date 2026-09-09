import type { QuarantineRecord, QuarantineRestore, QuarantineStatus } from '../../domain/quarantine-record.js';
import type { QuarantineStorePort } from '../../ports/quarantine-store.js';

/**
 * In-memory quarantine store (R3).
 *
 * Demonstrates the write-before-move ordering: `stage()` persists `pending`
 * metadata before any file would move, and `commit()`/`restore()` are
 * idempotent by quarantineId (S-05/S-08). No purge/delete primitive exists.
 */
export class InMemoryQuarantineStore implements QuarantineStorePort {
  private readonly records = new Map<string, QuarantineRecord>();

  async stage(record: QuarantineRecord): Promise<void> {
    this.records.set(record.quarantineId, record);
  }

  async commit(quarantineId: string): Promise<QuarantineRecord> {
    return this.transition(quarantineId, 'quarantined');
  }

  async get(quarantineId: string): Promise<QuarantineRecord | null> {
    return this.records.get(quarantineId) ?? null;
  }

  async restore(quarantineId: string, restore: QuarantineRestore): Promise<QuarantineRecord> {
    const record = this.require(quarantineId);
    const updated: QuarantineRecord = { ...record, status: 'restored', restore };
    this.records.set(quarantineId, updated);
    return updated;
  }

  private transition(quarantineId: string, status: QuarantineStatus): QuarantineRecord {
    const record = this.require(quarantineId);
    const updated: QuarantineRecord = { ...record, status };
    this.records.set(quarantineId, updated);
    return updated;
  }

  private require(quarantineId: string): QuarantineRecord {
    const record = this.records.get(quarantineId);
    if (!record) throw new Error('quarantine_not_found');
    return record;
  }
}
