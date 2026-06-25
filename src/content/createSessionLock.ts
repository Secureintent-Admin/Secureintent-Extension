import { type ContentScriptContext, storage } from '#imports';
import { siDebug, siError } from '@/lib/debug';
import { getOrCreateSalt, type KeyValueStore } from '@/lib/fingerprint';
import { verifyPin } from '@/lib/lock';
import { type LockWarningHandle, mountLockWarning } from '@/overlay/mountLockWarning';
import { mountSessionLock, type SessionLockHandle } from '@/overlay/mountSessionLock';
import { getSessionLockConfig } from '@/settings';

const browserStore: KeyValueStore = {
  get: async (key) => (await storage.getItem<string>(`local:${key}`)) ?? undefined,
  set: (key, value) => storage.setItem(`local:${key}`, value),
};

// Per-tab locked flag in the page's own sessionStorage: survives a reload in the
// same tab (so a refresh can't bypass the lock) and clears when the tab closes.
const LOCKED_FLAG = 'si_session_locked';
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const;

/**
 * Cloud Console Session Lock. After inactivity (or on tab-away), covers a
 * high-risk console with a PIN gate. A walk-away deterrent — fails open on error.
 */
export async function createSessionLock(ctx: ContentScriptContext): Promise<void> {
  try {
    const { enabled, pinHash, timeoutMs } = await getSessionLockConfig();
    if (!enabled || !pinHash) {
      siDebug('session-lock', 'inert', { enabled, hasPin: Boolean(pinHash) });
      return; // inert until configured
    }
    siDebug('session-lock', 'active', { host: location.host, timeoutMs });

    const salt = await getOrCreateSalt(browserStore);
    // Warn this long before locking (a countdown toast), capped so short timeouts
    // still get a warning phase.
    const warnMs = Math.min(10_000, Math.floor(timeoutMs / 2));

    let locked = false;
    let handle: SessionLockHandle | null = null;
    let warnHandle: LockWarningHandle | null = null;
    let warnTimer: ReturnType<typeof setTimeout> | undefined;
    let lockTimer: ReturnType<typeof setTimeout> | undefined;
    let lastActivity = 0;

    const dismissWarning = () => {
      warnHandle?.remove();
      warnHandle = null;
      clearTimeout(lockTimer);
    };

    const arm = () => {
      clearTimeout(warnTimer);
      dismissWarning();
      if (!locked) warnTimer = setTimeout(() => void warn(), timeoutMs - warnMs);
    };

    const warn = async () => {
      if (locked || warnHandle) return;
      lockTimer = setTimeout(() => void lock(), warnMs);
      warnHandle = await mountLockWarning(ctx, { seconds: Math.round(warnMs / 1000) });
    };

    const unlock = () => {
      locked = false;
      handle?.remove();
      handle = null;
      try {
        sessionStorage.removeItem(LOCKED_FLAG);
      } catch {}
      arm();
    };

    const lock = async () => {
      if (locked) return;
      locked = true;
      clearTimeout(warnTimer);
      dismissWarning();
      try {
        sessionStorage.setItem(LOCKED_FLAG, '1');
      } catch {}
      handle = await mountSessionLock(ctx, {
        onUnlock: async (pin) => {
          if (!(await verifyPin(pin, salt, pinHash))) return false;
          unlock();
          return true;
        },
      });
      siDebug('session-lock', 'locked');
    };

    const onActivity = () => {
      if (locked) return;
      const now = Date.now();
      if (now - lastActivity < 1000) return; // throttle resets
      lastActivity = now;
      arm(); // also dismisses any showing warning
    };
    for (const ev of ACTIVITY_EVENTS) {
      document.addEventListener(ev, onActivity, { passive: true, capture: true });
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void lock();
    });

    // Restore a lock that was active before a reload; otherwise start the timer.
    if (sessionStorage.getItem(LOCKED_FLAG) === '1') await lock();
    else arm();
  } catch (err) {
    siError('session-lock', 'init failed', err);
  }
}
