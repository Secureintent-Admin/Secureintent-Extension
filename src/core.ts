/**
 * Public API surface for the open-core seam.
 *
 * The free extension is published from this barrel as `@secureintent/core`.
 * The private "pro" repo imports from here to reuse the guard, overlay, and
 * config plumbing, and registers premium behaviour via `registerFeature`.
 *
 * Keep this file's exports stable and semver'd — pro depends on them. Internal
 * modules can be refactored freely as long as this surface holds.
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
