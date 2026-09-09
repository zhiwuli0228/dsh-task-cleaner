import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * Read the installed `@deepseek-ai/dsh` version from its `package.json`.
 *
 * The package ships no `exports` map, so the `package.json` subpath resolves
 * directly. We read the declaration rather than importing the CLI runtime to
 * avoid pulling the host program into our module graph.
 */
export function readDshVersion(): string {
  const pkg = require('@deepseek-ai/dsh/package.json') as { version?: unknown };
  return typeof pkg.version === 'string' ? pkg.version : 'unknown';
}
