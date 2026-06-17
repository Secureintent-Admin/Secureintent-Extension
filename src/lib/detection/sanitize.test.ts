import { describe, expect, test } from 'vitest';
import { sanitize, summarize } from './sanitize';
import type { Detection } from './types';

function det(
  match: string,
  start: number,
  label: string,
  type: Detection['type'] = 'pii',
): Detection {
  return { type, label, match, start, end: start + match.length };
}

describe('sanitize', () => {
  test('returns text unchanged when there are no detections', () => {
    expect(sanitize('clean log line', [])).toBe('clean log line');
  });

  test('replaces a secret with a typed placeholder', () => {
    const out = sanitize('ip 10.0.0.1 here', [det('10.0.0.1', 3, 'Internal IP')]);
    expect(out).toBe('ip ‹ip_1› here');
  });

  test('numbers distinct values within a category', () => {
    const text = 'a 10.0.0.1 b 10.0.0.2';
    const dets = [det('10.0.0.1', 2, 'Internal IP'), det('10.0.0.2', 13, 'Internal IP')];
    expect(sanitize(text, dets)).toBe('a ‹ip_1› b ‹ip_2›');
  });

  test('reuses the same placeholder for a repeated value (correlation)', () => {
    const text = 'x 10.0.0.1 y 10.0.0.1 z';
    const dets = [det('10.0.0.1', 2, 'Internal IP'), det('10.0.0.1', 13, 'Internal IP')];
    expect(sanitize(text, dets)).toBe('x ‹ip_1› y ‹ip_1› z');
  });

  test('uses separate counters per category', () => {
    const text = 'ip 10.0.0.1 mail a@b.com';
    const dets = [det('10.0.0.1', 3, 'Internal IP'), det('a@b.com', 17, 'Email address')];
    expect(sanitize(text, dets)).toBe('ip ‹ip_1› mail ‹email_1›');
  });

  test('maps key-type detections to the secret category', () => {
    const out = sanitize('key sk-abc', [det('sk-abc', 4, 'OpenAI API key', 'known-key')]);
    expect(out).toBe('key ‹secret_1›');
  });

  test('keeps offsets valid across adjacent detections', () => {
    const text = '10.0.0.1a@b.com';
    const dets = [det('10.0.0.1', 0, 'Internal IP'), det('a@b.com', 8, 'Email address')];
    expect(sanitize(text, dets)).toBe('‹ip_1›‹email_1›');
  });
});

describe('summarize', () => {
  test('counts detections grouped by label, most frequent first', () => {
    const dets = [
      det('10.0.0.1', 0, 'Internal IP'),
      det('10.0.0.2', 10, 'Internal IP'),
      det('a@b.com', 20, 'Email address'),
    ];
    expect(summarize(dets)).toEqual({
      total: 3,
      items: [
        { label: 'Internal IP', count: 2 },
        { label: 'Email address', count: 1 },
      ],
    });
  });

  test('empty detections summarize to zero', () => {
    expect(summarize([])).toEqual({ total: 0, items: [] });
  });
});
