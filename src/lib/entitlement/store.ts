import { storage } from '#imports';
import type { StoredEntitlement } from './types';

/** Cached signed entitlement (blob + signature). Null until the first refresh. */
export const entitlementItem = storage.defineItem<StoredEntitlement | null>(
  'local:si_entitlement',
  { fallback: null },
);

export const getStoredEntitlement = () => entitlementItem.getValue();
export const setStoredEntitlement = (v: StoredEntitlement | null) => entitlementItem.setValue(v);
