import type { Pattern } from './patterns';

/**
 * Ghost Sanitizer — the expanded ruleset for large log/terminal pastes.
 *
 * These patterns are deliberately NOT part of the conservative catalog the
 * normal paste guard uses: emails and internal IPs are far too common in
 * ordinary chat messages to flag there. They only run when a paste is large
 * enough to look like a log dump (see GHOST_MIN_CHARS), where aggressive
 * stripping is the desired behaviour.
 */
export const GHOST_EXTRA_PATTERNS: Pattern[] = [
  {
    type: 'pii',
    label: 'IP address',
    // Any valid IPv4 (each octet 0–255), public or private. Boundaries use
    // digit/dot lookarounds rather than \b, so IPs glued to following text in
    // flattened logs (e.g. "10.0.0.1Installed", "10.20.2.231VDOM") are caught.
    regex:
      /(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?![\d.])/g,
  },
  {
    type: 'pii',
    label: 'Email address',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
];

/** Pastes at least this many characters take the Ghost (aggressive) path. */
export const GHOST_MIN_CHARS = 2000;
