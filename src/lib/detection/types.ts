/**
 * What kind of thing a detector found.
 *
 * `known-key` means we recognised a named format — an AWS key, a GitHub token.
 * `high-entropy` is the opposite claim: nothing matched, the text merely looks
 * random, so it is flagged to be safe. Reporting the second as the first told
 * anyone reading a dashboard that we had identified a credential when we
 * expressly had not.
 */
export type SecretType = 'known-key' | 'private-key' | 'env-credential' | 'pii' | 'high-entropy';

/**
 * Where a pattern came from. The Worker marks a team admin's own patterns with
 * `origin: 'team'` and leaves ours bare — the default catalogue carries no
 * `origin` key at all — so the only safe test anywhere is `=== 'team'`, never
 * `!== 'default'`. Absent means default.
 */
export type PatternOrigin = 'default' | 'team';

export interface Detection {
  type: SecretType;
  label: string;
  match: string;
  start: number; // inclusive index into source text
  end: number; // exclusive index into source text
  /** Set only when the pattern that matched was a team rule; absent = default. */
  origin?: PatternOrigin;
}
