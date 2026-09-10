import { execFileSync } from 'node:child_process';
import { linkSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { NodeFsPort } from '../src/adapter/filesystem/node-fs.js';
import { NodeGitPort } from '../src/adapter/git/node-git.js';
import { DefaultDenySafetyKernel } from '../src/app/default-deny-safety-kernel.js';
import type { ArtifactCandidate, CleanupPlan } from '../src/domain/artifact.js';
import type { RealPath, RelPath } from '../src/domain/common.js';
import { SAFETY_REASON } from '../src/domain/safety-kernel.js';
import type { DecisionContext } from '../src/domain/safety-kernel.js';
import type { PathStat } from '../src/ports/filesystem.js';

const fsPort = new NodeFsPort();
const gitPort = new NodeGitPort();
const kernel = new DefaultDenySafetyKernel({ fs: fsPort, git: gitPort });

let root = '';
let outside = '';
let parentRepo = '';
let parentWs = '';
let brokenRepo = '';
let noRepo = '';
let trackedFile = '';
let untrackedFile = '';
let linkDir = '';
let hardLink = '';
let hardStat: PathStat | null = null;

function runGit(cwd: string, args: readonly string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore', windowsHide: true });
}

function candidateFor(
  candidateId: string,
  absolutePath: string,
  relPath: string,
  stat: PathStat,
): ArtifactCandidate {
  return {
    artifactId: `artifact-${candidateId}`,
    candidateId,
    decisionId: `data-layer-${candidateId}`,
    relPath: relPath as RelPath,
    sourceRealPath: absolutePath as RealPath,
    kind: 'temp',
    provenance: 'task_write',
    identity: stat.identity,
    sizeBytes: stat.sizeBytes,
    sha256: 'a'.repeat(64),
    mtime: stat.mtime,
    mode: stat.mode,
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

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'dsh-ws-'));
  outside = mkdtempSync(join(tmpdir(), 'dsh-outside-'));
  trackedFile = join(root, 'tracked.txt');
  untrackedFile = join(root, 'untracked.txt');
  writeFileSync(trackedFile, 'tracked');
  writeFileSync(untrackedFile, 'untracked');
  symlinkSync(outside, join(root, 'link-out'), 'junction');
  linkDir = join(root, 'link-out');
  runGit(root, ['init']);
  runGit(root, ['add', 'tracked.txt']);

  // Hardlink from its own source: linking to untrackedFile would raise that
  // file's nlink and change the "clean candidate" fixture.
  const hardSource = join(root, 'hard-source.txt');
  writeFileSync(hardSource, 'hard');
  hardLink = join(root, 'hard.txt');
  linkSync(hardSource, hardLink);
  hardStat = await fsPort.lstat(hardLink as RealPath);

  parentRepo = mkdtempSync(join(tmpdir(), 'dsh-parent-'));
  parentWs = join(parentRepo, 'ws');
  mkdirSync(parentWs);
  writeFileSync(join(parentWs, 'tracked.txt'), 'parent-tracked');
  runGit(parentRepo, ['init']);
  runGit(parentRepo, ['add', 'ws/tracked.txt']);

  brokenRepo = mkdtempSync(join(tmpdir(), 'dsh-broken-'));
  mkdirSync(join(brokenRepo, '.git'));
  writeFileSync(join(brokenRepo, 'file.txt'), 'broken');

  noRepo = mkdtempSync(join(tmpdir(), 'dsh-norepo-'));
  writeFileSync(join(noRepo, 'file.txt'), 'plain');
});

