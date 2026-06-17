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

function newTokenId(): string {
  const buf = new Uint8Array(4);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Replace each detected secret with a unique, copy-safe token and return the
 * `token → secret` mapping for the vault. Pure: no DOM, no async, no storage.
 *
 * Tokens use Unicode math brackets (`⟦⟧`) so they are extremely unlikely to
 * collide with real code and survive a round-trip through an LLM verbatim.
 * Detections are spliced right-to-left so earlier offsets stay valid (assumes
 * non-overlapping detections, as produced by `detectSecrets`).
 */
export function tokenizeSecrets(text: string, detections: Detection[]): TokenizeResult {
  if (detections.length === 0) return { text, entries: [] };

  const ordered = [...detections].sort((a, b) => b.start - a.start);
  const entries: VaultEntry[] = [];
  let out = text;
  for (const d of ordered) {
    const token = `⟦SI:${newTokenId()}⟧`;
    out = out.slice(0, d.start) + token + out.slice(d.end);
    entries.push({ token, secret: d.match });
  }
  return { text: out, entries };
}
