// keep in sync with backend/src/lib/configBundle.ts
import type { SecretType } from '../detection';

export interface BundlePattern {
  type: SecretType;
  label: string;
  regex: string;
  flags?: string;
  validate?: string; // optional post-match validator name (e.g. 'card')
}
export interface BundleSite {
  inputSelector: string;
}
export interface ConfigBundle {
  version: number;
  patterns: BundlePattern[];
  sites: Record<string, BundleSite>;
  killSwitch: boolean;
  // pilot mode: run entropy patterns (catches more, noisier). Off = standard tuning.
  aggressive?: boolean;
  // Ghost Sanitizer tuning. minChars: pastes at least this large take the
  // aggressive expanded-detection path. Omitted → built-in GHOST_MIN_CHARS.
  ghost?: { minChars?: number };
}
