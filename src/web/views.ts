import type {
  VmAuditPage,
  VmConfigSummary,
  VmPlan,
  VmQuarantineRecord,
  VmTaskSummary,
} from "../shell/index.js";

/**
 * Web shell view definitions (ux-shell-contract.md §6.1).
 *
 * Views are passive render targets: each one receives the view model from
 * UxShellPorts and the five shared states (loading/empty/error/content/
 * busy). No view computes a decision, count, or safety conclusion (R1).
 */

export type WebViewName = "overview" | "plan" | "quarantine" | "audit" | "config";

export type ViewState = "loading" | "empty" | "error" | "content" | "busy";

export interface WebRoute {
  view: WebViewName;
  taskId: string | null;
}

/** Overview view: recent tasks, cleanup state, dry-run hint. */
export interface OverviewViewModel {
  recentTasks: VmTaskSummary[];
  dryRunDefault: true;
}

/** Plan view payload: read-only plan + UI-only selection helpers. */
export interface PlanViewModel {
  plan: VmPlan;
  /** UI checkbox state only; port revalidates on submit (R3). */
  selectedCandidateIds: string[];
}

export interface QuarantineViewModel {
  records: VmQuarantineRecord[];
  selectedRecordIds: string[];
}

export interface AuditViewModel {
  page: VmAuditPage;
  filterLabel: string;
}

export interface ConfigViewModel {
  config: VmConfigSummary;
}

export type WebViewState =
  | { view: "overview"; state: Exclude<ViewState, "busy">; model: OverviewViewModel | null; error: string | null }
  | { view: "plan"; state: ViewState; model: PlanViewModel | null; error: string | null }
  | { view: "quarantine"; state: ViewState; model: QuarantineViewModel | null; error: string | null }
  | { view: "audit"; state: Exclude<ViewState, "busy">; model: AuditViewModel | null; error: string | null }
  | { view: "config"; state: Exclude<ViewState, "busy">; model: ConfigViewModel | null; error: string | null };

export interface ViewDefinition<V> {
  name: V;
  title: string;
  routePattern: string;
}

/** Route patterns per ux-shell-contract.md §6.1. */
export const VIEW_DEFINITIONS: readonly ViewDefinition<WebViewName>[] = [
  { name: "overview", title: "Overview", routePattern: "/" },
  { name: "plan", title: "Plan", routePattern: "/tasks/:taskId/plan" },
  { name: "quarantine", title: "Quarantine", routePattern: "/quarantine" },
  { name: "audit", title: "Audit", routePattern: "/audit" },
  { name: "config", title: "Configuration", routePattern: "/settings" },
] as const;

function parseSegments(path: string): string[] {
  return path.split("/").filter((segment) => segment.length > 0);
}

/**
 * Defensive URL-decoding for route parameters (Review SUGGESTION).
 * Malformed percent-encoding or decoded control characters must never
 * reach a view model; callers fall back to a safe route.
 */
function decodeSegment(segment: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return null;
  }
  // Reject empty results, any control characters (including NUL/newline),
  // separators introduced through encoding, and traversal-shaped values
  // that could confuse labels or later path handling.
  if (decoded.length === 0) return null;
  if (/[\u0000-\u001f\u007f]/.test(decoded)) return null;
  if (decoded.includes("/") || decoded.includes("\\")) return null;
  if (decoded === "." || decoded === "..") return null;
  return decoded;
}

function matchPattern(pattern: string, segments: string[]): Record<string, string> | null {
  const patternSegments = parseSegments(pattern);
  if (patternSegments.length !== segments.length) return null;
  const params: Record<string, string> = {};
  for (let index = 0; index < patternSegments.length; index += 1) {
    const patternSegment = patternSegments[index];
    if (patternSegment.startsWith(":")) {
      const decoded = decodeSegment(segments[index]);
      if (decoded === null) return null;
      params[patternSegment.slice(1)] = decoded;
    } else if (patternSegment !== segments[index]) {
      return null;
    }
  }
  return params;
}

/** Resolves a location path (without query/hash) into a route + params. */
export function resolveRoute(path: string): WebRoute {
  const clean = path.startsWith("/") ? path : `/${path}`;
  const segments = parseSegments(clean);
  for (const definition of VIEW_DEFINITIONS) {
    const params = matchPattern(definition.routePattern, segments);
    if (params !== null) {
      return {
        view: definition.name,
        taskId: params.taskId ?? null,
      };
    }
  }
  // Unknown paths fall back to the overview, matching the SPA navigation
  // contract where every top-level route is one of the five views.
  return { view: "overview", taskId: null };
}

export function viewDefinition(view: WebViewName): ViewDefinition<WebViewName> {
  const definition = VIEW_DEFINITIONS.find((item) => item.name === view);
  if (!definition) {
    throw new RangeError(`unknown view '${view}'`);
  }
  return definition;
}

/** Stable empty/error model per view (used by contract tests and mount). */
export function emptyStateFor(
  view: WebViewName,
  message: string,
): Extract<WebViewState, { view: WebViewName }> {
  return {
    view,
    state: "empty",
    model: null,
    error: null,
  } as Extract<WebViewState, { view: WebViewName }>;
}
