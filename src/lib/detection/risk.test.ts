import { describe, expect, test } from 'vitest';
import { assessRisk } from './risk';
import type { Detection } from './types';

function detection(text: string, match: string, overrides: Partial<Detection> = {}): Detection {
  const start = text.indexOf(match);
  return {
    type: 'known-key',
    label: 'High-entropy hex string',
    match,
    start,
    end: start + match.length,
    ...overrides,
  };
}

describe('assessRisk', () => {
  const value = 'd41d8cd98f00b204e9800998ecf8427e';

  test('raises an entropy finding when sensitive assignment context is present', () => {
    const text = `DATABASE_PASSWORD=${value}`;
    const result = assessRisk(text, detection(text, value));

    expect(result.level).toBe('high');
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.reasons).toContain('It is assigned to a sensitive variable');
  });

  test('lowers an entropy finding identified as a checksum', () => {
    const text = `SHA256 checksum: ${value}`;
    const result = assessRisk(text, detection(text, value));

    expect(result.level).toBe('low');
    expect(result.reasons).toContain('Checksum or digest context lowers confidence');
  });

  test('keeps a provider-specific API key high risk in example text', () => {
    const secret = `sk-${'a'.repeat(30)}`;
    const text = `Example OpenAI key: ${secret}`;
    const result = assessRisk(text, detection(text, secret, { label: 'OpenAI API key' }));

    expect(result.level).toBe('high');
    expect(result.score).toBe(72);
  });

  test('always treats private-key structures as critical', () => {
    const secret = '-----BEGIN PRIVATE KEY-----';
    const text = `credential:\n${secret}`;
    const result = assessRisk(
      text,
      detection(text, secret, { type: 'private-key', label: 'Private key (PEM)' }),
    );

    expect(result.level).toBe('critical');
    expect(result.score).toBe(100);
  });

  test('never includes the matched secret in its explanations', () => {
    const text = `token=${value}`;
    const result = assessRisk(text, detection(text, value));

    expect(result.reasons.join(' ')).not.toContain(value);
  });
});
