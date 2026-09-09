import type {
  CliJsonEnvelope,
  UxShellPorts,
  VmAuditPage,
  VmCommandResult,
  VmConfigSummary,
  VmError,
  VmPlan,
  VmStatus,
  VmTaskSummary,
} from "../shell/index.js";
import { buildEnvelope } from "../shell/index.js";
import { parseArgs } from "./arg-parse.js";
import type { ParsedArgs } from "./arg-parse.js";
import {
  renderAudit,
  renderCommandResult,
  renderConfig,
  renderHelp,
  renderPlan,
  renderStatus,
} from "./render-text.js";

/**
 * CLI execution core (ux-shell-contract.md §5.4). Pure in its contract:
 * handlers take injected ports and return stdout/stderr plus an exit code.
 */

export const EXIT_OK = 0;
export const EXIT_RUNTIME_FAILURE = 1;
export const EXIT_USAGE = 2;
export const EXIT_SAFETY_DENY = 3;
export const EXIT_PARTIAL = 4;
export const EXIT_INTERRUPT = 130;

/** Statuses the executor itself emits; other statuses come from ports. */
type ExecutorStatus = "succeeded" | "failed" | "denied" | "partial" | "noop" | "plan-ready";

export interface CliOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
  envelope: CliJsonEnvelope<unknown> | null;
}

