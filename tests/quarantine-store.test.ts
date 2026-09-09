import { describe, expect, test } from 'vitest';
import { InMemoryQuarantineStore } from '../src/adapter/quarantine-store/in-memory-quarantine-store.js';
import { QUARANTINE_RECORD_SCHEMA_VERSION } from '../src/domain/common.js';
import type { QuarantineRecord, QuarantineRestore, QuarantineStatus } from '../src/domain/quarantine-record.js';

function record(status: QuarantineStatus, quarantineId = 'q1'): QuarantineRecord {
  return {
    schemaVersion: QUARANTINE_RECORD_SCHEMA_VERSION,
    quarantineId,
    taskId: 'task-1',
    runId: 'run-1',
    manifestId: 'm1',
    decisionId: 'd1',
    createdAt: '2026-01-01T00:00:00Z',
    status,
    entries: [],
    restore: null,
  };
}

function restore(): QuarantineRestore {
  return {
    restoreId: 'r1',
    decisionId: 'd1',
    requestedBy: 'u1',
    requestedAt: '2026-01-01T00:00:00Z',
    result: 'succeeded',
    failures: [],
  };
}

describe('InMemoryQuarantineStore (MINOR-3 state machine)', () => {
  test('stage persists pending and rejects a duplicate quarantineId', async () => {
    const store = new InMemoryQuarantineStore();
    await store.stage(record('pending', 'q1'));
    await expect(store.stage(record('pending', 'q1'))).rejects.toThrow(/already staged/);
  });

  test('stage rejects a non-pending record', async () => {
    const store = new InMemoryQuarantineStore();
    await expect(store.stage(record('quarantined', 'q1'))).rejects.toThrow(/status/);
  });

  test('commit transitions pending → quarantined and is idempotent', async () => {
    const store = new InMemoryQuarantineStore();
    await store.stage(record('pending', 'q1'));
    const first = await store.commit('q1');
    expect(first.status).toBe('quarantined');
    const second = await store.commit('q1');
    expect(second.status).toBe('quarantined');
    expect(second).toEqual(first);
  });

  test('restore transitions quarantined → restored and is idempotent', async () => {
    const store = new InMemoryQuarantineStore();
    await store.stage(record('pending', 'q1'));
    await store.commit('q1');

    const first = await store.restore('q1', restore());
    expect(first.status).toBe('restored');
    expect(first.restore?.restoreId).toBe('r1');

    const second = await store.restore('q1', restore());
    expect(second).toEqual(first);
  });

  test('restore rejects a record that is not quarantined', async () => {
    const store = new InMemoryQuarantineStore();
    await store.stage(record('pending', 'q1'));
    await expect(store.restore('q1', restore())).rejects.toThrow(/status/);
  });

  test('commit/restore throw on unknown quarantineId', async () => {
    const store = new InMemoryQuarantineStore();
    await expect(store.commit('missing')).rejects.toThrow(/quarantine_not_found/);
    await expect(store.restore('missing', restore())).rejects.toThrow(/quarantine_not_found/);
  });
});
