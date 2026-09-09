import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, test } from 'vitest';
import type {
  ArtifactCandidate,
  AuditActor,
  AuditEvent,
  AuditRefs,
  AuditTarget,
  AuditTargetIdentity,
  CleanupManifest,
  ManifestScope,
  QuarantineEntry,
  QuarantineRecord,
  QuarantineRestore,
  QuarantineRestoreFailure,
} from '../src/domain/index.js';

const SCHEMA_FILES = ['common', 'cleanup-manifest', 'audit-event', 'quarantine-record'] as const;
const EXAMPLE_DIR = join(process.cwd(), 'specs', 'v1alpha1', 'examples');

interface JsonSchema {
  $schema?: string;
  $defs?: Record<string, JsonSchema>;
  additionalProperties?: unknown;
  properties?: Record<string, { const?: unknown } & JsonSchema>;
  required?: readonly string[];
}

function load(name: string): JsonSchema {
  const path = join(process.cwd(), 'specs', 'v1alpha1', `${name}.schema.json`);
  return JSON.parse(readFileSync(path, 'utf8')) as JsonSchema;
}

function raw(name: string): string {
  const path = join(process.cwd(), 'specs', 'v1alpha1', `${name}.schema.json`);
  return readFileSync(path, 'utf8');
}

function loadExample(name: string): unknown {
  return JSON.parse(readFileSync(join(EXAMPLE_DIR, name), 'utf8')) as unknown;
}

type JsonRecord = Record<string, unknown>;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function camelize(key: string): string {
  return key.replace(/_([a-z])/g, (_match, c: string) => c.toUpperCase());
}

function buildAjv(): Ajv2020 {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  for (const name of SCHEMA_FILES) {
    ajv.addSchema(load(name), name);
  }
  return ajv;
}

