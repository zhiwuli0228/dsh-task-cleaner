import type { ArtifactCandidate } from './artifact.js';
import { CLEANUP_MANIFEST_SCHEMA_VERSION } from './common.js';
import type { Sha256Hex, Timestamp } from './common.js';

export type ManifestStatus = 'draft' | 'frozen' | 'applied' | 'closed' | 'superseded';

export interface ManifestScope {
  readonly workspaceRootRel: string;
  /** SHA-256 of the canonical workspace realpath (S-02). */
  readonly rootAnchor: Sha256Hex;
  readonly boundaryPolicyRef?: string;
}

/**
 * CleanupManifest (R1): per-run artifacts inventory snapshot.
 */
export interface CleanupManifest {
  readonly schemaVersion: typeof CLEANUP_MANIFEST_SCHEMA_VERSION;
  readonly manifestId: string;
  readonly taskId: string;
  readonly runId: string;
  readonly dshVersion: string;
  readonly pluginVersion: string;
  readonly scope: ManifestScope;
  readonly createdAt: Timestamp;
  readonly status: ManifestStatus;
  readonly artifacts: readonly ArtifactCandidate[];
}
