import { storage } from '#imports';
import { getActiveBundle, getPolicy } from '@/lib/config';

export const enabledItem = storage.defineItem<boolean>('local:si_enabled', {
  fallback: true,
});

export const blockedCountItem = storage.defineItem<number>('local:si_blocked_count', {
  fallback: 0,
});

export const isEnabled = () => enabledItem.getValue();
export const setEnabled = (value: boolean) => enabledItem.setValue(value);
export const getBlockedCount = () => blockedCountItem.getValue();

// --- Session Lock (cloud consoles) ---
export const DEFAULT_LOCK_TIMEOUT_MS = 5 * 60 * 1000;

export const sessionLockEnabledItem = storage.defineItem<boolean>('local:si_lock_enabled', {
  fallback: false,
});
/** Salted SHA-256 of the PIN; null until the user sets one. Never plaintext. */
export const sessionLockPinHashItem = storage.defineItem<string | null>('local:si_lock_pin', {
  fallback: null,
});
export const sessionLockTimeoutItem = storage.defineItem<number>('local:si_lock_timeout_ms', {
  fallback: DEFAULT_LOCK_TIMEOUT_MS,
});

export interface SessionLockConfig {
  enabled: boolean;
  pinHash: string | null;
  timeoutMs: number;
}

/**
 * Team Policy `requireSessionLock`: the admin has pinned Session Lock on for
 * every member. The flag rides on the Ed25519-signed config bundle, so only a
 * Worker-signed bundle can turn it on.
 *
 * Reads fall back to "not enforced" — a settings read must never throw, and a
 * missing/unreadable bundle means we simply have no policy to apply.
 */
export async function isSessionLockEnforced(): Promise<boolean> {
  try {
    return getPolicy(await getActiveBundle()).requireSessionLock;
  } catch {
    return false;
  }
}

export async function getSessionLockConfig(): Promise<SessionLockConfig> {
  const [stored, pinHash, timeoutMs, enforced] = await Promise.all([
    sessionLockEnabledItem.getValue(),
    sessionLockPinHashItem.getValue(),
    sessionLockTimeoutItem.getValue(),
    isSessionLockEnforced(),
  ]);
  // Policy wins over the local toggle, so an enforced lock is on for every
  // reader even if a stale `false` is still sitting in storage.
  return { enabled: enforced || stored, pinHash, timeoutMs };
}

/**
 * Turn the lock on or off. Returns false when the change was REFUSED because the
 * team policy pins it on — callers surface that to the member instead of letting
 * a click quietly do nothing.
 */
export async function setSessionLockEnabled(value: boolean): Promise<boolean> {
  if (!value && (await isSessionLockEnforced())) return false;
  await sessionLockEnabledItem.setValue(value);
  return true;
}

/** Save a PIN hash and turn the lock on in one step (no separate enable click). */
export async function setSessionLockPin(pinHash: string): Promise<void> {
  await sessionLockPinHashItem.setValue(pinHash);
  await sessionLockEnabledItem.setValue(true);
}

/**
 * Remove the PIN and disable the lock. Returns false when refused: dropping the
 * PIN would disable an enforced lock through the back door, so the policy has to
 * block this path too, not only the toggle.
 */
export async function clearSessionLockPin(): Promise<boolean> {
  if (await isSessionLockEnforced()) return false;
  await sessionLockPinHashItem.setValue(null);
  await sessionLockEnabledItem.setValue(false);
  return true;
}

export async function recordBlocked(n: number): Promise<void> {
  const current = await blockedCountItem.getValue();
  await blockedCountItem.setValue(current + n);
}

// --- Desktop bridge (SecureIntent desktop agent) ---

/**
 * Off unless the person turns it on.
 *
 * The bridge tells a local agent which host the focused tab is on, so one copy
 * isn't warned about twice. That is website activity leaving the browser, even
 * though it only travels to another process on the same machine, so it is a
 * choice rather than a default — and the agent has to work correctly for the
 * many people who never enable it.
 */
export const bridgeEnabledItem = storage.defineItem<boolean>('local:si_bridge_enabled', {
  fallback: false,
});

export const isBridgeEnabled = () => bridgeEnabledItem.getValue();
export const setBridgeEnabled = (value: boolean) => bridgeEnabledItem.setValue(value);

/**
 * The desktop app's pairing token, copied from its dashboard.
 *
 * Typed in rather than fetched because there is nothing to fetch it from: the
 * desktop's local API exposes only `/health` and `/scan`, `/scan` already needs
 * this token, and neither sends CORS headers — so a browser would discard the
 * response even if a handout existed. The dashboard shows the token and the
 * endpoint side by side, which makes copying it the shortest honest path.
 */
export const bridgeTokenItem = storage.defineItem<string | null>('local:si_bridge_token', {
  fallback: null,
});

export const setBridgeToken = (value: string | null) =>
  bridgeTokenItem.setValue(value?.trim() || null);
