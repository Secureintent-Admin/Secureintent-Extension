import { browser } from '#imports';
import { CLERK_SYNC_HOST, WEB_APP_URL } from '@/lib/clerkConfig';

// Clerk stores the active session JWT in the `__session` cookie on the web app's
// domain. On Firefox we can't mint a token via the chrome-extension SDK (its FAPI
// call comes from the random moz-extension:// origin, which Clerk can't
// allowlist), so we read this cookie directly with the privileged `browser.cookies`
// API instead. The token was minted by the web app (an allowlisted origin), and
// our Worker verifies it server-side via JWKS — no extension-origin check anywhere.
// Requires the `cookies` permission + host_permissions for the cookie's domain
// (both already declared for secureintent.ai and clerk.secureintent.ai).
const SESSION_COOKIE = '__session';

function looksLikeJwt(value: string): boolean {
  const parts = value.split('.');
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

/** Decode the `sub` (Clerk user id) from a JWT without verifying it. */
function jwtSub(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

/**
 * Read the Clerk session JWT from the web app cookie. Tries the app origin first,
 * then the Frontend API host. Returns null if signed out (no cookie) or on error.
 * The JWT may be expired if the user hasn't opened the app recently — the Worker
 * rejects expired tokens and the caller keeps its last-known entitlement (fail-safe).
 */
export async function getClerkTokenFromCookie(): Promise<string | null> {
  for (const url of [WEB_APP_URL, CLERK_SYNC_HOST]) {
    try {
      const cookie = await browser.cookies.get({ url, name: SESSION_COOKIE });
      const value = cookie?.value?.trim();
      if (value && looksLikeJwt(value)) return value;
    } catch {
      // Permission/host mismatch for this URL — try the next.
    }
  }
  return null;
}

/** The signed-in Clerk user id, derived from the session cookie (Firefox path). */
export async function getClerkUserIdFromCookie(): Promise<string | null> {
  const token = await getClerkTokenFromCookie();
  return token ? jwtSub(token) : null;
}
