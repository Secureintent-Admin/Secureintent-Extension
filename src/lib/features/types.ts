import type { Detection } from '@/lib/detection';

/**
 * Open-core seam.
 *
 * Premium ("pro") code lives in a private repo and plugs into the free
 * extension through this registry — it never edits free internals, so free
 * updates flow into pro without merge conflicts.
 *
 * Privacy invariant: hooks receive detection *metadata* only (counts, types,
 * labels). Raw clipboard text and the matched secret substrings are
 * deliberately withheld — they never leave the device, not even to pro code.
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
