export type SecretType = 'known-key' | 'private-key' | 'env-credential' | 'pii';

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
