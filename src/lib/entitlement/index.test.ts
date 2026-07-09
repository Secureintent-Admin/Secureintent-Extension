import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

// Mock the Ed25519 verifier so tests don't need the private signing key.
vi.mock('@/lib/config/verify', () => ({
  verifyBundle: vi.fn(async (_payload: string, sig: string | null) => sig === 'valid'),
}));

import {
  evaluateBlob,
  evaluateStored,
  getActiveEntitlement,
  hasFeatureCached,
  initEntitlementCache,
} from './index';
import { entitlementItem } from './store';
import type { SignedEntitlement } from './types';

const proBlob = (over: Partial<SignedEntitlement> = {}): SignedEntitlement => ({
  clerkUserId: 'user_1',
  plan: 'developer_pro',
  source: 'paddle',
  pro: true,
  features: ['rehydrate', 'ghost', 'session_lock'],
  status: 'active',
  businessDomain: null,
  issuedAt: 1000,
  exp: 2000,
  ...over,
});

beforeEach(() => {
  fakeBrowser.reset();
});

describe('evaluateBlob', () => {
  test('valid + unexpired → unlocked', () => {
    expect(evaluateBlob(proBlob(), 1500, true)).toEqual({
      plan: 'developer_pro',
      pro: true,
      features: ['rehydrate', 'ghost', 'session_lock'],
      source: 'paddle',
      businessDomain: null,
    });
  });
  test('invalid signature → free', () => {
    expect(evaluateBlob(proBlob(), 1500, false)).toEqual({
      plan: 'developer',
      pro: false,
      features: [],
      source: 'none',
      businessDomain: null,
    });
  });
  test('expired → free even if signature valid', () => {
    expect(evaluateBlob(proBlob({ exp: 1200 }), 1500, true)).toEqual({
      plan: 'developer',
      pro: false,
      features: [],
      source: 'none',
      businessDomain: null,
    });
  });
  test('bound to a different user → free (blob is not portable)', () => {
    expect(evaluateBlob(proBlob(), 1500, true, 'user_2').pro).toBe(false);
  });
  test('bound to the matching user → unlocked', () => {
    expect(evaluateBlob(proBlob(), 1500, true, 'user_1').pro).toBe(true);
  });
  test('signed out (null) with a stored blob → free', () => {
    expect(evaluateBlob(proBlob(), 1500, true, null).pro).toBe(false);
  });
  test('no user id supplied → binding skipped (unlocked)', () => {
    expect(evaluateBlob(proBlob(), 1500, true).pro).toBe(true);
  });
});

describe('evaluateStored', () => {
  test('null → free', async () => {
    expect(await evaluateStored(null, 1500)).toEqual({
      plan: 'developer',
      pro: false,
      features: [],
      source: 'none',
      businessDomain: null,
    });
  });
  test('valid signature unlocks', async () => {
    const out = await evaluateStored({ blob: proBlob(), signature: 'valid' }, 1500);
    expect(out.pro).toBe(true);
  });
  test('bad signature → free', async () => {
    const out = await evaluateStored({ blob: proBlob(), signature: 'nope' }, 1500);
    expect(out.pro).toBe(false);
  });
});

describe('cache', () => {
  test('initEntitlementCache primes hasFeatureCached and updates on change', async () => {
    await entitlementItem.setValue({ blob: proBlob({ exp: 9_999_999_999 }), signature: 'valid' });
    const stop = await initEntitlementCache();
    expect(hasFeatureCached('rehydrate')).toBe(true);
    expect(hasFeatureCached('session_lock')).toBe(true);

    await entitlementItem.setValue(null);
    await vi.waitFor(() => expect(hasFeatureCached('rehydrate')).toBe(false));
    stop();
  });
});

describe('getActiveEntitlement', () => {
  test('reads from storage', async () => {
    await entitlementItem.setValue({ blob: proBlob({ exp: 9_999_999_999 }), signature: 'valid' });
    expect((await getActiveEntitlement()).pro).toBe(true);
  });
});
