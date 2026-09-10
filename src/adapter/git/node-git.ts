import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { isAbsolute, join, normalize } from 'node:path';
import { promisify } from 'node:util';
import type { GitStatus } from '../../domain/common.js';
import type { GitPort } from '../../ports/git.js';

const execFileAsync = promisify(execFile);

/** Fail-closed status: an unanswerable Git question protects the file (S-04). */
const PROTECTED: GitStatus = { tracked: true, head: true, index: true };
const UNTRACKED: GitStatus = { tracked: false, head: false, index: false };

function isSafeRelPath(relPath: string): boolean {
  if (!relPath || isAbsolute(relPath)) return false;
  const normalized = normalize(relPath).replace(/\\/g, '/');
  return !normalized.split('/').includes('..') && !normalized.startsWith('/');
}

/**
 * Real GitPort adapter (S-04), backed by the `git` CLI with no shell
 * interpretation. Invalid relative paths, a missing `.git` directory, and a
 * missing `git` executable all resolve fail-closed so a tracked-file
 * protection check can never silently report "untracked".
 */
export class NodeGitPort implements GitPort {
  async status(workspaceRoot: string, relPath: string): Promise<GitStatus> {
    if (!isSafeRelPath(relPath)) return PROTECTED;
    if (!(await this.hasGitDir(workspaceRoot))) return UNTRACKED;
    const posix = relPath.replace(/\\/g, '/');

    const index = await this.gitSucceeds(workspaceRoot, ['ls-files', '--error-unmatch', '--', posix]);
    const head = await this.gitSucceeds(workspaceRoot, ['cat-file', '-e', `HEAD:${posix}`]);
    if (index === null || head === null) return PROTECTED;
    return { tracked: index || head, head, index };
  }

  async hasGitDir(workspaceRoot: string): Promise<boolean> {
    try {
      await access(join(workspaceRoot, '.git'));
      return true;
    } catch {
      return false;
    }
  }

  /** `true`/`false` on a normal Git answer, `null` when Git itself is unavailable. */
  private async gitSucceeds(workspaceRoot: string, args: readonly string[]): Promise<boolean | null> {
    try {
      await execFileAsync('git', ['-C', workspaceRoot, ...args], { windowsHide: true });
      return true;
    } catch (error) {
      const code = (error as { code?: string | number }).code;
      if (code === 'ENOENT') return null;
      return false;
    }
  }
}
