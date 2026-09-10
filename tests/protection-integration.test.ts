import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { NodeFsPort } from '../src/adapter/filesystem/node-fs.js';
import { NodeGitPort } from '../src/adapter/git/node-git.js';
import { DefaultDenySafetyKernel } from '../src/app/default-deny-safety-kernel.js';
import type { ArtifactCandidate, CleanupPlan } from '../src/domain/artifact.js';
import type { FileIdentity, RealPath, RelPath } from '../src/domain/common.js';
import { SAFETY_REASON } from '../src/domain/safety-kernel.js';
import type { DecisionContext } from '../src/domain/safety-kernel.js';

const fsPort = new NodeFsPort();
const gitPort = new NodeGitPort();
const kernel = new DefaultDenySafetyKernel({ fs: fsPort, git: gitPort });

let root = '';
let outside = '';
let trackedFile = '';
let untrackedFile = '';
let linkDir = '';

function runGit(args: readonly string[]): void {
  execFileSync('git', args, { cwd: root, stdio: 'ignore', windowsHide: true });
}

function candidateFor(
  candidateId: string,
  absolutePath: string,
  relPath: string,
  identity: FileIdentity,
): ArtifactCandidate {
  return {
    artifactId: `artifact-${candidateId}`,
    candidateId,
    decisionId: `data-layer-${candidateId}`,
    relPath: relPath as RelPath,
    sourceRealPath: absolutePath as RealPath,
    kind: 'temp',
    provenance: 'task_write',
    identity,
    sizeBytes: 1,
    sha256: 'a'.repeat(64),
    mtime: '2026-01-01T00:00:00Z',
    mode: '644',
    gitTracked: false,
    symlink: null,
    matchedBy: ['integration'],
    state: 'candidate',
  };
}

async function decideOne(candidate: ArtifactCandidate, workspaceRoot: string): Promise<string> {
  const plan: CleanupPlan = {
    planId: 'plan-1',
    manifestId: 'manifest-1',
    taskId: 'task-1',
    runId: 'run-1',
    createdAt: '2026-01-01T00:00:00Z',
    status: 'frozen',
    candidates: [candidate],
  };
  const context: DecisionContext = {
    taskId: 'task-1',
    runId: 'run-1',
    workspaceRoot,
    now: '2026-01-01T00:00:00Z',
    dryRun: true,
  };
  const summary = await kernel.decide(plan, context);
  return summary.decisions[0].reasonCode;
}

describe('candidate protections through real FsPort/GitPort adapters (MAJOR-01/GAP-M1)', () => {
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'dsh-ws-'));
    outside = mkdtempSync(join(tmpdir(), 'dsh-outside-'));
    trackedFile = join(root, 'tracked.txt');
    untrackedFile = join(root, 'untracked.txt');
    writeFileSync(trackedFile, 'tracked');
    writeFileSync(untrackedFile, 'untracked');
    symlinkSync(outside, join(root, 'link-out'), 'junction');
    linkDir = join(root, 'link-out');
    runGit(['init']);
    runGit(['add', 'tracked.txt']);
  });

  afterAll(() => {
    for (const dir of [root, outside]) {
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  test('denies a Git-tracked file (S-04)', async () => {
    const stat = await fsPort.lstat(trackedFile as RealPath);
    const candidate = candidateFor('tracked', trackedFile, 'tracked.txt', stat.identity);
    expect(await decideOne(candidate, root)).toBe(SAFETY_REASON.GIT_TRACKED);
  });

  test('denies a symlink/junction candidate without following it (S-03)', async () => {
    const stat = await fsPort.lstat(linkDir as RealPath);
    const candidate = candidateFor('link', linkDir, 'link-out', stat.identity);
    expect(await decideOne(candidate, root)).toBe(SAFETY_REASON.SYMLINK_NOT_FOLLOWED);
  });

  test('denies a candidate outside the workspace boundary (S-02)', async () => {
    const stat = await fsPort.lstat(outside as RealPath);
    const candidate = candidateFor('outside', outside, 'outside', stat.identity);
    expect(await decideOne(candidate, root)).toBe(SAFETY_REASON.OUTSIDE_WORKSPACE);
  });

  test('denies a candidate whose identity changed after planning (S-05/S-06)', async () => {
    const stat = await fsPort.lstat(trackedFile as RealPath);
    const candidate = candidateFor('identity', trackedFile, 'tracked.txt', {
      ...stat.identity,
      ino: '999999',
    });
    expect(await decideOne(candidate, root)).toBe(SAFETY_REASON.IDENTITY_MISMATCH);
  });

  test('an untracked, in-workspace, non-symlink candidate still hits the fail-closed default (S-07)', async () => {
    const stat = await fsPort.lstat(untrackedFile as RealPath);
    const candidate = candidateFor('clean', untrackedFile, 'untracked.txt', stat.identity);
    expect(await decideOne(candidate, root)).toBe(SAFETY_REASON.NOT_IMPLEMENTED_DEFAULT_DENY);
  });

  test('validates workspace roots and rejects filesystem root (S-02)', async () => {
    await expect(fsPort.validateWorkspaceRoot(root as RealPath)).resolves.toBeUndefined();
    const fsRoot = (process.platform === 'win32' ? 'C:\\' : '/') as RealPath;
    await expect(fsPort.validateWorkspaceRoot(fsRoot)).rejects.toThrow();
  });

  test('detects Git directory presence through the GitPort', async () => {
    await expect(gitPort.hasGitDir(root)).resolves.toBe(true);
    await expect(gitPort.hasGitDir(outside)).resolves.toBe(false);
  });
});
