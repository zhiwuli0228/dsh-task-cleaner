/**
 * Shell mapping helpers from domain-shaped fixtures/events to view models.
 *
 * Baseline scope: mapping is display-only (R1) and mirrors the R1-R3
 * field names so the composition root can wire the backend types without
 * changing shell contracts. No cleanup/decision logic lives here.
 */

import { pathLabel } from "./format.js";
import type {
  VmCandidate,
  VmCandidateState,
  VmPlan,
} from "./vm-types.js";

/** Minimal domain-shaped candidate used by fixtures and adapter tests. */
export interface DomainShapedCandidate {
  artifactId?: string;
  candidateId: string;
  decisionId?: string;
  relPath: string;
  kind: "temp" | "intermediate" | "cache" | "build" | "generated" | "unknown";
  sizeBytes: number;
  mtime: string;
  gitTracked?: boolean;
  symlink?: unknown;
  state:
    | "candidate"
    | "planned_keep"
    | "planned_quarantine"
    | "quarantined"
    | "restored"
    | "expired"
    | "purged"
    | "skipped";
  matchedBy?: string[];
  outsideWorkspace?: boolean;
}

/** Maps the category taxonomy used by data contracts to display buckets. */
export function toVmCategory(
  kind: DomainShapedCandidate["kind"],
): VmCandidate["category"] {
  switch (kind) {
    case "temp":
      return "tmp";
    case "cache":
      return "cache";
    case "build":
    case "intermediate":
      return "intermediate";
    default:
      return "unknown";
  }
}

/** Maps a data-contract candidate state to the row display state. */
export function toVmCandidateState(
  state: DomainShapedCandidate["state"],
): VmCandidateState {
  switch (state) {
    case "candidate":
    case "planned_keep":
    case "planned_quarantine":
      return "offered";
    case "quarantined":
      return "quarantined";
    case "restored":
      return "restored";
    case "skipped":
      return "skipped";
    case "expired":
    case "purged":
      // Present in the contract, but never an actionable display state in
      // this milestone (S-07). Report as skipped for the read-only shell.
      return "skipped";
  }
}

/** Maps one artifact record to a view-model candidate (display only). */
export function mapCandidate(candidate: DomainShapedCandidate): VmCandidate {
  const riskTags: string[] = [];
  if (candidate.gitTracked) riskTags.push("git-tracked");
  if (candidate.symlink !== undefined && candidate.symlink !== null) {
    riskTags.push("symlink");
  }
  if (candidate.outsideWorkspace) riskTags.push("outside-workspace");
  return {
    candidateId: candidate.candidateId,
    state: toVmCandidateState(candidate.state),
    path: candidate.relPath,
    pathLabel: pathLabel(candidate.relPath),
    category: toVmCategory(candidate.kind),
    sizeBytes: candidate.sizeBytes,
    modifiedAt: candidate.mtime,
    riskTags,
    reasonCodes: candidate.matchedBy ? [...candidate.matchedBy] : [],
    selected: false,
  };
}

export interface DomainShapedPlan {
  planId: string;
  taskId: string;
  generatedAt?: string;
  workspaceLabel?: string;
  artifacts?: DomainShapedCandidate[];
  protectedHits?: Array<{
    path: string;
    reasonCode: string;
  }>;
}

/** Maps plan + candidate rows into the dry-run view model (display only). */
export function mapPlan(plan: DomainShapedPlan): VmPlan {
  const candidates = (plan.artifacts ?? []).map(mapCandidate);
  const offered = candidates.filter((c) => c.state === "offered").length;
  const bytesOffered = candidates
    .filter((c) => c.state === "offered")
    .reduce((sum, c) => sum + c.sizeBytes, 0);
  const protectedHits = (plan.protectedHits ?? []).map((hit) => ({
    path: hit.path,
    reasonCode: hit.reasonCode,
    label: pathLabel(hit.path),
  }));
  return {
    planId: plan.planId,
    taskId: plan.taskId,
    generatedAt: plan.generatedAt ?? new Date(0).toISOString(),
    dryRun: true,
    scopeLabel: plan.workspaceLabel ?? "",
    candidates,
    protectedHits,
    summary: {
      offered,
      quarantined: 0,
      restored: 0,
      failed: 0,
      denied: protectedHits.length,
      skipped: candidates.length - offered,
      bytesOffered,
    },
  };
}
