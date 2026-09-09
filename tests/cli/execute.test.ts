import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createEmptyPorts,
  type UxShellPorts,
  type VmPlan,
} from "../../src/shell/index.js";
import {
  EXIT_OK,
  EXIT_INTERRUPT,
  EXIT_PARTIAL,
  EXIT_RUNTIME_FAILURE,
  EXIT_SAFETY_DENY,
  EXIT_USAGE,
  runCliEntry,
  type CliContext,
} from "../../src/cli/execute.js";

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

function makePlan(offered: number): VmPlan {
  return {
    planId: "plan_1",
    taskId: "tsk_1",
    generatedAt: "2026-09-09T12:00:00.000Z",
    dryRun: true,
    scopeLabel: "ws",
    candidates:
      offered === 0
        ? []
        : [
            {
              candidateId: "cand_1",
              state: "offered",
              path: "tmp/a",
              pathLabel: "tmp/a",
              category: "tmp",
              sizeBytes: 100,
              modifiedAt: "2026-09-09T12:00:00.000Z",
              riskTags: [],
              reasonCodes: [],
              selected: false,
            },
          ],
    protectedHits: [],
    summary: counts({ offered, bytesOffered: offered * 100, denied: offered === 0 ? 0 : 2 }),
  };
}

function context(ports: UxShellPorts): CliContext {
  return {
    ports,
    isTty: false,
    cliVersion: "test",
    now: new Date("2026-09-09T12:00:00.000Z"),
  };
}

/** Complete ports object where only the listed overrides are wired. */
function portsWith(overrides: Partial<UxShellPorts>): UxShellPorts {
  return { ...createEmptyPorts(), ...overrides };
}

