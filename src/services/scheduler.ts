import { type SyncResult, syncConfig } from './configService';

export const SYNC_ALARM = { name: 'si-config-sync', periodInMinutes: 120 };

export async function handleRefreshMessage(msg: unknown): Promise<SyncResult | null> {
  if (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: string }).type === 'si-refresh-config'
  ) {
    return syncConfig();
  }
  return null;
}
