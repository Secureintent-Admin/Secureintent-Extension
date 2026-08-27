import { describe, expect, test } from 'vitest';
import { contentHash, handledFrame } from './hash';

describe('contentHash matches the desktop', () => {
  test('the empty string is the FNV-1a 64 offset basis', () => {
    // Published constant. If this drifts, the port is wrong at the root and
    // every other value is wrong with it.
    expect(contentHash('')).toBe(14695981039346656037n);
  });

  test('known vectors', () => {
    expect(contentHash('abc')).toBe(16654208175385433931n);
    expect(contentHash('abd')).toBe(16654213672943574986n);
  });

  test('one byte apart gives an unrelated hash', () => {
    expect(contentHash('abc')).not.toBe(contentHash('abd'));
  });

  test('hashes bytes, not code units, so non-ASCII agrees with Rust', () => {
    // The desktop hashes `s.as_bytes()`. A JS implementation walking characters
    // instead would diverge here and nowhere else.
    const utf8 = new TextEncoder().encode('é');
    expect(utf8).toHaveLength(2);
    let expected = 14695981039346656037n;
    for (const b of utf8) {
      expected = ((expected ^ BigInt(b)) * 0x100000001b3n) & 0xffffffffffffffffn;
    }
    expect(contentHash('é')).toBe(expected);
  });

  test('stays inside 64 bits however long the input', () => {
    const h = contentHash('x'.repeat(100_000));
    expect(h).toBeLessThan(2n ** 64n);
    expect(h).toBeGreaterThanOrEqual(0n);
  });
});

describe('handledFrame', () => {
  test('writes the hash as an exact integer literal', () => {
    const h = contentHash('abc');
    expect(handledFrame(h, 5000)).toBe(
      '{"type":"handled","hash":16654208175385433931,"ttl_ms":5000}',
    );
  });

  test('a value above Number.MAX_SAFE_INTEGER survives, which JSON.stringify would not', () => {
    const h = contentHash('abc');
    expect(Number(h) > Number.MAX_SAFE_INTEGER).toBe(true);
    expect(handledFrame(h, 1)).toContain(h.toString());
    // What the obvious implementation would have produced instead.
    expect(JSON.stringify({ hash: Number(h) })).not.toContain(h.toString());
  });

  test('the ttl is always an integer', () => {
    expect(handledFrame(1n, 1500.7)).toContain('"ttl_ms":1500');
  });
});
