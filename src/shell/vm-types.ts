/**
 * UX view-model types (contract: docs/design/ux-shell-contract.md §7).
 *
 * These types are the only data shapes the CLI and Web shells render.
 * The shell never computes decisions, safety conclusions, or cleanup
 * state: every value originates from UxShellPorts.
 *
 * Domain alignment (DataEngineer R1-R3 / ADR-002):
 *   ArtifactCandidate   -> VmCandidate
 *   CleanupPlan         -> VmPlan
 *   SafetyDecision      -> VmDecisionSummary
 *   QuarantineRecord    -> VmQuarantineRecord
 *   RestoreResult       -> VmRestoreResult
 *   AuditEvent          -> VmAuditEvent
 *   config/status       -> VmConfigSummary / VmTaskSummary / VmCommandResult
 */

/** Shared command/session-level UI state (§4.1). */
export type VmStatus =
  | "idle"
  | "loading"
  | "noop"
  | "plan-ready"
  | "awaiting-decision"
  | "running"
  | "succeeded"
  | "partial"
  | "failed"
  | "cancelled"
  | "denied";

/** Stable machine-readable error; code is the primary signal (§6.4). */
export interface VmError {
  /** Stable error code, e.g. "ERR_SAFETY_DENY", "ERR_PLAN_LOAD". */
  code: string;
  /** Human-readable message shown alongside the code. */
  message: string;
  /** Optional scope: candidateId / recordId / taskId. */
  scope?: string;
}

/** Counts are always taken verbatim from the port result (R1). */
export interface VmCounts {
  offered: number;
  quarantined: number;
  restored: number;
  failed: number;
  denied: number;
  skipped: number;
  bytesOffered: number;
}

export type VmTaskCleanupState =
  | "none"
  | "plan-ready"
  | "quarantined"
  | "partial"
  | "restored"
  | "failed";

export interface VmTaskSummary {
  taskId: string;
  workspaceLabel: string;
  finishedAt: string | null;
  cleanupState: VmTaskCleanupState;
  counts: VmCounts;
}

/** Candidate row state (§4.2). */
export type VmCandidateState =
  | "offered"
  | "selected"
  | "running"
  | "quarantined"
  | "restored"
  | "skipped"
  | "failed"
  | "denied";

export type VmCandidateCategory =
  | "tmp"
  | "cache"
  | "log"
  | "intermediate"
  | "unknown";

export interface VmCandidate {
  candidateId: string;
  /** Row state comes from the port result; never guessed locally (R3). */
  state: VmCandidateState;
  /** Workspace-relative path. */
  path: string;
  /** Escaped/shortened display text. */
  pathLabel: string;
  category: VmCandidateCategory;
  sizeBytes: number;
  /** RFC 3339 timestamp. */
  modifiedAt: string;
  /** Display tags such as "symlink" | "git-tracked". */
  riskTags: string[];
  reasonCodes: string[];
  /** UI-only checkbox state; independent of backend decision (R3). */
  selected: boolean;
  error?: VmError;
}

export interface VmProtectedHit {
  path: string;
  reasonCode: string;
  label: string;
}

export interface VmPlan {
  planId: string;
  taskId: string;
  generatedAt: string;
  /** Baseline is always dry-run; kept as literal `true`. */
  dryRun: true;
  scopeLabel: string;
  candidates: VmCandidate[];
  protectedHits: VmProtectedHit[];
  summary: VmCounts;
}

export interface VmDecisionSummary {
  planId: string;
  candidateIds: string[];
  actor: string;
  decidedAt: string;
  outcome: "approved" | "denied";
  reasonCodes: string[];
}

export interface VmQuarantineRecord {
  recordId: string;
  originalPath: string;
  originalPathLabel: string;
  quarantinePath: string;
  quarantinePathLabel: string;
  quarantinedAt: string;
  sizeBytes: number;
  restored: boolean;
  restoredAt: string | null;
  error?: VmError;
}

export interface VmRestoreResult {
  recordId: string;
  status: "restored" | "conflict" | "failed";
  originalPathLabel: string;
  error?: VmError;
}

export interface VmAuditEvent {
  eventId: string;
  ts: string;
  taskId: string | null;
  actor: string;
  /** e.g. "dry-run" | "quarantine" | "restore" | "safety-deny". */
  eventType: string;
  outcome: "succeeded" | "partial" | "failed" | "denied";
  scopeLabel: string;
}

export interface VmAuditPage {
  events: VmAuditEvent[];
  nextCursor: string | null;
}

export interface VmConfigSummary {
  /** Baseline constant; no editing UI exists. */
  dryRunDefault: true;
  workspaceRootLabel: string;
  protectedPatternCount: number;
  version: string;
}

export interface VmCommandResult {
  command: string;
  status: VmStatus;
  summary: VmCounts | null;
  updatedAt: string;
}

/** Read-only audit filters shared by CLI and Web. */
export interface AuditFilter {
  taskId?: string;
  since?: string;
  limit?: number;
  nextCursor?: string;
}
