import { describe, expect, test } from 'vitest';
import { InMemoryAuditStore } from '../src/adapter/audit-store/in-memory-audit-store.js';
import type { AuditEvent } from '../src/domain/audit-event.js';
import { AUDIT_EVENT_SCHEMA_VERSION } from '../src/domain/common.js';

function event(runId: string, overrides: Partial<Omit<AuditEvent, 'seq'>> = {}): Omit<AuditEvent, 'seq'> {
  return {
    schemaVersion: AUDIT_EVENT_SCHEMA_VERSION,
    eventId: 'e1',
    timestamp: '2026-01-01T00:00:00Z',
    taskId: 'task-1',
    runId,
    phase: 'quarantine',
    actor: { type: 'system', id: 'a1' },
    eventSource: 'internal',
    action: 'quarantine',
    outcome: 'intent',
    dryRun: true,
    targets: [],
    refs: {},
    failureReason: null,
    reason: undefined,
    ...overrides,
  };
}

describe('InMemoryAuditStore', () => {
  test('assigns a monotonic seq per run atomically (m2)', async () => {
    const store = new InMemoryAuditStore();
    const first = await store.append(event('run-1', { eventId: 'a' }));
    const second = await store.append(event('run-1', { eventId: 'b' }));
    expect(first.seq).toBe(1);
    expect(second.seq).toBe(2);
  });

  test('scopes seq per run (m2)', async () => {
    const store = new InMemoryAuditStore();
    await store.append(event('run-1', { eventId: 'a' }));
    await store.append(event('run-1', { eventId: 'b' }));
    const third = await store.append(event('run-2', { eventId: 'c' }));
    expect(third.seq).toBe(1);
  });

  test('read returns only events for the run', async () => {
    const store = new InMemoryAuditStore();
    await store.append(event('run-1', { eventId: 'a' }));
    await store.append(event('run-2', { eventId: 'b' }));
    const events = await store.read('run-1');
    expect(events.map((e) => e.eventId)).toEqual(['a']);
    expect(events[0].seq).toBe(1);
  });
});
