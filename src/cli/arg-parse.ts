import type { AuditFilter } from "../shell/index.js";

/**
 * CLI command surface and argument parsing (ux-shell-contract.md §5.1).
 *
 * The parser is deliberately explicit: no shorthand execution switches,
 * no `--all`/`--yes`/`--force`/delete/purge options exist anywhere on the
 * surface (S-07, R2). Unknown flags fail with a usage error rather than
 * being silently ignored.
 */

export type CliCommand =
  | "plan"
  | "dry-run"
  | "quarantine"
  | "restore"
  | "status"
  | "audit"
  | "config"
  | "help";

export type OutputFormat = "text" | "json";
export type ColorMode = "auto" | "always" | "never";

export interface CommonOptions {
  format: OutputFormat;
  color: ColorMode;
}

export interface PlanArgs extends CommonOptions {
  command: "plan" | "dry-run";
  taskId: string | null;
}

export interface QuarantineArgs extends CommonOptions {
  command: "quarantine";
  taskId: string;
  candidateIds: string[];
}

export interface RestoreArgs extends CommonOptions {
  command: "restore";
  recordIds: string[];
}

export interface StatusArgs extends CommonOptions {
  command: "status";
  taskId: string | null;
}

export interface AuditArgs extends CommonOptions {
  command: "audit";
  filter: AuditFilter;
}

export interface ConfigArgs extends CommonOptions {
  command: "config";
}

export interface HelpArgs extends CommonOptions {
  command: "help";
}

export type ParsedArgs =
  | PlanArgs
  | QuarantineArgs
  | RestoreArgs
  | StatusArgs
  | AuditArgs
  | ConfigArgs
  | HelpArgs;

export interface UsageError {
  ok: false;
  message: string;
  /** Usage errors always exit 2 (§5.4). */
  exitCode: 2;
}

export type ParseResult = { ok: true; args: ParsedArgs } | UsageError;

export const DEFAULT_COMMON: CommonOptions = Object.freeze({
  format: "text",
  color: "auto",
});

/**
 * Options that must never exist on this baseline command surface (S-07).
 * Their presence is rejected explicitly so accidental wiring fails loudly.
 */
export const FORBIDDEN_FLAGS: readonly string[] = [
  "--yes",
  "--force",
  "-y",
  "--all",
  "--delete",
  "--purge",
] as const;

export function usage(message: string): UsageError {
  return { ok: false, message, exitCode: 2 };
}

interface ScanOptions {
  allowTaskId: boolean;
  allowSince: boolean;
  allowLimit: boolean;
  allowCandidateId: boolean;
  allowRecordId: boolean;
  allowPositional: string[];
}

const EMPTY_ALLOW = Object.freeze({
  allowTaskId: false,
  allowSince: false,
  allowLimit: false,
  allowCandidateId: false,
  allowRecordId: false,
  allowPositional: [],
});

function takeValue(argv: string[], index: number, _flag: string): string | null {
  const raw = argv[index + 1];
  if (raw === undefined || raw.startsWith("-")) return null;
  return raw;
}

/**
 * Strict flag/value scanner. Returns usage error on anything not explicitly
 * allowed, which keeps the surface small and auditable.
 */
function scan(argv: string[], options: ScanOptions): UsageError | null {
  let index = 0;
  let positionals = 0;
  while (index < argv.length) {
    const token = argv[index];
    if (FORBIDDEN_FLAGS.includes(token)) {
      return usage(`forbidden option '${token}' is not part of the baseline surface`);
    }
    if (token === "--help" || token === "-h") {
      return usage("help requested");
    }
    if (token === "--format") {
      const value = takeValue(argv, index, token);
      if (value === null) return usage("--format requires text|json");
      if (value !== "text" && value !== "json") {
        return usage(`--format must be text or json (got '${value}')`);
      }
      index += 2;
      continue;
    }
    if (token === "--color") {
      const value = takeValue(argv, index, token);
      if (value === null) return usage("--color requires auto|always|never");
      if (value !== "auto" && value !== "always" && value !== "never") {
        return usage(`--color must be auto, always or never (got '${value}')`);
      }
      index += 2;
      continue;
    }
    if (token === "--task-id") {
      if (!options.allowTaskId) return usage(`option '${token}' is not valid for this command`);
      const value = takeValue(argv, index, token);
      if (value === null) return usage("--task-id requires a value");
      index += 2;
      continue;
    }
    if (token === "--since") {
      if (!options.allowSince) return usage(`option '${token}' is not valid for this command`);
      const value = takeValue(argv, index, token);
      if (value === null) return usage("--since requires an RFC 3339 timestamp");
      index += 2;
      continue;
    }
    if (token === "--limit") {
      if (!options.allowLimit) return usage(`option '${token}' is not valid for this command`);
      const value = takeValue(argv, index, token);
      if (value === null) return usage("--limit requires a positive integer");
      if (!/^[1-9]\d*$/.test(value)) {
        return usage(`--limit requires a positive integer (got '${value}')`);
      }
      index += 2;
      continue;
    }
    if (token === "--candidate-id") {
      if (!options.allowCandidateId) {
        return usage(`option '${token}' is not valid for this command`);
      }
      const value = takeValue(argv, index, token);
      if (value === null) return usage("--candidate-id requires a value");
      index += 2;
      continue;
    }
    if (token === "--record-id") {
      if (!options.allowRecordId) return usage(`option '${token}' is not valid for this command`);
      const value = takeValue(argv, index, token);
      if (value === null) return usage("--record-id requires a value");
      index += 2;
      continue;
    }
    if (token.startsWith("-") && token !== "-") {
      return usage(`unknown option '${token}'`);
    }
    if (!options.allowPositional.includes(token)) {
      return usage(`unexpected argument '${token}'`);
    }
    positionals += 1;
    index += 1;
  }
  if (options.allowPositional.length > 0 && positionals > options.allowPositional.length) {
    return usage("too many positional arguments");
  }
  return null;
}

