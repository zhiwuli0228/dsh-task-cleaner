import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  CLOSED_LOOP_REGISTRY_PATH,
  DISCOVERY_BASELINE_PATH,
  posixPath,
  readJsonObject,
} from "./index.js";
import type { GovernanceIssue } from "./types.js";
import { GovernanceError, issue } from "./types.js";

export const PHASES = [
  "registered",
  "brainstormed",
  "plan_reviewed",
  "plan_confirmed",
  "design_reviewed",
  "design_confirmed",
  "eval_red",
  "implemented",
  "code_reviewed",
  "verified",
  "traced",
  "workflow_ready",
] as const;

export const IMPACT_FIELDS = [
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
] as const;

export const VALID_ARTIFACT_TYPES = new Set([
  "classification",
  "brainstorm",
  "plan",
  "superspec",
  "design",
  "eval",
  "implementation",
  "review",
  "verification",
  "trace",
  "gate_receipt",
]);

export const PHASE_ARTIFACT_TYPES: Readonly<Record<string, readonly string[]>> = {
  registered: ["classification"],
  brainstormed: ["brainstorm"],
  plan_reviewed: ["plan"],
  design_reviewed: ["superspec", "design"],
  eval_red: ["eval"],
  implemented: ["implementation"],
  verified: ["verification"],
  traced: ["trace"],
};

export const ARTIFACT_PRODUCER_PHASES: Readonly<
  Record<string, readonly string[]>
> = {
  classification: ["registered"],
  brainstorm: ["brainstormed"],
  plan: ["plan_reviewed"],
  superspec: ["design_reviewed"],
  design: ["design_reviewed"],
  eval: ["eval_red"],
  implementation: ["implemented"],
  review: ["plan_reviewed", "design_reviewed", "code_reviewed"],
  verification: ["verified"],
  trace: ["traced"],
  gate_receipt: ["plan_confirmed", "design_confirmed"],
};

export class WorkflowError extends Error {}

interface ImpactQuestionnaire {
  [field: string]: string;
}

interface ChangeRegistryItem {
  change_id: string;
  state_path?: unknown;
  covered_paths?: unknown;
}

interface ChangeRegistry {
  schema_version?: unknown;
  changes: unknown[];
}

interface StateDocument {
  schema_version?: unknown;
  change_id?: unknown;
  base_revision?: unknown;
  phase?: unknown;
  history?: unknown;
  artifacts?: unknown;
  reviews?: unknown;
  findings?: unknown;
  gates?: unknown;
  external_acceptance?: unknown;
}

export interface Report {
  change_id: unknown;
  phase: unknown;
  external_acceptance: unknown;
  workflow_ready: boolean;
  gate_status: string;
  issues: GovernanceIssue[];
}

export function classifyImpact(
  impact: ImpactQuestionnaire,
): { workflow_class: "full" | "abbreviated"; reasons: string[] } {
  const reasons: string[] = [];
  for (const field of IMPACT_FIELDS) {
    const answer = impact[field] ?? "unknown";
    if (answer !== "no") {
      reasons.push(field);
    }
  }
  return {
    workflow_class: reasons.length === 0 ? "abbreviated" : "full",
    reasons,
  };
}

function runGit(root: string, args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
    }).trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new WorkflowError(`git_error: ${message}`);
  }
}

function runGitBytes(root: string, args: string[]): Buffer {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "buffer",
      windowsHide: true,
    });
  } catch {
    return Buffer.alloc(0);
  }
}

function isAncestor(root: string, resolved: string): boolean {
  try {
    execFileSync(
      "git",
      ["merge-base", "--is-ancestor", resolved, "HEAD"],
      { cwd: root, stdio: "ignore", windowsHide: true },
    );
    return true;
  } catch {
    return false;
  }
}

