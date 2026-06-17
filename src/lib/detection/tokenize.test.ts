import { describe, expect, test } from 'vitest';
import { TOKEN_RE, tokenizeSecrets } from './tokenize';
import type { Detection } from './types';

function det(match: string, start: number, type: Detection['type'] = 'known-key'): Detection {
  return { type, label: 'test', match, start, end: start + match.length };
}

describe('tokenizeSecrets', () => {
  test('returns text unchanged with no entries when there are no detections', () => {
    const { text, entries } = tokenizeSecrets('hello world', []);
    expect(text).toBe('hello world');
    expect(entries).toEqual([]);
  });

  test('replaces the detected secret with a token', () => {
    const src = 'key=AKIAsecret123 done';
    const { text } = tokenizeSecrets(src, [det('AKIAsecret123', 4)]);
    expect(text).not.toContain('AKIAsecret123');
    expect(text).toMatch(/^key=⟦SI:[0-9a-f]{8}⟧ done$/);
  });

  test('emits a vault entry mapping token to the real secret', () => {
    const { entries } = tokenizeSecrets('x AKIAsecret123', [det('AKIAsecret123', 2)]);
    expect(entries).toHaveLength(1);
    expect(entries[0].secret).toBe('AKIAsecret123');
    expect(entries[0].token).toMatch(TOKEN_RE);
  });

  test('generates a unique token per detection', () => {
    const src = 'aaa bbb';
    const { entries } = tokenizeSecrets(src, [det('aaa', 0), det('bbb', 4)]);
    expect(entries[0].token).not.toBe(entries[1].token);
  });

  test('round-trips: substituting tokens back yields the original text', () => {
    const src = 'a=SEC_ONE b=SEC_TWO c=SEC_ONE_LONGER';
    const dets = [det('SEC_ONE', 2), det('SEC_TWO', 12), det('SEC_ONE_LONGER', 22)];
    const { text, entries } = tokenizeSecrets(src, dets);
    let restored = text;
    for (const e of entries) restored = restored.replace(e.token, e.secret);
    expect(restored).toBe(src);
  });

  test('keeps offsets valid for adjacent detections', () => {
    const src = 'ABCDEF';
    const { text, entries } = tokenizeSecrets(src, [det('ABC', 0), det('DEF', 3)]);
    let restored = text;
    for (const e of entries) restored = restored.replace(e.token, e.secret);
    expect(restored).toBe(src);
  });
});
