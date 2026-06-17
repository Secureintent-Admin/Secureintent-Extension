import { describe, expect, test } from 'vitest';
import { detectSecrets } from './index';
import { locateInText } from './locate';

const KEY = 'sk-' + 'a'.repeat(30);

describe('locateInText', () => {
  test('reports a 1-based line number', () => {
    const text = `first line\nsecond line\nkey here ${KEY} ok`;
    const [d] = detectSecrets(text);
    expect(locateInText(text, d).line).toBe(3);
  });

  test('line is 1 for a single-line paste', () => {
    const text = `my key ${KEY}`;
    const [d] = detectSecrets(text);
    expect(locateInText(text, d).line).toBe(1);
  });

  test('snippet masks the raw secret but keeps surrounding text', () => {
    const text = `here is ${KEY} end`;
    const [d] = detectSecrets(text);
    const { snippet } = locateInText(text, d);
    expect(snippet).not.toContain(KEY);
    expect(snippet).toContain('here is ');
    expect(snippet).toContain('end');
    expect(snippet).toMatch(/●/);
  });

  test('windows a very long line around the secret', () => {
    const text = `${'x'.repeat(200)} ${KEY} ${'y'.repeat(200)}`;
    const [d] = detectSecrets(text);
    const { snippet } = locateInText(text, d);
    expect(snippet.length).toBeLessThan(120);
    expect(snippet).toContain('…');
    expect(snippet).not.toContain(KEY);
  });
});
