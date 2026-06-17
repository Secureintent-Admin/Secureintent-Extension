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
    label: 'Internal IP',
    // RFC 1918 private ranges only: 10/8, 172.16–31/12, 192.168/16.
    regex:
      /\b(?:10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2})\b/g,
  },
  {
    type: 'pii',
    label: 'Email address',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
];

/** Pastes at least this many characters take the Ghost (aggressive) path. */
export const GHOST_MIN_CHARS = 2000;
