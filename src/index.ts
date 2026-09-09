/**
 * Composition root. Re-exports the DSH adapter plugin as the package
 * entrypoint. No `@deepseek-ai/*` import may appear here — the host-coupled
 * surface is confined to `src/adapter/dsh/` (ADR-002 boundary).
 */
export { apply, plugin, plugin as default } from './adapter/dsh/index.js';
export { ConfigSchema } from './config.js';
export type { Config, LifecycleConfig } from './config.js';
