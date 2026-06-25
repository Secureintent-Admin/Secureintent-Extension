import { describe, expect, test } from 'vitest';
import { getOrCreateSalt, type KeyValueStore } from '@/lib/fingerprint';
import { hashPin, verifyPin } from './index';

function memStore(): KeyValueStore {
  const d: Record<string, string> = {};
  return {
    get: async (k) => d[k],
    set: async (k, v) => {
      d[k] = v;
    },
  };
}

describe('pin hashing', () => {
  test('hashPin returns a 64-char hex digest', async () => {
    const salt = await getOrCreateSalt(memStore());
    expect(await hashPin('1234', salt)).toMatch(/^[0-9a-f]{64}$/);
  });

  test('verifyPin accepts the correct pin', async () => {
    const salt = await getOrCreateSalt(memStore());
    const hash = await hashPin('1234', salt);
    expect(await verifyPin('1234', salt, hash)).toBe(true);
  });

  test('verifyPin rejects a wrong pin', async () => {
    const salt = await getOrCreateSalt(memStore());
    const hash = await hashPin('1234', salt);
    expect(await verifyPin('0000', salt, hash)).toBe(false);
  });

  test('the same pin hashes differently under different salts', async () => {
    const s1 = await getOrCreateSalt(memStore());
    const s2 = await getOrCreateSalt(memStore());
    expect(await hashPin('1234', s1)).not.toBe(await hashPin('1234', s2));
  });
});
