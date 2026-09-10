import { describe, expect, test } from 'vitest';
import { DefaultDenySafetyKernel } from '../src/app/default-deny-safety-kernel.js';
import type { ArtifactCandidate, CleanupPlan } from '../src/domain/artifact.js';
import type { FileIdentity, RealPath } from '../src/domain/common.js';
import { SAFETY_REASON } from '../src/domain/safety-kernel.js';
import type { DecisionContext } from '../src/domain/safety-kernel.js';
import type { FsPort, PathStat } from '../src/ports/filesystem.js';
import type { GitPort } from '../src/ports/git.js';

const IDENTITY: FileIdentity = { dev: '1', ino: '1', nlink: 1, ctime: '2026-01-01T00:00:00Z' };

interface FakeFsOptions {
  readonly contained?: boolean;
  readonly symlink?: boolean;
  readonly identity?: FileIdentity;
  readonly lstatFails?: boolean;
  readonly realpathFails?: boolean;
}

class FakeFs implements FsPort {
  constructor(private readonly options: FakeFsOptions = {}) {}

  async canonicalize(path: string): Promise<RealPath> {
    return path as RealPath;
  }

  async realpath(path: string): Promise<RealPath> {
    if (this.options.realpathFails) throw new Error('realpath_failed');
    return path as RealPath;
  }

  async contains(): Promise<boolean> {
    return this.options.contained ?? true;
  }

  async lstat(path: RealPath): Promise<PathStat> {
    if (this.options.lstatFails) throw new Error('lstat_failed');
    return {
      path,
      isDirectory: false,
      isFile: true,
      isSymlink: this.options.symlink ?? false,
      identity: this.options.identity ?? IDENTITY,
      sizeBytes: 10,
      mtime: '2026-01-01T00:00:00Z',
      mode: '644',
    };
  }

  async list(): Promise<readonly string[]> {
    return [];
  }

  async validateWorkspaceRoot(): Promise<void> {}
}

class FakeGit implements GitPort {
  constructor(private readonly tracked = false) {}

  async status() {
    return { tracked: this.tracked, head: this.tracked, index: this.tracked };
  }

  async hasGitDir(): Promise<boolean> {
    return true;
  }
}

function candidate(candidateId: string, overrides: Partial<ArtifactCandidate> = {}): ArtifactCandidate {
  return {
    artifactId: `artifact-${candidateId}`,
    candidateId,
    decisionId: `data-layer-${candidateId}`,
    relPath: `tmp/${candidateId}`,
    sourceRealPath: `/workspace/tmp/${candidateId}` as RealPath,
    kind: 'temp',
    provenance: 'task_write',
    identity: IDENTITY,
    sizeBytes: 10,
    sha256: 'a'.repeat(64),
    mtime: '2026-01-01T00:00:00Z',
    mode: '0644',
    gitTracked: false,
    symlink: null,
    matchedBy: ['rule'],
    state: 'candidate',
    ...overrides,
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

function kernel(fsOptions: FakeFsOptions = {}, tracked = false): DefaultDenySafetyKernel {
  return new DefaultDenySafetyKernel({ fs: new FakeFs(fsOptions), git: new FakeGit(tracked) });
}

describe('DefaultDenySafetyKernel protection predicates', () => {
  test('denies every candidate and never allows (S-01/S-07)', async () => {
    const summary = await kernel().decide(plan([candidate('c1'), candidate('c2')]), context);

    expect(summary.allowed).toBe(0);
    expect(summary.review).toBe(0);
    expect(summary.denied).toBe(2);
    expect(summary.decisions).toHaveLength(2);
    for (const decision of summary.decisions) {
      expect(decision.decision).toBe('deny');
      expect(decision.reasonCode).toBe(SAFETY_REASON.NOT_IMPLEMENTED_DEFAULT_DENY);
    }
  });

  test('returns an empty summary for an empty plan', async () => {
    const summary = await kernel().decide(plan([]), context);
    expect(summary.decisions).toEqual([]);
    expect(summary.allowed).toBe(0);
    expect(summary.denied).toBe(0);
    expect(summary.review).toBe(0);
  });

  test('denies a candidate without a canonical source path', async () => {
    const summary = await kernel().decide(
      plan([candidate('c1', { sourceRealPath: undefined })]),
      context,
    );
    expect(summary.decisions[0].reasonCode).toBe(SAFETY_REASON.MISSING_REAL_PATH);
  });

  test('denies every candidate when the workspace root is unusable', async () => {
    const summary = await kernel().decide(plan([candidate('c1')]), { ...context, workspaceRoot: '' });
    expect(summary.decisions[0].reasonCode).toBe(SAFETY_REASON.MISSING_WORKSPACE_ROOT);
  });

  test('denies symlink candidates without following them (S-03)', async () => {
    const summary = await kernel({ symlink: true }).decide(plan([candidate('c1')]), context);
    expect(summary.decisions[0].reasonCode).toBe(SAFETY_REASON.SYMLINK_NOT_FOLLOWED);
  });

  test('denies candidates outside the workspace boundary (S-02)', async () => {
    const summary = await kernel({ contained: false }).decide(plan([candidate('c1')]), context);
    expect(summary.decisions[0].reasonCode).toBe(SAFETY_REASON.OUTSIDE_WORKSPACE);
  });

  test('denies candidates whose captured identity no longer matches (S-05/S-06)', async () => {
    const summary = await kernel({ identity: { ...IDENTITY, ino: '2' } }).decide(
      plan([candidate('c1')]),
      context,
    );
    expect(summary.decisions[0].reasonCode).toBe(SAFETY_REASON.IDENTITY_MISMATCH);
  });

  test('denies Git-tracked candidates (S-04)', async () => {
    const summary = await kernel({}, true).decide(plan([candidate('c1')]), context);
    expect(summary.decisions[0].reasonCode).toBe(SAFETY_REASON.GIT_TRACKED);
  });

  test('denies unresolvable candidates', async () => {
    const summary = await kernel({ lstatFails: true }).decide(plan([candidate('c1')]), context);
    expect(summary.decisions[0].reasonCode).toBe(SAFETY_REASON.UNRESOLVABLE_PATH);
  });

  test('generates a fresh decisionId per decision, independent of the candidate (MINOR-1)', async () => {
    const summary = await kernel().decide(plan([candidate('c1', { decisionId: 'data-layer-id' })]), context);
    const decision = summary.decisions[0];
    expect(decision.decisionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(decision.decisionId).not.toBe('data-layer-id');
  });

  test('emits distinct decisionIds for distinct candidates (MINOR-1)', async () => {
    const summary = await kernel().decide(plan([candidate('c1'), candidate('c2')]), context);
    expect(summary.decisions[0].decisionId).not.toBe(summary.decisions[1].decisionId);
  });
});
