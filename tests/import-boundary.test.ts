import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'vitest';

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (full.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('@deepseek-ai import boundary (ADR-002)', () => {
  test('host imports are confined to src/adapter/dsh/', () => {
    const srcDir = join(process.cwd(), 'src');
    const offenders: string[] = [];

    for (const file of collectTsFiles(srcDir)) {
      const rel = relative(srcDir, file).replace(/\\/g, '/');
      if (rel.startsWith('adapter/dsh/')) continue;
      const text = readFileSync(file, 'utf8');
      if (/from\s+['"]@deepseek-ai\//.test(text) || /import\s*\(\s*['"]@deepseek-ai\//.test(text)) {
        offenders.push(rel);
      }
    }

    expect(offenders).toEqual([]);
  });
});
