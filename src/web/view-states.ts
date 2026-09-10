import type {
  VmAuditPage,
  VmConfigSummary,
  VmPlan,
  VmQuarantineRecord,
  VmTaskSummary,
} from "../shell/index.js";
import type {
  PlanViewModel,
  QuarantineViewModel,
  WebViewName,
  ViewState,
} from "./views.js";

/**
 * Five-views x standard-states matrix (ux-shell-contract.md §6.4 and
 * §4.3). These pure selectors keep the renderer free of ad-hoc empty/error
 * logic and make the contract directly testable without a DOM.
 */

export const VIEW_NAMES: readonly WebViewName[] = [
  "overview",
  "plan",
  "quarantine",
  "audit",
  "config",
] as const;

export const VIEW_STATES: readonly ViewState[] = [
  "loading",
  "empty",
  "error",
  "content",
  "busy",
] as const;

export type PlanViewState = {
  view: "plan";
  state: ViewState;
  model: PlanViewModel | null;
  error: string | null;
};

export type QuarantineViewState = {
  view: "quarantine";
  state: ViewState;
  model: QuarantineViewModel | null;
  error: string | null;
};

export type StandardViewState =
  | {
      view: "overview";
      state: Exclude<ViewState, "busy">;
      model: { recentTasks: VmTaskSummary[]; dryRunDefault: true } | null;
      error: string | null;
    }
  | {
      view: "audit";
      state: Exclude<ViewState, "busy">;
      model: { page: VmAuditPage; filterLabel: string } | null;
      error: string | null;
    }
  | {
      view: "config";
      state: Exclude<ViewState, "busy">;
      model: { config: VmConfigSummary } | null;
      error: string | null;
    };

export type AnyViewState = PlanViewState | QuarantineViewState | StandardViewState;

/** Empty-state copy per view (§4.3), used by renderers and tests. */
export function emptyCopy(view: WebViewName): AnyViewState {
  const base = { model: null, error: null, state: "empty" as const };
  if (view === "plan") return { view, ...base, state: "empty", model: null, error: null };
  if (view === "quarantine") {
    return { view, ...base, state: "empty", model: null, error: null };
  }
  return { view, ...base, state: "empty", model: null, error: null } as StandardViewState;
}

/** True when a view has nothing to render but did not fail. */
export function isEmptyPlan(plan: VmPlan): boolean {
  return plan.candidates.length === 0 || plan.summary.offered === 0;
}

export function isEmptyQuarantine(records: VmQuarantineRecord[]): boolean {
  return records.length === 0;
}

export function isEmptyAudit(page: VmAuditPage): boolean {
  return page.events.length === 0;
}

export function isEmptyConfig(config: VmConfigSummary | null): boolean {
  return config === null;
}
