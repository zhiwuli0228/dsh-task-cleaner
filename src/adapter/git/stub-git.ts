import type { GitStatus } from '../../domain/common.js';
import type { GitPort } from '../../ports/git.js';

/**
 * Stub GitPort for the baseline (S-04). Tests seed tracked paths to exercise
 * tracked-file protection; no real `git` subprocess runs.
 */
export class StubGitPort implements GitPort {
  private readonly tracked = new Set<string>();

  constructor(trackedRelPaths: readonly string[] = []) {
    for (const path of trackedRelPaths) this.tracked.add(path);
  }

  async status(_workspaceRoot: string, relPath: string): Promise<GitStatus> {
    const tracked = this.tracked.has(relPath);
    return { tracked, head: tracked, index: tracked };
  }

  async hasGitDir(_workspaceRoot: string): Promise<boolean> {
    return true;
  }

  track(relPath: string): void {
    this.tracked.add(relPath);
  }
}
