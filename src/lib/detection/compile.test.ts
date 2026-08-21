import { describe, expect, test } from 'vitest';
import { DEFAULT_BUNDLE } from '@/lib/config/default';
import type { BundlePattern } from '@/lib/config/types';
import { compilePatterns } from './compile';
import { detectSecrets } from './index';

describe('compilePatterns', () => {
  test('compiles bundle string-regex patterns and detects with them', () => {
    const compiled = compilePatterns([
      { type: 'known-key', label: 'OpenAI API key', regex: 'sk-[A-Za-z0-9]{10,}' },
    ]);
    const hits = detectSecrets('here sk-abcdefghij1234 end', compiled);
    expect(hits).toHaveLength(1);
    expect(hits[0].label).toBe('OpenAI API key');
  });
  test('skips invalid regex strings without throwing', () => {
    const compiled = compilePatterns([{ type: 'known-key', label: 'bad', regex: '(' }]);
    expect(compiled).toHaveLength(0);
  });
});

/**
 * Team-authored patterns (Business tier). The Worker merges an admin's patterns
 * into `bundle.patterns` and marks ONLY those with `origin: 'team'`; the default
 * catalogue ships with no `origin` key at all. These tests pin both halves: the
 * marker survives compile → detect, and the default catalogue is untouched.
 */
describe('compilePatterns — pattern origin', () => {
  test("carries a team pattern's origin through to the compiled pattern", () => {
    const [p] = compilePatterns([
      { type: 'known-key', label: 'Acme token', regex: 'ACME-[A-Z0-9]{6}', origin: 'team' },
    ]);
    expect(p.origin).toBe('team');
  });

  test('a default-catalogue pattern compiles with no origin key at all', () => {
    const compiled = compilePatterns(DEFAULT_BUNDLE.patterns);
    expect(compiled.length).toBe(DEFAULT_BUNDLE.patterns.length);
    expect(compiled.every((p) => !('origin' in p))).toBe(true);
  });

  test('an explicit origin: "default" is carried verbatim (and is not "team")', () => {
    const [p] = compilePatterns([
      { type: 'known-key', label: 'Ours', regex: 'ACME-[A-Z0-9]{6}', origin: 'default' },
    ]);
    expect(p.origin).toBe('default');
  });

  test('a malformed team regex is dropped without taking the catalogue with it', () => {
    const compiled = compilePatterns([
      ...DEFAULT_BUNDLE.patterns,
      { type: 'known-key', label: 'Broken team rule', regex: '([', origin: 'team' },
    ]);
    expect(compiled.length).toBe(DEFAULT_BUNDLE.patterns.length);
    expect(compiled.some((p) => p.label === 'Broken team rule')).toBe(false);
  });
});

/**
 * The end-to-end question the owner asked: with a real bundle (defaults + a
 * team's own pattern), does each side actually detect, and does the finding say
 * where its rule came from?
 */
describe('detectSecrets — defaults and team patterns together', () => {
  const TEAM_PATTERN: BundlePattern = {
    type: 'known-key',
    label: 'Acme internal token',
    regex: 'ACME-[A-Z0-9]{12}',
    origin: 'team',
  };
  // Exactly what /v1/config serves a team member: the global catalogue with the
  // team's own patterns appended.
  const teamBundlePatterns: BundlePattern[] = [...DEFAULT_BUNDLE.patterns, TEAM_PATTERN];
  const patterns = compilePatterns(teamBundlePatterns);

  const DEFAULT_SECRET = 'AKIAIOSFODNN7EXAMPLE'; // AWS access key ID, default catalogue
  const TEAM_SECRET = 'ACME-4F2K9Z7Q1B3D'; // only the team's rule knows this shape

  test('(a) a paste with only a default-catalogue secret is detected, with no origin', () => {
    const dets = detectSecrets(`deploy with ${DEFAULT_SECRET} today`, patterns);
    expect(dets).toHaveLength(1);
    expect(dets[0].label).toBe('AWS access key ID');
    expect(dets[0].match).toBe(DEFAULT_SECRET);
    expect(dets[0].origin).toBeUndefined();
    expect('origin' in dets[0]).toBe(false); // absent, not undefined-valued
  });

  test("(b) a paste with only a team-pattern match is detected and marked 'team'", () => {
    const dets = detectSecrets(`deploy with ${TEAM_SECRET} today`, patterns);
    expect(dets).toHaveLength(1);
    expect(dets[0].label).toBe('Acme internal token');
    expect(dets[0].match).toBe(TEAM_SECRET);
    expect(dets[0].origin).toBe('team');
  });

  test('(c) a paste with both reports both findings, each with its own origin', () => {
    const text = `aws ${DEFAULT_SECRET} then acme ${TEAM_SECRET} end`;
    const dets = detectSecrets(text, patterns);
    expect(dets).toHaveLength(2);
    // Sorted by position in the text, as always.
    expect(dets.map((d) => d.label)).toEqual(['AWS access key ID', 'Acme internal token']);
    expect(dets.map((d) => d.origin)).toEqual([undefined, 'team']);
    for (const d of dets) expect(text.slice(d.start, d.end)).toBe(d.match);
  });

  test('the team pattern alone (replaceDefaultPatterns) still detects, and defaults then do not', () => {
    // `replaceDefaultPatterns` is resolved server-side: the client just receives
    // a patterns list holding only the team's rules.
    const teamOnly = compilePatterns([TEAM_PATTERN]);
    expect(detectSecrets(`x ${TEAM_SECRET} y`, teamOnly)[0]).toMatchObject({
      label: 'Acme internal token',
      origin: 'team',
    });
    expect(detectSecrets(`x ${DEFAULT_SECRET} y`, teamOnly)).toHaveLength(0);
  });

  test('a team member with no team patterns sees byte-identical results to today', () => {
    const withoutTeam = compilePatterns(DEFAULT_BUNDLE.patterns);
    const text = `aws ${DEFAULT_SECRET} and sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123 end`;
    // Same bundle minus the team pattern → same findings, and none carry origin.
    expect(detectSecrets(text, patterns)).toEqual(detectSecrets(text, withoutTeam));
    expect(detectSecrets(text, withoutTeam).every((d) => !('origin' in d))).toBe(true);
  });
});

