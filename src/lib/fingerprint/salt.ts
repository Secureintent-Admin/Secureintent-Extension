import type { Salt } from './types';

export interface KeyValueStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
}

const SALT_KEY = 'si_fingerprint_salt';

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function getOrCreateSalt(store: KeyValueStore): Promise<Salt> {
  const existing = await store.get(SALT_KEY);
  if (existing) return existing as Salt;

  const salt = randomHex(16);
  await store.set(SALT_KEY, salt);
  return salt as Salt;
}
