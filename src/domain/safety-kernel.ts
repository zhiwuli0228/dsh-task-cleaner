import type { CleanupPlan } from './artifact.js';

/** Safety decision kind (S-01 default deny). */
export type SafetyDecisionKind = 'allow' | 'deny' | 'review';

export interface SafetyDecision {
  /** Stable decision id; the SafetyKernel is the sole producer (S-06). */
  readonly decisionId: string;
  readonly candidateId: string;
  readonly decision: SafetyDecisionKind;
  /** Stable machine-readable reason code. */
  readonly reasonCode: string;
  readonly evaluatedAt: string;
}

export interface SafetyDecisionSummary {
  readonly allowed: number;
  readonly denied: number;
  readonly review: number;
  readonly decisions: readonly SafetyDecision[];
}

export interface DecisionContext {
  readonly taskId: string;
  readonly runId: string;
  readonly workspaceRoot: string;
  readonly now: string;
  readonly dryRun: boolean;
}

/**
 * Safety kernel contract (ADR-004).
 *
 * A pure decision boundary: it receives a plan plus context and returns
 * per-candidate SafetyDecision values. No positive decision → deny. Business
 * code must never construct filesystem actions without routing through here.
 */
export interface SafetyKernel {
  decide(plan: CleanupPlan, context: DecisionContext): Promise<SafetyDecisionSummary>;
}

/** Stable reason codes used by the protection-checking default-deny kernel. */
export const SAFETY_REASON = {
  /** Candidate has no canonical source path; nothing can be verified (S-02). */
  MISSING_REAL_PATH: 'missing_real_path',
  /** The decision context has no usable workspace root (S-02). */
  MISSING_WORKSPACE_ROOT: 'missing_workspace_root',
  /** The candidate path cannot be lstat/realpath resolved (S-02/S-03). */
  UNRESOLVABLE_PATH: 'unresolvable_path',
  /** The workspace-relative path is empty, absolute, or escapes the root. */
  INVALID_REL_PATH: 'invalid_rel_path',
  /** The candidate points into `.git/` internals; never a cleanup target. */
  GIT_INTERNAL_PATH: 'git_internal_path',
  /** Candidate is a symlink/junction; links are never followed (S-03). */
  SYMLINK_NOT_FOLLOWED: 'symlink_not_followed',
  /** Candidate resolves outside the configured workspace root (S-02). */
  OUTSIDE_WORKSPACE: 'outside_workspace',
  /** relPath and sourceRealPath do not describe the same file (S-03/S-06). */
  REL_PATH_UNBOUND: 'rel_path_unbound',
  /** Captured identity no longer matches the file on disk (S-05/S-06). */
  IDENTITY_MISMATCH: 'identity_mismatch',
  /** Hardlinked file: other links would survive a move (S-05). */
  HARDLINK_NOT_ALLOWED: 'hardlink_not_allowed',
  /** Candidate is tracked by HEAD or the Git index (S-04). */
  GIT_TRACKED: 'git_tracked',
  /** Git status could not be established; fail closed (S-04). */
  GIT_STATUS_UNAVAILABLE: 'git_status_unavailable',
  /** Baseline milestone: no allow path is implemented yet (S-07). */
  NOT_IMPLEMENTED_DEFAULT_DENY: 'not_implemented_default_deny',
  /** Candidate failed to satisfy at least one of S-01..S-04 predicates. */
  DEFAULT_DENY: 'default_deny',
} as const;
