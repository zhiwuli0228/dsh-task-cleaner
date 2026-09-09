import { lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, parse } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { ConfigRootValidationError, validateConfigRoots } from '../src/config-validation.js';

const tempDirs: string[] = [];

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-cleaner-'));
  tempDirs.push(dir);
  return dir;
}

function canCreateDirSymlink(): boolean {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-sym-'));
  const target = join(dir, 'target');
  const link = join(dir, 'link');
  try {
    mkdirSync(target);
    symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
    return lstatSync(link).isSymbolicLink();
  } catch {
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const symlinkSupported = canCreateDirSymlink();

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('validateConfigRoots (MAJOR-03)', () => {
  test('accepts no roots', () => {
    expect(() => validateConfigRoots({})).not.toThrow();
  });

  test('accepts a single valid workspaceRoot', () => {
    expect(() => validateConfigRoots({ workspaceRoot: makeDir() })).not.toThrow();
  });

  test('accepts a single valid quarantineRoot', () => {
    expect(() => validateConfigRoots({ quarantineRoot: makeDir() })).not.toThrow();
  });

  test('accepts a workspace and an outside quarantine root', () => {
    const workspace = makeDir();
    const quarantine = makeDir();
    expect(() => validateConfigRoots({ workspaceRoot: workspace, quarantineRoot: quarantine })).not.toThrow();
  });

  test('rejects a relative path', () => {
    expect(() => validateConfigRoots({ workspaceRoot: 'relative/path' })).toThrow(ConfigRootValidationError);
  });

  test('rejects a non-existent path', () => {
    expect(() => validateConfigRoots({ workspaceRoot: join(makeDir(), 'missing') })).toThrow(ConfigRootValidationError);
  });

  test('rejects a path that is a file, not a directory', () => {
    const dir = makeDir();
    const file = join(dir, 'file.txt');
    writeFileSync(file, 'x');
    expect(() => validateConfigRoots({ workspaceRoot: file })).toThrow(ConfigRootValidationError);
  });

  test('rejects the filesystem root', () => {
    expect(() => validateConfigRoots({ workspaceRoot: parse(tmpdir()).root })).toThrow(ConfigRootValidationError);
  });

  test('rejects the user home directory', () => {
    expect(() => validateConfigRoots({ workspaceRoot: homedir() })).toThrow(ConfigRootValidationError);
  });

  test('rejects a path inside a .git directory', () => {
    const dir = makeDir();
    const gitDir = join(dir, '.git');
    mkdirSync(gitDir);
    expect(() => validateConfigRoots({ workspaceRoot: gitDir })).toThrow(ConfigRootValidationError);
  });

  test('rejects workspaceRoot === quarantineRoot', () => {
    const dir = makeDir();
    expect(() => validateConfigRoots({ workspaceRoot: dir, quarantineRoot: dir })).toThrow(ConfigRootValidationError);
  });

  test('rejects quarantineRoot nested inside workspaceRoot', () => {
    const workspace = makeDir();
    const quarantine = join(workspace, 'quarantine');
    mkdirSync(quarantine);
    expect(() => validateConfigRoots({ workspaceRoot: workspace, quarantineRoot: quarantine })).toThrow(
      ConfigRootValidationError,
    );
  });

  test('rejects workspaceRoot nested inside quarantineRoot', () => {
    const quarantine = makeDir();
    const workspace = join(quarantine, 'workspace');
    mkdirSync(workspace);
    expect(() => validateConfigRoots({ workspaceRoot: workspace, quarantineRoot: quarantine })).toThrow(
      ConfigRootValidationError,
    );
  });

  test.skipIf(!symlinkSupported)('rejects a quarantineRoot symlink even when workspaceRoot is unset (MINOR-2)', () => {
    const dir = makeDir();
    const target = join(dir, 'target');
    mkdirSync(target);
    const link = join(dir, 'link');
    symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');

    expect(() => validateConfigRoots({ quarantineRoot: link })).toThrow(ConfigRootValidationError);
  });
});
