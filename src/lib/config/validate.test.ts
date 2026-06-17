import { describe, expect, test } from 'vitest';
import { DEFAULT_BUNDLE } from './default';
import { validateBundle } from './validate';

describe('validateBundle', () => {
  test('accepts the default bundle', () => {
    expect(validateBundle(DEFAULT_BUNDLE)).toBe(true);
  });
  test('rejects a non-object / missing fields', () => {
    expect(validateBundle(null)).toBe(false);
    expect(validateBundle({ version: 1 })).toBe(false);
    expect(validateBundle({ version: 'x', patterns: [], sites: {}, killSwitch: false })).toBe(
      false,
    );
  });
  test('rejects a pattern with an unknown type or missing regex', () => {
    const bad = {
      version: 1,
      patterns: [{ type: 'nope', label: 'x', regex: 'a' }],
      sites: {},
      killSwitch: false,
    };
    expect(validateBundle(bad)).toBe(false);
    const bad2 = {
      version: 1,
      patterns: [{ type: 'known-key', label: 'x' }],
      sites: {},
      killSwitch: false,
    };
    expect(validateBundle(bad2)).toBe(false);
  });
});
