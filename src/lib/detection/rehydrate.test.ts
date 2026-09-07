import { describe, expect, it } from 'vitest';
import { rehydrateTokens } from './rehydrate';

describe('rehydrateTokens', () => {
  it('bounds expansion when a short token refers to a large secret', () => {
    expect(() =>
      rehydrateTokens(
        '⟦SI:00000001⟧'.repeat(10),
        new Map([['⟦SI:00000001⟧', 's'.repeat(1000)]]),
        2000,
      ),
    ).toThrow(RangeError);
  });
  it('restores repeated tokens, counts distinct known tokens, and preserves unknown ones', () => {
    const vault = new Map([['⟦SI:00000001⟧', '$& literal secret']]);
    expect(rehydrateTokens('a ⟦SI:00000001⟧ b ⟦SI:00000001⟧ c ⟦SI:00000002⟧', vault)).toEqual({
      text: 'a $& literal secret b $& literal secret c ⟦SI:00000002⟧',
      tokenCount: 1,
    });
  });

  it('does not recursively interpret a token inside a restored secret', () => {
    const vault = new Map([
      ['⟦SI:00000001⟧', 'literal ⟦SI:00000002⟧'],
      ['⟦SI:00000002⟧', 'other'],
    ]);
    expect(rehydrateTokens('⟦SI:00000001⟧ ⟦SI:00000002⟧', vault)).toEqual({
      text: 'literal ⟦SI:00000002⟧ other',
      tokenCount: 2,
    });
  });

  it('preserves ordinary text and supports empty stored secrets', () => {
    expect(rehydrateTokens('plain text', new Map())).toEqual({ text: 'plain text', tokenCount: 0 });
    expect(rehydrateTokens('x⟦SI:00000001⟧y', new Map([['⟦SI:00000001⟧', '']]))).toEqual({
      text: 'xy',
      tokenCount: 1,
    });
  });

  it('restores 20,000 tokens within the 1.5s regression budget', () => {
    const entries = Array.from(
      { length: 20_000 },
      (_, i) => [`⟦SI:${i.toString(16).padStart(8, '0')}⟧`, `user${i}@acme.io`] as const,
    );
    const text = entries.map(([token]) => `INFO ${token} ${'context '.repeat(8)}`).join('\n');
    const expected = entries
      .map(([, secret]) => `INFO ${secret} ${'context '.repeat(8)}`)
      .join('\n');
    const vault = new Map(entries);
    const start = performance.now();
    const result = rehydrateTokens(text, vault);
    expect(performance.now() - start).toBeLessThan(1500);
    expect(result).toEqual({ text: expected, tokenCount: 20_000 });
  });
});
