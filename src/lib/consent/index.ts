import { storage } from '#imports';

/**
 * Terms & Privacy consent. Blocking: until the user accepts the current version,
 * the paste guard shows a consent gate on the first warning and the popup shows
 * a consent screen. Stored in `sync` so it follows the user's Chrome profile
 * across devices. Bump TERMS_VERSION to re-prompt everyone after a terms change.
 */
export const TERMS_VERSION = 1;

export const TOS_URL = 'https://secureintent.ai/tos';
export const PRIVACY_URL = 'https://secureintent.ai/privacy';

export interface ConsentRecord {
  version: number;
  acceptedAt: number; // epoch ms
}

export const consentItem = storage.defineItem<ConsentRecord | null>('sync:si_terms_consent', {
  fallback: null,
});

/** Pure check: is this stored consent record valid for the current terms version? */
export function consentSatisfied(record: ConsentRecord | null, version = TERMS_VERSION): boolean {
  return record != null && record.version >= version;
}

/** Has the user accepted the current Terms & Privacy version? */
export async function isConsentAccepted(): Promise<boolean> {
  return consentSatisfied(await consentItem.getValue());
}

/** Record acceptance of the current terms version. */
export async function acceptTerms(nowMs = Date.now()): Promise<void> {
  await consentItem.setValue({ version: TERMS_VERSION, acceptedAt: nowMs });
}
