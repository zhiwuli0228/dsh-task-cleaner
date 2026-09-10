/**
 * Package composition root.
 *
 * The DSH plugin entry (`apply` / `plugin`) is implemented by the backend
 * track and is the package's Cordis `apply(ctx, config)` surface. The shared
 * shell/view-model contract is re-exported from the same entry so CLI, Web
 * and external consumers can import it without a second package entry.
 * No `@deepseek-ai/*` import may appear here (ADR-002 boundary).
 */
export { apply, plugin, plugin as default } from './adapter/dsh/index.js';
export { ConfigSchema } from './config.js';
export type { Config, LifecycleConfig } from './config.js';
export { createCleanupRuntime } from './app/create-runtime.js';
export type { CleanupRuntime } from './app/create-runtime.js';
export { DefaultDenySafetyKernel } from './app/default-deny-safety-kernel.js';
export * from './shell/index.js';
