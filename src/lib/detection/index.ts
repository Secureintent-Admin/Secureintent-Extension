import type { Pattern } from './patterns';
import { PATTERNS, TYPE_RANK } from './patterns';
import type { Detection } from './types';
import { validateMatch } from './validators';

export { compilePatterns, type RawPattern } from './compile';
export { GHOST_EXTRA_PATTERNS, GHOST_MIN_CHARS } from './ghost';
export { locateInText, type SecretLocation } from './locate';
export { redact } from './redact';
export { type GhostSummary, sanitize, summarize } from './sanitize';
export { TOKEN_RE, type TokenizeResult, tokenizeSecrets, type VaultEntry } from './tokenize';
export type { Detection, SecretType } from './types';

function overlaps(a: Detection, b: Detection): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * True when the match sits inside a URL — its surrounding whitespace-delimited
 * token carries a scheme (`https://…`) or a `domain.tld/path`. High-entropy path
 * segments (Loom share ids, Google Drive file ids, …) are links, not secrets, so
 * entropy hits there are skipped to cut false positives. Specific key patterns
 * (gh*_, AIza…) are unaffected — a real key in a URL is still flagged.
 */
function inUrl(text: string, start: number, end: number): boolean {
  let l = start;
  while (l > 0 && !/\s/.test(text[l - 1])) l--;
  let r = end;
  while (r < text.length && !/\s/.test(text[r])) r++;
  const token = text.slice(l, r);
  return token.includes('://') || /[a-z0-9.-]+\.[a-z]{2,}\/\S/i.test(token);
}

/**
 * Scan text for secrets using the pattern catalog. Pure: no DOM, no async.
 * Overlapping matches are resolved by specificity (private-key > known-key >
 * env-credential, then longer match wins). Returns detections sorted by start.
 */
export function detectSecrets(text: string, patterns: Pattern[] = PATTERNS): Detection[] {
  const raw: Detection[] = [];

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      if (m[0].length === 0) {
        regex.lastIndex++; // guard against zero-width loops
        continue;
      }
      if (validateMatch(pattern.validate, m[0])) {
        // Generic entropy hits inside a URL are link ids (Loom/Drive/…), not secrets.
        if (pattern.validate === 'entropy' && inUrl(text, m.index, m.index + m[0].length)) {
          continue;
        }
        raw.push({
          type: pattern.type,
          label: pattern.label,
          match: m[0],
          start: m.index,
          end: m.index + m[0].length,
        });
      }
    }
  }

  // Resolve overlaps: prefer higher rank, then longer match.
  raw.sort((a, b) => {
    const rank = TYPE_RANK[b.type] - TYPE_RANK[a.type];
    if (rank !== 0) return rank;
    return b.end - b.start - (a.end - a.start);
  });

  const kept: Detection[] = [];
  for (const det of raw) {
    if (!kept.some((k) => overlaps(k, det))) kept.push(det);
  }

  return kept.sort((a, b) => a.start - b.start);
}
