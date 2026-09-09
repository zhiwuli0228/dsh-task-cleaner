import type { UxShellPorts } from "../shell/index.js";
import { formatBytes, formatTimestamp, pathLabel } from "../shell/index.js";
import { resolveRoute, viewDefinition, type WebViewName } from "./views.js";

/**
 * Minimal dependency-free DOM shell for the five Web views.
 *
 * This is intentionally framework-agnostic: every render helper is a pure
 * function of the view model returned by UxShellPorts. A framework adapter
 * can replace this file without changing the shell contracts.
 */

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function heading(level: 1 | 2 | 3, className: string, text: string): HTMLElement {
  const node = document.createElement(`h${level}`);
  node.className = className;
  node.textContent = text;
  return node;
}

function paragraph(className: string, text: string): HTMLParagraphElement {
  return el("p", className, text);
}

function liveRegion(id: string, text: string): HTMLDivElement {
  const region = el("div", "sr-live");
  region.id = id;
  region.setAttribute("role", "status");
  region.setAttribute("aria-live", "polite");
  region.textContent = text;
  return region;
}

function emptyState(text: string): HTMLElement {
  const box = el("section", "view-state view-state--empty");
  box.append(heading(2, "view-state__title", text));
  return box;
}

function errorState(error: string): HTMLElement {
  const box = el("section", "view-state view-state--error");
  box.setAttribute("role", "alert");
  box.append(heading(2, "view-state__title", "Unable to load this view"));
  box.append(paragraph("view-state__code", error));
  box.append(paragraph("view-state__hint", "Retry or check the audit view for details."));
  return box;
}

function loadingState(): HTMLElement {
  const box = el("section", "view-state view-state--loading");
  box.setAttribute("aria-busy", "true");
  box.append(heading(2, "view-state__title", "Loading…"));
  return box;
}

function table(
  headers: string[],
  rows: string[][],
  ariaLabel: string,
): HTMLTableElement {
  const node = el("table", "data-table");
  node.setAttribute("aria-label", ariaLabel);
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const header of headers) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = header;
    headerRow.append(th);
  }
  thead.append(headerRow);
  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const cell of row) {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.append(td);
    }
    tbody.append(tr);
  }
  node.append(thead, tbody);
  return node;
}

async function loadAndRender(
  root: HTMLElement,
  ports: UxShellPorts,
  taskId: string | null,
): Promise<void> {
  const plan = await ports.loadPlan(taskId);
  const title = heading(2, "view-title", `Dry-run plan · ${plan.taskId}`);
  const subtitle = paragraph(
    "view-subtitle",
    `Generated ${formatTimestamp(plan.generatedAt)} · ${plan.scopeLabel}`,
  );
  if (plan.summary.offered === 0) {
    root.replaceChildren(
      title,
      subtitle,
      emptyState("No cleanup candidates found."),
      liveRegion("plan-live", "Empty plan loaded"),
    );
    return;
  }
  root.replaceChildren(
    title,
    subtitle,
    table(
      ["Select", "Path", "Category", "Size", "Modified", "State"],
      plan.candidates.map((candidate) => [
        candidate.selected ? "☑" : "☐",
        candidate.pathLabel,
        candidate.category,
        formatBytes(candidate.sizeBytes),
        formatTimestamp(candidate.modifiedAt),
        candidate.state,
      ]),
      "Cleanup candidates",
    ),
    liveRegion("plan-live", "Plan loaded"),
  );
}

/** Renders one of the five views by name. */
export async function renderView(
  root: HTMLElement,
  view: WebViewName,
  ports: UxShellPorts,
  taskId: string | null,
): Promise<void> {
  root.replaceChildren(loadingState());
  try {
    if (view === "overview") {
      const summary = await ports.loadTaskStatus(taskId ?? "latest");
      root.replaceChildren(
        heading(2, "view-title", "Overview"),
        paragraph("view-subtitle", "Dry-run is always on in this baseline."),
        table(
          ["Task", "Workspace", "Cleanup state", "Offered", "Quarantined", "Restored"],
          [[summary.taskId, summary.workspaceLabel, summary.cleanupState, String(summary.counts.offered), String(summary.counts.quarantined), String(summary.counts.restored)]],
          "Task summary",
        ),
        liveRegion("overview-live", "Overview loaded"),
      );
      return;
    }
    if (view === "plan") {
      await loadAndRender(root, ports, taskId);
      return;
    }
    if (view === "quarantine") {
      const records = await ports.loadQuarantine();
      if (records.length === 0) {
        root.replaceChildren(
          heading(2, "view-title", "Quarantine"),
          emptyState("Quarantine is empty."),
          liveRegion("quarantine-live", "Quarantine is empty"),
        );
        return;
      }
      root.replaceChildren(
        heading(2, "view-title", "Quarantine"),
        table(
          ["Record", "Original path", "Quarantine path", "Quarantined", "Size", "Restored"],
          records.map((record) => [
            record.recordId,
            record.originalPathLabel,
            record.quarantinePathLabel,
            formatTimestamp(record.quarantinedAt),
            formatBytes(record.sizeBytes),
            record.restored ? formatTimestamp(record.restoredAt) : "no",
          ]),
          "Quarantine records",
        ),
        liveRegion("quarantine-live", `${records.length} quarantine record(s) loaded`),
      );
      return;
    }
    if (view === "audit") {
      const page = await ports.loadAudit({});
      if (page.events.length === 0) {
        root.replaceChildren(
          heading(2, "view-title", "Audit"),
          emptyState("No audit events."),
          liveRegion("audit-live", "No audit events"),
        );
        return;
      }
      root.replaceChildren(
        heading(2, "view-title", "Audit"),
        table(
          ["Time", "Task", "Actor", "Event", "Outcome", "Scope"],
          page.events.map((event) => [
            formatTimestamp(event.ts),
            event.taskId ?? "-",
            event.actor,
            event.eventType,
            event.outcome,
            event.scopeLabel,
          ]),
          "Audit events",
        ),
        liveRegion("audit-live", `${page.events.length} audit event(s) loaded`),
      );
      return;
    }
    if (view === "config") {
      const config = await ports.loadConfig();
      root.replaceChildren(
        heading(2, "view-title", "Configuration"),
        table(
          ["Setting", "Value"],
          [
            ["Dry-run default", config.dryRunDefault ? "true (always on in baseline)" : "false"],
            ["Workspace root", pathLabel(config.workspaceRootLabel)],
            ["Protected rules", String(config.protectedPatternCount)],
            ["Plugin version", config.version],
            ["Editing", "not available in this baseline (read-only)"],
          ],
          "Configuration summary",
        ),
        liveRegion("config-live", "Configuration loaded"),
      );
      return;
    }
    throw new RangeError(`unhandled view '${view}'`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    root.replaceChildren(errorState(message));
  }
}

/** Mounts the five-view shell into #app for the hash route on load. */
export function mountApp(root: HTMLElement, ports: UxShellPorts): void {
  const render = async (): Promise<void> => {
    const hash = window.location.hash.replace(/^#/, "") || "/";
    const route = resolveRoute(hash);
    document.title = `${viewDefinition(route.view).title} · dsh-task-cleaner`;
    await renderView(root, route.view, ports, route.taskId);
  };
  window.addEventListener("hashchange", () => {
    void render();
  });
  void render();
}
