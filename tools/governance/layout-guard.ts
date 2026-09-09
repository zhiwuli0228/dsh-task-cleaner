import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  CLOSED_LOOP_REGISTRY_PATH,
  DISCOVERY_BASELINE_PATH,
  GOVERNANCE_ROOT,
  HUMAN_GATES_PATH,
  TRACEABILITY_LEDGER_PATH,
  TRACEABILITY_SCHEMA_PATH,
  posixPath,
} from "./index.js";
import type { GovernanceIssue } from "./types.js";
import { issue } from "./types.js";

export const REQUIRED_GOVERNANCE_FILES = [
  `${GOVERNANCE_ROOT}/WORKFLOW.md`,
  `${GOVERNANCE_ROOT}/DONE_DEFINITION.md`,
  `${GOVERNANCE_ROOT}/CHECKLIST.md`,
  `${GOVERNANCE_ROOT}/TOOL_POLICY.md`,
  TRACEABILITY_SCHEMA_PATH,
  CLOSED_LOOP_REGISTRY_PATH,
  HUMAN_GATES_PATH,
  DISCOVERY_BASELINE_PATH,
] as const;

export const REQUIRED_GOVERNANCE_DIRECTORIES = [
  `${GOVERNANCE_ROOT}/templates`,
  `${GOVERNANCE_ROOT}/task-templates`,
  `${GOVERNANCE_ROOT}/changes`,
  `${GOVERNANCE_ROOT}/snapshots`,
  `${GOVERNANCE_ROOT}/traces`,
] as const;

export function layoutGuard(root: string): GovernanceIssue[] {
  const failures: GovernanceIssue[] = [];
  const rootPath = path.resolve(root);

  const rootEntries = readdirSync(rootPath);
  if (rootEntries.some((entry) => entry.toLowerCase() === ".harness")) {
    failures.push(
      issue(
        "root_harness_present",
        "repository root must not contain a .harness file or directory (case-insensitive)",
      ),
    );
  }

  for (const relative of REQUIRED_GOVERNANCE_FILES) {
    if (!existsSync(path.join(rootPath, relative))) {
      failures.push(
        issue(
          "missing_governance_file",
          `governance root ${GOVERNANCE_ROOT}/ requires ${relative}`,
        ),
      );
    }
  }
  for (const relative of REQUIRED_GOVERNANCE_DIRECTORIES) {
    if (!existsSync(path.join(rootPath, relative))) {
      failures.push(
        issue(
          "missing_governance_directory",
          `governance root ${GOVERNANCE_ROOT}/ requires ${relative}`,
        ),
      );
    }
  }
  if (!existsSync(path.join(rootPath, TRACEABILITY_LEDGER_PATH))) {
    failures.push(
      issue(
        "missing_ledger",
        `traceability ledger must exist at ${TRACEABILITY_LEDGER_PATH}`,
      ),
    );
  }

  let tracked = "";
  try {
    tracked = execFileSync(
      "git",
      ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      { cwd: rootPath, encoding: "utf8", windowsHide: true },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(issue("git_unavailable", `cannot list tracked paths: ${message}`));
    return failures;
  }
  for (const rawPath of tracked.split("\0")) {
    if (!rawPath) {
      continue;
    }
    const normalized = posixPath(rawPath);
    if (
      normalized
        .split("/")
        .some((segment) => segment.toLowerCase() === ".harness")
    ) {
      failures.push(
        issue(
          "harness_path_regression",
          `tracked/untracked path ${normalized} reintroduces a .harness segment outside the documented ${GOVERNANCE_ROOT}/ layout`,
        ),
      );
    }
  }
  return failures;
}
