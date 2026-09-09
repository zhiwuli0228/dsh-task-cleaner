import type {
  AuditFilter,
  VmAuditPage,
  VmCommandResult,
  VmConfigSummary,
  VmPlan,
  VmQuarantineRecord,
  VmTaskSummary,
} from "./vm-types.js";

/**
 * UI shell ports (ux-shell-contract.md §7.3).
 *
 * The shell only depends on these functions. The composition root binds
 * them to backend noop/stub use-cases; shells never touch filesystem,
 * cleanup, or safety APIs directly. There is deliberately no delete or
 * purge surface anywhere on this interface (R2 / S-07).
 */
export interface UxShellPorts {
  /** Read-only dry-run plan. */
  loadPlan(taskId: string | null): Promise<VmPlan>;
  /** Explicit, scoped quarantine of the listed candidate IDs. */
  applyQuarantine(request: {
    taskId: string;
    candidateIds: string[];
  }): Promise<VmCommandResult>;
  /** Explicit restore of the listed quarantine record IDs. */
  applyRestore(request: { recordIds: string[] }): Promise<VmCommandResult>;
  /** Read-only per-task cleanup state summary. */
  loadTaskStatus(taskId: string): Promise<VmTaskSummary>;
  /** Read-only quarantine list. */
  loadQuarantine(): Promise<VmQuarantineRecord[]>;
  /** Read-only audit page. */
  loadAudit(filter: AuditFilter): Promise<VmAuditPage>;
  /** Read-only configuration summary. */
  loadConfig(): Promise<VmConfigSummary>;
}

/** Empty/noop port provider used by the framework baseline demos. */
export function createEmptyPorts(): UxShellPorts {
  const notReady = async (): Promise<never> => {
    throw new Error("backend stub not wired by composition root yet");
  };
  return {
    loadPlan: notReady,
    applyQuarantine: notReady,
    applyRestore: notReady,
    loadTaskStatus: notReady,
    loadQuarantine: notReady,
    loadAudit: notReady,
    loadConfig: notReady,
  };
}
