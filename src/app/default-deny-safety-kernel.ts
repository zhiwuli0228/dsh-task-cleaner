import { randomUUID } from 'node:crypto';
import type { ArtifactCandidate, CleanupPlan } from '../domain/artifact.js';
import type { RealPath } from '../domain/common.js';
import { SAFETY_REASON } from '../domain/safety-kernel.js';
import type { DecisionContext, SafetyDecision, SafetyDecisionSummary, SafetyKernel } from '../domain/safety-kernel.js';
import type { FsPort } from '../ports/filesystem.js';
import type { GitPort } from '../ports/git.js';

export interface ProtectionPorts {
  readonly fs: FsPort;
  readonly git: GitPort;
}

/**
 * Default-deny safety kernel with real protection predicates (ADR-004, S-01..S-07).
 *
 * Every candidate is evaluated against the FsPort/GitPort predicates
 * (canonical path, workspace containment, symlink refusal, identity match,
 * Git tracked-file protection). Any predicate failure yields its specific
 * reason code; a candidate that passes every predicate still falls through to
 * the stable `not_implemented_default_deny` reason because this milestone
 * ships no positive cleanup path (S-07). Nothing is ever allowed here, and
 * the reasons are now evidence-based rather than stub-constant.
 */
export class DefaultDenySafetyKernel implements SafetyKernel {
  constructor(private readonly ports: ProtectionPorts) {}

  async decide(plan: CleanupPlan, context: DecisionContext): Promise<SafetyDecisionSummary> {
    const workspace = await this.resolveWorkspace(context);
    const decisions: SafetyDecision[] = [];
    for (const candidate of plan.candidates) {
      decisions.push({
        decisionId: randomUUID(),
        candidateId: candidate.candidateId,
        decision: 'deny',
        reasonCode: await this.evaluateCandidate(candidate, context, workspace),
        evaluatedAt: context.now,
      });
    }
    return {
      allowed: 0,
      denied: decisions.length,
      review: 0,
      decisions,
    };
  }

  private async resolveWorkspace(context: DecisionContext): Promise<RealPath | null> {
    if (!context.workspaceRoot) return null;
    try {
      return await this.ports.fs.realpath(context.workspaceRoot);
    } catch {
      return null;
    }
  }

  private async evaluateCandidate(
    candidate: ArtifactCandidate,
    context: DecisionContext,
    workspace: RealPath | null,
  ): Promise<string> {
    if (!candidate.sourceRealPath) return SAFETY_REASON.MISSING_REAL_PATH;
    if (workspace === null) return SAFETY_REASON.MISSING_WORKSPACE_ROOT;

    // lstat on the candidate itself: symlinks are visible and never followed.
    let stat;
    try {
      stat = await this.ports.fs.lstat(candidate.sourceRealPath);
    } catch {
      return SAFETY_REASON.UNRESOLVABLE_PATH;
    }
    if (stat.isSymlink || candidate.symlink !== null) {
      return SAFETY_REASON.SYMLINK_NOT_FOLLOWED;
    }

    // Canonicalize, then require strict containment inside the workspace root.
    let canonical;
    try {
      canonical = await this.ports.fs.realpath(candidate.sourceRealPath);
    } catch {
      return SAFETY_REASON.UNRESOLVABLE_PATH;
    }
    if (!(await this.ports.fs.contains(workspace, canonical))) {
      return SAFETY_REASON.OUTSIDE_WORKSPACE;
    }

    // The identity captured at plan time must still describe the same file.
    if (
      stat.identity.dev !== candidate.identity.dev ||
      stat.identity.ino !== candidate.identity.ino
    ) {
      return SAFETY_REASON.IDENTITY_MISMATCH;
    }

    let gitStatus;
    try {
      gitStatus = await this.ports.git.status(workspace, candidate.relPath);
    } catch {
      return SAFETY_REASON.GIT_STATUS_UNAVAILABLE;
    }
    if (gitStatus.tracked || gitStatus.head || gitStatus.index) {
      return SAFETY_REASON.GIT_TRACKED;
    }

    return SAFETY_REASON.NOT_IMPLEMENTED_DEFAULT_DENY;
  }
}
