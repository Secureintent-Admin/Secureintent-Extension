/**
 * The Anonymise & Paste allowance is per **UTC calendar month** — `offline.ts`
 * keys the on-device count by UTC year-month, and the Worker's `/v1/usage` does
 * the same. When the allowance runs out the UI has to answer "when do I get more
 * of these?", so the reset boundary lives here as a pure, testable function.
 */

/** Epoch ms of the next UTC month boundary — the instant the allowance resets. */
export function quotaResetAt(nowMs: number = Date.now()): number {
  const d = new Date(nowMs);
  // Month 12 rolls over into January of the next year (Date.UTC normalizes it).
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

/**
 * Short label for the reset date, e.g. `"Sep 1"`. Formatted in UTC (the quota's
 * own clock) and pinned to en-US so the string never drifts with the host locale
 * — every other line of UI copy is English too.
 */
export function formatQuotaReset(nowMs: number = Date.now()): string {
  return new Date(quotaResetAt(nowMs)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