function envelopeToJson(envelope: CliJsonEnvelope<unknown>): string {
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

export interface CliContext {
  ports: UxShellPorts;
  /** true when attached to an interactive terminal. */
  isTty: boolean;
  cliVersion: string;
  now?: Date;
}

function envelopeError(
  context: CliContext,
  command: string,
  status: "failed" | "denied",
  errors: VmError[],
  jsonRequested: boolean,
): CliOutput {
  const envelope = buildEnvelope({
    command,
    status,
    errors,
    meta: {},
    cliVersion: context.cliVersion,
    now: context.now,
  });
  return {
    exitCode: status === "denied" ? EXIT_SAFETY_DENY : EXIT_RUNTIME_FAILURE,
    stdout: "",
    stderr: jsonRequested
      ? ""
      : `${errors.map((error) => `[${error.code}] ${error.message}`).join("\n")}\n`,
    envelope,
  };
}

function runtimeFailure(
  context: CliContext,
  command: string,
  error: unknown,
  jsonRequested: boolean,
): CliOutput {
  const message = error instanceof Error ? error.message : String(error);
  return envelopeError(context, command, "failed", [
    { code: "ERR_PORT_FAILURE", message },
  ], jsonRequested);
}

function usageOutput(
  context: CliContext,
  message: string,
  jsonRequested: boolean,
): CliOutput {
  const envelope = buildEnvelope({
    command: "usage",
    status: "failed",
    errors: [{ code: "ERR_USAGE", message }],
    meta: {},
    cliVersion: context.cliVersion,
    now: context.now,
  });
  return {
    exitCode: EXIT_USAGE,
    stdout: jsonRequested ? envelopeToJson(envelope) : "",
    stderr: `${message}\n`,
    envelope,
  };
}

function finalize(
  context: CliContext,
  command: string,
  status: ExecutorStatus,
  data: unknown,
  text: string,
  errors: VmError[],
  meta?: Pick<CliJsonEnvelope<unknown>["meta"], "taskId" | "planId">,
): CliOutput {
  const envelope = buildEnvelope({
    command,
    status,
    data,
    errors,
    meta: {
      taskId: meta?.taskId,
      planId: meta?.planId,
    },
    cliVersion: context.cliVersion,
    now: context.now,
  });
  return {
    exitCode: exitCodeFor(status),
    stdout: text,
    stderr: "",
    envelope,
  };
}

function exitCodeFor(status: ExecutorStatus): number {
  switch (status) {
    case "denied":
      return EXIT_SAFETY_DENY;
    case "partial":
      return EXIT_PARTIAL;
    case "failed":
      return EXIT_RUNTIME_FAILURE;
    default:
      return EXIT_OK;
  }
}

function commandLabel(args: ParsedArgs): string {
  return args.command === "dry-run" ? "plan" : args.command;
}

function isNoopPlan(plan: VmPlan): boolean {
  return plan.candidates.length === 0 || plan.summary.offered === 0;
}

async function planCommand(
  context: CliContext,
  args: Extract<ParsedArgs, { command: "plan" | "dry-run" }>,
): Promise<CliOutput> {
  const jsonRequested = args.format === "json";
  let result: VmPlan;
  try {
    result = await context.ports.loadPlan(args.taskId);
  } catch (error) {
    return runtimeFailure(context, commandLabel(args), error, jsonRequested);
  }
  const noop = isNoopPlan(result);
  const status = noop ? "noop" : "plan-ready";
  let text = "";
  if (args.format === "text") {
    text = noop
      ? "No cleanup candidates found (no changes written).\n"
      : renderPlan(result);
  }
  return finalize(
    context,
    "plan",
    status,
    result,
    text,
    [],
    { taskId: result.taskId, planId: result.planId },
  );
}

async function quarantineCommand(
  context: CliContext,
  args: Extract<ParsedArgs, { command: "quarantine" }>,
): Promise<CliOutput> {
  const jsonRequested = args.format === "json";
  if (args.candidateIds.length === 0) {
    // Safety refusal for an empty/unspecified candidate set (§5.1/§5.5).
    return envelopeError(context, "quarantine", "denied", [
      {
        code: "ERR_SAFETY_DENY",
        message: "quarantine requires at least one explicit --candidate-id",
      },
    ], jsonRequested);
  }
  let result: VmCommandResult;
  try {
    result = await context.ports.applyQuarantine({
      taskId: args.taskId,
      candidateIds: args.candidateIds,
    });
  } catch (error) {
    return runtimeFailure(context, "quarantine", error, jsonRequested);
  }
  const status = portStatus(result.status);
  const text = args.format === "json" ? "" : renderCommandResult("quarantine", status);
  return finalize(context, "quarantine", status, result, text, [], {
    taskId: args.taskId,
  });
}

async function restoreCommand(
  context: CliContext,
  args: Extract<ParsedArgs, { command: "restore" }>,
): Promise<CliOutput> {
  const jsonRequested = args.format === "json";
  if (args.recordIds.length === 0) {
    return envelopeError(context, "restore", "denied", [
      {
        code: "ERR_SAFETY_DENY",
        message: "restore requires at least one explicit --record-id",
      },
    ], jsonRequested);
  }
  let result: VmCommandResult;
  try {
    result = await context.ports.applyRestore({ recordIds: args.recordIds });
  } catch (error) {
    return runtimeFailure(context, "restore", error, jsonRequested);
  }
  const status = portStatus(result.status);
  const text = args.format === "json" ? "" : renderCommandResult("restore", status);
  return finalize(context, "restore", status, result, text, []);
}

async function statusCommand(
  context: CliContext,
  args: Extract<ParsedArgs, { command: "status" }>,
): Promise<CliOutput> {
  const jsonRequested = args.format === "json";
  let result: VmTaskSummary;
  try {
    result = await context.ports.loadTaskStatus(args.taskId ?? "");
  } catch (error) {
    return runtimeFailure(context, "status", error, jsonRequested);
  }
  const text = args.format === "json" ? "" : renderStatus(result);
  return finalize(context, "status", "succeeded", result, text, [], {
    taskId: result.taskId,
  });
}

async function auditCommand(
  context: CliContext,
  args: Extract<ParsedArgs, { command: "audit" }>,
): Promise<CliOutput> {
  const jsonRequested = args.format === "json";
  let result: VmAuditPage;
  try {
    result = await context.ports.loadAudit(args.filter);
  } catch (error) {
    return runtimeFailure(context, "audit", error, jsonRequested);
  }
  const text = args.format === "json" ? "" : renderAudit(result);
  return finalize(context, "audit", "succeeded", result, text, []);
}

async function configCommand(
  context: CliContext,
  args: Extract<ParsedArgs, { command: "config" }>,
): Promise<CliOutput> {
  const jsonRequested = args.format === "json";
  let result: VmConfigSummary;
  try {
    result = await context.ports.loadConfig();
  } catch (error) {
    return runtimeFailure(context, "config", error, jsonRequested);
  }
  const text = args.format === "json" ? "" : renderConfig(result);
  return finalize(context, "config", "succeeded", result, text, []);
}

function helpCommand(
  context: CliContext,
  args: Extract<ParsedArgs, { command: "help" }>,
): CliOutput {
  return finalize(
    context,
    "help",
    "succeeded",
    null,
    args.format === "json" ? "" : renderHelp(),
    [],
  );
}

function portStatus(status: VmStatus): ExecutorStatus {
  if (status === "succeeded" || status === "partial") return status;
  if (status === "denied") return "denied";
  return "failed";
}

/** Executes parsed arguments against injected ports (async port calls). */
export async function runCli(args: ParsedArgs, context: CliContext): Promise<CliOutput> {
  switch (args.command) {
    case "plan":
    case "dry-run":
      return planCommand(context, args);
    case "quarantine":
      return quarantineCommand(context, args);
    case "restore":
      return restoreCommand(context, args);
    case "status":
      return statusCommand(context, args);
    case "audit":
      return auditCommand(context, args);
    case "config":
      return configCommand(context, args);
    case "help":
      return helpCommand(context, args);
  }
}

/**
 * Full entry used by main.ts and tests: parse, run, then render the JSON
 * envelope to stdout when the user requested `--format json`.
 */
export async function runCliEntry(
  rawArgs: string[],
  context: CliContext,
): Promise<CliOutput> {
  const parsed = parseArgs(rawArgs);
  if (!parsed.ok) {
    const jsonRequested = rawArgs.includes("--format") && rawArgs.includes("json");
    return usageOutput(context, parsed.message, jsonRequested);
  }
  const output = await runCli(parsed.args, context);
  const format = (parsed.args as { format: "text" | "json" }).format;
  if (format === "json" && output.envelope) {
    return { ...output, stdout: envelopeToJson(output.envelope) };
  }
  return output;
}