describe("CLI execution and exit codes (§5.4)", () => {
  it("plan with candidates succeeds with a readable dry-run report", async () => {
    const ports = portsWith({
      loadPlan: async () => makePlan(1),
      loadTaskStatus: async (taskId: string) => ({
        taskId,
        workspaceLabel: "ws",
        finishedAt: null,
        cleanupState: "plan-ready",
        counts: counts({ offered: 1 }),
      }),
      loadConfig: async () => ({
        dryRunDefault: true,
        workspaceRootLabel: "ws",
        protectedPatternCount: 0,
        version: "test",
      }),
    });
    const output = await runCliEntry(["plan", "--task-id", "tsk_1"], context(ports));
    assert.equal(output.exitCode, EXIT_OK);
    assert.match(output.stdout, /Dry-run plan  plan_1/);
    assert.match(output.stdout, /no changes written/);
    assert.equal(output.stderr, "");
  });

  it("plan with zero candidates is a safe noop", async () => {
    const ports = portsWith({
      loadPlan: async () => makePlan(0),
    });
    const output = await runCliEntry(["plan"], context(ports));
    assert.equal(output.exitCode, EXIT_OK);
    assert.match(output.stdout, /No cleanup candidates found/);
    assert.ok(output.envelope);
    assert.equal(output.envelope?.status, "noop");
  });

  it("quarantine without candidate ids exits 3 (safety deny)", async () => {
    const output = await runCliEntry(
      ["quarantine", "--task-id", "tsk_1"],
      context(portsWith({})),
    );
    assert.equal(output.exitCode, EXIT_SAFETY_DENY);
    assert.ok(output.envelope);
    assert.equal(output.envelope?.status, "denied");
    assert.equal(output.envelope?.errors[0]?.code, "ERR_SAFETY_DENY");
  });

  it("restore without record ids exits 3", async () => {
    const output = await runCliEntry(["restore"], context(portsWith({})));
    assert.equal(output.exitCode, EXIT_SAFETY_DENY);
  });

  it("maps port partial results to exit code 4", async () => {
    const ports = portsWith({
      applyQuarantine: async () => ({
        command: "quarantine",
        status: "partial",
        summary: null,
        updatedAt: "2026-09-09T12:00:00.000Z",
      }),
    });
    const output = await runCliEntry(
      ["quarantine", "--task-id", "t", "--candidate-id", "c"],
      context(ports),
    );
    assert.equal(output.exitCode, EXIT_PARTIAL);
  });

  it("maps port noop results to exit 0 (safe noop)", async () => {
    const ports = portsWith({
      applyQuarantine: async () => ({
        command: "quarantine",
        status: "noop",
        summary: null,
        updatedAt: "2026-09-09T12:00:00.000Z",
      }),
    });
    const output = await runCliEntry(
      ["quarantine", "--task-id", "t", "--candidate-id", "c"],
      context(ports),
    );
    assert.equal(output.exitCode, EXIT_OK);
    assert.ok(output.envelope);
    assert.equal(output.envelope?.status, "noop");
    assert.match(output.stdout, /quarantine: noop/);
  });

  it("maps port cancelled results to exit 130 (interrupt)", async () => {
    const ports = portsWith({
      applyRestore: async () => ({
        command: "restore",
        status: "cancelled",
        summary: null,
        updatedAt: "2026-09-09T12:00:00.000Z",
      }),
    });
    const output = await runCliEntry(
      ["restore", "--record-id", "rec_1"],
      context(ports),
    );
    assert.equal(output.exitCode, EXIT_INTERRUPT);
    assert.ok(output.envelope);
    assert.equal(output.envelope?.status, "cancelled");
  });

  it("maps port denied results to exit 3 and reports the reason", async () => {
    const ports = portsWith({
      applyQuarantine: async () => ({
        command: "quarantine",
        status: "denied",
        summary: null,
        updatedAt: "2026-09-09T12:00:00.000Z",
      }),
    });
    const output = await runCliEntry(
      ["quarantine", "--task-id", "t", "--candidate-id", "c"],
      context(ports),
    );
    assert.equal(output.exitCode, EXIT_SAFETY_DENY);
    assert.equal(output.envelope?.status, "denied");
  });

  it("unknown port statuses fail closed instead of succeeding", async () => {
    const ports = portsWith({
      applyQuarantine: async () =>
        ({
          command: "quarantine",
          status: "awaiting-decision",
          summary: null,
          updatedAt: "2026-09-09T12:00:00.000Z",
        }) as never,
    });
    const output = await runCliEntry(
      ["quarantine", "--task-id", "t", "--candidate-id", "c"],
      context(ports),
    );
    assert.equal(output.exitCode, EXIT_RUNTIME_FAILURE);
    assert.equal(output.envelope?.status, "failed");
  });

  it("maps port failures to exit code 1", async () => {
    const ports = portsWith({
      loadPlan: async () => {
        throw new Error("backend exploded");
      },
    });
    const output = await runCliEntry(["plan"], context(ports));
    assert.equal(output.exitCode, EXIT_RUNTIME_FAILURE);
    assert.equal(output.envelope?.errors[0]?.code, "ERR_PORT_FAILURE");
  });

  it("unknown commands and bad usage exit 2", async () => {
    const usage = await runCliEntry(["frobnicate"], context(portsWith({})));
    assert.equal(usage.exitCode, EXIT_USAGE);
    const badFlag = await runCliEntry(["plan", "--force"], context(portsWith({})));
    assert.equal(badFlag.exitCode, EXIT_USAGE);
  });

  it("--format json emits a stable envelope on stdout and keeps stderr empty", async () => {
    const ports = portsWith({
      loadPlan: async () => makePlan(0),
    });
    const output = await runCliEntry(["plan", "--format", "json"], context(ports));
    assert.equal(output.exitCode, EXIT_OK);
    assert.equal(output.stderr, "");
    const envelope = JSON.parse(output.stdout) as {
      schemaVersion: string;
      command: string;
      status: string;
      meta: { dryRun: boolean };
      errors: unknown[];
    };
    assert.equal(envelope.schemaVersion, "cli.v1");
    assert.equal(envelope.command, "plan");
    assert.equal(envelope.status, "noop");
    assert.equal(envelope.meta.dryRun, true);
    assert.deepEqual(envelope.errors, []);
  });

  it("help text never advertises delete/force switches", async () => {
    const output = await runCliEntry(["help"], context(portsWith({})));
    assert.equal(output.exitCode, EXIT_OK);
    assert.match(output.stdout, /Usage: dsh-task-cleaner/);
    assert.doesNotMatch(output.stdout, /--delete|--purge|--force|--all|--yes/);
  });
});
