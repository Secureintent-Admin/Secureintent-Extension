import { describe, expect, test } from 'vitest';
import { GHOST_EXTRA_PATTERNS, GHOST_MIN_CHARS } from './ghost';
import { detectSecrets } from './index';

const labels = (text: string) => detectSecrets(text, GHOST_EXTRA_PATTERNS).map((d) => d.label);

describe('GHOST_EXTRA_PATTERNS', () => {
  test('flags private 10.x addresses', () => {
    expect(labels('connecting to 10.0.4.21 now')).toEqual(['Internal IP']);
  });

  test('flags 172.16–31.x and 192.168.x ranges', () => {
    expect(labels('db 172.16.0.9 cache 172.31.255.4 web 192.168.1.10')).toEqual([
      'Internal IP',
      'Internal IP',
      'Internal IP',
    ]);
  });

  test('does NOT flag public IPs', () => {
    expect(labels('resolver 8.8.8.8 and 172.15.0.1 and 172.32.0.1')).toEqual([]);
  });

  test('flags email addresses', () => {
    expect(labels('owner john.wright@secureintent.ai paged')).toEqual(['Email address']);
  });

  test('ignores plain text with no IPs or emails', () => {
    expect(labels('just a normal log line, nothing sensitive')).toEqual([]);
  });

  test('exposes a sane default size threshold', () => {
    expect(GHOST_MIN_CHARS).toBeGreaterThanOrEqual(1000);
  });
});
