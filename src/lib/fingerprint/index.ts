import type { Fingerprint, Salt } from './types';

export type { KeyValueStore } from './salt';
export { getOrCreateSalt } from './salt';
export type { Fingerprint, Salt } from './types';

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function computeFingerprint(secret: string, salt: Salt): Promise<Fingerprint> {
  const data = new TextEncoder().encode(salt + secret);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(digest) as Fingerprint;
}
