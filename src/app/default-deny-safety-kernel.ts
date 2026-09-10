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

    // relPath hygiene first: `.git/` internals are never cleanup targets, and
    // an executable-prefixed/escaping relative path cannot be trusted.
    const segments = candidate.relPath.replace(/\\/g, '/').split('/');
    if (segments.some((segment) => segment.toLowerCase() === '.git')) {
      return SAFETY_REASON.GIT_INTERNAL_PATH;
    }

    // Bind relPath -> real path through the port (ADR-002 rule 4): the
    // candidate is only trustworthy when the relative path and the recorded
    // canonical path describe the same file.
    const relAbsolute = this.ports.fs.resolveRelative(workspace, candidate.relPath);
    if (relAbsolute === null) return SAFETY_REASON.INVALID_REL_PATH;

    // lstat through the relPath (never the pre-resolved path): a symlink at
    // the candidate location is visible even when sourceRealPath was resolved.
    let relStat;
    try {
      relStat = await this.ports.fs.lstat(relAbsolute);
    } catch {
      return SAFETY_REASON.UNRESOLVABLE_PATH;
    }
    if (relStat.isSymlink || candidate.symlink !== null) {
      return SAFETY_REASON.SYMLINK_NOT_FOLLOWED;
    }

    let relCanonical;
    let sourceCanonical;
    try {
      relCanonical = await this.ports.fs.realpath(relAbsolute);
      sourceCanonical = await this.ports.fs.realpath(candidate.sourceRealPath);
    } catch {
      return SAFETY_REASON.UNRESOLVABLE_PATH;
    }
    if (!(await this.ports.fs.contains(workspace, relCanonical))) {
      return SAFETY_REASON.OUTSIDE_WORKSPACE;
    }
    if (!this.ports.fs.samePath(relCanonical, sourceCanonical)) {
      return SAFETY_REASON.REL_PATH_UNBOUND;
    }

    // The identity captured at plan time must still describe the same file.
    if (
      relStat.identity.dev !== candidate.identity.dev ||
      relStat.identity.ino !== candidate.identity.ino ||
      relStat.sizeBytes !== candidate.sizeBytes ||
      relStat.mtime !== candidate.mtime
    ) {
      return SAFETY_REASON.IDENTITY_MISMATCH;
    }
    if (relStat.identity.nlink > 1) {
      return SAFETY_REASON.HARDLINK_NOT_ALLOWED;
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
