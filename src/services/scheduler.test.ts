import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import * as configService from '@/services/configService';
import { handleRefreshMessage, SYNC_ALARM } from './scheduler';

beforeEach(() => fakeBrowser.reset());
afterEach(() => vi.restoreAllMocks());

describe('config scheduler', () => {
  test('refresh message triggers syncConfig and returns the result', async () => {
    const spy = vi
      .spyOn(configService, 'syncConfig')
      .mockResolvedValue({ status: 'updated', version: 9 });
    const reply = await handleRefreshMessage({ type: 'si-refresh-config' });
    expect(spy).toHaveBeenCalledOnce();
    expect(reply).toEqual({ status: 'updated', version: 9 });
  });

  test('ignores unrelated messages', async () => {
    const spy = vi.spyOn(configService, 'syncConfig').mockResolvedValue({ status: 'updated' });
    const reply = await handleRefreshMessage({ type: 'other' });
    expect(spy).not.toHaveBeenCalled();
    expect(reply).toBeNull();
  });

  test('SYNC_ALARM period is 120 minutes', () => {
    expect(SYNC_ALARM.periodInMinutes).toBe(120);
  });
});
