import type { Detection } from './types';

/** A `token → secret` pair to be held in the vault for later rehydration. */
export interface VaultEntry {
  token: string;
  secret: string;
}

export interface TokenizeResult {
  text: string;
  entries: VaultEntry[];
}

/** Matches a single rehydration token, e.g. `⟦SI:a1b2c3d4⟧`. */
export const TOKEN_RE = /⟦SI:[0-9a-f]{8}⟧/;

const HEX = '0123456789abcdef';

/**
 * `count` token ids in one go. One `getRandomValues` call for the whole paste
 * rather than one per finding: the per-call overhead dominated on large Ghost
 * pastes (40k findings ≈ 6s of the old runtime). Same 4-byte/8-hex-char id.
 */
function newTokenIds(count: number): string[] {
  const buf = new Uint8Array(count * 4);
  // getRandomValues rejects any view longer than 65,536 bytes, so fill in
  // chunks. A large Ghost paste needs far more than one call's worth.
  const MAX_BYTES = 65536;
  for (let o = 0; o < buf.length; o += MAX_BYTES) {
    crypto.getRandomValues(buf.subarray(o, Math.min(o + MAX_BYTES, buf.length)));
  }
  const ids: string[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    ids[i] =
      HEX[buf[o] >> 4] +
      HEX[buf[o] & 15] +
      HEX[buf[o + 1] >> 4] +
      HEX[buf[o + 1] & 15] +
      HEX[buf[o + 2] >> 4] +
      HEX[buf[o + 2] & 15] +
      HEX[buf[o + 3] >> 4] +
      HEX[buf[o + 3] & 15];
  }
  return ids;
}

/**
 * Replace each detected secret with a unique, copy-safe token and return the
 * `token → secret` mapping for the vault. Pure: no DOM, no async, no storage.
 *
 * Tokens use Unicode math brackets (`⟦⟧`) so they are extremely unlikely to
 * collide with real code and survive a round-trip through an LLM verbatim.
 * Entries are returned newest-offset-first (descending by `start`), which is the
 * order the vault has always received them in.
 */
export function tokenizeSecrets(text: string, detections: Detection[]): TokenizeResult {
  if (detections.length === 0) return { text, entries: [] };

  const ordered = [...detections].sort((a, b) => b.start - a.start);
  const ids = newTokenIds(ordered.length);
  const entries: VaultEntry[] = ordered.map((d, i) => ({
    token: `⟦SI:${ids[i]}⟧`,
    secret: d.match,
  }));

  // Walk `ordered` backwards (i.e. ascending by offset) and emit spans into an
  // array, joined once. Splicing the whole string per finding is quadratic and
  // froze the tab on large pastes; the entry order above is unchanged.
  const parts: string[] = [];
  let cursor = 0;
  for (let i = ordered.length - 1; i >= 0; i--) {
    const d = ordered[i];
    // detectSecrets resolves overlaps before we get here; this only guards
    // against a caller passing an overlapping set.
    if (d.start < cursor) continue;
    parts.push(text.slice(cursor, d.start), entries[i].token);
    cursor = d.end;
  }
  parts.push(text.slice(cursor));
  return { text: parts.join(''), entries };
}
