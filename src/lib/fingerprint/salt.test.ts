import { beforeEach, describe, expect, test } from 'vitest';
import { getOrCreateSalt, type KeyValueStore } from './salt';

function memoryStore(initial: Record<string, string> = {}): KeyValueStore {
  const data = { ...initial };
  return {
    get: async (key) => data[key],
    set: async (key, value) => {
      data[key] = value;
    },
  };
}

describe('getOrCreateSalt', () => {
  let store: KeyValueStore;
  beforeEach(() => {
    store = memoryStore();
  });

  test('generates a hex salt when none is stored', async () => {
    const salt = await getOrCreateSalt(store);
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
  });

  test('persists the generated salt to the store', async () => {
    const salt = await getOrCreateSalt(store);
    expect(await store.get('si_fingerprint_salt')).toBe(salt);
  });

  test('returns the same salt on subsequent calls', async () => {
    const first = await getOrCreateSalt(store);
    const second = await getOrCreateSalt(store);
    expect(second).toBe(first);
  });

  test('returns the existing salt without overwriting it', async () => {
    const seeded = memoryStore({ si_fingerprint_salt: 'preexistingsaltvalue' });
    expect(await getOrCreateSalt(seeded)).toBe('preexistingsaltvalue');
  });
});
