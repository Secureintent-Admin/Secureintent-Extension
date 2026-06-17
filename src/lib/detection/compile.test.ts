import { describe, expect, test } from 'vitest';
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
