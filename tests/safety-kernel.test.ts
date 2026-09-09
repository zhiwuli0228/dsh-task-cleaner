import { describe, expect, test } from 'vitest';
import { DefaultDenySafetyKernel } from '../src/app/default-deny-safety-kernel.js';
import type { ArtifactCandidate, CleanupPlan } from '../src/domain/artifact.js';
import { SAFETY_REASON } from '../src/domain/safety-kernel.js';
import type { DecisionContext } from '../src/domain/safety-kernel.js';

function candidate(candidateId: string, decisionId: string): ArtifactCandidate {
  return {
    artifactId: `artifact-${candidateId}`,
    candidateId,
    decisionId,
    relPath: `tmp/${candidateId}`,
    kind: 'temp',
    provenance: 'task_write',
    identity: { dev: '1', ino: '1', nlink: 1, ctime: '2026-01-01T00:00:00Z' },
    sizeBytes: 10,
    sha256: 'a'.repeat(64),
    mtime: '2026-01-01T00:00:00Z',
    mode: '0644',
    gitTracked: false,
    symlink: null,
    matchedBy: ['rule'],
    state: 'candidate',
  };
}

function plan(candidates: readonly ArtifactCandidate[]): CleanupPlan {
  return {
    planId: 'plan-1',
    manifestId: 'manifest-1',
    taskId: 'task-1',
    runId: 'run-1',
    createdAt: '2026-01-01T00:00:00Z',
    status: 'frozen',
    candidates,
  };
}

const context: DecisionContext = {
  taskId: 'task-1',
  runId: 'run-1',
  workspaceRoot: '/workspace',
  now: '2026-01-01T00:00:00Z',
  dryRun: true,
};

describe('DefaultDenySafetyKernel', () => {
  test('denies every candidate with the default-deny reason (S-01/S-07)', () => {
    const summary = new DefaultDenySafetyKernel().decide(
      plan([candidate('c1', 'd1'), candidate('c2', 'd2')]),
      context,
    );

    expect(summary.allowed).toBe(0);
    expect(summary.review).toBe(0);
    expect(summary.denied).toBe(2);
    expect(summary.decisions).toHaveLength(2);
    for (const decision of summary.decisions) {
      expect(decision.decision).toBe('deny');
      expect(decision.reasonCode).toBe(SAFETY_REASON.NOT_IMPLEMENTED_DEFAULT_DENY);
    }
  });

  test('returns an empty summary for an empty plan', () => {
    const summary = new DefaultDenySafetyKernel().decide(plan([]), context);
    expect(summary.decisions).toEqual([]);
    expect(summary.allowed).toBe(0);
    expect(summary.denied).toBe(0);
    expect(summary.review).toBe(0);
  });

  test('generates a fresh decisionId per decision, independent of the candidate (MINOR-1)', () => {
    const summary = new DefaultDenySafetyKernel().decide(
      plan([candidate('c1', 'data-layer-id')]),
      context,
    );

    const decision = summary.decisions[0];
    expect(decision.decisionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(decision.decisionId).not.toBe('data-layer-id');
  });

  test('emits distinct decisionIds for distinct candidates (MINOR-1)', () => {
    const summary = new DefaultDenySafetyKernel().decide(
      plan([candidate('c1', 'd1'), candidate('c2', 'd2')]),
      context,
    );

    expect(summary.decisions[0].decisionId).not.toBe(summary.decisions[1].decisionId);
  });
});