afterAll(() => {
  for (const dir of [root, outside, parentRepo, brokenRepo, noRepo]) {
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('candidate protections through real FsPort/GitPort adapters (MAJOR-01/GAP-M1)', () => {
  test('denies a Git-tracked file (S-04)', async () => {
    const stat = await fsPort.lstat(trackedFile as RealPath);
    const candidate = candidateFor('tracked', trackedFile, 'tracked.txt', stat);
    expect(await decideOne(candidate, root)).toBe(SAFETY_REASON.GIT_TRACKED);
  });

  test('denies a symlink/junction candidate without following it (S-03)', async () => {
    const stat = await fsPort.lstat(linkDir as RealPath);
    const candidate = candidateFor('link', linkDir, 'link-out', stat);
    expect(await decideOne(candidate, root)).toBe(SAFETY_REASON.SYMLINK_NOT_FOLLOWED);
  });

  test('detects a symlink at relPath even when sourceRealPath is already resolved (m2)', async () => {
    const resolvedTarget = await fsPort.realpath(linkDir as RealPath);
    const stat = await fsPort.lstat(linkDir as RealPath);
    const candidate = candidateFor('resolved-link', resolvedTarget, 'link-out', stat);
    expect(await decideOne(candidate, root)).toBe(SAFETY_REASON.SYMLINK_NOT_FOLLOWED);
  });

  test('denies when relPath and sourceRealPath describe different files (m2)', async () => {
    const stat = await fsPort.lstat(trackedFile as RealPath);
    const candidate = candidateFor('unbound', trackedFile, 'untracked.txt', stat);
    expect(await decideOne(candidate, root)).toBe(SAFETY_REASON.REL_PATH_UNBOUND);
  });

  test('denies a candidate whose identity changed after planning (S-05/S-06)', async () => {
    const stat = await fsPort.lstat(trackedFile as RealPath);
    const candidate = candidateFor('identity', trackedFile, 'tracked.txt', {
      ...stat,
      identity: { ...stat.identity, ino: '999999' },
    });
    expect(await decideOne(candidate, root)).toBe(SAFETY_REASON.IDENTITY_MISMATCH);
  });

  test('denies hardlinked candidates (m3)', async () => {
    if (!hardStat || hardStat.identity.nlink < 2) return; // filesystem without hardlink nlink support
    const candidate = candidateFor('hardlink', hardLink, 'hard.txt', hardStat);
    expect(await decideOne(candidate, root)).toBe(SAFETY_REASON.HARDLINK_NOT_ALLOWED);
  });

  test('denies any path inside .git internals (m1)', async () => {
    const gitConfig = join(root, '.git', 'config');
    const stat = await fsPort.lstat(gitConfig as RealPath);
    const candidate = candidateFor('git-internal', gitConfig, '.git/config', stat);
    expect(await decideOne(candidate, root)).toBe(SAFETY_REASON.GIT_INTERNAL_PATH);
  });

  test('an untracked, in-workspace, non-symlink candidate still hits the fail-closed default (S-07)', async () => {
    const stat = await fsPort.lstat(untrackedFile as RealPath);
    const candidate = candidateFor('clean', untrackedFile, 'untracked.txt', stat);
    expect(await decideOne(candidate, root)).toBe(SAFETY_REASON.NOT_IMPLEMENTED_DEFAULT_DENY);
  });

  test('contains is strict: inside passes, outside fails (S-02)', async () => {
    await expect(fsPort.contains(root as RealPath, untrackedFile as RealPath)).resolves.toBe(true);
    await expect(fsPort.contains(root as RealPath, outside as RealPath)).resolves.toBe(false);
    await expect(fsPort.contains(root as RealPath, root as RealPath)).resolves.toBe(false);
  });

  test('validates workspace roots and rejects filesystem root (S-02)', async () => {
    await expect(fsPort.validateWorkspaceRoot(root as RealPath)).resolves.toBeUndefined();
    const fsRoot = (process.platform === 'win32' ? 'C:\\' : '/') as RealPath;
    await expect(fsPort.validateWorkspaceRoot(fsRoot)).rejects.toThrow();
  });
});

describe('NodeGitPort fail-closed semantics (ReviewAgent M1)', () => {
  test('tracks files through a parent repository when the workspace has no .git of its own', async () => {
    const status = await gitPort.status(parentWs, 'tracked.txt');
    expect(status.tracked).toBe(true);
    expect(status.index).toBe(true);
    await expect(gitPort.hasGitDir(parentWs)).resolves.toBe(true);
  });

  test('fails closed when .git exists but the repository is unusable', async () => {
    const status = await gitPort.status(brokenRepo, 'file.txt');
    expect(status.tracked).toBe(true);
    expect(status.head).toBe(true);
    expect(status.index).toBe(true);
  });

  test('reports untracked only for a confirmed non-repository path', async () => {
    const status = await gitPort.status(noRepo, 'file.txt');
    expect(status.tracked).toBe(false);
    await expect(gitPort.hasGitDir(noRepo)).resolves.toBe(false);
  });

  test('fails closed for invalid relative paths', async () => {
    for (const bad of ['', '/abs', '../escape', 'a/../../b']) {
      const status = await gitPort.status(root, bad);
      expect(status.tracked).toBe(true);
    }
  });
});
