import { describe, expect, test } from 'vitest';
import { InMemoryAuditStore } from '../src/adapter/audit-store/in-memory-audit-store.js';
import { InMemoryQuarantineStore } from '../src/adapter/quarantine-store/in-memory-quarantine-store.js';
import { CleanupOrchestrator, type CleanupDeps } from '../src/app/cleanup-orchestrator.js';
import { DefaultDenySafetyKernel } from '../src/app/default-deny-safety-kernel.js';
import type { Config } from '../src/config.js';
import type { CleanupPlan } from '../src/domain/artifact.js';
import { QUARANTINE_RECORD_SCHEMA_VERSION } from '../src/domain/common.js';
import type { QuarantineRecord } from '../src/domain/quarantine-record.js';

function config(): Config {
  return {
    dryRun: true,
    pluginVersion: '0.1.0',
    lifecycle: { goalPrimary: true, sessionFallback: true, turnEnabled: false },
  };
}

function emptyPlan(): CleanupPlan {
  return {
    planId: 'plan-1',
    manifestId: 'manifest-1',
    taskId: 'task-1',
    runId: 'run-1',
    createdAt: '2026-01-01T00:00:00Z',
    status: 'frozen',
    candidates: [],
  };
}

function quarantineRecord(quarantineId: string): QuarantineRecord {
  return {
    schemaVersion: QUARANTINE_RECORD_SCHEMA_VERSION,
    quarantineId,
    taskId: 'task-1',
    runId: 'run-1',
    manifestId: 'manifest-1',
    decisionId: 'decision-1',
    createdAt: '2026-01-01T00:00:00Z',
    status: 'pending',
    entries: [],
    restore: null,
  };
}

function deps(audit: InMemoryAuditStore, quarantine: InMemoryQuarantineStore): CleanupDeps {
  return {
    fs: {} as CleanupDeps['fs'],
    git: {} as CleanupDeps['git'],
    taskMetadata: { getCurrentTask: async () => null },
    lifecycle: { subscribe: () => () => {}, publish: () => {} },
    clock: { now: () => new Date(), nowIso: () => '2026-01-01T00:00:00Z', epochMs: () => 0 },
    hash: { sha256Hex: async () => 'a'.repeat(64) },
    audit,
    quarantine,
    safetyKernel: new DefaultDenySafetyKernel(),
  };
}

describe('CleanupOrchestrator', () => {
  test('quarantine is an explicit deny: intent audited before denied, nothing staged (m2)', async () => {
    const audit = new InMemoryAuditStore();
    const quarantine = new InMemoryQuarantineStore();
    const orchestrator = new CleanupOrchestrator(deps(audit, quarantine), config());

    const result = await orchestrator.quarantine(emptyPlan(), { type: 'user', id: 'u1' });

    expect(result).toBeNull();
    const events = await audit.read('run-1');
    expect(events).toHaveLength(2);
    expect(events[0].outcome).toBe('intent');
    expect(events[1].outcome).toBe('denied');
    expect(events[1].reason).toBe('default_deny_no_allowable_candidates');
    expect(events[0].seq).toBe(1);
    expect(events[1].seq).toBe(2);
  });

  test('restore backfills task/run/decision id from the quarantine record (m2/MINOR-2)', async () => {
    const audit = new InMemoryAuditStore();
    const quarantine = new InMemoryQuarantineStore();
    await quarantine.stage(quarantineRecord('q1'));

    const orchestrator = new CleanupOrchestrator(deps(audit, quarantine), config());
    const result = await orchestrator.restore('q1', { type: 'user', id: 'u1' });

    expect(result.decisionId).toBe('decision-1');

    const events = await audit.read('run-1');
    expect(events).toHaveLength(2);
    expect(events[0].taskId).toBe('task-1');
    expect(events[0].runId).toBe('run-1');
    expect(events[0].refs.quarantineId).toBe('q1');
    expect(events[0].seq).toBe(1);
    expect(events[1].seq).toBe(2);
    expect(events[1].outcome).toBe('denied');
  });
});
