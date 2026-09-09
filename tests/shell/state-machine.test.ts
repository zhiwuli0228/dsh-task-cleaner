import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isCommandBusy,
  stateForSelection,
  transitionCommandState,
} from "../../src/shell/state-machine.js";
import type { VmStatus } from "../../src/shell/vm-types.js";

describe("command state machine (§4.1)", () => {
  it("allows the full plan -> decision -> execution flow", () => {
    assert.equal(transitionCommandState("idle", "plan-ready"), "plan-ready");
    assert.equal(
      transitionCommandState("plan-ready", "awaiting-decision"),
      "awaiting-decision",
    );
    assert.equal(
      transitionCommandState("awaiting-decision", "running"),
      "running",
    );
    assert.equal(transitionCommandState("running", "succeeded"), "succeeded");
  });

  it("forbids plan-ready -> running without an explicit decision", () => {
    assert.throws(
      () => transitionCommandState("plan-ready", "running"),
      /forbidden transition/,
    );
  });

  it("forbids re-submission while running", () => {
    assert.throws(
      () => transitionCommandState("running", "running"),
      /forbidden transition/,
    );
  });

  it("treats failed/partial as terminal requiring an explicit retry", () => {
    assert.equal(transitionCommandState("failed", "idle"), "idle");
    assert.equal(transitionCommandState("partial", "plan-ready"), "plan-ready");
    assert.throws(
      () => transitionCommandState("failed", "running"),
      /forbidden transition/,
    );
  });

  it("tracks UI selection separately from command state (R3)", () => {
    assert.equal(stateForSelection("plan-ready", 0), "plan-ready");
    assert.equal(stateForSelection("plan-ready", 3), "awaiting-decision");
    assert.equal(stateForSelection("awaiting-decision", 0), "plan-ready");
    assert.equal(stateForSelection("running", 1), "running");
  });

  it("reports running as busy", () => {
    assert.equal(isCommandBusy("running"), true);
    assert.equal(isCommandBusy("plan-ready"), false);
  });

  it("covers every defined status in the exported list", () => {
    const statuses: VmStatus[] = [
      "idle", "loading", "noop", "plan-ready", "awaiting-decision", "running",
      "succeeded", "partial", "failed", "cancelled", "denied",
    ];
    for (const status of statuses) {
      // running -> running is intentionally forbidden (double-submit).
      if (status !== "running") {
        assert.doesNotThrow(() => transitionCommandState(status, status));
      }
    }
  });
});
