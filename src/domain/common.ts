/**
 * Shared scalar vocabulary for the runtime data contracts (R1–R3).
 *
 * These are pure value types with no framework dependency; they mirror the
 * `$defs` of `specs/v1alpha1/common.schema.json`.
 */

/** RFC 3339 UTC timestamp. */
export type Timestamp = string;

/** SHA-256 hex digest. */
export type Sha256Hex = string;

/** Workspace-relative POSIX path (never absolute, no drive/UNC prefix). */
export type RelPath = string;

/** Absolute canonical path produced by the FsPort; never accepted from input. */
export type RealPath = string;

/** File identity captured at action time (S-05/S-06). `dev`/`ino` are strings to survive large inodes. */
export interface FileIdentity {
  readonly dev: string;
  readonly ino: string;
  readonly nlink: number;
  readonly ctime: Timestamp;
}

/** Symlink metadata recorded but never followed (S-03). */
export interface SymlinkInfo {
  readonly target: string;
}

/** Git protection state for a candidate (S-04). */
export interface GitStatus {
  readonly tracked: boolean;
  readonly head: boolean;
  readonly index: boolean;
}

/** Restore result kind shared by RestoreResult and QuarantineRecord.restore. */
export type RestoreResultKind = 'pending' | 'succeeded' | 'partial_failed' | 'denied';

export const CLEANUP_MANIFEST_SCHEMA_VERSION = 'dsh-task-cleaner/manifest/v1alpha1' as const;
export const AUDIT_EVENT_SCHEMA_VERSION = 'dsh-task-cleaner/audit/v1alpha1' as const;
export const QUARANTINE_RECORD_SCHEMA_VERSION = 'dsh-task-cleaner/quarantine/v1alpha1' as const;