/**
 * Overlap resolution (TYPE_RANK, then longest match) picks ONE detection out of
 * several. The winner must carry its own origin — a team rule that wins is still
 * badged, and a default that wins must not inherit a team marker.
 */
describe('detectSecrets — origin survives overlap resolution', () => {
  const AWS = 'AKIAIOSFODNN7EXAMPLE'; // default catalogue, known-key (rank 2)

  test('a higher-ranked team pattern wins the overlap and keeps origin "team"', () => {
    const patterns = compilePatterns([
      ...DEFAULT_BUNDLE.patterns,
      {
        type: 'private-key', // rank 4 — outranks the default known-key hit inside it
        label: 'Acme signing block',
        regex: 'ACME-KEY:\\s*\\S+',
        origin: 'team',
      },
    ]);
    const dets = detectSecrets(`ACME-KEY: ${AWS}`, patterns);
    expect(dets).toHaveLength(1);
    expect(dets[0].label).toBe('Acme signing block');
    expect(dets[0].origin).toBe('team');
  });

  test('a longer team pattern wins a same-rank overlap and keeps origin "team"', () => {
    const patterns = compilePatterns([
      ...DEFAULT_BUNDLE.patterns,
      {
        type: 'known-key', // same rank as the default AWS pattern; longer match wins
        label: 'Acme-scoped AWS key',
        regex: 'AKIA[0-9A-Z]{16}-ACME',
        origin: 'team',
      },
    ]);
    const dets = detectSecrets(`key ${AWS}-ACME here`, patterns);
    expect(dets).toHaveLength(1);
    expect(dets[0].label).toBe('Acme-scoped AWS key');
    expect(dets[0].match).toBe(`${AWS}-ACME`);
    expect(dets[0].origin).toBe('team');
  });

  test('when a default pattern wins the overlap the finding carries no origin', () => {
    const patterns = compilePatterns([
      ...DEFAULT_BUNDLE.patterns,
      {
        type: 'env-credential', // rank 1 — loses to the default known-key AWS hit
        label: 'Acme env line',
        regex: 'ACME_TOKEN=\\S+',
        origin: 'team',
      },
    ]);
    const dets = detectSecrets(`ACME_TOKEN=${AWS}`, patterns);
    expect(dets).toHaveLength(1);
    expect(dets[0].label).toBe('AWS access key ID');
    expect('origin' in dets[0]).toBe(false);
  });

  test('a shorter team pattern loses a same-rank overlap and does not badge the winner', () => {
    const patterns = compilePatterns([
      ...DEFAULT_BUNDLE.patterns,
      {
        type: 'known-key',
        label: 'Acme AWS prefix',
        regex: 'AKIA[0-9A-Z]{8}', // strictly shorter than the default AWS match
        origin: 'team',
      },
    ]);
    const dets = detectSecrets(`key ${AWS} here`, patterns);
    expect(dets).toHaveLength(1);
    expect(dets[0].label).toBe('AWS access key ID');
    expect(dets[0].match).toBe(AWS);
    expect('origin' in dets[0]).toBe(false);
  });
});
