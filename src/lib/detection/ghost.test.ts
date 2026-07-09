import { describe, expect, test } from 'vitest';
import { GHOST_EXTRA_PATTERNS, GHOST_MIN_CHARS } from './ghost';
import { detectSecrets } from './index';

const labels = (text: string) => detectSecrets(text, GHOST_EXTRA_PATTERNS).map((d) => d.label);

describe('GHOST_EXTRA_PATTERNS', () => {
  test('flags private 10.x addresses', () => {
    expect(labels('connecting to 10.0.4.21 now')).toEqual(['IP address']);
  });

  test('flags private and public IPv4 alike', () => {
    expect(labels('db 192.168.1.10 dns 8.8.8.8 syslog 64.47.61.150 cgnat 100.64.11.193')).toEqual([
      'IP address',
      'IP address',
      'IP address',
      'IP address',
    ]);
  });

  test('catches IPs glued to following text (flattened logs)', () => {
    // No whitespace after the IP — a trailing \b would have missed these.
    expect(labels('NOM IP 10.79.72.47Installed: YES, peer 10.20.2.231VDOM Count')).toEqual([
      'IP address',
      'IP address',
    ]);
  });

  test('does not match over-range octets', () => {
    expect(labels('build 10.20.300.1 here')).toEqual([]);
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
