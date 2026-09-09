import { describe, expect, test } from 'vitest';
import {
  checkDshVersion,
  SUPPORTED_DSH_VERSIONS,
  UnsupportedDshVersionError,
} from '../src/adapter/dsh/version-gate.js';

describe('checkDshVersion', () => {
  test('accepts the supported baseline version', () => {
    for (const version of SUPPORTED_DSH_VERSIONS) {
      expect(() => checkDshVersion(version)).not.toThrow();
    }
  });

  test('rejects an unsupported version (fail-closed)', () => {
    expect(() => checkDshVersion('0.1.2-rc.2')).toThrow(UnsupportedDshVersionError);
  });

  test('rejects unknown and empty versions', () => {
    expect(() => checkDshVersion('unknown')).toThrow(UnsupportedDshVersionError);
    expect(() => checkDshVersion('')).toThrow(UnsupportedDshVersionError);
  });

  test('reports the offending version on the error', () => {
    try {
      checkDshVersion('9.9.9');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedDshVersionError);
      expect((error as UnsupportedDshVersionError).actual).toBe('9.9.9');
    }
  });
});
