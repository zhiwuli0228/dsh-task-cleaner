import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import {
  GovernanceError,
  type GovernanceIssue,
  type HumanGateRegistry,
  type TraceabilityLedger,
  issue,
} from "./types.js";

export const GOVERNANCE_ROOT = "docs/harness";
export const TRACEABILITY_SCHEMA_PATH = `${GOVERNANCE_ROOT}/traceability.schema.json`;
export const TRACEABILITY_LEDGER_PATH = `${GOVERNANCE_ROOT}/traces/traceability-ledger.json`;
export const HUMAN_GATES_PATH = `${GOVERNANCE_ROOT}/human-gates.json`;
export const CLOSED_LOOP_REGISTRY_PATH = `${GOVERNANCE_ROOT}/closed-loop-registry.json`;
export const DISCOVERY_BASELINE_PATH = `${GOVERNANCE_ROOT}/discovery-baseline.json`;

export const TRACEABILITY_SCHEMA_VERSION =
  "dsh-task-cleaner/traceability/v1alpha1";

const LEDGER_TOP_KEYS = new Set(["schema_version", "entries"]);
const ENTRY_KEYS = new Set([
  "requirement_id",
  "milestone",
  "status",
  "requirements",
  "specs",
  "tasks",
  "code",
  "verification",
  "traces",
  "human_gate",
  "gaps",
]);
const VERIFICATION_KEYS = new Set(["path", "mode", "status"]);
const VERIFICATION_MODES = new Set([
  "declarative",
  "unit",
  "integration",
  "e2e",
  "manual",
  "ci",
]);
const VERIFICATION_STATUSES = new Set([
  "passed",
  "failed",
  "pending",
  "missing",
]);

export function posixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

export function readJsonObject(filePath: string, label: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw new GovernanceError("missing_file", `${label} ${filePath}: ${cause}`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw new GovernanceError(
      "invalid_json",
      `${label} ${filePath}: ${cause}`,
    );
  }
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  label: string,
  failures: GovernanceIssue[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      failures.push(issue("unknown_field", `${label}: unknown field "${key}"`));
    }
  }
}

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return null;
  }
  return value as string[];
}

export function checkContainedPath(
  root: string,
  candidate: string,
): GovernanceIssue | null {
  const raw = String(candidate);
  if (raw.trim() === "") {
    return issue("empty_artifact_path", "empty artifact path");
  }
  if (raw.includes("\0")) {
    return issue(
      "artifact_path_invalid",
      `artifact path ${JSON.stringify(raw)} contains NUL`,
    );
  }
  const posix = posixPath(raw);
  if (
    posix.startsWith("/") ||
    /^[A-Za-z]:/.test(posix) ||
    posix.startsWith("//")
  ) {
    return issue(
      "artifact_path_escapes",
      `artifact path "${raw}" is absolute or uses a drive/UNC prefix`,
    );
  }
  const segments = posix.split("/").filter((part) => part !== "");
  if (segments.length === 0) {
    return issue("empty_artifact_path", "empty artifact path");
  }
  const resolved = path.resolve(root, ...segments);
  const relative = path.relative(path.resolve(root), resolved);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return issue(
      "artifact_path_escapes",
      `artifact path "${raw}" escapes repository`,
    );
  }
  try {
    statSync(resolved);
    return null;
  } catch {
    return issue(
      "artifact_path_missing",
      `artifact path "${raw}" does not exist`,
    );
  }
}

export function loadLedger(filePath: string): TraceabilityLedger {
  const value = readJsonObject(filePath, "traceability ledger");
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new GovernanceError(
      "invalid_ledger",
      `traceability ledger ${filePath} must be an object`,
    );
  }
  return value as TraceabilityLedger;
}

