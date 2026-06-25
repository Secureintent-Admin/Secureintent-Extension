import { computeFingerprint, type Salt } from '@/lib/fingerprint';

/**
 * Session-lock PIN hashing. Reuses the per-install salt + SHA-256 from the
 * fingerprint module so the PIN is never stored in plaintext. A captured hash is
 * useless without the on-device salt.
 */
export async function hashPin(pin: string, salt: Salt): Promise<string> {
  return computeFingerprint(pin, salt);
}

export async function verifyPin(pin: string, salt: Salt, hash: string): Promise<boolean> {
  return (await hashPin(pin, salt)) === hash;
}
