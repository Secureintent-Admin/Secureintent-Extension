import { beforeEach, describe, expect, test } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { type BundlePolicy, DEFAULT_BUNDLE, saveBundle } from '@/lib/config';
import {
  clearSessionLockPin,
  DEFAULT_LOCK_TIMEOUT_MS,
  getBlockedCount,
  getSessionLockConfig,
  isEnabled,
  isSessionLockEnforced,
  recordBlocked,
  sessionLockEnabledItem,
  sessionLockPinHashItem,
  sessionLockTimeoutItem,
  setEnabled,
  setSessionLockEnabled,
  setSessionLockPin,
} from './index';

describe('settings', () => {
  beforeEach(() => fakeBrowser.reset());

  test('protection is enabled by default', async () => {
    expect(await isEnabled()).toBe(true);
  });

  test('setEnabled(false) disables protection', async () => {
    await setEnabled(false);
    expect(await isEnabled()).toBe(false);
  });

  test('blocked count starts at zero', async () => {
    expect(await getBlockedCount()).toBe(0);
  });

  test('recordBlocked accumulates the count', async () => {
    await recordBlocked(1);
    await recordBlocked(2);
    expect(await getBlockedCount()).toBe(3);
  });

  test('session lock is off with no PIN and a 5-minute default timeout', async () => {
    expect(await getSessionLockConfig()).toEqual({
      enabled: false,
      pinHash: null,
      timeoutMs: DEFAULT_LOCK_TIMEOUT_MS,
    });
  });

  test('getSessionLockConfig reflects stored values', async () => {
    await sessionLockEnabledItem.setValue(true);
    await sessionLockPinHashItem.setValue('deadbeef');
    await sessionLockTimeoutItem.setValue(60_000);
    expect(await getSessionLockConfig()).toEqual({
      enabled: true,
      pinHash: 'deadbeef',
      timeoutMs: 60_000,
    });
  });

  test('setSessionLockPin stores the hash and auto-enables the lock', async () => {
    await setSessionLockPin('cafe1234');
    expect(await getSessionLockConfig()).toMatchObject({ enabled: true, pinHash: 'cafe1234' });
  });

  test('clearSessionLockPin removes the PIN and disables the lock', async () => {
    await setSessionLockPin('cafe1234');
    await clearSessionLockPin();
    expect(await getSessionLockConfig()).toMatchObject({ enabled: false, pinHash: null });
  });
});

describe('settings — team policy requireSessionLock', () => {
  const policy: BundlePolicy = {
    blockInsteadOfWarn: false,
    requireSessionLock: true,
    extraPatterns: [],
    blockedSites: [],
  };
  /** Only a verified bundle ever reaches storage, so seeding it == "team pushed it". */
  const enforce = () => saveBundle({ ...DEFAULT_BUNDLE, policy });

  beforeEach(() => fakeBrowser.reset());

  test('regression: with no policy nothing is enforced and disabling still works', async () => {
    expect(await isSessionLockEnforced()).toBe(false);
    await setSessionLockPin('cafe1234');
    expect(await setSessionLockEnabled(false)).toBe(true);
    expect(await getSessionLockConfig()).toMatchObject({ enabled: false });
    expect(await clearSessionLockPin()).toBe(true);
    expect(await getSessionLockConfig()).toMatchObject({ enabled: false, pinHash: null });
  });

  test('regression: a policy that does not require the lock enforces nothing', async () => {
    await saveBundle({ ...DEFAULT_BUNDLE, policy: { ...policy, requireSessionLock: false } });
    expect(await isSessionLockEnforced()).toBe(false);
    expect(await setSessionLockEnabled(false)).toBe(true);
  });

  test('the lock reads as ON even when storage still says off', async () => {
    await sessionLockEnabledItem.setValue(false);
    await enforce();
    expect(await isSessionLockEnforced()).toBe(true);
    expect(await getSessionLockConfig()).toMatchObject({ enabled: true });
  });

  test('the member cannot switch it off — the write is refused, not silently lost', async () => {
    await setSessionLockPin('cafe1234');
    await enforce();
    expect(await setSessionLockEnabled(false)).toBe(false);
    expect(await getSessionLockConfig()).toMatchObject({ enabled: true });
    expect(await sessionLockEnabledItem.getValue()).toBe(true); // untouched
  });

  test('turning it on is still allowed under enforcement', async () => {
    await sessionLockEnabledItem.setValue(false);
    await enforce();
    expect(await setSessionLockEnabled(true)).toBe(true);
    expect(await sessionLockEnabledItem.getValue()).toBe(true);
  });

  test('removing the PIN is refused too (it would disable the lock)', async () => {
    await setSessionLockPin('cafe1234');
    await enforce();
    expect(await clearSessionLockPin()).toBe(false);
    expect(await getSessionLockConfig()).toMatchObject({ enabled: true, pinHash: 'cafe1234' });
  });
});
