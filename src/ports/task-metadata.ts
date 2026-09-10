export interface TaskMetadata {
  readonly taskId: string;
  readonly runId: string;
  readonly workspaceRoot?: string;
  readonly cwd?: string;
}

/**
 * Task metadata port — query the current task identity and workspace.
 * The DSH adapter is the source of truth; this port keeps app/domain free of
 * host coupling (ADR-002).
 */
export interface TaskMetadataPort {
  getCurrentTask(): Promise<TaskMetadata | null>;
}
