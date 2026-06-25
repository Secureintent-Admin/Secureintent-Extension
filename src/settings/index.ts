import { storage } from '#imports';

export const enabledItem = storage.defineItem<boolean>('local:si_enabled', {
  fallback: true,
});

export const blockedCountItem = storage.defineItem<number>('local:si_blocked_count', {
  fallback: 0,
});

export const isEnabled = () => enabledItem.getValue();
export const setEnabled = (value: boolean) => enabledItem.setValue(value);
export const getBlockedCount = () => blockedCountItem.getValue();

// --- Cloud Console Session Lock ---
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

export async function getSessionLockConfig(): Promise<SessionLockConfig> {
  const [enabled, pinHash, timeoutMs] = await Promise.all([
    sessionLockEnabledItem.getValue(),
    sessionLockPinHashItem.getValue(),
    sessionLockTimeoutItem.getValue(),
  ]);
  return { enabled, pinHash, timeoutMs };
}

/** Save a PIN hash and turn the lock on in one step (no separate enable click). */
export async function setSessionLockPin(pinHash: string): Promise<void> {
  await sessionLockPinHashItem.setValue(pinHash);
  await sessionLockEnabledItem.setValue(true);
}

/** Remove the PIN and disable the lock. */
export async function clearSessionLockPin(): Promise<void> {
  await sessionLockPinHashItem.setValue(null);
  await sessionLockEnabledItem.setValue(false);
}

export async function recordBlocked(n: number): Promise<void> {
  const current = await blockedCountItem.getValue();
  await blockedCountItem.setValue(current + n);
}