export function resolveBaseline(root: string, explicit: string | null): string {
  let source = "argument";
  let revision = explicit;
  if (!revision) {
    source = DISCOVERY_BASELINE_PATH;
    const baselinePath = path.join(root, DISCOVERY_BASELINE_PATH);
    let baseline: Record<string, unknown>;
    try {
      const value = readJsonObject(baselinePath, "discovery baseline");
      baseline = value as Record<string, unknown>;
    } catch (error) {
      if (error instanceof GovernanceError && error.code === "missing_file") {
        throw new WorkflowError("missing_discovery_baseline");
      }
      throw error;
    }
    revision = String(baseline.base_revision ?? "");
  }
  if (
    revision.length !== 40 ||
    !/^[0-9a-fA-F]{40}$/.test(revision)
  ) {
    throw new WorkflowError(`invalid_discovery_baseline: ${source}`);
  }
  let resolved = "";
  try {
    resolved = runGit(root, ["rev-parse", "--verify", `${revision}^{commit}`]);
  } catch {
    throw new WorkflowError(`invalid_discovery_baseline: ${source}`);
  }
  if (!isAncestor(root, resolved)) {
    throw new WorkflowError(`invalid_discovery_baseline: ${source}`);
  }
  return resolved.toLowerCase();
}

export function discoverChangedPaths(root: string, baseline: string): string[] {
  const found = new Set<string>();
  const commandSets: string[][] = [
    ["diff", "--name-only", "-z", baseline, "HEAD"],
    ["diff", "--name-only", "-z", "--cached"],
    ["diff", "--name-only", "-z"],
    ["ls-files", "--others", "--exclude-standard", "-z"],
  ];
  for (const command of commandSets) {
    const output = runGitBytes(root, command);
    for (const raw of output.toString("utf8").split("\0")) {
      if (!raw) {
        continue;
      }
      const clean = posixPath(raw);
      if (!clean.startsWith(".git/")) {
        found.add(clean);
      }
    }
  }
  return [...found].sort();
}

export function discoverCandidates(
  root: string,
  baseline: string,
  registry: ChangeRegistry,
): GovernanceIssue[] {
  const issues: GovernanceIssue[] = [];
  const changed = discoverChangedPaths(root, baseline);
  const registeredIds = new Set(
    registry.changes.map((change) =>
      String((change as ChangeRegistryItem).change_id ?? ""),
    ),
  );
  const registeredPaths = new Set<string>();
  for (const change of registry.changes) {
    const item = change as ChangeRegistryItem;
    for (const rawPath of (item.covered_paths ?? []) as unknown[]) {
      registeredPaths.add(posixPath(String(rawPath)).replace(/\/+$/, ""));
    }
  }
  for (const directory of [
    path.join(root, "openspec", "changes"),
    path.join(root, "docs", "harness", "changes"),
  ]) {
    let entries: string[] = [];
    try {
      entries = readdirSync(directory);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(directory, entry);
      let isDirectory = false;
      try {
        isDirectory = statSync(full).isDirectory();
      } catch {
        isDirectory = false;
      }
      if (
        isDirectory &&
        !["archive", "archived"].includes(entry) &&
        !registeredIds.has(entry)
      ) {
        issues.push(
          issue(
            "missing_registration",
            `active change is not registered: ${posixPath(path.relative(root, full))}`,
          ),
        );
      }
    }
  }
  for (const changedPath of changed) {
    if (!registeredPaths.has(changedPath)) {
      issues.push(
        issue(
          "missing_registration",
          `${changedPath}: changed path has no registered impact questionnaire`,
        ),
      );
    }
  }
  return issues;
}

