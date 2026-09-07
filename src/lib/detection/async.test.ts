import { expect, it } from 'vitest';
import { detectSecrets, detectSecretsAsync, GHOST_EXTRA_PATTERNS } from './index';
import { PATTERNS, type Pattern } from './patterns';

it('cooperative scanning preserves full-text matches and ordering', async () => {
  const text =
    'log 10.0.0.1 ops@acme.io\n'.repeat(10000) +
    '-----BEGIN PRIVATE KEY-----\n' +
    'a'.repeat(10000) +
    '\n-----END PRIVATE KEY-----';
  const patterns = [...PATTERNS, ...GHOST_EXTRA_PATTERNS];
  const result = await detectSecretsAsync(text, patterns, new AbortController().signal);
  expect(result).toEqual(detectSecrets(text, patterns));
});

it('an aborted scan cannot return a result', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(detectSecretsAsync('secret', PATTERNS, controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
});

it('allows a queued cancellation to interrupt work before results are returned', async () => {
  const controller = new AbortController();
  const text = 'log 10.0.0.1 ops@acme.io\n'.repeat(60000);
  const timer = setTimeout(() => controller.abort(), 0);
  try {
    await expect(
      detectSecretsAsync(text, [...PATTERNS, ...GHOST_EXTRA_PATTERNS], controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  } finally {
    clearTimeout(timer);
  }
});

it('non-global rules find every match instead of looping forever', () => {
  const patterns: Pattern[] = [{ type: 'known-key', label: 'Team secret', regex: /secret/i }];
  expect(detectSecrets('secret SECRET', patterns).map((d) => d.start)).toEqual([0, 7]);
  expect(patterns[0].regex.flags).toBe('i');
});

it('empty Unicode matches advance over surrogate pairs', () => {
  expect(detectSecrets('😀😀', [{ type: 'known-key', label: 'Empty', regex: /(?:)/gu }])).toEqual(
    [],
  );
});
