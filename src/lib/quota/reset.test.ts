import { describe, expect, it } from 'vitest';
import { formatQuotaReset, quotaResetAt } from './reset';

const at = (iso: string) => Date.parse(iso);

describe('quotaResetAt', () => {
  it('returns the first instant of the next UTC month', () => {
    expect(quotaResetAt(at('2026-08-09T12:00:00Z'))).toBe(Date.parse('2026-09-01T00:00:00Z'));
  });

  it('rolls over into January of the next year in December', () => {
    expect(quotaResetAt(at('2026-12-31T23:59:59Z'))).toBe(Date.parse('2027-01-01T00:00:00Z'));
  });

  it('uses the UTC month even when local time is still in the previous one', () => {
    // 2026-09-01T00:30Z is 2026-08-31 in UTC-3 — the quota follows UTC, so the
    // next reset is October, not September.
    expect(quotaResetAt(at('2026-09-01T00:30:00Z'))).toBe(Date.parse('2026-10-01T00:00:00Z'));
  });
});

describe('formatQuotaReset', () => {
  it('formats the next reset as a short UTC date', () => {
    expect(formatQuotaReset(at('2026-08-09T12:00:00Z'))).toBe('Sep 1');
    expect(formatQuotaReset(at('2026-12-01T00:00:00Z'))).toBe('Jan 1');
  });

  it('does not shift a day when the boundary is read in a behind-UTC zone', () => {
    // Formatting is pinned to UTC, so the label is always the 1st.
    expect(formatQuotaReset(at('2026-01-15T00:00:00Z'))).toBe('Feb 1');
  });
});
