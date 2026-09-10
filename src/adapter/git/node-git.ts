import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { GitStatus } from '../../domain/common.js';
import type { GitPort } from '../../ports/git.js';

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 10_000;
const GIT_MAX_BUFFER = 4 * 1024 * 1024;

/** Fail-closed status: an unanswerable Git question protects the file (S-04). */
const PROTECTED: GitStatus = { tracked: true, head: true, index: true };
const UNTRACKED: GitStatus = { tracked: false, head: false, index: false };

interface GitRun {
  /** Process exit code, or null when Git could not be executed at all. */
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  /** Git was missing, unrunnable, timed out, or denied by the OS. */
  readonly unavailable: boolean;
}

function normalizeRelPath(relPath: string): string | null {
  if (!relPath || isAbsolute(relPath)) return null;
  const normalized = normalize(relPath).replace(/\\/g, '/');
  if (normalized.startsWith('/') || normalized.split('/').includes('..')) return null;
  return normalized;
}

function looksLikeNotARepository(stderr: string): boolean {
  return /not a git repository|not a git work tree/i.test(stderr);
}

function looksLikeMissingHead(stderr: string): boolean {
  return /not a valid object name|unknown revision|ambiguous argument|does not exist/i.test(stderr);
}

/**
 * True when a `.git` entry exists at the workspace or any ancestor. A broken
 * `.git` still means "this path is meant to be Git-backed", so an
 * unanswerable question there must fail closed rather than look untracked.
 */
async function hasGitEntry(workspaceRoot: string): Promise<boolean> {
  let current = resolve(workspaceRoot);
  for (;;) {
    try {
      await access(join(current, '.git'));
      return true;
    } catch {
      // keep walking up
    }
    const parent = dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

/**
 * Real GitPort adapter (S-04), backed by the `git` CLI with no shell
 * interpretation.
 *
 * Fail-closed rules (ReviewAgent M1):
 * - repository availability is probed with `rev-parse --is-inside-work-tree`,
 *   so a workspace that is a subdirectory of a parent repository is still
 *   recognized as Git-backed;
 * - `ls-files --error-unmatch` exit 1 means "not tracked", any higher exit
 *   code (fatal/corrupt/permission) is treated as PROTECTED;
 * - a missing `git` executable, timeout, EACCES, or any other spawn failure is
 *   PROTECTED;
 * - only a confirmed "not a git repository" answer yields UNTRACKED.
 */
export class NodeGitPort implements GitPort {
  async hasGitDir(workspaceRoot: string): Promise<boolean> {
    const inside = await this.run(workspaceRoot, ['rev-parse', '--is-inside-work-tree']);
    if (inside.code === 0 && inside.stdout.trim() === 'true') return true;
    return hasGitEntry(workspaceRoot);
  }

  async status(workspaceRoot: string, relPath: string): Promise<GitStatus> {
    const posix = normalizeRelPath(relPath);
    if (posix === null) return PROTECTED;

    const inside = await this.run(workspaceRoot, ['rev-parse', '--is-inside-work-tree']);
    if (inside.unavailable) return PROTECTED;
    if (inside.code !== 0) {
      if (looksLikeNotARepository(inside.stderr) && !(await hasGitEntry(workspaceRoot))) {
        return UNTRACKED;
      }
      return PROTECTED;
    }
    if (inside.stdout.trim() !== 'true') {
      return (await hasGitEntry(workspaceRoot)) ? PROTECTED : UNTRACKED;
    }

    const index = await this.trackedInIndex(workspaceRoot, posix);
    if (index === null) return PROTECTED;
    const head = await this.trackedInHead(workspaceRoot, posix);
    if (head === null) return PROTECTED;
    return { tracked: index || head, head, index };
  }

  /** `true`/`false` on a Git answer, `null` when the answer is untrustworthy. */
  private async trackedInIndex(workspaceRoot: string, posix: string): Promise<boolean | null> {
    const result = await this.run(workspaceRoot, ['ls-files', '--error-unmatch', '--', posix]);
    if (result.unavailable) return null;
    if (result.code === 0) return true;
    // Exit 1 is Git's "pathspec did not match"; >=2/128 is a fatal error.
    if (result.code === 1) return false;
    return null;
  }

  private async trackedInHead(workspaceRoot: string, posix: string): Promise<boolean | null> {
    const verify = await this.run(workspaceRoot, ['rev-parse', '--verify', '--quiet', 'HEAD']);
    if (verify.unavailable) return null;
    if (verify.code !== 0) {
      // A repository with no commits yet has no HEAD; exit 1 is conclusive.
      if (verify.code === 1 || looksLikeMissingHead(verify.stderr)) return false;
      return null;
    }
    const tree = await this.run(workspaceRoot, [
      'ls-tree',
      '-r',
      '--name-only',
      'HEAD',
      '--',
      posix,
    ]);
    if (tree.unavailable || tree.code !== 0) return null;
    return tree.stdout.trim().length > 0;
  }

  private async run(workspaceRoot: string, args: readonly string[]): Promise<GitRun> {
    try {
      const { stdout, stderr } = await execFileAsync('git', ['-C', workspaceRoot, ...args], {
        windowsHide: true,
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: GIT_MAX_BUFFER,
      });
      return {
        code: 0,
        stdout: String(stdout),
        stderr: String(stderr),
        unavailable: false,
      };
    } catch (error) {
      const failure = error as {
        code?: string | number;
        killed?: boolean;
        stdout?: string;
        stderr?: string;
      };
      const exitCode = failure.code;
      if (failure.killed === true || typeof exitCode !== 'number') {
        return { code: null, stdout: '', stderr: '', unavailable: true };
      }
      return {
        code: exitCode,
        stdout: String(failure.stdout ?? ''),
        stderr: String(failure.stderr ?? ''),
        unavailable: false,
      };
    }
  }
}
