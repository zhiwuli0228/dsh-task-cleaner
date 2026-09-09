import { lstatSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, normalize, parse, relative, resolve, sep } from 'node:path';
import type { Config } from './config.js';

/**
 * Startup semantic validation for the explicit filesystem roots (MAJOR-03).
 *
 * Schemastery only checks shape/type; these checks enforce the S-02/S-05
 * semantics that make a root safe to act on. Any violation refuses plugin
 * activation rather than risking operations against an unsafe path.
 */
export class ConfigRootValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigRootValidationError';
  }
}

function samePath(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  return process.platform === 'win32' ? na.toLowerCase() === nb.toLowerCase() : na === nb;
}

function isFilesystemRoot(path: string): boolean {
  return normalize(path) === parse(path).root;
}

function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function hasGitComponent(path: string): boolean {
  return normalize(path).split(sep).filter(Boolean).includes('.git');
}

function assertValidRoot(label: 'workspaceRoot' | 'quarantineRoot', value: string): string {
  if (!isAbsolute(value)) {
    throw new ConfigRootValidationError(`${label} must be an absolute path: "${value}"`);
  }
  const resolved = resolve(value);
  if (isFilesystemRoot(resolved)) {
    throw new ConfigRootValidationError(`${label} must not be the filesystem root: "${resolved}"`);
  }
  if (samePath(resolved, homedir())) {
    throw new ConfigRootValidationError(`${label} must not be the user home directory: "${resolved}"`);
  }
  if (hasGitComponent(resolved)) {
    throw new ConfigRootValidationError(`${label} must not be inside a .git directory: "${resolved}"`);
  }

  let stat;
  try {
    stat = statSync(resolved);
  } catch {
    throw new ConfigRootValidationError(`${label} does not exist: "${resolved}"`);
  }
  if (!stat.isDirectory()) {
    throw new ConfigRootValidationError(`${label} is not a directory: "${resolved}"`);
  }
  return resolved;
}

export function validateConfigRoots(
  config: Pick<Config, 'workspaceRoot' | 'quarantineRoot'>,
): void {
  const workspace = config.workspaceRoot;
  const quarantine = config.quarantineRoot;

  const workspaceResolved = workspace === undefined ? undefined : assertValidRoot('workspaceRoot', workspace);
  const quarantineResolved = quarantine === undefined ? undefined : assertValidRoot('quarantineRoot', quarantine);

  if (workspaceResolved === undefined || quarantineResolved === undefined) {
    return;
  }

  if (samePath(workspaceResolved, quarantineResolved)) {
    throw new ConfigRootValidationError('workspaceRoot and quarantineRoot must not be the same directory');
  }
  if (isInside(workspaceResolved, quarantineResolved)) {
    throw new ConfigRootValidationError('quarantineRoot must be outside the workspaceRoot (S-05)');
  }
  if (isInside(quarantineResolved, workspaceResolved)) {
    throw new ConfigRootValidationError('workspaceRoot must not be inside the quarantineRoot');
  }

  if (lstatSync(quarantineResolved).isSymbolicLink()) {
    throw new ConfigRootValidationError(`quarantineRoot must not be a symlink: "${quarantineResolved}"`);
  }
}