function collectValues(argv: string[], flag: string): string[] {
  const out: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      const value = argv[index + 1];
      if (value !== undefined && !value.startsWith("-")) out.push(value);
    }
  }
  return out;
}

function lastValue(argv: string[], flag: string): string | null {
  const values = collectValues(argv, flag);
  return values.length > 0 ? values[values.length - 1] : null;
}

function formatOf(argv: string[]): OutputFormat {
  const value = lastValue(argv, "--format");
  return value === "json" ? "json" : "text";
}

function colorOf(argv: string[]): ColorMode {
  const value = lastValue(argv, "--color");
  if (value === "always" || value === "never") return value;
  return "auto";
}

/**
 * Parses argv (without the binary name). Returns a discriminated result so
 * callers can map usage failures to exit code 2.
 */
export function parseArgs(argv: string[]): ParseResult {
  if (argv.length === 0) return usage("missing command (try 'help')");
  const [command, ...rest] = argv;

  if (command === "help" || command === "--help" || command === "-h") {
    return { ok: true, args: { ...DEFAULT_COMMON, command: "help" } };
  }

  const known = new Set<CliCommand>([
    "plan",
    "dry-run",
    "quarantine",
    "restore",
    "status",
    "audit",
    "config",
  ]);
  if (!known.has(command as CliCommand)) {
    return usage(`unknown command '${command}'`);
  }

  const common = { format: formatOf(rest), color: colorOf(rest) };

  if (command === "config") {
    const error = scan(rest, { ...EMPTY_ALLOW, allowPositional: ["show"] });
    if (error) return error;
    const positionals = rest.filter((token) => !token.startsWith("-"));
    if (positionals.length === 0) {
      return usage("config requires the 'show' subcommand");
    }
    if (positionals[0] !== "show") {
      return usage(`unknown config subcommand '${positionals[0]}'`);
    }
    return { ok: true, args: { ...common, command: "config" } };
  }

  if (command === "plan" || command === "dry-run") {
    const error = scan(rest, { ...EMPTY_ALLOW, allowTaskId: true });
    if (error) return error;
    return {
      ok: true,
      args: { ...common, command, taskId: lastValue(rest, "--task-id") },
    };
  }

  if (command === "quarantine") {
    const error = scan(rest, {
      ...EMPTY_ALLOW,
      allowTaskId: true,
      allowCandidateId: true,
    });
    if (error) return error;
    const taskId = lastValue(rest, "--task-id");
    if (!taskId) return usage("quarantine requires --task-id");
    const candidateIds = collectValues(rest, "--candidate-id");
    return {
      ok: true,
      args: { ...common, command: "quarantine", taskId, candidateIds },
    };
  }

  if (command === "restore") {
    const error = scan(rest, { ...EMPTY_ALLOW, allowRecordId: true });
    if (error) return error;
    const recordIds = collectValues(rest, "--record-id");
    return { ok: true, args: { ...common, command: "restore", recordIds } };
  }

  if (command === "status") {
    const error = scan(rest, { ...EMPTY_ALLOW, allowTaskId: true });
    if (error) return error;
    return {
      ok: true,
      args: { ...common, command: "status", taskId: lastValue(rest, "--task-id") },
    };
  }

  if (command === "audit") {
    const error = scan(rest, {
      ...EMPTY_ALLOW,
      allowTaskId: true,
      allowSince: true,
      allowLimit: true,
    });
    if (error) return error;
    const filter: AuditFilter = {};
    const taskId = lastValue(rest, "--task-id");
    if (taskId) filter.taskId = taskId;
    const since = lastValue(rest, "--since");
    if (since) filter.since = since;
    const limit = lastValue(rest, "--limit");
    if (limit) filter.limit = Number(limit);
    return { ok: true, args: { ...common, command: "audit", filter } };
  }

  return usage(`internal parser error for '${command}'`);
}
