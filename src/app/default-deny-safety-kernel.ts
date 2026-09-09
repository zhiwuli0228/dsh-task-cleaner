import type { CleanupPlan } from '../domain/artifact.js';
import { SAFETY_REASON } from '../domain/safety-kernel.js';
import type { DecisionContext, SafetyDecision, SafetyDecisionSummary, SafetyKernel } from '../domain/safety-kernel.js';

/**
 * Default-deny safety kernel (ADR-004, S-01 / S-07).
 *
 * Baseline milestone policy: no candidate is ever allowed. Every decision is a
 * stable `deny`, which is the correct fail-closed behavior until the real
 * containment / attribution / protection predicates are implemented behind
 * the FsPort/GitPort.
 */
export class DefaultDenySafetyKernel implements SafetyKernel {
  decide(plan: CleanupPlan, context: DecisionContext): SafetyDecisionSummary {
    const decisions: SafetyDecision[] = plan.candidates.map((candidate) => ({
      decisionId: candidate.decisionId,
      candidateId: candidate.candidateId,
      decision: 'deny',
      reasonCode: SAFETY_REASON.NOT_IMPLEMENTED_DEFAULT_DENY,
      evaluatedAt: context.now,
    }));

    return {
      allowed: 0,
      denied: decisions.length,
      review: 0,
      decisions,
    };
  }
}
