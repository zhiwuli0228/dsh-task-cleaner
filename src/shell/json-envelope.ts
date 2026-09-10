import type { VmError, VmStatus } from "./vm-types.js";

/** Stable JSON envelope shared by all CLI `--format json` output (§5.3). */
export interface CliJsonEnvelope<D> {
  schemaVersion: "cli.v1";
  command: string;
  status: VmStatus;
  data: D | null;
  meta: {
    taskId?: string;
    planId?: string;
    /** RFC 3339 UTC. */
    ts: string;
    /** Baseline is always true. */
    dryRun: true;
    cliVersion: string;
  };
  errors: VmError[];
}

export interface EnvelopeBuildInput<D> {
  command: string;
  status: VmStatus;
  data?: D | null;
  meta?: Partial<CliJsonEnvelope<D>["meta"]>;
  errors?: VmError[];
  cliVersion?: string;
  now?: Date;
}

/** Builds a deterministic envelope; `ts` defaults to now (RFC 3339 UTC). */
export function buildEnvelope<D>(input: EnvelopeBuildInput<D>): CliJsonEnvelope<D> {
  const now = input.now ?? new Date();
  const meta: CliJsonEnvelope<D>["meta"] = {
    ts: now.toISOString(),
    dryRun: true as const,
    cliVersion: input.cliVersion ?? "0.0.0-dev",
  };
  if (input.meta?.taskId !== undefined) {
    meta.taskId = input.meta.taskId;
  }
  if (input.meta?.planId !== undefined) {
    meta.planId = input.meta.planId;
  }
  return {
    schemaVersion: "cli.v1",
    command: input.command,
    status: input.status,
    data: input.data ?? null,
    meta,
    errors: input.errors ?? [],
  };
}
