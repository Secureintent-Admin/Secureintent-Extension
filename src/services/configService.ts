import { getJson } from '@/lib/api/client';
import { configItem, saveBundle } from '@/lib/config/store';
import type { ConfigBundle } from '@/lib/config/types';
import { validateBundle } from '@/lib/config/validate';
import { verifyBundle } from '@/lib/config/verify';

export interface SyncResult {
  status: 'updated' | 'unchanged' | 'error';
  version?: number;
  error?: string;
}

export async function syncConfig(): Promise<SyncResult> {
  try {
    const { bundle, signature } = await getJson<{ bundle: unknown; signature: string | null }>(
      '/v1/config',
    );
    if (!validateBundle(bundle)) return { status: 'error', error: 'invalid bundle' };

    const incoming = bundle as ConfigBundle;
    if (!(await verifyBundle(JSON.stringify(incoming), signature))) {
      return { status: 'error', error: 'signature verification failed' };
    }

    const current = await configItem.getValue();
    if (current && incoming.version <= current.version) {
      return { status: 'unchanged', version: current.version };
    }
    await saveBundle(incoming);
    return { status: 'updated', version: incoming.version };
  } catch (e) {
    return { status: 'error', error: e instanceof Error ? e.message : String(e) };
  }
}
