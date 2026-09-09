import type { VmCandidate, VmQuarantineRecord } from "../shell/index.js";
import { formatBytes, pathLabel } from "../shell/index.js";

/**
 * Confirmation-panel data helpers (ux-shell-contract.md §6.3). The panel
 * must show the exact N items/bytes/paths and require an explicit checkbox
 * whose label contains that same N; nothing here implies deletion (R2).
 */

export interface ConfirmPlanRequest {
  candidates: VmCandidate[];
  taskId: string;
}

export interface ConfirmRestoreRequest {
  records: VmQuarantineRecord[];
}

export interface ConfirmationDetail {
  /** The exact statement the confirmation checkbox must carry. */
  confirmationText: string;
  items: string[];
  /** Display-only total bytes; the underlying number is the port's. */
  totalBytesLabel: string;
}

export function quarantineConfirmation(request: ConfirmPlanRequest): ConfirmationDetail {
  const selected = request.candidates.filter((candidate) => candidate.selected);
  const count = selected.length;
  const bytes = selected.reduce((sum, candidate) => sum + candidate.sizeBytes, 0);
  return {
    confirmationText: `I confirm I will quarantine only the ${count} item(s) above (recoverable from quarantine)`,
    items: selected.map((candidate) => pathLabel(candidate.path)),
    totalBytesLabel: formatBytes(bytes),
  };
}

export function restoreConfirmation(request: ConfirmRestoreRequest): ConfirmationDetail {
  const selected = request.records;
  const count = selected.length;
  return {
    confirmationText: `I confirm I will restore only the ${count} record(s) above to their original paths`,
    items: selected.map((record) => `${record.originalPathLabel} <- ${record.quarantinePathLabel}`),
    totalBytesLabel: formatBytes(selected.reduce((sum, record) => sum + record.sizeBytes, 0)),
  };
}

/** A selection is submittable only when every candidate row says selected. */
export function selectedCandidates(candidates: VmCandidate[]): VmCandidate[] {
  return candidates.filter((candidate) => candidate.selected);
}
