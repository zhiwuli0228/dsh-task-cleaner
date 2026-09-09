import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  REQUIRED_GOVERNANCE_DIRECTORIES,
  REQUIRED_GOVERNANCE_FILES,
  layoutGuard,
} from "./layout-guard.js";
import { TRACEABILITY_LEDGER_PATH } from "./index.js";

const tempRoots: string[] = [];

function makeGitRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "dsh-layout-"));
  tempRoots.push(root);
  execFileSync("git", ["init", "-b", "main"], { cwd: root, stdio: "ignore" });
  return root;
}

function scaffoldGovernanceRoot(root: string): void {
  for (const relative of REQUIRED_GOVERNANCE_FILES) {
    const file = path.join(root, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, relative.endsWith(".json") ? "{}" : `# ${relative}`);
  }
  for (const relative of REQUIRED_GOVERNANCE_DIRECTORIES) {
    mkdirSync(path.join(root, relative), { recursive: true });
  }
  const ledger = path.join(root, TRACEABILITY_LEDGER_PATH);
  mkdirSync(path.dirname(ledger), { recursive: true });
  writeFileSync(
    ledger,
    JSON.stringify({
      schema_version: "dsh-task-cleaner/traceability/v1alpha1",
      entries: [],
    }),
  );
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("layout guard", () => {
  it("passes when docs/harness is the only governance root", () => {
    const root = makeGitRoot();
    scaffoldGovernanceRoot(root);
    expect(layoutGuard(root)).toEqual([]);
  });

  it("rejects a root-level .harness directory", () => {
    const root = makeGitRoot();
    scaffoldGovernanceRoot(root);
    mkdirSync(path.join(root, ".harness"));
    const failures = layoutGuard(root);
    expect(failures.some((item) => item.code === "root_harness_present")).toBe(true);
  });

  it("rejects a missing traceability ledger", () => {
    const root = makeGitRoot();
    scaffoldGovernanceRoot(root);
    rmSync(path.join(root, TRACEABILITY_LEDGER_PATH));
    const failures = layoutGuard(root);
    expect(failures.some((item) => item.code === "missing_ledger")).toBe(true);
  });

  it("rejects governance files outside docs/harness", () => {
    const root = makeGitRoot();
    scaffoldGovernanceRoot(root);
    const nested = path.join(root, "src", ".harness", "state.json");
    mkdirSync(path.dirname(nested), { recursive: true });
    writeFileSync(nested, "{}");
    const failures = layoutGuard(root);
    expect(failures.some((item) => item.code === "harness_path_regression")).toBe(
      true,
    );
  });
});
