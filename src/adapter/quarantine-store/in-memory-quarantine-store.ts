import type { QuarantineRecord, QuarantineRestore } from '../../domain/quarantine-record.js';
import type { QuarantineStorePort } from '../../ports/quarantine-store.js';

/**
 * In-memory quarantine store (R3).
 *
 * Demonstrates the write-before-move ordering: `stage()` persists `pending`
 * metadata before any file would move, and `commit()`/`restore()` enforce the
 * status state machine with idempotent retries (S-05/S-08). No purge/delete
 * primitive exists (S-07).
 */
export class InMemoryQuarantineStore implements QuarantineStorePort {
  private readonly records = new Map<string, QuarantineRecord>();

  async stage(record: QuarantineRecord): Promise<void> {
    if (record.status !== 'pending') {
      throw new Error(`cannot stage quarantine in status "${record.status}"`);
    }
    if (this.records.has(record.quarantineId)) {
      throw new Error(`quarantine already staged: ${record.quarantineId}`);
    }
    this.records.set(record.quarantineId, record);
  }

  async commit(quarantineId: string): Promise<QuarantineRecord> {
    const record = this.require(quarantineId);
    if (record.status === 'quarantined') return record;
    if (record.status !== 'pending') {
      throw new Error(`cannot commit quarantine in status "${record.status}"`);
    }
    const updated: QuarantineRecord = { ...record, status: 'quarantined' };
    this.records.set(quarantineId, updated);
    return updated;
  }

  async get(quarantineId: string): Promise<QuarantineRecord | null> {
    return this.records.get(quarantineId) ?? null;
  }

  async restore(quarantineId: string, restore: QuarantineRestore): Promise<QuarantineRecord> {
    const record = this.require(quarantineId);
    if (record.status === 'restored') return record;
    if (record.status !== 'quarantined') {
      throw new Error(`cannot restore quarantine in status "${record.status}"`);
    }
    const updated: QuarantineRecord = { ...record, status: 'restored', restore };
    this.records.set(quarantineId, updated);
    return updated;
  }

  private require(quarantineId: string): QuarantineRecord {
    const record = this.records.get(quarantineId);
    if (!record) throw new Error('quarantine_not_found');
    return record;
  }
}
