import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  allowVaultInContentScripts,
  DEFAULT_TTL_MS,
  type VaultStore,
  vaultPut,
  vaultResolve,
  vaultSnapshot,
  vaultSweep,
} from './index';

function memoryStore(initial: Record<string, string> = {}): VaultStore {
  const data = { ...initial };
  return {
    get: async (key) => data[key],
    set: async (key, value) => {
      data[key] = value;
    },
  };
}

const A = 'https://chatgpt.com';
const B = 'https://claude.ai';

describe('vault', () => {
  let store: VaultStore;
  beforeEach(() => {
    store = memoryStore();
  });

  test('resolves a token to the secret that was put', async () => {
    await vaultPut(store, A, [{ token: '⟦SI:aaaaaaaa⟧', secret: 'sk-real' }], 0);
    expect(await vaultResolve(store, A, '⟦SI:aaaaaaaa⟧', 0)).toBe('sk-real');
  });

  test('returns undefined for an unknown token', async () => {
    expect(await vaultResolve(store, A, '⟦SI:ffffffff⟧', 0)).toBeUndefined();
  });

  test('isolates tokens per origin', async () => {
    await vaultPut(store, A, [{ token: '⟦SI:aaaaaaaa⟧', secret: 'sk-a' }], 0);
    expect(await vaultResolve(store, B, '⟦SI:aaaaaaaa⟧', 0)).toBeUndefined();
  });

  test('accumulates entries across multiple puts to one origin', async () => {
    await vaultPut(store, A, [{ token: '⟦SI:aaaaaaaa⟧', secret: 's1' }], 0);
    await vaultPut(store, A, [{ token: '⟦SI:bbbbbbbb⟧', secret: 's2' }], 0);
    expect(await vaultResolve(store, A, '⟦SI:aaaaaaaa⟧', 0)).toBe('s1');
    expect(await vaultResolve(store, A, '⟦SI:bbbbbbbb⟧', 0)).toBe('s2');
  });

  test('does not resolve an entry older than the TTL', async () => {
    await vaultPut(store, A, [{ token: '⟦SI:aaaaaaaa⟧', secret: 'sk' }], 0);
    expect(await vaultResolve(store, A, '⟦SI:aaaaaaaa⟧', DEFAULT_TTL_MS + 1)).toBeUndefined();
  });

  test('still resolves an entry exactly at the TTL boundary', async () => {
    await vaultPut(store, A, [{ token: '⟦SI:aaaaaaaa⟧', secret: 'sk' }], 0);
    expect(await vaultResolve(store, A, '⟦SI:aaaaaaaa⟧', DEFAULT_TTL_MS)).toBe('sk');
  });

  test('snapshot returns all live token→secret pairs for an origin', async () => {
    await vaultPut(store, A, [{ token: '⟦SI:aaaaaaaa⟧', secret: 's1' }], 0);
    await vaultPut(store, A, [{ token: '⟦SI:bbbbbbbb⟧', secret: 's2' }], 0);
    expect(await vaultSnapshot(store, A, 0)).toEqual({
      '⟦SI:aaaaaaaa⟧': 's1',
      '⟦SI:bbbbbbbb⟧': 's2',
    });
  });

  test('snapshot omits entries older than the TTL', async () => {
    await vaultPut(store, A, [{ token: '⟦SI:old00000⟧', secret: 'old' }], 0);
    await vaultPut(store, A, [{ token: '⟦SI:new00000⟧', secret: 'new' }], DEFAULT_TTL_MS);
    expect(await vaultSnapshot(store, A, DEFAULT_TTL_MS + 1)).toEqual({
      '⟦SI:new00000⟧': 'new',
    });
  });

  test('snapshot of an empty origin is an empty object', async () => {
    expect(await vaultSnapshot(store, B, 0)).toEqual({});
  });

  test('grants content scripts access to session storage', async () => {
    const setAccessLevel = vi.fn();
    await allowVaultInContentScripts({ setAccessLevel });
    expect(setAccessLevel).toHaveBeenCalledWith({
      accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS',
    });
  });

  test('is a safe no-op when setAccessLevel is unavailable (e.g. Firefox)', async () => {
    await expect(allowVaultInContentScripts({})).resolves.toBeUndefined();
  });

  test('swallows a rejection from setAccessLevel', async () => {
    const setAccessLevel = vi.fn().mockRejectedValue(new Error('nope'));
    await expect(allowVaultInContentScripts({ setAccessLevel })).resolves.toBeUndefined();
  });

  test('putting an empty entry list is a no-op', async () => {
    await vaultPut(store, A, [], 0);
    expect(await store.get('si_vault:https://chatgpt.com')).toBeUndefined();
  });

  test('resolves to undefined when the stored blob is corrupt', async () => {
    const corrupt = memoryStore({ 'si_vault:https://chatgpt.com': 'not json' });
    expect(await vaultResolve(corrupt, A, '⟦SI:aaaaaaaa⟧', 0)).toBeUndefined();
  });

  test('sweep removes expired entries and keeps fresh ones', async () => {
    await vaultPut(store, A, [{ token: '⟦SI:old00000⟧', secret: 'old' }], 0);
    await vaultPut(store, A, [{ token: '⟦SI:new00000⟧', secret: 'new' }], DEFAULT_TTL_MS);
    await vaultSweep(store, A, DEFAULT_TTL_MS + 1);
    // read at put-time so TTL doesn't re-hide the fresh one
    expect(await vaultResolve(store, A, '⟦SI:new00000⟧', DEFAULT_TTL_MS)).toBe('new');
    expect(await vaultResolve(store, A, '⟦SI:old00000⟧', DEFAULT_TTL_MS)).toBeUndefined();
  });
});
