import { browser, defineBackground } from '#imports';
import { bumpBadge, clearBadge } from '@/lib/badge';
import { TIERS_URL } from '@/lib/clerkConfig';
import { isConsentAccepted } from '@/lib/consent';
import { allowVaultInContentScripts } from '@/lib/vault';
import { syncConfig } from '@/services/configService';
import {
  consumeUsage,
  enforceEntitlementBinding,
  getUsageStatus,
  openCheckout,
  refreshEntitlementBg,
} from '@/services/entitlementBackground';
import { handleRefreshMessage, SYNC_ALARM } from '@/services/scheduler';

const WELCOME_URL = '/welcome.html';

/** Toolbar "!" badge nag while the user hasn't accepted the Terms & Privacy. */
async function updateConsentBadge() {
  if (await isConsentAccepted()) {
    browser.action.setBadgeText({ text: '' });
    return;
  }
  browser.action.setBadgeText({ text: '!' });
  browser.action.setBadgeBackgroundColor({ color: '#ff6b6b' });
}

export default defineBackground(() => {
  // First install → open the welcome/consent page. Any startup → refresh the
  // consent badge (nag until Terms & Privacy are accepted).
  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      browser.tabs.create({ url: browser.runtime.getURL(WELCOME_URL) }).catch(() => {});
    }
    updateConsentBadge();
  });
  updateConsentBadge();

  // Auto-sync entitlement on sign-in / sign-out. Clerk mirrors the web-app
  // session into extension storage; when those keys change we refresh the cached
  // entitlement (and re-check binding). Content scripts watch the entitlement
  // item, so their gating updates live — no popup open or manual refresh needed.
  let entRefreshTimer: ReturnType<typeof setTimeout> | undefined;
  browser.storage.onChanged.addListener((changes) => {
    if (!Object.keys(changes).some((k) => k.toLowerCase().includes('clerk'))) return;
    clearTimeout(entRefreshTimer);
    entRefreshTimer = setTimeout(() => {
      refreshEntitlementBg().then(() => enforceEntitlementBinding());
    }, 500); // debounce Clerk's burst of session writes
  });

  // Let content scripts read/write the rehydration vault in storage.session.
  allowVaultInContentScripts(browser.storage.session);
  syncConfig();
  // Sync plan on startup, then drop any cached entitlement that isn't for the
  // currently signed-in user (a signed blob is otherwise portable between installs).
  refreshEntitlementBg().then(() => enforceEntitlementBinding());
  browser.alarms.create(SYNC_ALARM.name, { periodInMinutes: SYNC_ALARM.periodInMinutes });
  browser.alarms.onAlarm.addListener((a) => {
    if (a.name === SYNC_ALARM.name) {
      syncConfig();
      refreshEntitlementBg().then(() => enforceEntitlementBinding()); // ride the existing 2h alarm
    }
  });
  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const type = (msg as { type?: string })?.type;
    // Per-tab badge: a content script reports how many secrets it just caught.
    if (type === 'si-detected' && sender.tab?.id != null) {
      bumpBadge(sender.tab.id, (msg as { count?: number }).count ?? 1);
      return false; // no async response needed
    }
    // Overlay/popup asked to start a Paddle checkout.
    if (type === 'si-open-checkout') {
      openCheckout();
      return false;
    }
    // Upgrade CTA → open the pricing / tiers section on the web app.
    if (type === 'si-open-tiers') {
      browser.tabs.create({ url: TIERS_URL }).catch(() => {});
      return false;
    }
    // User accepted Terms & Privacy (welcome page or popup) → clear the nag badge.
    if (type === 'si-consent-accepted') {
      updateConsentBadge();
      return false;
    }
    // Anonymise & Paste quota (signed-in users): status + consume via the Worker.
    if (type === 'si-quota-status') {
      getUsageStatus().then(sendResponse);
      return true;
    }
    if (type === 'si-quota-consume') {
      consumeUsage().then(sendResponse);
      return true;
    }
    // Popup asked to refresh the entitlement (e.g. after sign-in / returning from checkout).
    if (type === 'si-refresh-entitlement') {
      refreshEntitlementBg()
        .then((r) => enforceEntitlementBinding().then(() => r))
        .then(sendResponse);
      return true;
    }
    handleRefreshMessage(msg).then(sendResponse);
    return true; // keep the message channel open for the async response
  });
  // Reset a tab's badge count when it navigates to a new page.
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') clearBadge(tabId);
  });
});
