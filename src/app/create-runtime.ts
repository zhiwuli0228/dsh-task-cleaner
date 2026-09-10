import { InMemoryAuditStore } from '../adapter/audit-store/in-memory-audit-store.js';
import { SystemClock } from '../adapter/clock/system-clock.js';
import { NodeFsPort } from '../adapter/filesystem/node-fs.js';
import { NodeGitPort } from '../adapter/git/node-git.js';
import { Sha256Hash } from '../adapter/hash/sha256-hash.js';
import { InMemoryQuarantineStore } from '../adapter/quarantine-store/in-memory-quarantine-store.js';
import { InMemoryTaskLifecycle } from '../adapter/task-lifecycle/in-memory-task-lifecycle.js';
import { StubTaskMetadata } from '../adapter/task-metadata/stub-task-metadata.js';
import type { Config } from '../config.js';
import { CleanupOrchestrator, type CleanupDeps } from './cleanup-orchestrator.js';
import { DefaultDenySafetyKernel } from './default-deny-safety-kernel.js';

export interface CleanupRuntime {
  readonly orchestrator: CleanupOrchestrator;
  readonly deps: CleanupDeps;
}

/**
 * Composition root (ADR-002).
 *
 * Wires the real FsPort/GitPort adapters into the safety kernel and the
 * orchestrator so candidate decisions are backed by actual filesystem and Git
 * predicates. Tests and shells may override individual ports; production
 * callers get the real adapters by default.
 */
export function createCleanupRuntime(
  config: Config,
  overrides: Partial<CleanupDeps> = {},
): CleanupRuntime {
  const fs = overrides.fs ?? new NodeFsPort(config.quarantineRoot);
  const git = overrides.git ?? new NodeGitPort();
  const deps: CleanupDeps = {
    fs,
    git,
    taskMetadata: overrides.taskMetadata ?? new StubTaskMetadata(),
    lifecycle: overrides.lifecycle ?? new InMemoryTaskLifecycle(),
    clock: overrides.clock ?? new SystemClock(),
    hash: overrides.hash ?? new Sha256Hash(),
    audit: overrides.audit ?? new InMemoryAuditStore(),
    quarantine: overrides.quarantine ?? new InMemoryQuarantineStore(),
    safetyKernel: overrides.safetyKernel ?? new DefaultDenySafetyKernel({ fs, git }),
  };
  return { orchestrator: new CleanupOrchestrator(deps, config), deps };
}
