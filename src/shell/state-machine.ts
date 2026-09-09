import type { VmStatus } from "./vm-types.js";

/**
 * Command/session state machine (ux-shell-contract.md §4.1).
 *
 * Design notes:
 * - `plan-ready -> running` is forbidden; every execution goes through
 *   `awaiting-decision` with an explicit, revalidated candidate set.
 * - A `running` command cannot be submitted again (no double execution).
 * - `partial`/`failed` never retry automatically: a retry is a new
 *   explicit user action (R6), so the machine accepts an explicit
 *   transition to a fresh `plan-ready`/`awaiting-decision` only.
 */
export const COMMAND_STATUSES: readonly VmStatus[] = [
  "idle",
  "loading",
  "noop",
  "plan-ready",
  "awaiting-decision",
  "running",
  "succeeded",
  "partial",
  "failed",
  "cancelled",
  "denied",
] as const;

const TERMINAL_OR_BUSY: ReadonlySet<VmStatus> = new Set<VmStatus>([
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

/**
 * Transition table for shell-driven transitions. Returns the next state,
 * or throws TypeError for forbidden transitions.
 */
export function transitionCommandState(from: VmStatus, to: VmStatus): VmStatus {
  // Re-submitting while running must fail even when the UI state has not
  // changed between events (double-submit protection).
  if (from === "running" && to === "running") {
    throw new TypeError(`forbidden transition: ${from} -> ${to}`);
  }
  if (from === to) return to;
  if (from === "idle") {
    if (to === "loading" || to === "plan-ready" || to === "noop") return to;
  }
  if (from === "loading") {
    if (
      to === "plan-ready" ||
      to === "noop" ||
      to === "succeeded" ||
      to === "failed" ||
      to === "cancelled"
    ) {
      return to;
    }
  }
  if (from === "plan-ready") {
    if (to === "awaiting-decision" || to === "loading") return to;
  }
  if (from === "awaiting-decision") {
    if (to === "running" || to === "plan-ready" || to === "cancelled") return to;
  }
  if (from === "running") {
    if (to === "succeeded" || to === "partial" || to === "failed" || to === "cancelled") {
      return to;
    }
  }
  // Explicit user restart after failure/partial is a new decision cycle.
  if (from === "partial" || from === "failed" || from === "cancelled" || from === "succeeded") {
    if (to === "idle" || to === "loading" || to === "plan-ready") return to;
  }
  if (from === "denied") {
    if (to === "idle" || to === "loading" || to === "plan-ready") return to;
  }
  throw new TypeError(`forbidden transition: ${from} -> ${to}`);
}

/** True when the status is one of the terminal/busy states used to block UI. */
export function isCommandBusy(status: VmStatus): boolean {
  return status === "running";
}

export function isCommandTerminal(status: VmStatus): boolean {
  return TERMINAL_OR_BUSY.has(status);
}

/** Maps the UI-selected candidate set into a command-level state. */
export function stateForSelection(
  current: VmStatus,
  selectedCount: number,
): VmStatus {
  if (current === "plan-ready") {
    return selectedCount > 0 ? "awaiting-decision" : "plan-ready";
  }
  if (current === "awaiting-decision") {
    return selectedCount > 0 ? "awaiting-decision" : "plan-ready";
  }
  return current;
}
