import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  renderAudit,
  renderConfig,
  renderPlan,
  renderQuarantine,
  renderStatus,
} from "../../src/cli/render-text.js";
import type {
  VmAuditPage,
  VmCandidate,
  VmConfigSummary,
  VmPlan,
  VmQuarantineRecord,
  VmTaskSummary,
} from "../../src/shell/index.js";

const HOSTILE = "task\u0000id\nwith\tESC[31mred";

function counts(overrides: Partial<VmPlan["summary"]> = {}): VmPlan["summary"] {
  return {
    offered: 0,
    quarantined: 0,
    restored: 0,
    failed: 0,
    denied: 0,
    skipped: 0,
    bytesOffered: 0,
    ...overrides,
  };
}

function candidate(id: string, path: string): VmCandidate {
  return {
    candidateId: id,
    state: "offered",
    path,
    pathLabel: path,
    category: "tmp",
    sizeBytes: 10,
    modifiedAt: "2026-09-09T12:00:00.000Z",
    riskTags: [],
    reasonCodes: [],
    selected: false,
  };
}

describe("CLI text rendering escapes dynamic labels (SecurityReview MINOR-5)", () => {
  it("escapes taskId/workspace/plan labels in the plan report", () => {
    const plan: VmPlan = {
      planId: "plan\u0007p",
      taskId: HOSTILE,
      generatedAt: "2026-09-09T12:00:00.000Z",
      dryRun: true,
      scopeLabel: "ws\nroot",
      candidates: [candidate("cand_1", "tmp/a.log")],
      protectedHits: [],
      summary: counts({ offered: 1, bytesOffered: 10 }),
    };
    const text = renderPlan(plan);
    assert.ok(!text.includes("task\u0000id\nwith\t"));
    assert.match(text, /task\\u0000id\\nwith\\tESC\[31mred/);
    assert.match(text, /plan\\u0007p/);
    assert.match(text, /ws\\nroot/);
  });

  it("escapes task/workspace labels in the status summary", () => {
    const status: VmTaskSummary = {
      taskId: HOSTILE,
      workspaceLabel: "ws\nroot",
      finishedAt: null,
      cleanupState: "none",
      counts: counts(),
    };
    const text = renderStatus(status);
    assert.ok(!text.includes("task\u0000id\nwith\t"));
    assert.match(text, /task\\u0000id\\nwith\\tESC\[31mred/);
    assert.match(text, /ws\\nroot/);
  });

  it("escapes record ids in the quarantine listing", () => {
    const record: VmQuarantineRecord = {
      recordId: "rec\u001bid",
      originalPath: "a",
      originalPathLabel: "a",
      quarantinePath: "q",
      quarantinePathLabel: "q",
      quarantinedAt: "2026-09-09T12:00:00.000Z",
      sizeBytes: 10,
      restored: false,
      restoredAt: null,
    };
    const text = renderQuarantine([record]);
    assert.ok(!text.includes("rec\u001bid"));
    assert.match(text, /rec\\u001bid/);
  });

  it("escapes actor/eventType/scope and neutralizes hostile timestamps", () => {
    const page: VmAuditPage = {
      events: [
        {
          eventId: "evt_1",
          ts: "not-a-date\nred",
          taskId: HOSTILE,
          actor: "actor\r\nESC[31m",
          eventType: "dry-run\u0000x",
          outcome: "denied",
          scopeLabel: "scope\n[red]",
        },
      ],
      nextCursor: null,
    };
    const text = renderAudit(page);
    assert.ok(!text.includes("not-a-date\nred"));
    assert.match(text, /\[invalid timestamp\]/);
    assert.ok(!text.includes("task\u0000id\nwith\t"));
    assert.ok(!text.includes("actor\r\n"));
    assert.ok(!text.includes("dry-run\u0000x"));
    assert.ok(!text.includes("scope\n[red]"));
    assert.match(text, /actor\\r\\nESC\[31m/);
    assert.match(text, /dry-run\\u0000x/);
    assert.match(text, /scope\\n\[red\]/);
  });

  it("escapes config labels while keeping enum/version structure", () => {
    const config: VmConfigSummary = {
      dryRunDefault: true,
      workspaceRootLabel: "ws\nroot",
      protectedPatternCount: 3,
      version: "0.1.2-rc.1\nDEV",
    };
    const text = renderConfig(config);
    assert.match(text, /ws\\nroot/);
    assert.match(text, /0\.1\.2-rc\.1\\nDEV/);
    assert.match(text, /dryRun default:\s+true/);
  });
});
