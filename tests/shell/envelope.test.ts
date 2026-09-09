import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildEnvelope } from "../../src/shell/json-envelope.js";
import type { VmPlan } from "../../src/shell/vm-types.js";

describe("JSON envelope contract (§5.3)", () => {
  const now = new Date("2026-09-09T12:00:00.000Z");

  it("always emits schemaVersion/status/data/meta/errors with stable keys", () => {
    const envelope = buildEnvelope({
      command: "plan",
      status: "plan-ready",
      data: null,
      meta: { taskId: "tsk_1" },
      cliVersion: "test",
      now,
    });
    const serialized = JSON.stringify(envelope);
    assert.equal(envelope.schemaVersion, "cli.v1");
    assert.equal(envelope.meta.dryRun, true);
    assert.equal(envelope.meta.ts, "2026-09-09T12:00:00.000Z");
    assert.deepEqual(envelope.errors, []);
    // Key order is deterministic: schemaVersion, command, status, data,
    // meta, errors.
    assert.deepEqual(Object.keys(envelope), [
      "schemaVersion",
      "command",
      "status",
      "data",
      "meta",
      "errors",
    ]);
    assert.equal(typeof serialized, "string");
  });

  it("keeps data/errors nullable and empty by default", () => {
    const envelope = buildEnvelope<{ planId: string } | null>({
      command: "plan",
      status: "noop",
      now,
    });
    assert.equal(envelope.data, null);
    assert.deepEqual(envelope.errors, []);
  });

  it("envelope payloads are JSON-serializable view models", () => {
    const plan: VmPlan = {
      planId: "plan_1",
      taskId: "tsk_1",
      generatedAt: now.toISOString(),
      dryRun: true,
      scopeLabel: "ws",
      candidates: [],
      protectedHits: [],
      summary: {
        offered: 0,
        quarantined: 0,
        restored: 0,
        failed: 0,
        denied: 0,
        skipped: 0,
        bytesOffered: 0,
      },
    };
    const envelope = buildEnvelope({
      command: "plan",
      status: "plan-ready",
      data: plan,
      now,
    });
    const roundTrip = JSON.parse(JSON.stringify(envelope)) as typeof envelope;
    assert.deepEqual(roundTrip, envelope);
  });
});