export function validateLedger(
  root: string,
  ledger: TraceabilityLedger,
): GovernanceIssue[] {
  const failures: GovernanceIssue[] = [];
  if (typeof ledger !== "object" || ledger === null) {
    return [issue("invalid_ledger", "ledger is required")];
  }
  rejectUnknownKeys(
    ledger as unknown as Record<string, unknown>,
    LEDGER_TOP_KEYS,
    "ledger",
    failures,
  );
  if (ledger.schema_version !== TRACEABILITY_SCHEMA_VERSION) {
    failures.push(
      issue(
        "unsupported_traceability_schema_version",
        `expected ${TRACEABILITY_SCHEMA_VERSION}, got ${String(
          ledger.schema_version,
        )}`,
      ),
    );
  }
  if (!Array.isArray(ledger.entries)) {
    failures.push(issue("invalid_ledger", "ledger.entries must be an array"));
    return failures;
  }

  const seen = new Set<string>();
  ledger.entries.forEach((rawEntry, index) => {
    const entry = rawEntry as unknown as Record<string, unknown>;
    const label = `ledger entry ${index}`;
    rejectUnknownKeys(entry, ENTRY_KEYS, label, failures);
    const requirementId = String(entry.requirement_id ?? "");
    if (!requirementId || seen.has(requirementId)) {
      failures.push(
        issue(
          "duplicate_or_empty_requirement",
          `duplicate or empty requirement ID ${JSON.stringify(requirementId)}`,
        ),
      );
      return;
    }
    seen.add(requirementId);

    const status = String(entry.status ?? "");
    const requirements = stringList(entry.requirements);
    const specs = stringList(entry.specs);
    const tasks = stringList(entry.tasks);
    const code = stringList(entry.code);
    const traces = stringList(entry.traces);
    const verification = entry.verification;
    if (
      !requirements ||
      !specs ||
      !tasks ||
      !code ||
      !traces ||
      !Array.isArray(verification)
    ) {
      failures.push(
        issue(
          "invalid_ledger_entry",
          `${requirementId}: six-segment fields must all be arrays of strings`,
        ),
      );
      return;
    }
    if (requirements.length === 0) {
      failures.push(
        issue("no_requirement_source", `${requirementId} has no requirement source`),
      );
    }

    const needsFullTrace =
      status !== "planned" && status !== "blocked" && status !== "";
    if (
      needsFullTrace &&
      (specs.length === 0 ||
        tasks.length === 0 ||
        code.length === 0 ||
        verification.length === 0 ||
        traces.length === 0)
    ) {
      failures.push(
        issue(
          "incomplete_six_segment_trace",
          `${requirementId} has an incomplete six-segment trace`,
        ),
      );
    }

    for (const ref of [
      ...requirements,
      ...specs,
      ...code,
      ...traces,
    ]) {
      const failure = checkContainedPath(root, ref);
      if (failure) {
        failures.push({
          code: failure.code,
          message: `${requirementId}: ${failure.message}`,
        });
      }
    }

    let hasExecutedPass = false;
    let hasPendingRequired = false;
    verification.forEach((rawVerification, verIndex) => {
      const item = rawVerification as Record<string, unknown>;
      rejectUnknownKeys(
        item,
        VERIFICATION_KEYS,
        `${requirementId} verification ${verIndex}`,
        failures,
      );
      const itemPath = String(item.path ?? "");
      const mode = String(item.mode ?? "");
      const itemStatus = String(item.status ?? "");
      if (!VERIFICATION_MODES.has(mode)) {
        failures.push(
          issue(
            "invalid_verification_mode",
            `${requirementId} verification ${verIndex}: unsupported mode ${JSON.stringify(
              mode,
            )}`,
          ),
        );
      }
      if (!VERIFICATION_STATUSES.has(itemStatus)) {
        failures.push(
          issue(
            "invalid_verification_status",
            `${requirementId} verification ${verIndex}: unsupported status ${JSON.stringify(
              itemStatus,
            )}`,
          ),
        );
      }
      const failure = checkContainedPath(root, itemPath);
      if (failure) {
        failures.push({
          code: failure.code,
          message: `${requirementId} verification: ${failure.message}`,
        });
      }
      if (mode !== "declarative" && itemStatus === "passed") {
        hasExecutedPass = true;
      }
      if (
        itemStatus === "pending" ||
        itemStatus === "missing" ||
        itemStatus === "failed"
      ) {
        hasPendingRequired = true;
      }
    });

    if (status === "implemented" && !hasExecutedPass) {
      failures.push(
        issue(
          "implemented_without_executed_verification",
          `${requirementId} is implemented without passed executable verification`,
        ),
      );
    }
    if (status === "accepted") {
      if (!hasExecutedPass || hasPendingRequired) {
        failures.push(
          issue(
            "accepted_without_complete_verification",
            `${requirementId} is accepted without complete executable verification`,
          ),
        );
      }
      const gate = String(entry.human_gate ?? "").trim();
      if (gate === "") {
        failures.push(
          issue(
            "accepted_without_human_gate",
            `${requirementId} is accepted without a Human Gate`,
          ),
        );
      } else {
        const gateFailure = checkContainedPath(root, gate);
        if (gateFailure) {
          failures.push({
            code: gateFailure.code,
            message: `${requirementId} Human Gate: ${gateFailure.message}`,
          });
        }
      }
    }
  });
  return failures;
}

