import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveRoute, viewDefinition, VIEW_DEFINITIONS } from "../../src/web/views.js";
import { quarantineConfirmation, selectedCandidates } from "../../src/web/confirm.js";
import {
  isEmptyPlan,
  isEmptyQuarantine,
  VIEW_NAMES,
  VIEW_STATES,
} from "../../src/web/view-states.js";
import type { VmCandidate, VmPlan } from "../../src/shell/index.js";

function candidate(id: string, selected: boolean): VmCandidate {
  return {
    candidateId: id,
    state: "offered",
    path: `tmp/${id}.log`,
    pathLabel: `tmp/${id}.log`,
    category: "tmp",
    sizeBytes: 100,
    modifiedAt: "2026-09-09T12:00:00.000Z",
    riskTags: [],
    reasonCodes: [],
    selected,
  };
}

function plan(count: number): VmPlan {
  return {
    planId: "plan_1",
    taskId: "tsk_1",
    generatedAt: "2026-09-09T12:00:00.000Z",
    dryRun: true,
    scopeLabel: "ws",
    candidates: Array.from({ length: count }, (_, index) => candidate(`cand_${index}`, false)),
    protectedHits: [],
    summary: {
      offered: count,
      quarantined: 0,
      restored: 0,
      failed: 0,
      denied: 0,
      skipped: 0,
      bytesOffered: count * 100,
    },
  };
}

describe("Web view definitions (§6.1/§4.3)", () => {
  it("exposes exactly the five views with stable route patterns", () => {
    assert.deepEqual(
      VIEW_DEFINITIONS.map((view) => view.name),
      ["overview", "plan", "quarantine", "audit", "config"],
    );
    assert.equal(VIEW_NAMES.length, 5);
    assert.equal(VIEW_STATES.length, 5);
    assert.ok(VIEW_STATES.includes("loading"));
    assert.ok(VIEW_STATES.includes("busy"));
  });

  it("resolves task plan routes and carries taskId", () => {
    const route = resolveRoute("/tasks/tsk_123/plan");
    assert.equal(route.view, "plan");
    assert.equal(route.taskId, "tsk_123");
  });

  it("resolves every static view route", () => {
    assert.equal(resolveRoute("/").view, "overview");
    assert.equal(resolveRoute("/quarantine").view, "quarantine");
    assert.equal(resolveRoute("/audit").view, "audit");
    assert.equal(resolveRoute("/settings").view, "config");
    // Unknown routes degrade to the overview, never to a delete surface.
    assert.equal(resolveRoute("/nope").view, "overview");
  });

  it("decodes URL-encoded task ids safely", () => {
    const route = resolveRoute("/tasks/task%20with%20spaces/plan");
    assert.equal(route.view, "plan");
    assert.equal(route.taskId, "task with spaces");
    // Plain spaces are normalized by browsers before resolveRoute, but
    // explicit encoding must remain decodable when present.
    assert.equal(resolveRoute("/tasks/task%2Fname/plan").view, "overview");
  });

  it("falls back to overview for malformed or hostile encoded routes", () => {
    // Invalid percent-encoding must not throw (Review SUGGESTION).
    assert.equal(resolveRoute("/tasks/%zz/plan").view, "overview");
    // Encoded control characters (NUL/newline) must not reach a view model.
    assert.equal(resolveRoute("/tasks/%00/plan").view, "overview");
    assert.equal(resolveRoute("/tasks/%0A/plan").view, "overview");
    // Encoded path traversal is not treated as a task identifier.
    assert.equal(resolveRoute("/tasks/..%2F..%2Fetc/plan").view, "overview");
    assert.equal(resolveRoute("/tasks/%2E%2E/plan").view, "overview");
  });

  it("does not throw when decoding malformed static-route segments", () => {
    assert.doesNotThrow(() => resolveRoute("/%zz"));
    assert.doesNotThrow(() => resolveRoute("/tasks/%E0%A4%A/plan"));
  });

  it("confirmation reflects the exact selected count (R3/R2 wording)", () => {
    const confirmation = quarantineConfirmation({
      taskId: "tsk_1",
      candidates: [candidate("a", true), candidate("b", true), candidate("c", false)],
    });
    assert.match(confirmation.confirmationText, /only the 2 item/);
    assert.equal(confirmation.items.length, 2);
    assert.match(confirmation.confirmationText, /quarantine/i);
    assert.doesNotMatch(confirmation.confirmationText, /delete|erase/i);
  });

  it("only rows marked selected are submittable", () => {
    const selected = selectedCandidates([
      candidate("a", true),
      candidate("b", false),
    ]);
    assert.deepEqual(
      selected.map((item) => item.candidateId),
      ["a"],
    );
  });

  it("empty detection is pure and does not invent results", () => {
    assert.equal(isEmptyPlan(plan(0)), true);
    assert.equal(isEmptyPlan(plan(2)), false);
    assert.equal(isEmptyQuarantine([]), true);
    assert.equal(isEmptyQuarantine([{} as never]), false);
  });

  it("every view has a definition and a document title source", () => {
    for (const name of VIEW_NAMES) {
      const definition = viewDefinition(name);
      assert.equal(definition.name, name);
      assert.ok(definition.title.length > 0);
      assert.ok(definition.routePattern.length > 0);
    }
  });
});
