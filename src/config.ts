import Schema from 'schemastery';

/**
 * Plugin lifecycle mapping strategy (ADR-003). Goal lifecycle is the primary
 * trigger; session disposal is the fallback; turn-level is optional and off.
 */
export interface LifecycleConfig {
  readonly goalPrimary: boolean;
  readonly sessionFallback: boolean;
  readonly turnEnabled: boolean;
}

/**
 * Runtime plugin config (validated by Schemastery, ADR-002).
 *
 * `dryRun` defaults to true (S-07): no destructive action may run without an
 * explicit opt-in, and this milestone ships no destructive path regardless.
 * `workspaceRoot` and `quarantineRoot` are independent explicit roots (S-02 /
 * S-05).
 */
export interface Config {
  readonly dryRun: boolean;
  readonly workspaceRoot?: string;
  readonly quarantineRoot?: string;
  readonly pluginVersion: string;
  readonly lifecycle: LifecycleConfig;
}

export const ConfigSchema = Schema.object({
  dryRun: Schema.boolean()
    .default(true)
    .description('Dry-run by default; no destructive action without an explicit opt-in.'),
  workspaceRoot: Schema.string().description(
    'Explicit workspace root; must be an existing absolute directory, not fs root / home / quarantine root / .git.',
  ),
  quarantineRoot: Schema.string().description(
    'Quarantine root; must be outside the workspace, absolute, non-symlink, owner-only (S-05).',
  ),
  pluginVersion: Schema.string().default('0.1.0'),
  lifecycle: Schema.object({
    goalPrimary: Schema.boolean().default(true),
    sessionFallback: Schema.boolean().default(true),
    turnEnabled: Schema.boolean().default(false),
  }),
}).description('dsh-task-cleaner plugin config.');
