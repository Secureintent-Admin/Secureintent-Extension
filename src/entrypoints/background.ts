import { browser, defineBackground } from '#imports';
import { bumpBadge, clearBadge } from '@/lib/badge';
import { allowVaultInContentScripts } from '@/lib/vault';
import { syncConfig } from '@/services/configService';
import { handleRefreshMessage, SYNC_ALARM } from '@/services/scheduler';

export default defineBackground(() => {
  // Let content scripts read/write the rehydration vault in storage.session.
  allowVaultInContentScripts(browser.storage.session);
  syncConfig();
  browser.alarms.create(SYNC_ALARM.name, { periodInMinutes: SYNC_ALARM.periodInMinutes });
  browser.alarms.onAlarm.addListener((a) => {
    if (a.name === SYNC_ALARM.name) syncConfig();
  });
  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // Per-tab badge: a content script reports how many secrets it just caught.
    if ((msg as { type?: string })?.type === 'si-detected' && sender.tab?.id != null) {
      bumpBadge(sender.tab.id, (msg as { count?: number }).count ?? 1);
      return false; // no async response needed
    }
    handleRefreshMessage(msg).then(sendResponse);
    return true; // keep the message channel open for the async response
  });
  // Reset a tab's badge count when it navigates to a new page.
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') clearBadge(tabId);
  });
});
