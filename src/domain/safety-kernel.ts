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
  decide(plan: CleanupPlan, context: DecisionContext): SafetyDecisionSummary;
}

/** Stable reason codes used by the default-deny baseline kernel. */
export const SAFETY_REASON = {
  /** Baseline milestone: no allow path is implemented yet (S-07). */
  NOT_IMPLEMENTED_DEFAULT_DENY: 'not_implemented_default_deny',
  /** Candidate failed to satisfy at least one of S-01..S-04 predicates. */
  DEFAULT_DENY: 'default_deny',
} as const;