export function validateAcceptedDocuments(
  root: string,
  registryPath: string,
): GovernanceIssue[] {
  const failures: GovernanceIssue[] = [];
  const value = readJsonObject(registryPath, "Human Gate registry");
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    failures.push(
      issue("invalid_human_gate_registry", "Human Gate registry must be an object"),
    );
    return failures;
  }
  const registry = value as HumanGateRegistry & Record<string, unknown>;
  if (!Array.isArray(registry.accepted_documents)) {
    failures.push(
      issue(
        "invalid_human_gate_registry",
        "accepted_documents must be an array",
      ),
    );
    return failures;
  }
  const approved = new Map<string, string>();
  registry.accepted_documents.forEach((rawItem, index) => {
    const item = rawItem as unknown as Record<string, unknown>;
    const itemPath = posixPath(String(item.path ?? "")).replace(/\/+$/, "");
    if (!itemPath || typeof item.gate !== "string" || item.gate === "") {
      failures.push(
        issue(
          "invalid_human_gate_entry",
          `Human Gate entry ${index} must have non-empty path and gate`,
        ),
      );
      return;
    }
    approved.set(itemPath, posixPath(item.gate));
  });

  const docsRoot = path.join(root, "docs");
  const acceptedPattern = /^Status:\s*Accepted(?:\s|$)/m;
  const walk = (directory: string): void => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      const cause = error instanceof Error ? error.message : String(error);
      failures.push(issue("docs_unreadable", `cannot read ${directory}: ${cause}`));
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".md") {
        continue;
      }
      let body: string;
      try {
        body = readFileSync(fullPath, "utf8");
      } catch (error) {
        const cause = error instanceof Error ? error.message : String(error);
        failures.push(issue("docs_unreadable", `cannot read ${fullPath}: ${cause}`));
        continue;
      }
      if (!acceptedPattern.test(body)) {
        continue;
      }
      const relative = posixPath(path.relative(root, fullPath));
      const gate = approved.get(relative);
      if (gate === undefined) {
        failures.push(
          issue(
            "accepted_document_without_gate",
            `Accepted document ${relative} has no registered Human Gate`,
          ),
        );
        continue;
      }
      const gateFailure = checkContainedPath(root, gate);
      if (gateFailure) {
        failures.push({
          code: gateFailure.code,
          message: `Accepted document ${relative}: ${gateFailure.message}`,
        });
      }
    }
  };
  if (existsSync(docsRoot)) {
    walk(docsRoot);
  }
  return failures;
}
