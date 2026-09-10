import type { UxShellPorts } from "../shell/index.js";
import { mapPlan, type DomainShapedPlan } from "../shell/index.js";

/**
 * Web demo provider. This mirrors the backend noop/stub contract so the
 * five views have deterministic content to mount; production composition
 * replaces it with the same UxShellPorts bound by the composition root.
 */

const DEMO_PLAN: DomainShapedPlan = {
  planId: "plan_01J2DEMO",
  taskId: "tsk_demo_001",
  generatedAt: "2026-09-09T12:00:00.000Z",
  workspaceLabel: "tasks/tsk_demo_001",
  artifacts: [
    {
      candidateId: "cand_01",
      relPath: "tmp/node-1.log",
      kind: "temp",
      sizeBytes: 1024,
      mtime: "2026-09-09T11:59:00.000Z",
      state: "candidate",
      matchedBy: ["rule:tmp-ext"],
    },
    {
      candidateId: "cand_02",
      relPath: "cache/esbuild/2ab/out.meta",
      kind: "cache",
      sizeBytes: 8192,
      mtime: "2026-09-09T11:58:00.000Z",
      state: "candidate",
      matchedBy: ["rule:cache-dir"],
    },
    {
      candidateId: "cand_03",
      relPath: "out/gen/generated.txt",
      kind: "generated",
      sizeBytes: 128,
      mtime: "2026-09-09T11:57:00.000Z",
      gitTracked: true,
      state: "candidate",
      matchedBy: ["rule:gen-dir"],
    },
  ],
  protectedHits: [
    { path: "out/gen/generated.txt", reasonCode: "git-tracked" },
    { path: "../outside/note.txt", reasonCode: "outside-workspace" },
  ],
};

export function createWebDemoPorts(): UxShellPorts {
  return {
    async loadPlan(): Promise<ReturnType<typeof mapPlan>> {
      return mapPlan(DEMO_PLAN);
    },
    async applyQuarantine() {
      return {
        command: "quarantine",
        status: "noop",
        summary: null,
        updatedAt: new Date().toISOString(),
      };
    },
    async applyRestore() {
      return {
        command: "restore",
        status: "noop",
        summary: null,
        updatedAt: new Date().toISOString(),
      };
    },
    async loadTaskStatus(taskId: string) {
      return {
        taskId,
        workspaceLabel: DEMO_PLAN.workspaceLabel ?? "",
        finishedAt: null,
        cleanupState: "plan-ready",
        counts: {
          offered: 2,
          quarantined: 0,
          restored: 0,
          failed: 0,
          denied: 2,
          skipped: 1,
          bytesOffered: 1024 + 8192,
        },
      };
    },
    async loadQuarantine() {
      return [];
    },
    async loadAudit() {
      return {
        events: [
          {
            eventId: "evt_01",
            ts: "2026-09-09T12:00:00.000Z",
            taskId: "tsk_demo_001",
            actor: "demo-user",
            eventType: "dry-run",
            outcome: "succeeded",
            scopeLabel: "plan_01J2DEMO",
          },
        ],
        nextCursor: null,
      };
    },
    async loadConfig() {
      return {
        dryRunDefault: true,
        workspaceRootLabel: "tasks/tsk_demo_001",
        protectedPatternCount: 3,
        version: "0.1.2-rc.1.dev",
      };
    },
  };
}
