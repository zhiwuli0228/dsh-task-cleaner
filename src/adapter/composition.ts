import { CleanupOrchestrator, type CleanupDeps } from '../app/cleanup-orchestrator.js';
import { DefaultDenySafetyKernel } from '../app/default-deny-safety-kernel.js';
import type { Config } from '../config.js';
import { InMemoryAuditStore } from './audit-store/in-memory-audit-store.js';
import { SystemClock } from './clock/system-clock.js';
import { NodeFsPort } from './filesystem/node-fs.js';
import { NodeGitPort } from './git/node-git.js';
import { Sha256Hash } from './hash/sha256-hash.js';
import { InMemoryQuarantineStore } from './quarantine-store/in-memory-quarantine-store.js';
import { InMemoryTaskLifecycle } from './task-lifecycle/in-memory-task-lifecycle.js';
import { StubTaskMetadata } from './task-metadata/stub-task-metadata.js';

export interface CleanupRuntime {
  readonly orchestrator: CleanupOrchestrator;
  readonly deps: CleanupDeps;
}

/**
 * Composition root (ADR-002).
 *
 * Lives in the adapter layer so the app layer never depends on adapters
 * (`adapter -> app/ports/domain` is the only allowed direction). The real
 * FsPort/GitPort adapters are bound here and consulted by every
 * SafetyKernel decision this runtime produces. Tests and shells may override
 * individual ports; production callers get the real adapters by default.
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
