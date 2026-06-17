import { beforeEach, describe, expect, test } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { DEFAULT_BUNDLE } from './default';
import { configItem, getActiveBundle, getLastSynced, saveBundle } from './store';

beforeEach(() => fakeBrowser.reset());

describe('config store', () => {
  test('getActiveBundle returns the bundled default when storage is empty', async () => {
    expect((await getActiveBundle()).version).toBe(DEFAULT_BUNDLE.version);
  });
  test('saveBundle persists and getActiveBundle returns it', async () => {
    const next = { ...DEFAULT_BUNDLE, version: 42 };
    await saveBundle(next);
    expect((await getActiveBundle()).version).toBe(42);
    expect(await getLastSynced()).toBeGreaterThan(0);
  });
  test('configItem stores the raw bundle', async () => {
    await saveBundle({ ...DEFAULT_BUNDLE, version: 7 });
    expect((await configItem.getValue())?.version).toBe(7);
  });
});