export function validateRegistry(
  root: string,
  registry: ChangeRegistry,
): GovernanceIssue[] {
  const issues: GovernanceIssue[] = [];
  const owners = new Map<string, string>();
  for (const rawChange of registry.changes) {
    const change = rawChange as ChangeRegistryItem;
    const changeId = String(change.change_id ?? "");
    for (const rawPath of (change.covered_paths ?? []) as unknown[]) {
      const normalized = posixPath(String(rawPath)).replace(/\/+$/, "");
      if (!normalized) {
        issues.push(
          issue(
            "empty_coverage",
            `${changeId}: empty covered path is prohibited`,
          ),
        );
        continue;
      }
      let isDirectory = false;
      try {
        isDirectory = statSync(path.join(root, normalized)).isDirectory();
      } catch {
        isDirectory = false;
      }
      if (isDirectory) {
        issues.push(
          issue(
            "overbroad_coverage",
            `${changeId}: directory coverage is prohibited: ${rawPath}`,
          ),
        );
      }
      const existingOwner = owners.get(normalized);
      if (existingOwner && existingOwner !== changeId) {
        issues.push(
          issue(
            "overlapping_coverage",
            `${normalized}: owned by ${existingOwner} and ${changeId}`,
          ),
        );
      }
      owners.set(normalized, changeId);
    }
  }
  return issues;
}

