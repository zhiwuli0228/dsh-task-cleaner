import { describe, expect, test } from 'vitest';
import { ConfigSchema } from '../src/config.js';

describe('ConfigSchema', () => {
  test('dryRun defaults to true (S-07)', () => {
    expect(ConfigSchema({}).dryRun).toBe(true);
  });

  test('dryRun can be explicitly disabled', () => {
    expect(ConfigSchema({ dryRun: false }).dryRun).toBe(false);
  });

  test('lifecycle defaults: goal primary + session fallback, turn disabled (ADR-003)', () => {
    expect(ConfigSchema({}).lifecycle).toEqual({
      goalPrimary: true,
      sessionFallback: true,
      turnEnabled: false,
    });
  });

  test('pluginVersion defaults to 0.1.0', () => {
    expect(ConfigSchema({}).pluginVersion).toBe('0.1.0');
  });

  test('exposes a StandardSchemaV1 validator (~standard)', () => {
    expect(typeof ConfigSchema['~standard'].validate).toBe('function');
  });
});
