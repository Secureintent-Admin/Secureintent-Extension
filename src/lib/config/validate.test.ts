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
  test('accepts a type this build has never heard of', () => {
    // Deliberate, and it is the whole reason a new secret type can ship at all.
    // Rejecting here fails the WHOLE bundle, so the day the Worker first served
    // `high-entropy` every installed copy would have thrown the bundle away and
    // quietly stopped taking pattern updates — permanently, because the fix
    // travels in the bundle it can no longer read. An unfamiliar type now costs
    // that one pattern its rank (TYPE_RANK falls back to lowest) and no more.
    const future = {
      version: 1,
      patterns: [{ type: 'some-future-type', label: 'x', regex: 'a' }],
      sites: {},
      killSwitch: false,
    };
    expect(validateBundle(future)).toBe(true);
  });

  test('still rejects a type that is missing or not a string', () => {
    const base = { version: 1, sites: {}, killSwitch: false };
    expect(validateBundle({ ...base, patterns: [{ label: 'x', regex: 'a' }] })).toBe(false);
    expect(validateBundle({ ...base, patterns: [{ type: '', label: 'x', regex: 'a' }] })).toBe(
      false,
    );
    expect(validateBundle({ ...base, patterns: [{ type: 7, label: 'x', regex: 'a' }] })).toBe(
      false,
    );
  });

  test('rejects a pattern with a missing regex', () => {
    const bad2 = {
      version: 1,
      patterns: [{ type: 'known-key', label: 'x' }],
      sites: {},
      killSwitch: false,
    };
    expect(validateBundle(bad2)).toBe(false);
  });
});

describe('validateBundle — team policy', () => {
  const policy = {
    blockInsteadOfWarn: true,
    requireSessionLock: true,
    extraPatterns: [{ type: 'known-key', label: 'Acme key', regex: 'acme_[a-z0-9]{10}' }],
    blockedSites: ['pastebin.com'],
  };

  test('a bundle with no policy is exactly as valid as before (regression)', () => {
    expect(validateBundle(DEFAULT_BUNDLE)).toBe(true);
    expect('policy' in DEFAULT_BUNDLE).toBe(false);
    expect(validateBundle({ ...DEFAULT_BUNDLE, policy: undefined })).toBe(true);
  });

  test('accepts a well-formed policy and policyVersion', () => {
    expect(validateBundle({ ...DEFAULT_BUNDLE, policy, policyVersion: 4 })).toBe(true);
  });

  test('rejects a policy with a missing or mistyped flag', () => {
    const { blockInsteadOfWarn: _drop, ...missing } = policy;
    expect(validateBundle({ ...DEFAULT_BUNDLE, policy: missing })).toBe(false);
    expect(
      validateBundle({ ...DEFAULT_BUNDLE, policy: { ...policy, requireSessionLock: 'yes' } }),
    ).toBe(false);
  });

  test('a policy survives an unfamiliar pattern type but not a malformed one', () => {
    expect(
      validateBundle({
        ...DEFAULT_BUNDLE,
        policy: { ...policy, extraPatterns: [{ type: 'nope', label: 'x', regex: 'a' }] },
      }),
      // A team's own pattern gets the same forward-compatibility as ours: an
      // unfamiliar type is not a reason to drop the whole policy.
    ).toBe(true);
    expect(
      validateBundle({
        ...DEFAULT_BUNDLE,
        policy: { ...policy, extraPatterns: [{ label: 'x', regex: 'a' }] },
      }),
    ).toBe(false);
    expect(
      validateBundle({ ...DEFAULT_BUNDLE, policy: { ...policy, blockedSites: [{ host: 'x' }] } }),
    ).toBe(false);
  });

  test('rejects a non-numeric policyVersion', () => {
    expect(validateBundle({ ...DEFAULT_BUNDLE, policyVersion: 'v4' })).toBe(false);
  });
});

/**
 * `origin` marks a team admin's own patterns. Validation ignores it on purpose:
 * installs shipped before the field existed already accept these bundles, and a
 * bundle must never be rejected — losing its kill switch — over a UI marker.
 */
describe('validateBundle — pattern origin', () => {
  const teamPattern = {
    type: 'known-key',
    label: 'Acme token',
    regex: 'ACME-[A-Z0-9]{12}',
    origin: 'team',
  };

  test('accepts a bundle whose patterns carry origin: "team"', () => {
    expect(
      validateBundle({ ...DEFAULT_BUNDLE, patterns: [...DEFAULT_BUNDLE.patterns, teamPattern] }),
    ).toBe(true);
  });

  test('the default catalogue still carries no origin key (regression)', () => {
    expect(DEFAULT_BUNDLE.patterns.every((p) => !('origin' in p))).toBe(true);
  });

  test('an unrecognised origin value does not reject the bundle', () => {
    expect(
      validateBundle({
        ...DEFAULT_BUNDLE,
        patterns: [{ ...teamPattern, origin: 'something-else' }],
      }),
    ).toBe(true);
  });
});
