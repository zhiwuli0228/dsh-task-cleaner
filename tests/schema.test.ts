import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const SCHEMA_FILES = ['common', 'cleanup-manifest', 'audit-event', 'quarantine-record'] as const;

interface JsonSchema {
  $schema?: string;
  additionalProperties?: unknown;
  properties?: Record<string, { const?: unknown }>;
}

function load(name: string): JsonSchema {
  const path = join(process.cwd(), 'specs', 'v1alpha1', `${name}.schema.json`);
  return JSON.parse(readFileSync(path, 'utf8')) as JsonSchema;
}

function raw(name: string): string {
  const path = join(process.cwd(), 'specs', 'v1alpha1', `${name}.schema.json`);
  return readFileSync(path, 'utf8');
}

describe('specs/v1alpha1 schemas', () => {
  test('every schema is valid JSON and draft 2020-12', () => {
    for (const name of SCHEMA_FILES) {
      const schema = load(name);
      expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    }
  });

  test('record schemas are closed (additionalProperties: false) and pin schema_version', () => {
    const expected = {
      'cleanup-manifest': 'dsh-task-cleaner/manifest/v1alpha1',
      'audit-event': 'dsh-task-cleaner/audit/v1alpha1',
      'quarantine-record': 'dsh-task-cleaner/quarantine/v1alpha1',
    } as const;

    for (const [name, version] of Object.entries(expected)) {
      const schema = load(name);
      expect(schema.additionalProperties).toBe(false);
      expect(schema.properties?.schema_version?.const).toBe(version);
    }
  });

  test('record schemas reference common $defs', () => {
    for (const name of ['cleanup-manifest', 'audit-event', 'quarantine-record'] as const) {
      expect(raw(name)).toContain('common.schema.json#/$defs/');
    }
  });
});
