import { QUARANTINE_RECORD_SCHEMA_VERSION } from './common.js';
import type {
  FileIdentity,
  GitStatus,
  RestoreResultKind,
  Sha256Hex,
  Timestamp,
} from './common.js';

export type QuarantineStatus =
  | 'pending'
  | 'quarantined'
  | 'restore_pending'
  | 'restored'
  | 'expired'
  | 'purged'
  | 'reconciliation_required';

export type QuarantineEntryKind = 'file' | 'directory' | 'symlink';
export type QuarantineEntryState = 'staged' | 'verified' | 'restored' | 'expired' | 'purged' | 'missing';

export interface QuarantineEntry {
  readonly entryId: string;
  readonly candidateId: string;
  readonly sourceRelPath: string;
  readonly sourceRealPath: string;
  readonly quarantineRelPath: string;
  readonly kind: QuarantineEntryKind;
  readonly identity: FileIdentity;
  readonly sha256Before: Sha256Hex;
  readonly sizeBytes: number;
  readonly mtime: Timestamp;
  readonly mode: string;
  readonly gitStatus: GitStatus;
  readonly symlinkTarget?: string | null;
  readonly state: QuarantineEntryState;
}

export interface QuarantineRestoreFailure {
  readonly entryId: string;
  readonly reason: string;
}

export interface QuarantineRestore {
  readonly restoreId: string;
  readonly decisionId: string;
  readonly requestedBy: string;
  readonly requestedAt: Timestamp;
  readonly result: RestoreResultKind;
  readonly failures: readonly QuarantineRestoreFailure[];
}

/**
 * QuarantineRecord (R3): per-batch metadata for a quarantine operation.
 * `purged` exists only as a contract/gate state — this milestone ships no
 * executable purge path (S-07).
 */
export interface QuarantineRecord {
  readonly schemaVersion: typeof QUARANTINE_RECORD_SCHEMA_VERSION;
  readonly quarantineId: string;
  readonly taskId: string;
  readonly runId: string;
  readonly manifestId: string;
  readonly decisionId: string;
  readonly createdAt: Timestamp;
  readonly status: QuarantineStatus;
  readonly entries: readonly QuarantineEntry[];
  readonly restore?: QuarantineRestore | null;
}
