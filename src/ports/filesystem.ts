import type { FileIdentity, RelPath, RealPath } from '../domain/common.js';

export interface PathStat {
  readonly path: RealPath;
  readonly isDirectory: boolean;
  readonly isFile: boolean;
  readonly isSymlink: boolean;
  readonly identity: FileIdentity;
  readonly sizeBytes: number;
  readonly mtime: string;
  readonly mode: string;
}

/**
 * Filesystem port — the ONLY layer allowed to touch path/filesystem details
 * (ADR-002 / ADR-004). Read-only: traversal never follows links, and there is
 * no delete/unlink primitive (S-07).
 */
export interface FsPort {
  /** Absolute, canonical, case-normalized path (per-component junction/reparse resolution). */
  canonicalize(path: string): Promise<RealPath>;
  /** Resolve symlinks/junctions to a canonical absolute path. */
  realpath(path: string): Promise<RealPath>;
  /**
   * Pure join of a workspace root and a workspace-relative POSIX path.
   * Returns null when the relative path is empty, absolute, or escapes the
   * root (`..`); never performs IO. Business code uses this instead of
   * constructing paths itself (ADR-002 rule 4).
   */
  resolveRelative(root: RealPath, relPath: RelPath): RealPath | null;
  /** Canonical path equality (case-insensitive on Windows). */
  samePath(a: RealPath, b: RealPath): boolean;
  /** Containment predicate: candidate strictly inside root after canonicalization (S-02). */
  contains(root: RealPath, candidate: RealPath): Promise<boolean>;
  /** lstat (never follows symlinks) with identity for S-05/S-06. */
  lstat(path: RealPath): Promise<PathStat>;
  /** Non-following directory listing returning workspace-relative POSIX paths. */
  list(root: RealPath): Promise<readonly RelPath[]>;
  /** Validate a workspace root: existing absolute directory, not fs root / home / quarantine root / .git (S-02). */
  validateWorkspaceRoot(root: RealPath): Promise<void>;
}