function validateWith(ajv: Ajv2020, name: string): (instance: unknown) => boolean {
  const validate = ajv.getSchema(name);
  if (!validate) {
    throw new Error(`schema ${name} was not registered`);
  }
  return (instance: unknown) => validate(instance) as boolean;
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

  test('valid example instances pass their schema', () => {
    const ajv = buildAjv();
    const validateManifest = validateWith(ajv, 'cleanup-manifest');
    const validateAudit = validateWith(ajv, 'audit-event');
    const validateQuarantine = validateWith(ajv, 'quarantine-record');

    expect(validateManifest(loadExample('cleanup-manifest.valid.json'))).toBe(true);
    expect(validateAudit(loadExample('audit-event.valid.json'))).toBe(true);
    expect(validateQuarantine(loadExample('quarantine-record.valid.json'))).toBe(true);
  });

  test('relPath rejects absolute, drive, UNC, traversal, backslash and control forms', () => {
    const ajv = buildAjv();
    const validate = ajv.compile({ $ref: 'common.schema.json#/$defs/relPath' });

    for (const good of ['out/gen/tmp.txt', 'a/b/c', '.hidden/x', '任务/x.tmp']) {
      expect(validate(good), `relPath should accept ${good}`).toBe(true);
    }
    for (const bad of [
      '',
      '/abs/path',
      'C:\\outside',
      'C:/outside',
      '\\\\server\\share\\file',
      '//server/share/file',
      '../escape',
      'a/../b',
      'a/..',
      'a\\b',
      'a//b',
      'a/b/',
      '.\\hidden',
      'a/\u0001b',
    ]) {
      expect(validate(bad), `relPath should reject ${JSON.stringify(bad)}`).toBe(false);
    }
  });

  test('realPath requires POSIX-rooted, Windows drive-rooted or UNC absolute form', () => {
    const ajv = buildAjv();
    const validate = ajv.compile({ $ref: 'common.schema.json#/$defs/realPath' });

    for (const good of ['/workspace/a', '/', 'C:\\workspace\\a', 'C:/workspace/a', '\\\\server\\share\\a', '//server/share/a']) {
      expect(validate(good), `realPath should accept ${good}`).toBe(true);
    }
    for (const bad of ['relative/path', './relative', 'C:relative', '\\relative', 'a/b', 'a\\b', '']) {
      expect(validate(bad), `realPath should reject ${JSON.stringify(bad)}`).toBe(false);
    }
  });

  test('schema-level negative instances fail on path semantics (MAJOR-02)', () => {
    const ajv = buildAjv();
    const validateManifest = validateWith(ajv, 'cleanup-manifest');
    const validateAudit = validateWith(ajv, 'audit-event');
    const validateQuarantine = validateWith(ajv, 'quarantine-record');

    const manifestAbs = clone(loadExample('cleanup-manifest.valid.json')) as JsonRecord & {
      artifacts: Array<JsonRecord>;
    };
    manifestAbs.artifacts[0].rel_path = '/etc/passwd';
    expect(validateManifest(manifestAbs)).toBe(false);

    const manifestDrive = clone(loadExample('cleanup-manifest.valid.json')) as JsonRecord & {
      artifacts: Array<JsonRecord>;
    };
    manifestDrive.artifacts[0].source_real_path = 'C:\\outside\\tmp.txt';
    manifestDrive.artifacts[0].rel_path = 'C:/outside/tmp.txt';
    expect(validateManifest(manifestDrive)).toBe(false);

    const auditTraversal = clone(loadExample('audit-event.valid.json')) as JsonRecord & {
      targets: Array<JsonRecord>;
    };
    auditTraversal.targets[0].rel_path = 'out/../tracked.txt';
    expect(validateAudit(auditTraversal)).toBe(false);

    const auditRelativeReal = clone(loadExample('audit-event.valid.json')) as JsonRecord & {
      targets: Array<JsonRecord>;
    };
    auditRelativeReal.targets[0].real_path = 'relative/real/path';
    expect(validateAudit(auditRelativeReal)).toBe(false);

    const auditBackslash = clone(loadExample('audit-event.valid.json')) as JsonRecord & {
      targets: Array<JsonRecord>;
    };
    auditBackslash.targets[0].rel_path = 'out\\gen\\tmp.txt';
    expect(validateAudit(auditBackslash)).toBe(false);

    const quarantineUnc = clone(loadExample('quarantine-record.valid.json')) as JsonRecord & {
      entries: Array<JsonRecord>;
    };
    quarantineUnc.entries[0].source_rel_path = '\\\\server\\share\\outside.txt';
    expect(validateQuarantine(quarantineUnc)).toBe(false);

    const quarantineTraversal = clone(loadExample('quarantine-record.valid.json')) as JsonRecord & {
      entries: Array<JsonRecord>;
    };
    quarantineTraversal.entries[0].quarantine_rel_path = '../escape/file.txt';
    expect(validateQuarantine(quarantineTraversal)).toBe(false);

    const quarantineAbsoluteStaged = clone(loadExample('quarantine-record.valid.json')) as JsonRecord & {
      entries: Array<JsonRecord>;
    };
    quarantineAbsoluteStaged.entries[0].quarantine_rel_path = '/tmp/escape.txt';
    expect(validateQuarantine(quarantineAbsoluteStaged)).toBe(false);
  });
});

