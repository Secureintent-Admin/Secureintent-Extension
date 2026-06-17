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

export async function recordBlocked(n: number): Promise<void> {
  const current = await blockedCountItem.getValue();
  await blockedCountItem.setValue(current + n);
}
