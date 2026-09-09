#!/usr/bin/env node
import path from "node:path";
import {
  HUMAN_GATES_PATH,
  TRACEABILITY_LEDGER_PATH,
  loadLedger,
  validateAcceptedDocuments,
  validateLedger,
} from "./index.js";
import { layoutGuard } from "./layout-guard.js";
import {
  WorkflowError,
  checkRepository,
} from "./workflow-checker.js";
import type { GovernanceIssue } from "./types.js";
import { GovernanceError, issue } from "./types.js";

type Command = "check" | "workflow" | "layout";

interface CliOptions {
  command: Command;
  root: string;
  base: string | null;
  json: boolean;
}

function usage(): string {
  return [
    "Usage:",
    "  tsx tools/governance/cli.ts <check|workflow|layout> [--root <dir>] [--base <sha>] [--json]",
    "",
    "  check     traceability ledger + accepted documents + layout guard",
    "  workflow  closed-loop workflow checker (fail-closed)",
    "  layout    docs/harness layout guard incl. root .harness regression",
  ].join("\n");
}

function parseArgs(argv: string[]): CliOptions {
  const positional = argv.filter((argument) => !argument.startsWith("--"));
  const command = (positional[0] ?? "check") as Command;
  if (!["check", "workflow", "layout"].includes(command)) {
    throw new Error(`unknown command: ${command}\n\n${usage()}`);
  }
  const options: CliOptions = {
    command,
    root: process.cwd(),
    base: null,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--root") {
      options.root = argv[index + 1] ?? process.cwd();
      index += 1;
    } else if (argument === "--base") {
      options.base = argv[index + 1] ?? null;
      index += 1;
    } else if (argument === "--json") {
      options.json = true;
    }
  }
  options.root = path.resolve(options.root);
  return options;
}

function reportJson(report: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function fail(
  options: CliOptions,
  label: string,
  issues: GovernanceIssue[],
): void {
  const report = {
    ok: false,
    stage: label,
    issues,
  };
  if (options.json) {
    reportJson(report);
  } else {
    for (const entry of issues) {
      process.stderr.write(`ERROR ${entry.code}: ${entry.message}\n`);
    }
    process.stderr.write(`${label}=failed\n`);
  }
  process.exitCode = 1;
}

function checkCommand(options: CliOptions): void {
  const issues: GovernanceIssue[] = [...layoutGuard(options.root)];
  try {
    const ledger = loadLedger(
      path.join(options.root, TRACEABILITY_LEDGER_PATH),
    );
    issues.push(...validateLedger(options.root, ledger));
    issues.push(
      ...validateAcceptedDocuments(
        options.root,
        path.join(options.root, HUMAN_GATES_PATH),
      ),
    );
  } catch (error) {
    if (error instanceof GovernanceError) {
      issues.push(issue(error.code, error.message));
    } else {
      throw error;
    }
  }
  if (issues.length > 0) {
    fail(options, "harness-check", issues);
    return;
  }
  if (options.json) {
    reportJson({ ok: true, stage: "harness-check", issues: [] });
  } else {
    process.stdout.write("harness-check=passed\n");
  }
}

function workflowCommand(options: CliOptions): void {
  let report: {
    baseline: string;
    workflow_ready: boolean;
    issues: GovernanceIssue[];
    changes: unknown[];
  };
  try {
    report = checkRepository(options.root, options.base);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code =
      error instanceof GovernanceError
        ? error.code
        : error instanceof WorkflowError
          ? (message.split(":", 1)[0] ?? "workflow_error")
          : "workflow_error";
    const entry = issue(
      code,
      message,
    );
    report = {
      baseline: options.base ?? "",
      workflow_ready: false,
      issues: [entry],
      changes: [],
    };
  }
  if (options.json) {
    reportJson({ ...report, ok: report.issues.length === 0 });
  } else {
    for (const entry of report.issues) {
      process.stderr.write(`ERROR ${entry.code}: ${entry.message}\n`);
    }
    process.stdout.write(
      `workflow_ready=${String(report.workflow_ready).toLowerCase()}\n`,
    );
  }
  if (report.issues.length > 0) {
    process.exitCode = 1;
  }
}

function layoutCommand(options: CliOptions): void {
  const issues = layoutGuard(options.root);
  if (issues.length > 0) {
    fail(options, "layout-guard", issues);
    return;
  }
  if (options.json) {
    reportJson({ ok: true, stage: "layout-guard", issues: [] });
  } else {
    process.stdout.write("layout-guard=passed\n");
  }
}

function main(): void {
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
    return;
  }
  if (options.command === "check") {
    checkCommand(options);
  } else if (options.command === "workflow") {
    workflowCommand(options);
  } else {
    layoutCommand(options);
  }
}

main();
