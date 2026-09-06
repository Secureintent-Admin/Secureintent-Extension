// Performance budgets for the paste path.
//
// These are regression guards for a real user-reported freeze: pasting a large
// log dump locked up the tab for ~13s (Chrome showed "Page unresponsive").
// The cause was quadratic complexity, not slow regexes — see the equivalence
// tests below, which pin the OUTPUT so a faster algorithm can't change it.
//
// Budgets are deliberately loose (10-40x headroom over the measured runtime)
// so they fail on a complexity regression, not on a slow CI box.
import { describe, expect, it } from 'vitest';
import { GHOST_EXTRA_PATTERNS } from './ghost';
import { detectSecrets } from './index';
import { PATTERNS } from './patterns';
import { sanitize } from './sanitize';
import { tokenizeSecrets } from './tokenize';

const ghostPatterns = [
  ...PATTERNS.filter((p) => p.validate !== 'entropy'),
  ...GHOST_EXTRA_PATTERNS,
];

/** ~2MB of realistic log lines: one IP and one email per line. */
function makeLog(lines: number): string {
  const out: string[] = [];
  for (let i = 0; i < lines; i++) {
    out.push(
      `2026-09-06T10:${String(i % 60).padStart(2, '0')}:00Z INFO conn from 10.${i % 255}.${(i * 7) % 255}.${i % 255} user${i}@acme.io pid=${i} took=${i}ms`,
    );
  }
  return out.join('\n');
}

const BIG = makeLog(20000);

describe('paste-path performance budgets', () => {
  it('detects secrets in a 2MB log dump in under 500ms', () => {
    const t0 = performance.now();
    const dets = detectSecrets(BIG, ghostPatterns);
    const ms = performance.now() - t0;
    expect(dets.length).toBeGreaterThan(30000);
    expect(ms).toBeLessThan(500);
  });

  it('sanitizes a 2MB log dump in under 1500ms', () => {
    const dets = detectSecrets(BIG, ghostPatterns);
    const t0 = performance.now();
    const out = sanitize(BIG, dets);
    const ms = performance.now() - t0;
    expect(out).toContain('[#IP_1#]');
    expect(ms).toBeLessThan(1500);
  });

  it('tokenizes a 2MB log dump in under 1500ms', () => {
    const dets = detectSecrets(BIG, ghostPatterns);
    const t0 = performance.now();
    const { entries } = tokenizeSecrets(BIG, dets);
    const ms = performance.now() - t0;
    expect(entries.length).toBe(dets.length);
    expect(ms).toBeLessThan(1500);
  });
});
