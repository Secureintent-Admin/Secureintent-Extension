import { verifyBundle } from '@/lib/config/verify';
import { entitlementItem } from './store';
import {
  type ActiveEntitlement,
  type FeatureKey,
  FREE_ENTITLEMENT,
  type SignedEntitlement,
  type StoredEntitlement,
} from './types';

export type { ActiveEntitlement, FeatureKey, SignedEntitlement, StoredEntitlement };
export { entitlementItem, FREE_ENTITLEMENT };

/**
 * Pure evaluation: given a (possibly signature-valid) blob and the current time,
 * decide what is unlocked. An invalid signature or an expired blob → free.
 * Crypto verification is done by the caller and passed in as `signatureValid`.
 *
 * `expectedUserId` binds the blob to a Clerk user: a valid signature only proves
 * the Worker issued the blob, not that it belongs to *this* install. When an id
 * is supplied (a string, or null when signed out) and it doesn't match
 * `blob.clerkUserId`, the entitlement is rejected — this stops a signed pro blob
 * from being copied into another install. Omit it (undefined) to skip the check
 * in contexts without access to the live session (e.g. content scripts, which
 * instead rely on the background enforcer clearing a mismatch).
 */
export function evaluateBlob(
  blob: SignedEntitlement,
  nowSec: number,
  signatureValid: boolean,
  expectedUserId?: string | null,
): ActiveEntitlement {
  if (!signatureValid || blob.exp <= nowSec) return FREE_ENTITLEMENT;
  if (expectedUserId !== undefined && blob.clerkUserId !== expectedUserId) return FREE_ENTITLEMENT;
  return {
    plan: blob.plan,
    pro: blob.pro,
    features: blob.features,
    source: blob.source,
    businessDomain: blob.businessDomain ?? null,
  };
}

/** Verify the stored blob's signature, then evaluate it. Defaults to free. */
export async function evaluateStored(
  stored: StoredEntitlement | null,
  nowSec: number,
  expectedUserId?: string | null,
): Promise<ActiveEntitlement> {
  if (!stored) return FREE_ENTITLEMENT;
  // Verify against the exact signed payload when present; fall back to a
  // re-stringify only for values cached before `payload` was stored.
  const payload = stored.payload ?? JSON.stringify(stored.blob);
  const valid = await verifyBundle(payload, stored.signature);
  return evaluateBlob(stored.blob, nowSec, valid, expectedUserId);
}

/**
 * Read + verify + evaluate the persisted entitlement. Pass `expectedUserId` to
 * bind it to the currently signed-in user (background/popup); omit it in
 * content scripts.
 */
export async function getActiveEntitlement(
  expectedUserId?: string | null,
): Promise<ActiveEntitlement> {
  const stored = await entitlementItem.getValue();
  return evaluateStored(stored, Math.floor(Date.now() / 1000), expectedUserId);
}

// --- Synchronous cache for content-script hot paths (mirrors the `enabled` flag) ---

/** User-context snapshot read synchronously by the telemetry hot path. */
export interface EntitlementSnapshot {
  plan: ActiveEntitlement['plan'];
  source: ActiveEntitlement['source'];
  pro: boolean;
  signedIn: boolean;
  businessDomain: string | null;
}

const FREE_SNAPSHOT: EntitlementSnapshot = {
  plan: 'developer',
  source: 'none',
  pro: false,
  signedIn: false,
  businessDomain: null,
};

let cachedFeatures = new Set<string>();
let cachedSnapshot: EntitlementSnapshot = FREE_SNAPSHOT;

async function computeCache(): Promise<{ features: Set<string>; snapshot: EntitlementSnapshot }> {
  const stored = await entitlementItem.getValue();
  const ent = await evaluateStored(stored, Math.floor(Date.now() / 1000));
  return {
    features: new Set(ent.features),
    // signedIn: any stored blob means the user authenticated (even on the free tier).
    snapshot: {
      plan: ent.plan,
      source: ent.source,
      pro: ent.pro,
      signedIn: stored !== null,
      businessDomain: ent.businessDomain,
    },
  };
}

/**
 * Prime the in-memory caches and keep them fresh as the entitlement changes.
 * Call once at content-script boot. Returns a stop() to remove the watcher.
 */
export async function initEntitlementCache(): Promise<() => void> {
  const c = await computeCache();
  cachedFeatures = c.features;
  cachedSnapshot = c.snapshot;
  return entitlementItem.watch(async () => {
    const next = await computeCache();
    cachedFeatures = next.features;
    cachedSnapshot = next.snapshot;
  });
}

/** Synchronous gate for the paste/lock hot paths. Reads the primed cache. */
export function hasFeatureCached(key: FeatureKey): boolean {
  return cachedFeatures.has(key);
}

/** Synchronous user-context snapshot for telemetry. Reads the primed cache. */
export function getEntitlementSnapshot(): EntitlementSnapshot {
  return cachedSnapshot;
}

/** Async one-shot gate (popup / non-hot paths). */
export async function hasFeature(key: FeatureKey): Promise<boolean> {
  return (await getActiveEntitlement()).features.includes(key);
}
