import { beforeEach, describe, expect, test } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  clearSessionLockPin,
  DEFAULT_LOCK_TIMEOUT_MS,
  getBlockedCount,
  getSessionLockConfig,
  isEnabled,
  recordBlocked,
  sessionLockEnabledItem,
  sessionLockPinHashItem,
  sessionLockTimeoutItem,
  setEnabled,
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
