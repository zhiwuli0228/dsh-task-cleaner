import type {
  AuditFilter,
  UxShellPorts,
  VmAuditPage,
  VmCommandResult,
  VmConfigSummary,
  VmPlan,
  VmQuarantineRecord,
  VmTaskSummary,
} from "../shell/index.js";

/**
 * Deterministic demo provider for the framework baseline. The composition
 * root replaces this with backend noop/stub use-cases before any real
 * session exists; shells never import this module directly.
 */

const PLUGIN_VERSION = "0.1.2-rc.1.dev";

function emptyCounts(): VmTaskSummary["counts"] {
  return {
    offered: 0,
    quarantined: 0,
    restored: 0,
    failed: 0,
    denied: 0,
    skipped: 0,
    bytesOffered: 0,
  };
}

export function createDemoPorts(): UxShellPorts {
  const now = () => new Date().toISOString();
  return {
    async loadPlan(): Promise<VmPlan> {
      return {
        planId: "plan_demo_empty",
        taskId: "tsk_demo",
        generatedAt: now(),
        dryRun: true,
        scopeLabel: "demo-workspace (stub)",
        candidates: [],
        protectedHits: [],
        summary: emptyCounts(),
      };
    },
    async applyQuarantine(): Promise<VmCommandResult> {
      return {
        command: "quarantine",
        // Framework baseline: no real quarantine path exists, so the stub
        // reports a safe noop (exit 0) rather than pretending it acted.
        status: "noop",
        summary: emptyCounts(),
        updatedAt: now(),
      };
    },
    async applyRestore(): Promise<VmCommandResult> {
      return {
        command: "restore",
        status: "noop",
        summary: emptyCounts(),
        updatedAt: now(),
      };
    },
    async loadTaskStatus(taskId: string): Promise<VmTaskSummary> {
      return {
        taskId,
        workspaceLabel: "demo-workspace (stub)",
        finishedAt: now(),
        cleanupState: "none",
        counts: emptyCounts(),
      };
    },
    async loadQuarantine(): Promise<VmQuarantineRecord[]> {
      return [];
    },
    async loadAudit(_filter: AuditFilter): Promise<VmAuditPage> {
      return { events: [], nextCursor: null };
    },
    async loadConfig(): Promise<VmConfigSummary> {
      return {
        dryRunDefault: true,
        workspaceRootLabel: "demo-workspace (stub)",
        protectedPatternCount: 0,
        version: PLUGIN_VERSION,
      };
    },
  };
}
