import type { Context } from '@deepseek-ai/cordis';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { InMemoryTaskLifecycle } from '../src/adapter/task-lifecycle/in-memory-task-lifecycle.js';
import { createLifecycleAdapter } from '../src/adapter/dsh/index.js';
import type { Config } from '../src/config.js';
import type { TaskLifecycleEvent } from '../src/domain/task-lifecycle.js';

interface FakeContext {
  on(event: string, handler: (payload: unknown) => void): void;
  logger(): {
    info(...args: unknown[]): void;
    warn(fmt: string, ...args: unknown[]): void;
    error(fmt: string, ...args: unknown[]): void;
  };
  handlers: Map<string, ((payload: unknown) => void)[]>;
  infos: string[];
  warns: string[];
  errors: string[];
}

function makeFakeContext(): FakeContext {
  const handlers = new Map<string, ((payload: unknown) => void)[]>();
  const infos: string[] = [];
  const warns: string[] = [];
  const errors: string[] = [];
  return {
    on(event, handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    logger() {
      return {
        info(fmt: string) {
          infos.push(fmt);
        },
        warn(fmt: string) {
          warns.push(fmt);
        },
        error(fmt: string) {
          errors.push(fmt);
        },
      };
    },
    handlers,
    infos,
    warns,
    errors,
  };
}

function config(): Config {
  return {
    dryRun: true,
    pluginVersion: '0.1.0',
    lifecycle: { goalPrimary: true, sessionFallback: true, turnEnabled: false },
  };
}

function setup(): { published: TaskLifecycleEvent[]; fake: FakeContext } {
  const lifecycle = new InMemoryTaskLifecycle();
  const published: TaskLifecycleEvent[] = [];
  lifecycle.subscribe((event) => {
    published.push(event);
  });

  const fake = makeFakeContext();
  const adapter = createLifecycleAdapter(lifecycle);
  adapter(fake as unknown as Context, config());

  return { published, fake };
}

describe('createLifecycleAdapter', () => {
  test('M1: session fallback emits aborted only for sessions without goal activity', () => {
    const { published, fake } = setup();
    const goal = fake.handlers.get('goal/changed')![0];
    const disposed = fake.handlers.get('session/disposed')![0];

    goal({ agent: { id: 's1' }, change: { operation: 'create', ref: { id: 'g1', revision: 1 } } });
    disposed({ id: 's1', header: { cwd: '/ws' } });
    disposed({ id: 's2', header: { cwd: '/ws' } });

    expect(published.map((e) => e.phase)).toEqual(['started', 'aborted']);
    expect(published[1].scope.sessionId).toBe('s2');
  });

  test('M2: malformed payloads are logged and skipped, never thrown to the host', () => {
    const { published, fake } = setup();
    const goal = fake.handlers.get('goal/changed')![0];
    const disposed = fake.handlers.get('session/disposed')![0];

    expect(() => goal(null)).not.toThrow();
    expect(() => goal({ agent: { id: 's1' }, change: { operation: 'nope' } })).not.toThrow();
    expect(() => goal({ agent: {}, change: { operation: 'create', ref: { id: 'g1', revision: 1 } } })).not.toThrow();
    expect(() => disposed({})).not.toThrow();

    expect(published).toHaveLength(0);
    expect(fake.warns.length).toBeGreaterThan(0);
  });

  test('goal edit is a legitimate no-boundary skip (no warning, no publish)', () => {
    const { published, fake } = setup();
    const goal = fake.handlers.get('goal/changed')![0];

    goal({ agent: { id: 's1' }, change: { operation: 'edit', ref: { id: 'g1', revision: 2 } } });

    expect(published).toHaveLength(0);
    expect(fake.warns).toHaveLength(0);
  });

  test('activation pre-flights a valid workspace root through the real FsPort (m5)', async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'dsh-task-cleaner-ws-'));
    const fake = makeFakeContext();
    const adapter = createLifecycleAdapter(new InMemoryTaskLifecycle());
    adapter(fake as unknown as Context, {
      ...config(),
      workspaceRoot,
    });

    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(fake.errors).toHaveLength(0);
    expect(fake.infos.join(' ')).toContain('ready');
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  test('activation reports a workspace that disappears before the FsPort pre-flight (m5)', async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'dsh-task-cleaner-gone-'));
    const fake = makeFakeContext();
    const adapter = createLifecycleAdapter(new InMemoryTaskLifecycle());
    adapter(fake as unknown as Context, { ...config(), workspaceRoot });
    rmSync(workspaceRoot, { recursive: true, force: true });

    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(fake.errors.length).toBeGreaterThan(0);
  });
});
