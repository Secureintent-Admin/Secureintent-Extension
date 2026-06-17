import { beforeEach, describe, expect, test } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { getBlockedCount, isEnabled, recordBlocked, setEnabled } from './index';

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
});
