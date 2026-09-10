import { escapeLabel, formatBytes, formatTimestamp, pathLabel } from "../shell/index.js";
import type {
  VmAuditPage,
  VmConfigSummary,
  VmPlan,
  VmQuarantineRecord,
  VmTaskSummary,
} from "../shell/index.js";

/**
 * Deterministic human-readable rendering (ux-shell-contract.md §5.2).
 * stdout carries only the final result; callers write diagnostics to stderr.
 */

export function renderPlan(plan: VmPlan): string {
  const lines: string[] = [];
  lines.push(`Dry-run plan  ${escapeLabel(plan.planId)}  (no changes written)`);
  lines.push(`Task:        ${escapeLabel(plan.taskId)}`);
  lines.push(`Workspace:   ${escapeLabel(plan.scopeLabel || "-")}`);
  lines.push(
    `Candidates:  ${plan.summary.offered}  (${formatBytes(plan.summary.bytesOffered)})`,
  );
  const byCategory = new Map<string, { files: number; bytes: number }>();
  for (const candidate of plan.candidates) {
    if (candidate.state !== "offered") continue;
    const entry = byCategory.get(candidate.category) ?? { files: 0, bytes: 0 };
    entry.files += 1;
    entry.bytes += candidate.sizeBytes;
    byCategory.set(candidate.category, entry);
  }
  for (const category of [...byCategory.keys()].sort()) {
    const entry = byCategory.get(category);
    if (!entry) continue;
    lines.push(
      `  ${category.padEnd(12)}${String(entry.files).padStart(4)} files  ${formatBytes(entry.bytes)}`,
    );
  }
  const protectedHits = plan.protectedHits;
  lines.push(
    `Protected:   ${plan.summary.denied} protected/outside-workspace (ignored)`,
  );
  for (const hit of protectedHits) {
    lines.push(`  ${pathLabel(hit.path)}  [${hit.reasonCode}]`);
  }
  lines.push("Decision:    pending — quarantine requires explicit --candidate-id");
  return `${lines.join("\n")}\n`;
}

export function renderStatus(status: VmTaskSummary): string {
  const lines = [
    `Task:        ${escapeLabel(status.taskId)}`,
    `Workspace:   ${escapeLabel(status.workspaceLabel || "-")}`,
    `Cleanup:     ${status.cleanupState}`,
    `Candidates:  ${status.counts.offered} offered, ${status.counts.quarantined} quarantined, ` +
      `${status.counts.restored} restored`,
  ];
  return `${lines.join("\n")}\n`;
}

export function renderQuarantine(records: VmQuarantineRecord[]): string {
  if (records.length === 0) return "Quarantine is empty.\n";
  const lines = ["Quarantine records:"];
  for (const record of records) {
    const marker = record.restored ? "[restored]" : "[quarantined]";
    lines.push(
      `${marker} ${record.originalPathLabel}  ->  ${record.quarantinePathLabel}  ` +
        `(${escapeLabel(record.recordId)}, ${formatBytes(record.sizeBytes)})`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export function renderAudit(page: VmAuditPage): string {
  if (page.events.length === 0) return "No audit events.\n";
  const lines = ["Audit events (newest first):"];
  for (const event of page.events) {
    lines.push(
      `${formatTimestamp(event.ts)}  ${escapeLabel(event.taskId ?? "-")}  ` +
        `${escapeLabel(event.actor)}  ${escapeLabel(event.eventType)}  ` +
        `${event.outcome}  ${escapeLabel(event.scopeLabel)}`,
    );
  }
  if (page.nextCursor) lines.push(`Next cursor: ${page.nextCursor}`);
  return `${lines.join("\n")}\n`;
}

export function renderConfig(config: VmConfigSummary): string {
  return [
    `dryRun default:  ${config.dryRunDefault ? "true" : "false"}`,
    `workspace root:  ${escapeLabel(config.workspaceRootLabel || "-")}`,
    `protected rules: ${config.protectedPatternCount}`,
    `plugin version:  ${escapeLabel(config.version)}`,
    `configuration editing is not available in this baseline (read-only)`,
  ].join("\n") + "\n";
}

export function renderCommandResult(command: string, status: string): string {
  return `${command}: ${status}\n`;
}

export function renderHelp(): string {
  return [
    "Usage: dsh-task-cleaner <command> [options]",
    "",
    "Commands:",
    "  plan [--task-id ID]          Read-only dry-run cleanup plan (alias: dry-run)",
    "  quarantine --task-id ID --candidate-id ID [...]",
    "                               Explicitly quarantine listed candidates",
    "  restore --record-id ID [...] Explicitly restore listed quarantine records",
    "  status [--task-id ID]        Task cleanup state summary",
    "  audit [--task-id ID] [--since TS] [--limit N]",
    "                               Read-only audit events (newest first)",
    "  config show                  Read-only configuration summary",
    "  help                         Show this help",
    "",
    "Options:",
    "  --format text|json           Output format (default: text)",
    "  --color auto|always|never    Terminal color mode (default: auto)",
    "",
    "Safety: execution requires explicit identifiers; the baseline has no",
    "force/yes/all/delete/purge switches on this surface.",
    "",
  ].join("\n");
}
