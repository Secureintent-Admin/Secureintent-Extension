import { describe, expect, test } from 'vitest';
import { verifyBundle } from './verify';

// Test fixtures: the matching PKCS8 PRIVATE key (base64) for the embedded public key.
const PRIV = 'MC4CAQAwBQYDK2VwBCIEIDil5s2qLmnKUY2O5xpX+QTAWz58ZgCXmw6jxnzmxlBm';

async function sign(payload: string): Promise<string> {
  const priv = Uint8Array.from(atob(PRIV), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', priv, { name: 'Ed25519' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'Ed25519' }, key, new TextEncoder().encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

describe('verifyBundle', () => {
  test('accepts a valid signature', async () => {
    const payload = JSON.stringify({ version: 5 });
    expect(await verifyBundle(payload, await sign(payload))).toBe(true);
  });
  test('rejects a signature over different content', async () => {
    expect(
      await verifyBundle(
        JSON.stringify({ version: 6 }),
        await sign(JSON.stringify({ version: 5 })),
      ),
    ).toBe(false);
  });
  test('rejects a null or garbage signature', async () => {
    expect(await verifyBundle('{}', null)).toBe(false);
    expect(await verifyBundle('{}', 'not-base64-sig')).toBe(false);
  });
});
