import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { browser } from '#imports';
import { getClerkTokenFromCookie, getClerkUserIdFromCookie } from './cookieToken';

// Minimal unsigned JWT carrying a `sub` claim (base64url, no padding).
function jwt(sub: string): string {
  const seg = (o: object) =>
    btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${seg({ alg: 'none' })}.${seg({ sub })}.sig`;
}

const cookiesGet = vi.fn();

beforeAll(() => {
  // fakeBrowser doesn't implement the cookies API — provide a stub.
  (browser as unknown as { cookies: { get: typeof cookiesGet } }).cookies = { get: cookiesGet };
});

afterEach(() => cookiesGet.mockReset());

describe('getClerkTokenFromCookie', () => {
  test('returns the __session JWT from the app cookie', async () => {
    const token = jwt('user_abc');
    cookiesGet.mockResolvedValueOnce({ value: token });
    expect(await getClerkTokenFromCookie()).toBe(token);
    expect(cookiesGet).toHaveBeenCalledWith(expect.objectContaining({ name: '__session' }));
  });

  test('falls through to the FAPI host when the app cookie is absent', async () => {
    const token = jwt('user_x');
    cookiesGet.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ value: token });
    expect(await getClerkTokenFromCookie()).toBe(token);
    expect(cookiesGet).toHaveBeenCalledTimes(2);
  });

  test('null when signed out (no cookie on either host)', async () => {
    cookiesGet.mockResolvedValue(undefined);
    expect(await getClerkTokenFromCookie()).toBeNull();
  });

  test('ignores a cookie value that is not a JWT', async () => {
    cookiesGet.mockResolvedValue({ value: 'not-a-jwt' });
    expect(await getClerkTokenFromCookie()).toBeNull();
  });
});

describe('getClerkUserIdFromCookie', () => {
  test('decodes the sub claim from the session JWT', async () => {
    cookiesGet.mockResolvedValueOnce({ value: jwt('user_42') });
    expect(await getClerkUserIdFromCookie()).toBe('user_42');
  });

  test('null when signed out', async () => {
    cookiesGet.mockResolvedValue(undefined);
    expect(await getClerkUserIdFromCookie()).toBeNull();
  });
});
