import { storage } from '#imports';
import { DEFAULT_BUNDLE } from './default';
import type { ConfigBundle } from './types';

export const configItem = storage.defineItem<ConfigBundle | null>('local:si_config', {
  fallback: null,
});
export const lastSyncedItem = storage.defineItem<number>('local:si_config_synced', { fallback: 0 });

export async function getActiveBundle(): Promise<ConfigBundle> {
  return (await configItem.getValue()) ?? DEFAULT_BUNDLE;
}

export async function saveBundle(bundle: ConfigBundle): Promise<void> {
  await configItem.setValue(bundle);
  await lastSyncedItem.setValue(Date.now());
}

export const getLastSynced = () => lastSyncedItem.getValue();
