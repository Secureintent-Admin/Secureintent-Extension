import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { DEFAULT_BUNDLE } from '@/lib/config/default';
import { getActiveBundle, saveBundle } from '@/lib/config/store';
import { syncConfig } from './configService';

beforeEach(() => fakeBrowser.reset());
afterEach(() => vi.restoreAllMocks());

const PRIV = 'MC4CAQAwBQYDK2VwBCIEIDil5s2qLmnKUY2O5xpX+QTAWz58ZgCXmw6jxnzmxlBm';
async function sign(bundle: unknown): Promise<string> {
  const priv = Uint8Array.from(atob(PRIV), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', priv, { name: 'Ed25519' }, false, ['sign']);
  const sig = await crypto.subtle.sign(
    { name: 'Ed25519' },
    key,
    new TextEncoder().encode(JSON.stringify(bundle)),
  );
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

function mockConfig(bundle: unknown, signature: string | null, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ bundle, signature }), { status })),
  );
}

describe('syncConfig', () => {
  test('stores a newer valid bundle', async () => {
    const b = { ...DEFAULT_BUNDLE, version: 50 };
    mockConfig(b, await sign(b));
    const r = await syncConfig();
    expect(r.status).toBe('updated');
    expect((await getActiveBundle()).version).toBe(50);
  });
  test('ignores a bundle whose version is not newer', async () => {
    const b = { ...DEFAULT_BUNDLE, version: 50 };
    await saveBundle(b);
    mockConfig(b, await sign(b));
    const r = await syncConfig();
    expect(r.status).toBe('unchanged');
  });
  test('keeps the cached bundle when the fetch fails', async () => {
    await saveBundle({ ...DEFAULT_BUNDLE, version: 50 });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const r = await syncConfig();
    expect(r.status).toBe('error');
    expect((await getActiveBundle()).version).toBe(50);
  });
  test('rejects an invalid bundle without overwriting cache', async () => {
    await saveBundle({ ...DEFAULT_BUNDLE, version: 50 });
    mockConfig({ version: 'bad' }, 'x');
    const r = await syncConfig();
    expect(r.status).toBe('error');
    expect((await getActiveBundle()).version).toBe(50);
  });
  test('rejects a bundle with a bad signature', async () => {
    await saveBundle({ ...DEFAULT_BUNDLE, version: 50 });
    const b = { ...DEFAULT_BUNDLE, version: 60 };
    mockConfig(b, 'AAAA');
    const r = await syncConfig();
    expect(r.status).toBe('error');
    expect(r.error).toBe('signature verification failed');
    expect((await getActiveBundle()).version).toBe(50);
  });
});
