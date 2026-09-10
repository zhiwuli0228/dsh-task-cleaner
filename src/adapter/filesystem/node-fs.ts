import { lstat, readdir, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, normalize, parse, relative, resolve, sep } from 'node:path';
import type { RelPath, RealPath } from '../../domain/common.js';
import type { FsPort, PathStat } from '../../ports/filesystem.js';

/**
 * Real FsPort adapter (S-02/S-03).
 *
 * Every path fact the safety kernel relies on is resolved here:
 * `realpath` resolves junction/reparse/symlink components, `lstat` never
 * follows links (so a symlink candidate is visible as a symlink), and
 * `contains` performs the workspace-boundary predicate against canonical
 * paths. There is deliberately no create/delete/unlink primitive (S-07).
 */
export class WorkspaceRootValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceRootValidationError';
  }
}

function samePath(a: string, b: string): boolean {
  const na = normalize(resolve(a));
  const nb = normalize(resolve(b));
  return process.platform === 'win32' ? na.toLowerCase() === nb.toLowerCase() : na === nb;
}

function hasGitComponent(path: string): boolean {
  return normalize(path)
    .split(sep)
    .filter(Boolean)
    .includes('.git');
}

function toPosix(path: string): string {
  return path.split(sep).join('/');
}

export class NodeFsPort implements FsPort {
  constructor(private readonly quarantineRoot?: string) {}

  async canonicalize(path: string): Promise<RealPath> {
    return this.realpath(path);
  }

  async realpath(path: string): Promise<RealPath> {
    const resolved = await realpath(resolve(path));
    return normalize(resolved) as RealPath;
  }

  async contains(root: RealPath, candidate: RealPath): Promise<boolean> {
    const rel = relative(normalize(root), normalize(candidate));
    // Strict containment: the root itself is never a valid candidate (S-02).
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
  }

  async lstat(path: RealPath): Promise<PathStat> {
    const stat = await lstat(path, { bigint: true });
    return {
      path,
      isDirectory: stat.isDirectory(),
      isFile: stat.isFile(),
      isSymlink: stat.isSymbolicLink(),
      identity: {
        dev: stat.dev.toString(),
        ino: stat.ino.toString(),
        nlink: Number(stat.nlink),
        ctime: new Date(Number(stat.ctimeMs)).toISOString(),
      },
      sizeBytes: Number(stat.size),
      mtime: new Date(Number(stat.mtimeMs)).toISOString(),
      mode: (stat.mode & 0o777n).toString(8).padStart(3, '0'),
    };
  }

  async list(root: RealPath): Promise<readonly RelPath[]> {
    const found: RelPath[] = [];
    const walk = async (absolute: string, prefix: string): Promise<void> => {
      const entries = await readdir(absolute, { withFileTypes: true });
      for (const entry of entries) {
        const absoluteChild = join(absolute, entry.name);
        const relChild = prefix ? `${prefix}/${entry.name}` : entry.name;
        const stat = await lstat(absoluteChild, { bigint: true });
        // Non-following traversal: symlinks are reported but never descended.
        if (stat.isSymbolicLink()) {
          found.push(toPosix(relChild) as RelPath);
          continue;
        }
        if (stat.isDirectory()) {
          await walk(absoluteChild, relChild);
        } else if (stat.isFile()) {
          found.push(toPosix(relChild) as RelPath);
        }
      }
    };
    await walk(normalize(root), '');
    return found.sort();
  }

  async validateWorkspaceRoot(root: RealPath): Promise<void> {
    if (!isAbsolute(root)) {
      throw new WorkspaceRootValidationError(`workspace root must be absolute: "${root}"`);
    }
    const resolved = normalize(resolve(root));
    if (resolved === parse(resolved).root) {
      throw new WorkspaceRootValidationError(`workspace root must not be the filesystem root: "${resolved}"`);
    }
    if (samePath(resolved, homedir())) {
      throw new WorkspaceRootValidationError(`workspace root must not be the user home directory: "${resolved}"`);
    }
    if (hasGitComponent(resolved)) {
      throw new WorkspaceRootValidationError(`workspace root must not be inside a .git directory: "${resolved}"`);
    }

    const stat = await lstat(resolved, { bigint: true });
    if (stat.isSymbolicLink()) {
      throw new WorkspaceRootValidationError(`workspace root must not be a symlink: "${resolved}"`);
    }
    if (!stat.isDirectory()) {
      throw new WorkspaceRootValidationError(`workspace root is not a directory: "${resolved}"`);
    }

    const quarantine = this.quarantineRoot;
    if (quarantine !== undefined && quarantine !== '') {
      if (samePath(resolved, quarantine)) {
        throw new WorkspaceRootValidationError('workspace root must not equal the quarantine root (S-05)');
      }
      const rel = relative(normalize(resolved), normalize(resolve(quarantine)));
      if (rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)) {
        throw new WorkspaceRootValidationError('workspace root must not contain the quarantine root (S-05)');
      }
    }
  }
}