describe('schema-to-TS key alignment (MINOR-1)', () => {
  function assertKeys(schema: JsonSchema, path: string[], expected: readonly string[]) {
    let current: unknown = schema;
    for (const part of path) {
      current = (current as JsonRecord | undefined)?.[part];
    }
    const actual = Object.keys((current ?? {}) as JsonRecord).map(camelize).sort();
    expect(actual).toEqual([...expected].sort());
  }

  const cleanupManifestKeys = [
    'schemaVersion',
    'manifestId',
    'taskId',
    'runId',
    'dshVersion',
    'pluginVersion',
    'scope',
    'createdAt',
    'status',
    'artifacts',
  ] as const satisfies readonly (keyof CleanupManifest)[];

  const manifestScopeKeys = [
    'workspaceRootRel',
    'rootAnchor',
    'boundaryPolicyRef',
  ] as const satisfies readonly (keyof ManifestScope)[];

  const artifactKeys = [
    'artifactId',
    'candidateId',
    'decisionId',
    'relPath',
    'sourceRealPath',
    'kind',
    'provenance',
    'identity',
    'sizeBytes',
    'sha256',
    'mtime',
    'mode',
    'gitTracked',
    'symlink',
    'matchedBy',
    'state',
  ] as const satisfies readonly (keyof ArtifactCandidate)[];

  const auditEventKeys = [
    'schemaVersion',
    'eventId',
    'seq',
    'timestamp',
    'taskId',
    'runId',
    'phase',
    'actor',
    'eventSource',
    'action',
    'outcome',
    'dryRun',
    'targets',
    'refs',
    'failureReason',
    'reason',
  ] as const satisfies readonly (keyof AuditEvent)[];

  const auditActorKeys = ['type', 'id', 'sessionRef'] as const satisfies readonly (keyof AuditActor)[];

  const auditRefsKeys = [
    'manifestId',
    'planId',
    'quarantineId',
    'restoreId',
  ] as const satisfies readonly (keyof AuditRefs)[];

  const auditTargetKeys = [
    'relPath',
    'realPath',
    'candidateId',
    'decisionId',
    'identity',
  ] as const satisfies readonly (keyof AuditTarget)[];

  const auditTargetIdentityKeys = [
    'dev',
    'ino',
    'sha256Before',
  ] as const satisfies readonly (keyof AuditTargetIdentity)[];

  const quarantineKeys = [
    'schemaVersion',
    'quarantineId',
    'taskId',
    'runId',
    'manifestId',
    'decisionId',
    'createdAt',
    'status',
    'entries',
    'restore',
  ] as const satisfies readonly (keyof QuarantineRecord)[];

  const quarantineEntryKeys = [
    'entryId',
    'candidateId',
    'sourceRelPath',
    'sourceRealPath',
    'quarantineRelPath',
    'kind',
    'identity',
    'sha256Before',
    'sizeBytes',
    'mtime',
    'mode',
    'gitStatus',
    'symlinkTarget',
    'state',
  ] as const satisfies readonly (keyof QuarantineEntry)[];

  const quarantineRestoreKeys = [
    'restoreId',
    'decisionId',
    'requestedBy',
    'requestedAt',
    'result',
    'failures',
  ] as const satisfies readonly (keyof QuarantineRestore)[];

  const quarantineFailureKeys = ['entryId', 'reason'] as const satisfies readonly (keyof QuarantineRestoreFailure)[];

  test('cleanup-manifest schema keys align with CleanupManifest/ManifestScope/ArtifactCandidate', () => {
    const schema = load('cleanup-manifest');
    assertKeys(schema, ['properties'], cleanupManifestKeys);
    assertKeys(schema, ['properties', 'scope', 'properties'], manifestScopeKeys);
    assertKeys(schema, ['$defs', 'artifact', 'properties'], artifactKeys);
  });

  test('audit-event schema keys align with AuditEvent/AuditActor/AuditRefs/AuditTarget', () => {
    const schema = load('audit-event');
    assertKeys(schema, ['properties'], auditEventKeys);
    assertKeys(schema, ['properties', 'actor', 'properties'], auditActorKeys);
    assertKeys(schema, ['properties', 'refs', 'properties'], auditRefsKeys);
    assertKeys(schema, ['$defs', 'target', 'properties'], auditTargetKeys);
    assertKeys(schema, ['$defs', 'target', 'properties', 'identity', 'properties'], auditTargetIdentityKeys);
  });

  test('quarantine-record schema keys align with QuarantineRecord/QuarantineEntry/QuarantineRestore', () => {
    const schema = load('quarantine-record');
    assertKeys(schema, ['properties'], quarantineKeys);
    assertKeys(schema, ['$defs', 'entry', 'properties'], quarantineEntryKeys);
    assertKeys(schema, ['$defs', 'restore', 'properties'], quarantineRestoreKeys);
    assertKeys(schema, ['$defs', 'failure', 'properties'], quarantineFailureKeys);
  });
});
