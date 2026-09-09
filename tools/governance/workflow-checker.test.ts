import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  classifyImpact,
  discoverCandidates,
  validateState,
} from "./workflow-checker.js";

const tempRoots: string[] = [];

function makeGitRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "dsh-workflow-"));
  tempRoots.push(root);
  runGit(root, ["init", "-b", "main"]);
  runGit(root, ["config", "user.email", "test@example.invalid"]);
  runGit(root, ["config", "user.name", "Test"]);
  return root;
}

function runGit(root: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function sha256(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function commitSeed(root: string): string {
  writeFileSync(path.join(root, "seed.txt"), "seed");
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "seed"]);
  return runGit(root, ["rev-parse", "HEAD"]);
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("impact classification", () => {
  it("selects abbreviated workflow when every field is evidenced no", () => {
    const fullNo = Object.fromEntries(
      [
        "new_behavior",
        "new_interface_or_module",
        "schema_data_or_default",
        "dependency_behavior",
        "security_credentials_allowlist",
        "compatibility",
        "external_effect",
        "milestone_scope",
        "performance_or_limits",
        "uncertainty",
      ].map((field) => [field, "no"]),
    );
    expect(classifyImpact(fullNo)).toEqual({
      workflow_class: "abbreviated",
      reasons: [],
    });
  });

  it("selects full workflow when an answer is unknown or missing", () => {
    const fullNo = Object.fromEntries(
      [
        "new_behavior",
        "schema_data_or_default",
        "dependency_behavior",
        "security_credentials_allowlist",
        "compatibility",
        "external_effect",
        "milestone_scope",
        "performance_or_limits",
        "uncertainty",
      ].map((field) => [field, "no"]),
    );
    const result = classifyImpact({ ...fullNo, compatibility: "unknown" });
    expect(result.workflow_class).toBe("full");
    expect(result.reasons).toContain("compatibility");
  });
});

describe("state validation", () => {
  it("rejects phase skips and truncated histories", () => {
    const root = makeGitRoot();
    const base = {
      schema_version: "dsh-task-cleaner/closed-loop/v1alpha1",
      change_id: "sample",
      base_revision: "0".repeat(40),
      phase: "design_confirmed",
      history: ["registered", "design_confirmed"],
      artifacts: [],
      reviews: [],
      findings: [],
      gates: [],
      external_acceptance: "not_required",
    };
    const codes = new Set(validateState(root, base).map((item) => item.code));
    expect(codes.has("invalid_transition")).toBe(true);
    base.history = ["design_confirmed"];
    const codes2 = new Set(validateState(root, base).map((item) => item.code));
    expect(codes2.has("incomplete_history")).toBe(true);
  });

  it("detects stale artifact digests", () => {
    const root = makeGitRoot();
    const planFile = path.join(root, "plan.md");
    writeFileSync(planFile, "plan");
    const digest = sha256(planFile);
    writeFileSync(planFile, "plan changed");
    const state = {
      schema_version: "dsh-task-cleaner/closed-loop/v1alpha1",
      change_id: "sample",
      base_revision: "0".repeat(40),
      phase: "registered",
      history: ["registered"],
      artifacts: [
        {
          id: "plan",
          type: "classification",
          path: "plan.md",
          sha256: digest,
          producer_phase: "registered",
          depends_on: [],
        },
      ],
      reviews: [],
      findings: [],
      gates: [],
      external_acceptance: "not_required",
    };
    const codes = new Set(validateState(root, state).map((item) => item.code));
    expect(codes.has("stale_digest")).toBe(true);
  });

  it("rejects non-independent reviewers", () => {
    const root = makeGitRoot();
    const state = {
      schema_version: "dsh-task-cleaner/closed-loop/v1alpha1",
      change_id: "sample",
      base_revision: "0".repeat(40),
      phase: "registered",
      history: ["registered"],
      artifacts: [],
      reviews: [
        {
          id: "R-1",
          kind: "design",
          author_id: "agent-a",
          reviewer_id: "agent-a",
          artifact_ids: [],
        },
      ],
      findings: [],
      gates: [],
      external_acceptance: "not_required",
    };
    const codes = new Set(validateState(root, state).map((item) => item.code));
    expect(codes.has("reviewer_not_independent")).toBe(true);
  });

  it("accepts a registered phase with matching classification evidence", () => {
    const root = makeGitRoot();
    const classification = path.join(root, "classification.md");
    writeFileSync(classification, "# classification");
    const state = {
      schema_version: "dsh-task-cleaner/closed-loop/v1alpha1",
      change_id: "sample",
      base_revision: "0".repeat(40),
      phase: "registered",
      history: ["registered"],
      artifacts: [
        {
          id: "sample-classification",
          type: "classification",
          path: "classification.md",
          sha256: sha256(classification),
          producer_phase: "registered",
          depends_on: [],
        },
      ],
      reviews: [],
      findings: [],
      gates: [],
      external_acceptance: "not_required",
    };
    expect(validateState(root, state)).toEqual([]);
  });
});

describe("discovery", () => {
  it("reports unregistered changed files", () => {
    const root = makeGitRoot();
    const baseline = commitSeed(root);
    writeFileSync(path.join(root, "new-feature.ts"), "export {};");
    const issues = discoverCandidates(root, baseline, { changes: [] });
    expect(issues.some((item) => item.code === "missing_registration")).toBe(true);
  });

});
