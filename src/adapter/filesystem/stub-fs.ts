import { isAbsolute, relative, resolve } from 'node:path';
import type { RelPath, RealPath } from '../../domain/common.js';
import type { FsPort, PathStat } from '../../ports/filesystem.js';

/**
 * Stub FsPort for the baseline (S-02/S-03).
 *
 * Path primitives are host-`resolve`d only; no real traversal or identity
 * capture happens in this milestone. The real adapter (junction/reparse
 * resolution, per-component containment, handle-based identity re-verification)
 * lands with the actual cleanup implementation.
 */
export class StubFsPort implements FsPort {
  async canonicalize(path: string): Promise<RealPath> {
    return resolve(path) as RealPath;
  }

  async realpath(path: string): Promise<RealPath> {
    return resolve(path) as RealPath;
  }

  async contains(root: RealPath, candidate: RealPath): Promise<boolean> {
    const rel = relative(root, candidate);
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  }

  async lstat(path: RealPath): Promise<PathStat> {
    return {
      path,
      isDirectory: false,
      isFile: true,
      isSymlink: false,
      identity: { dev: '0', ino: '0', nlink: 1, ctime: new Date().toISOString() },
      sizeBytes: 0,
      mtime: new Date().toISOString(),
      mode: '0644',
    };
  }

  async list(_root: RealPath): Promise<readonly RelPath[]> {
    return [];
  }

  async validateWorkspaceRoot(_root: RealPath): Promise<void> {
    // Stub: no validation. The real adapter enforces S-02 (existing absolute
    // dir, not fs root / home / quarantine root / .git).
  }
}
