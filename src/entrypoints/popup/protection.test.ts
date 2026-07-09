import { describe, expect, test } from 'vitest';
import { protectionStatus } from './protection';

describe('protectionStatus', () => {
  test('http(s) page → active with hostname (www stripped)', () => {
    expect(protectionStatus('https://claude.ai/chat', true)).toEqual({
      kind: 'active',
      host: 'claude.ai',
    });
    expect(protectionStatus('https://www.perplexity.ai/', true)).toEqual({
      kind: 'active',
      host: 'perplexity.ai',
    });
  });
  test('browser/internal page → inactive', () => {
    expect(protectionStatus('chrome://extensions', true)).toEqual({ kind: 'inactive' });
    expect(protectionStatus(undefined, true)).toEqual({ kind: 'inactive' });
  });
  test('disabled → paused regardless of url', () => {
    expect(protectionStatus('https://claude.ai', false)).toEqual({ kind: 'paused' });
  });
});
