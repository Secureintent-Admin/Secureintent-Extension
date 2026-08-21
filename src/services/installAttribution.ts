import { browser, storage } from '#imports';
import { API_BASE } from '@/lib/api/client';
import { IS_FIREFOX, WEB_APP_URL } from '@/lib/clerkConfig';
import { isConsentAccepted } from '@/lib/consent';
import { siDebug, siError } from '@/lib/debug';

/**
 * Install and uninstall reporting, and which creator link brought this install.
 *
 * The Chrome Web Store passes no referral data to an extension, so an install can
 * never be attributed by the store. What we can do is ask ourselves: the landing
 * page stores the first-touch creator in a cookie on secureintent.ai, and on first
 * run we read that cookie with the `cookies` permission (already granted for the
 * Clerk session) and report it once.
 *
 * This only works when the link click and the install happened in the same browser
 * profile — click on a phone, install on a laptop, and there is no cookie to find.
 * That makes the number a floor, never an over-count.
 *
 * Every install is reported, creator or not: without the organic ones there is no
 * denominator, and no way to tell a quiet week from a broken report. An install
 * with no cookie is simply sent without one.
 *
 * Nothing here touches user data: a creator slug we set ourselves, a random install
 * id, the build's browser and version, and the coarse platform the browser tells us
 * (mac/win/linux). On Chrome it therefore sends as soon as the extension starts, so
 * an install is counted whether or not the user ever gets round to accepting the
 * Terms. Firefox waits for consent, because that build declares
 * `data_collection_permissions: { required: ['none'] }` to AMO and must not send
 * anything ahead of an opt-in.
 *
 * The removal is the other half. MV3 stops the extension the moment it is
 * uninstalled, so nothing of ours can run then — `setUninstallURL` is the whole
 * mechanism: we hand the browser an address now, and it opens it on the way out.
 * See `syncUninstallUrl` below.
 */

const CREATOR_COOKIE = 'si_creator';
const MEDIUM_COOKIE = 'si_creator_medium';
const CAMPAIGN_COOKIE = 'si_creator_campaign';

/** True from install until the report lands (or is found unattributable). */
const pendingItem = storage.defineItem<boolean>('local:si_install_pending', { fallback: false });
/** Stable per-install id, so retries collapse into one row server-side. */
const installIdItem = storage.defineItem<string | null>('local:si_install_id', { fallback: null });
/**
 * What the Worker gave us in exchange for the install report. It goes on the
 * uninstall URL so that ping can be told apart from one anybody could type — the
 * URL is a plain GET with nowhere to put a credential. Not a secret worth
 * protecting: it proves an install existed, nothing more.
 */
const installTokenItem = storage.defineItem<string | null>('local:si_install_token', {
  fallback: null,
});

export type InstallReport = 'sent' | 'not-pending' | 'awaiting-consent' | 'error';

/** Called from `onInstalled` (reason `install`): arm the one-shot report. */
export async function markInstallPending(): Promise<void> {
  await pendingItem.setValue(true);
  if (!(await installIdItem.getValue())) {
    await installIdItem.setValue(crypto.randomUUID());
  }
}

async function readCookie(name: string): Promise<string | null> {
  try {
    const cookie = await browser.cookies.get({ url: WEB_APP_URL, name });
    return cookie?.value?.trim() || null;
  } catch {
    return null; // no permission for this host, or the API is unavailable
  }
}

/** The build's version, or '' if the manifest can't be read. */
function version(): string {
  try {
    return browser.runtime.getManifest().version ?? '';
  } catch {
    return '';
  }
}

/** The coarse platform, or '' where the browser won't say. Never the arch. */
async function platform(): Promise<string> {
  try {
    const info = await browser.runtime.getPlatformInfo();
    return info?.os ?? '';
  } catch {
    return '';
  }
}

/** May the extension talk to us at all yet? Firefox waits for the Terms accept. */
async function mayReport(): Promise<boolean> {
  return !IS_FIREFOX || (await isConsentAccepted());
}

/**
 * Report the install once. Safe to call repeatedly — it no-ops unless a report is
 * pending, and the server is idempotent on the install id. Retries are driven by
 * the existing sync alarm, so an install that happened offline still lands later.
 */
export async function reportInstall(): Promise<InstallReport> {
  if (!(await pendingItem.getValue())) return 'not-pending';
  // Firefox only: hold until the Terms & Privacy accept (see the note above).
  // Nothing is dropped — accepting releases the report, as does the sync alarm.
  if (!(await mayReport())) return 'awaiting-consent';

  const installId = (await installIdItem.getValue()) ?? crypto.randomUUID();
  await installIdItem.setValue(installId);

  // Absent for an organic install, which is most of them. The cookie is written
  // before the install, never after, so a missing one will never turn up later.
  const creator = await readCookie(CREATOR_COOKIE);

  try {
    const res = await fetch(`${API_BASE}/v1/install`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        installId,
        creator,
        medium: creator ? await readCookie(MEDIUM_COOKIE) : null,
        campaign: creator ? await readCookie(CAMPAIGN_COOKIE) : null,
        browser: import.meta.env.BROWSER,
        version: version(),
        os: await platform(),
      }),
    });
    if (!res.ok) {
      // 4xx means the payload will never be accepted — stop. 5xx is transient,
      // so leave it pending for the next alarm.
      if (res.status >= 400 && res.status < 500) await pendingItem.setValue(false);
      siError('install', 'report failed', `HTTP ${res.status}`);
      return 'error';
    }
    const token = (await res.json().catch(() => null))?.token;
    if (typeof token === 'string' && token) await installTokenItem.setValue(token);
    await pendingItem.setValue(false);
    // Now that there is a token, the goodbye ping can carry it.
    await syncUninstallUrl();
    siDebug('install', 'reported', { creator: creator ?? '(organic)' });
    return 'sent';
  } catch (err) {
    siError('install', 'report threw', err); // offline — retry on the next alarm
    return 'error';
  }
}

/**
 * Hand the browser the address to open when the extension is removed.
 *
 * Called on install, at every startup, and after the token lands — the URL has to
 * be registered by a running extension, and by definition none of ours is running
 * at uninstall time. Registering it again is free and keeps it correct across an
 * update that changes the version.
 *
 * On Firefox this stays unset until the Terms are accepted: an address the
 * browser opens is a report, and that build promises AMO it sends nothing before
 * an opt-in. Clearing it is as important as setting it — someone who has not
 * consented must not have a ping armed.
 */
export async function syncUninstallUrl(): Promise<void> {
  const setUrl = browser.runtime.setUninstallURL;
  if (typeof setUrl !== 'function') return; // not supported here
  try {
    const installId = await installIdItem.getValue();
    if (!installId || !(await mayReport())) {
      await browser.runtime.setUninstallURL('');
      return;
    }
    const q = new URLSearchParams({
      id: installId,
      v: version(),
      b: String(import.meta.env.BROWSER ?? ''),
      os: await platform(),
    });
    const token = await installTokenItem.getValue();
    if (token) q.set('t', token);
    await browser.runtime.setUninstallURL(`${API_BASE}/v1/uninstall?${q}`);
  } catch (err) {
    // A missing uninstall ping is a metric, not a feature. Never let it throw
    // into the background's startup path.
    siError('install', 'uninstall URL not set', err);
  }
}
