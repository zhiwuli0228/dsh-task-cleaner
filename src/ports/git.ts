import type { GitStatus } from '../domain/common.js';

/**
 * Git port — the ONLY Git call site (ADR-002 / S-04). Backed by a stub/fake
 * in this milestone; tests exercise tracked-file protection against the fake.
 */
export interface GitPort {
  /** HEAD/index tracked status for a workspace-relative path. */
  status(workspaceRoot: string, relPath: string): Promise<GitStatus>;
  /** True when the workspace has a `.git` directory. */
  hasGitDir(workspaceRoot: string): Promise<boolean>;
}
