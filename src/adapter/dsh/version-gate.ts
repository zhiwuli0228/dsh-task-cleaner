/**
 * DSH host version gate (fail-closed, S-06). The plugin refuses to load
 * against an unverified host version rather than risk silently missing or
 * misreading lifecycle signals.
 *
 * Baseline lock is `0.1.2-rc.1` — a working assumption pending the DevOps
 * real-machine smoke confirmation. Only that exact version is admitted until
 * the smoke pass widens the set.
 */
export const SUPPORTED_DSH_VERSIONS: readonly string[] = ['0.1.2-rc.1'];

export class UnsupportedDshVersionError extends Error {
  readonly actual: string;
  readonly supported: readonly string[];

  constructor(actual: string, supported: readonly string[] = SUPPORTED_DSH_VERSIONS) {
    super(
      `unsupported @deepseek-ai/dsh version "${actual}" (supported: ${supported.join(', ')})`,
    );
    this.name = 'UnsupportedDshVersionError';
    this.actual = actual;
    this.supported = supported;
  }
}

export function checkDshVersion(actual: string): void {
  if (!SUPPORTED_DSH_VERSIONS.includes(actual)) {
    throw new UnsupportedDshVersionError(actual);
  }
}
