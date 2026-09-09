import { describe, expect, test } from 'vitest';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { GoalChanged, GoalOperation } from '@deepseek-ai/dsh-goal';
import type { Session } from '@deepseek-ai/dsh-session';
import {
  goalChangedToEvent,
  mapGoalOperation,
  sessionDisposedToEvent,
} from '../src/adapter/dsh/lifecycle-mapping.js';

function agent(id: string): Agent {
  return { id } as unknown as Agent;
}

function change(operation: GoalOperation, refId: string, revision: number): GoalChanged {
  return { operation, ref: { id: refId, revision } } as unknown as GoalChanged;
}

function session(id: string, cwd?: string): Session {
  return { id, header: { cwd } } as unknown as Session;
}

describe('mapGoalOperation', () => {
  test.each([
    ['create', 'started'],
    ['resume', 'started'],
    ['complete', 'completed'],
    ['block', 'blocked'],
    ['pause', 'paused'],
    ['clear', 'cleared'],
  ] as const)('maps %s → %s', (operation, phase) => {
    expect(mapGoalOperation(operation)).toBe(phase);
  });

  test('maps edit → null (no lifecycle boundary)', () => {
    expect(mapGoalOperation('edit')).toBeNull();
  });
});

describe('goalChangedToEvent', () => {
  test('maps a create operation to a started goal event', () => {
    const event = goalChangedToEvent({
      agent: agent('session-1'),
      change: change('create', 'goal-1', 3),
      seq: 7,
      timestamp: 1_700_000_000_000,
    });

    expect(event).not.toBeNull();
    expect(event!.phase).toBe('started');
    expect(event!.source).toBe('goal');
    expect(event!.seq).toBe(7);
    expect(event!.scope).toEqual({
      kind: 'goal',
      sessionId: 'session-1',
      goalId: 'goal-1',
      goalRef: { id: 'goal-1', revision: 3 },
      timestamp: 1_700_000_000_000,
    });
  });

  test('returns null for an edit operation', () => {
    expect(
      goalChangedToEvent({
        agent: agent('session-1'),
        change: change('edit', 'goal-1', 4),
        seq: 8,
        timestamp: 0,
      }),
    ).toBeNull();
  });
});

describe('sessionDisposedToEvent', () => {
  test('maps session disposal to an aborted session event', () => {
    const event = sessionDisposedToEvent({
      session: session('session-1', '/workspace'),
      seq: 9,
      timestamp: 1_700_000_000_000,
    });

    expect(event.phase).toBe('aborted');
    expect(event.source).toBe('session');
    expect(event.seq).toBe(9);
    expect(event.scope).toEqual({
      kind: 'session',
      sessionId: 'session-1',
      cwd: '/workspace',
      timestamp: 1_700_000_000_000,
    });
  });
});
