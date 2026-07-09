import { browser, defineBackground } from '#imports';
import { bumpBadge, clearBadge } from '@/lib/badge';
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

export default defineBackground(() => {
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
