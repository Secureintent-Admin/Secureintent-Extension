import { describe, expect, test } from 'vitest';
import { computeFingerprint } from './index';
import type { Salt } from './types';

describe('computeFingerprint', () => {
  test('produces a 64-char hex SHA-256 string', async () => {
    const fingerprint = await computeFingerprint('sk-secret', 'saltsaltsalt' as Salt);
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  test('is deterministic for the same secret and salt', async () => {
    const a = await computeFingerprint('sk-secret', 'saltsaltsalt' as Salt);
    const b = await computeFingerprint('sk-secret', 'saltsaltsalt' as Salt);
    expect(a).toBe(b);
  });

  test('differs when the salt differs', async () => {
    const a = await computeFingerprint('sk-secret', 'salt-one' as Salt);
    const b = await computeFingerprint('sk-secret', 'salt-two' as Salt);
    expect(a).not.toBe(b);
  });

  test('differs when the secret differs', async () => {
    const a = await computeFingerprint('secret-one', 'samesalt' as Salt);
    const b = await computeFingerprint('secret-two', 'samesalt' as Salt);
    expect(a).not.toBe(b);
  });
});
