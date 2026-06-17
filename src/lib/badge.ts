import { browser } from '#imports';

// Action-icon badge showing how many secrets were intercepted on the current tab.
export const BADGE_BG = '#72ffff'; // Intent Cyan
export const BADGE_FG = '#052656'; // Secure navy

// Pure: the next badge text given the current text and an increment. Empty string
// hides the badge (count 0).
export function nextBadgeText(current: string, add: number): string {
  const next = (Number.parseInt(current, 10) || 0) + add;
  return next > 0 ? String(next) : '';
}

// Add `add` detections to a tab's badge. Reads the existing badge text so the count
// survives service-worker restarts (the browser persists per-tab badge state).
export async function bumpBadge(tabId: number, add: number): Promise<void> {
  const current = await browser.action.getBadgeText({ tabId });
  await browser.action.setBadgeText({ tabId, text: nextBadgeText(current, add) });
  await browser.action.setBadgeBackgroundColor({ tabId, color: BADGE_BG });
  await browser.action.setBadgeTextColor?.({ tabId, color: BADGE_FG });
}

export function clearBadge(tabId: number): Promise<void> {
  return browser.action.setBadgeText({ tabId, text: '' });
}
