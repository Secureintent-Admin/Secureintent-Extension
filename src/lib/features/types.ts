import type { Detection } from '@/lib/detection';

/**
 * Feature-hook registry.
 *
 * Optional features plug into the paste guard through this registry instead of
 * editing the guard directly. (Single build, free + paid tiers — there is no
 * separate repo; paid features are gated at runtime by a signed entitlement.)
 *
 * Privacy invariant: hooks receive detection *metadata* only (counts, types,
 * labels). Raw clipboard text and the matched secret substrings are
 * deliberately withheld — they never leave the device, not even to a feature.
 */
export interface DetectionContext {
  site: string;
  siteKey: string;
  detectionCount: number;
  types: Detection['type'][];
  labels: string[];
}

export interface ActionContext extends DetectionContext {
  action: 'paste' | 'redact' | 'cancel' | 'sanitize';
}

export interface Feature {
  /** Stable identifier, used in error logs. */
  name: string;
  /** Fired when secrets are detected in a paste, before the overlay shows. */
  onDetections?(ctx: DetectionContext): void | Promise<void>;
  /** Fired after the user resolves the overlay. */
  onAction?(ctx: ActionContext): void | Promise<void>;
}
