import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  FORBIDDEN_FLAGS,
  parseArgs,
  type QuarantineArgs,
} from "../../src/cli/arg-parse.js";

describe("CLI argument parsing (§5.1)", () => {
  it("accepts plan with optional --task-id and aliases dry-run", () => {
    const parsed = parseArgs(["plan", "--task-id", "tsk_1", "--format", "json"]);
    assert.ok(parsed.ok);
    if (parsed.ok) {
      assert.equal(parsed.args.command, "plan");
      assert.equal(parsed.args.taskId, "tsk_1");
      assert.equal(parsed.args.format, "json");
    }
    const alias = parseArgs(["dry-run"]);
    assert.ok(alias.ok);
    if (alias.ok) assert.equal(alias.args.command, "dry-run");
  });

  it("accepts quarantine with task id and repeated candidate ids", () => {
    const parsed = parseArgs([
      "quarantine",
      "--task-id",
      "tsk_1",
      "--candidate-id",
      "cand_a",
      "--candidate-id",
      "cand_b",
    ]);
    assert.ok(parsed.ok);
    if (parsed.ok) {
      const args = parsed.args as QuarantineArgs;
      assert.deepEqual(args.candidateIds, ["cand_a", "cand_b"]);
      assert.equal(args.taskId, "tsk_1");
    }
  });

  it("an empty candidate set reaches the safety layer (deny, exit code 3)", () => {
    const parsed = parseArgs(["quarantine", "--task-id", "tsk_1"]);
    assert.ok(parsed.ok);
    if (parsed.ok) {
      assert.equal(parsed.args.command, "quarantine");
      assert.deepEqual((parsed.args as QuarantineArgs).candidateIds, []);
    }
  });

  it("rejects every forbidden switch explicitly (S-07)", () => {
    for (const flag of FORBIDDEN_FLAGS) {
      const parsed = parseArgs(["quarantine", "--task-id", "t", "--candidate-id", "c", flag]);
      assert.ok(!parsed.ok, `expected ${flag} to be rejected`);
      if (!parsed.ok) assert.match(parsed.message, /forbidden option/);
    }
  });

  it("rejects unknown flags and stray positionals", () => {
    assert.ok(!parseArgs(["plan", "--bogus"]).ok);
    assert.ok(!parseArgs(["plan", "extra-positional"]).ok);
    assert.ok(!parseArgs(["nonsense"]).ok);
  });

  it("validates format/color and requires positive limits", () => {
    assert.ok(!parseArgs(["plan", "--format", "xml"]).ok);
    assert.ok(!parseArgs(["plan", "--color", "red"]).ok);
    assert.ok(parseArgs(["audit", "--limit", "10"]).ok);
    assert.ok(!parseArgs(["audit", "--limit", "0"]).ok);
  });

  it("accepts restore, status, audit and config show surfaces", () => {
    assert.ok(parseArgs(["restore", "--record-id", "rec_1"]).ok);
    assert.ok(parseArgs(["status"]).ok);
    assert.ok(parseArgs(["audit", "--since", "2026-09-09T00:00:00Z"]).ok);
    assert.ok(parseArgs(["config", "show"]).ok);
    assert.ok(!parseArgs(["config"]).ok);
    assert.ok(!parseArgs(["config", "edit"]).ok);
  });

  it("help is reachable without arguments", () => {
    assert.ok(parseArgs(["help"]).ok);
  });
});