function sha256File(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function isPhases(value: unknown): value is (typeof PHASES)[number] {
  return (
    typeof value === "string" &&
    (PHASES as readonly string[]).includes(value)
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return (typeof value === "object" && value !== null
    ? value
    : {}) as Record<string, unknown>;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

export function validateState(
  root: string,
  state: StateDocument,
): GovernanceIssue[] {
  const issues: GovernanceIssue[] = [];
  const artifacts = Array.isArray(state.artifacts) ? state.artifacts : [];
  const findings = Array.isArray(state.findings) ? state.findings : [];
  const history = Array.isArray(state.history) ? state.history : [];

  if (artifacts.length > 256) {
    issues.push(issue("artifact_limit_exceeded", "maximum is 256 artifacts"));
  }
  if (findings.length > 256) {
    issues.push(issue("finding_limit_exceeded", "maximum is 256 findings"));
  }
  if (history.length > 64) {
    issues.push(issue("history_limit_exceeded", "maximum is 64 transitions"));
  }

  for (let index = 0; index < history.length - 1; index += 1) {
    const previous = history[index];
    const current = history[index + 1];
    if (!isPhases(previous) || !isPhases(current)) {
      issues.push(
        issue("invalid_transition", `${String(previous)} -> ${String(current)}`),
      );
      continue;
    }
    const previousIndex = PHASES.indexOf(previous);
    const currentIndex = PHASES.indexOf(current);
    if (currentIndex !== previousIndex + 1) {
      issues.push(
        issue("invalid_transition", `${previous} -> ${current}`),
      );
    }
  }

  const phase = state.phase;
  if (!isPhases(phase)) {
    issues.push(issue("invalid_phase", String(phase)));
  } else if (history.length > 0 && phase !== history[history.length - 1]) {
    issues.push(issue("phase_history_mismatch", String(phase)));
  } else if (isPhases(phase)) {
    const expectedHistory = PHASES.slice(0, PHASES.indexOf(phase) + 1);
    if (history.join("\u0000") !== expectedHistory.join("\u0000")) {
      issues.push(
        issue(
          "incomplete_history",
          `expected canonical prefix through ${phase}`,
        ),
      );
    }
  }

  const byId = new Map<string, Record<string, unknown>>();
  const staleIds = new Set<string>();
  for (const rawArtifact of artifacts) {
    const artifact = asRecord(rawArtifact);
    const artifactId = String(artifact.id ?? "");
    if (!artifactId || byId.has(artifactId)) {
      issues.push(issue("duplicate_artifact", artifactId));
      continue;
    }
    byId.set(artifactId, artifact);
    const type = String(artifact.type ?? "");
    const producerPhase = String(artifact.producer_phase ?? "");
    if (!VALID_ARTIFACT_TYPES.has(type)) {
      issues.push(issue("untyped_dependency", artifactId));
    } else if (
      !(ARTIFACT_PRODUCER_PHASES[type] ?? []).includes(producerPhase)
    ) {
      issues.push(
        issue(
          "invalid_producer_phase",
          `${artifactId}: ${type} produced at ${producerPhase}`,
        ),
      );
    }
    const artifactPath = path.join(root, String(artifact.path ?? ""));
    try {
      const stat = statSync(artifactPath);
      if (stat.size > 1024 * 1024) {
        issues.push(issue("artifact_size_exceeded", artifactId));
      } else if (sha256File(artifactPath) !== String(artifact.sha256 ?? "").toLowerCase()) {
        issues.push(issue("stale_digest", artifactId));
        staleIds.add(artifactId);
      }
    } catch {
      issues.push(issue("missing_artifact", artifactId));
      staleIds.add(artifactId);
    }
  }

  const graph = new Map<string, string[]>();
  for (const [artifactId, artifact] of byId) {
    const dependencies = artifact.depends_on;
    if (!Array.isArray(dependencies)) {
      issues.push(issue("untyped_dependency", artifactId));
      graph.set(artifactId, []);
      continue;
    }
    const normalized = dependencies.map((item) => String(item));
    graph.set(artifactId, normalized);
    for (const dependency of normalized) {
      if (!byId.has(dependency)) {
        issues.push(
          issue("missing_dependency", `${artifactId} -> ${dependency}`),
        );
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: string): void => {
    if (visiting.has(node)) {
      issues.push(issue("dependency_cycle", node));
      return;
    }
    if (visited.has(node)) {
      return;
    }
    visiting.add(node);
    for (const dependency of graph.get(node) ?? []) {
      if (graph.has(dependency)) {
        visit(dependency);
      }
    }
    visiting.delete(node);
    visited.add(node);
  };
  for (const node of graph.keys()) {
    visit(node);
  }

  const dependsOnType = (
    artifactId: string,
    requiredType: string,
    seen = new Set<string>(),
  ): boolean => {
    if (seen.has(artifactId)) {
      return false;
    }
    seen.add(artifactId);
    for (const dependency of graph.get(artifactId) ?? []) {
      const target = byId.get(dependency);
      if (target?.type === requiredType) {
        return true;
      }
      if (dependsOnType(dependency, requiredType, seen)) {
        return true;
      }
    }
    return false;
  };

  const dependsOnId = (
    artifactId: string,
    requiredId: string,
    seen = new Set<string>(),
  ): boolean => {
    if (seen.has(artifactId)) {
      return false;
    }
    seen.add(artifactId);
    for (const dependency of graph.get(artifactId) ?? []) {
      if (dependency === requiredId) {
        return true;
      }
      if (dependsOnId(dependency, requiredId, seen)) {
        return true;
      }
    }
    return false;
  };

  const requiredPredecessors: Record<string, string> = {
    brainstorm: "classification",
    plan: "brainstorm",
    superspec: "plan",
    design: "superspec",
    eval: "design",
    implementation: "eval",
    verification: "implementation",
    trace: "verification",
  };
  for (const [artifactId, artifact] of byId) {
    const type = String(artifact.type ?? "");
    const requiredType = requiredPredecessors[type];
    if (requiredType && !dependsOnType(artifactId, requiredType)) {
      issues.push(
        issue(
          "missing_phase_dependency",
          `${artifactId}: no dependency chain to ${requiredType}`,
        ),
      );
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const [artifactId, dependencies] of graph) {
      if (
        !staleIds.has(artifactId) &&
        dependencies.some((dependency) => staleIds.has(dependency))
      ) {
        staleIds.add(artifactId);
        issues.push(issue("dependent_stale", artifactId));
        changed = true;
      }
    }
  }

  const reviewArtifactKinds = new Map<string, string>();
  const reviews = Array.isArray(state.reviews) ? state.reviews : [];
  for (const rawReview of reviews) {
    const review = asRecord(rawReview);
    const kind = String(review.kind ?? "");
    const comparedId =
      kind === "code"
        ? String(review.implementer_id ?? "")
        : String(review.author_id ?? "");
    if (
      !String(review.reviewer_id ?? "") ||
      !comparedId ||
      String(review.reviewer_id) === comparedId
    ) {
      issues.push(issue("reviewer_not_independent", String(review.id ?? "")));
    }
    const artifactIds = stringArray(review.artifact_ids);
    for (const artifactId of artifactIds) {
      if (!byId.has(artifactId)) {
        issues.push(issue("review_missing_artifact", String(review.id ?? "")));
      }
    }
    const reviewedTypes = new Set(
      artifactIds
        .map((artifactId) => String(byId.get(artifactId)?.type ?? ""))
        .filter(Boolean),
    );
    const requiredTypes: Record<string, readonly string[]> = {
      plan: ["plan"],
      design: ["superspec", "design"],
      code: ["implementation"],
    };
    const required = requiredTypes[kind] ?? [];
    const frozen = review.input_digests;
    const frozenValid =
      typeof frozen === "object" &&
      frozen !== null &&
      artifactIds.every(
        (artifactId) =>
          (frozen as Record<string, unknown>)[artifactId] ===
          byId.get(artifactId)?.sha256,
      );
    const reviewArtifactId = String(review.review_artifact_id ?? "");
    const expectedReviewPhase: Record<string, string> = {
      plan: "plan_reviewed",
      design: "design_reviewed",
      code: "code_reviewed",
    };
    const expectedPhase = expectedReviewPhase[kind];
    const reviewArtifact = byId.get(reviewArtifactId);
    let reviewArtifactValid =
      reviewArtifactId !== "" &&
      reviewArtifact !== undefined &&
      reviewArtifact.type === "review" &&
      reviewArtifact.producer_phase === expectedPhase &&
      artifactIds.every((artifactId) =>
        dependsOnId(reviewArtifactId, artifactId),
      );
    if (reviewArtifactValid) {
      if (reviewArtifactKinds.has(reviewArtifactId)) {
        reviewArtifactValid = false;
      } else {
        reviewArtifactKinds.set(reviewArtifactId, kind);
      }
    }
    if (
      artifactIds.length === 0 ||
      !required.every((type) => reviewedTypes.has(type)) ||
      !frozenValid ||
      !reviewArtifactValid
    ) {
      issues.push(issue("review_not_frozen", String(review.id ?? "")));
    }
  }

  for (const rawFinding of findings) {
    const finding = asRecord(rawFinding);
    const severity = String(finding.severity ?? "");
    const status = String(finding.status ?? "");
    if ((severity === "P0" || severity === "P1") && status !== "closed") {
      issues.push(issue("open_blocking_finding", String(finding.id ?? "")));
    }
    if (status === "waived" && severity !== "P2") {
      issues.push(issue("invalid_finding_waiver", String(finding.id ?? "")));
    }
    if (
      status === "closed" &&
      stringArray(finding.artifact_ids).some((artifactId) =>
        staleIds.has(artifactId),
      )
    ) {
      issues.push(issue("finding_reopened", String(finding.id ?? "")));
    }
  }

  const gateIds = new Set<string>();
  const validGateKinds = new Set<string>();
  const gates = Array.isArray(state.gates) ? state.gates : [];
  for (const rawGate of gates) {
    const gate = asRecord(rawGate);
    const gateId = String(gate.id ?? "");
    const artifactIds = stringArray(gate.artifact_ids);
    const kind = String(gate.kind ?? "");
    const expectedReviewKind = kind === "adoption" ? "code" : kind;
    const validBinding =
      artifactIds.length > 0 &&
      artifactIds.every(
        (artifactId) =>
          reviewArtifactKinds.get(artifactId) === expectedReviewKind,
      );
    if (
      !gateId ||
      gateIds.has(gateId) ||
      !["plan", "design", "adoption"].includes(kind) ||
      gate.decision !== "approved" ||
      !validBinding
    ) {
      issues.push(issue("invalid_gate", gateId));
    } else {
      gateIds.add(gateId);
      validGateKinds.add(kind);
    }
  }

  if (isPhases(phase)) {
    const currentIndex = PHASES.indexOf(phase);
    const presentTypes = new Set(
      [...byId.values()].map((artifact) => String(artifact.type ?? "")),
    );
    for (const [requiredPhase, requiredTypes] of Object.entries(
      PHASE_ARTIFACT_TYPES,
    )) {
      if (currentIndex < PHASES.indexOf(requiredPhase as (typeof PHASES)[number])) {
        continue;
      }
      for (const requiredType of requiredTypes) {
        if (!presentTypes.has(requiredType)) {
          issues.push(
            issue(
              "missing_phase_evidence",
              `${requiredPhase}: missing artifact type ${requiredType}`,
            ),
          );
        }
      }
    }
    const reviewKinds = new Set(
      reviews.map((review) => String(asRecord(review).kind ?? "")),
    );
    for (const [requiredPhase, reviewKind] of [
      ["plan_reviewed", "plan"],
      ["design_reviewed", "design"],
      ["code_reviewed", "code"],
    ] as const) {
      if (
        currentIndex >= PHASES.indexOf(requiredPhase) &&
        !reviewKinds.has(reviewKind)
      ) {
        issues.push(
          issue(
            "missing_phase_evidence",
            `${requiredPhase}: missing ${reviewKind} review`,
          ),
        );
      }
    }
    if (
      currentIndex >= PHASES.indexOf("plan_confirmed") &&
      !validGateKinds.has("plan")
    ) {
      issues.push(
        issue("missing_phase_evidence", "plan_confirmed: missing Gate receipt"),
      );
    }
    if (
      currentIndex >= PHASES.indexOf("design_confirmed") &&
      !validGateKinds.has("design")
    ) {
      issues.push(
        issue("missing_phase_evidence", "design_confirmed: missing Gate receipt"),
      );
    }
  }
  return issues;
}

export function buildReport(root: string, state: StateDocument): Report {
  const stateIssues = validateState(root, state);
  const gates = Array.isArray(state.gates) ? state.gates : [];
  const gateStatus =
    gates.length > 0 ? "gate_recorded_unverified" : "gate_missing";
  return {
    change_id: state.change_id,
    phase: state.phase,
    external_acceptance: state.external_acceptance ?? "pending",
    workflow_ready: state.phase === "workflow_ready" && stateIssues.length === 0,
    gate_status: gateStatus,
    issues: stateIssues,
  };
}

export function checkRepository(
  root: string,
  explicitBase: string | null,
): {
  baseline: string;
  workflow_ready: boolean;
  issues: GovernanceIssue[];
  changes: Report[];
} {
  const baseline = resolveBaseline(root, explicitBase);
  const registryPath = path.join(root, CLOSED_LOOP_REGISTRY_PATH);
  let registry: ChangeRegistry;
  try {
    registry = readJsonObject(registryPath, "closed-loop registry") as ChangeRegistry;
  } catch (error) {
    if (error instanceof GovernanceError && error.code === "missing_file") {
      registry = { changes: [] };
    } else {
      throw error;
    }
  }
  const issues = validateRegistry(root, registry);
  issues.push(...discoverCandidates(root, baseline, registry));
  const changes: Report[] = [];
  for (const rawItem of registry.changes) {
    const item = rawItem as ChangeRegistryItem;
    const statePath = path.join(root, String(item.state_path ?? ""));
    if (!statSyncSafe(statePath)) {
      issues.push(issue("missing_state", String(item.change_id ?? statePath)));
      continue;
    }
    const state = readJsonObject(statePath, "change state") as StateDocument;
    if (String(state.base_revision ?? "").toLowerCase() !== baseline) {
      issues.push(issue("registration_base_mismatch", String(item.change_id ?? "")));
    }
    const report = buildReport(root, state);
    changes.push(report);
    for (const entry of report.issues) {
      issues.push(issue(entry.code, entry.message));
    }
  }
  return {
    baseline,
    workflow_ready: issues.length === 0 && changes.every((change) => change.workflow_ready),
    issues,
    changes,
  };
}

function statSyncSafe(filePath: string): boolean {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}
