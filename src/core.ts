/**
 * Internal API barrel: groups the reusable guard, overlay, config, and detection
 * exports in one place. There is no open-core split — the extension is a single
 * build with free and paid tiers (paid features gated at runtime by a signed
 * entitlement; see `src/lib/entitlement/`). This barrel is a convenience seam,
 * not an external package.
 */

// Build on top of the paste guard.
export { createPasteGuard } from '@/content/createPasteGuard';
export type { SiteConfig } from '@/content/types';
export type { ConfigBundle } from '@/lib/config';
export { DEFAULT_BUNDLE, getActiveBundle } from '@/lib/config';
export type { Detection, SecretType } from '@/lib/detection';
export { compilePatterns, detectSecrets, redact } from '@/lib/detection';
export type { ActionContext, DetectionContext, Feature } from '@/lib/features';
// Premium plug-in points.
export { registerFeature } from '@/lib/features';
// Reusable building blocks for pro entrypoints.
export { mountOverlay } from '@/overlay/mount';
export type { OverlayAction, OverlayProps } from '@/overlay/Overlay';
