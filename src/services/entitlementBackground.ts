import { createClerkClient } from '@clerk/chrome-extension/client';
import { API_BASE } from '@/lib/api/client';
import {
  CLERK_JWT_TEMPLATE,
  CLERK_PUBLISHABLE_KEY,
  CLERK_SYNC_HOST,
  IS_FIREFOX,
  isAuthEnabled,
} from '@/lib/clerkConfig';
import { siDebug } from '@/lib/debug';
import { entitlementItem } from '@/lib/entitlement';
import { refreshEntitlement } from '@/lib/entitlement/refresh';
import { offlineUsed } from '@/lib/quota/offline';
import { getClerkTokenFromCookie, getClerkUserIdFromCookie } from './cookieToken';

/**
 * Mint a fresh Clerk session token from the background service worker (no DOM).
 * Returns null when Clerk is unconfigured or the user is signed out.
 */
export async function getClerkToken(): Promise<string | null> {
  if (!isAuthEnabled()) return null;
  // Firefox: read the web-app session JWT from the cookie (the SDK can't mint one
  // from the extension origin). The Worker hydrates missing claims server-side.
  if (IS_FIREFOX) return getClerkTokenFromCookie();
  const clerk = await createClerkClient({
    publishableKey: CLERK_PUBLISHABLE_KEY,
    syncHost: CLERK_SYNC_HOST,
    background: true,
  });
  if (!clerk.session) return null;
  return clerk.session.getToken({ template: CLERK_JWT_TEMPLATE });
}

/** Refresh the cached entitlement using the current Clerk session. */
export async function refreshEntitlementBg() {
  const result = await refreshEntitlement(getClerkToken);
  siDebug('entitlement', 'bg refresh', { status: result.status, plan: result.plan ?? null });
  return result;
}

/** The currently signed-in Clerk user id from the background session, or null. */
export async function getClerkUserId(): Promise<string | null> {
  if (!isAuthEnabled()) return null;
  if (IS_FIREFOX) return getClerkUserIdFromCookie();
  try {
    const clerk = await createClerkClient({
      publishableKey: CLERK_PUBLISHABLE_KEY,
      syncHost: CLERK_SYNC_HOST,
      background: true,
    });
    return clerk.session?.user?.id ?? clerk.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Clear the cached entitlement if it was issued for a different user than the
 * one currently signed in — a signed blob is otherwise portable between installs
 * until it expires. Null-safe: only clears on a DEFINITE mismatch (a known,
 * different user id), never when the session id can't be read, so a legitimate
 * user is never wrongly downgraded to free.
 */
export async function enforceEntitlementBinding(): Promise<void> {
  const stored = await entitlementItem.getValue();
  if (!stored) return;
  const userId = await getClerkUserId();
  if (userId && stored.blob.clerkUserId !== userId) {
    siDebug('entitlement', 'binding mismatch — clearing', { current: userId });
    await entitlementItem.setValue(null);
  }
}

/** GET the signed-in user's Anonymise & Paste allowance from the Worker. */
export async function getUsageStatus(): Promise<unknown | null> {
  const token = await getClerkToken();
  if (!token) return null;
  try {
    // Carry the on-device (offline) count into the account so signing in doesn't
    // reset the allowance to a fresh 10/10 — the backend reconciles to the max.
    const offline = await offlineUsed().catch(() => 0);
    const res = await fetch(`${API_BASE}/v1/usage`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-SI-Offline-Used': String(offline),
      },
      cache: 'no-store',
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Consume one Anonymise & Paste for the signed-in user. */
export async function consumeUsage(): Promise<unknown | null> {
  const token = await getClerkToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/v1/usage/anonymize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// Note: there is deliberately no in-extension checkout starter here. Buying a
// plan happens on the account page (ACCOUNT_URL), which already runs the Paddle
// flow against the signed-in web session — a second, extension-initiated path
// would be a second destination for the one "upgrade" intent.
