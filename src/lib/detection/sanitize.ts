import type { Detection, PatternOrigin } from './types';

export interface GhostSummary {
  total: number;
  /** `origin` is set only when every finding under that label was a team rule. */
  items: { label: string; count: number; origin?: PatternOrigin }[];
}

/** Short placeholder category for a finding, derived from its label. */
function categoryFor(label: string): string {
  if (label === 'IP address' || label === 'Internal IP') return 'ip';
  if (label === 'Email address') return 'email';
  return 'secret';
}

/**
 * Strip findings from a (typically large) log/terminal paste, replacing each
 * with a typed, correlation-preserving placeholder: distinct values are numbered
 * per category (`[#IP_1#]`, `[#EMAIL_2#]`), and a repeated value always maps to the
 * same placeholder so the model still sees structure. Irreversible — Ghost
 * pastes are not rehydrated. Pure: no DOM, no async.
 */
export function sanitize(text: string, detections: Detection[]): string {
  if (detections.length === 0) return text;

  // First pass (left-to-right): assign a stable placeholder to each distinct value.
  const counters: Record<string, number> = {};
  const tokenByValue = new Map<string, string>();
  for (const d of [...detections].sort((a, b) => a.start - b.start)) {
    if (tokenByValue.has(d.match)) continue;
    const cat = categoryFor(d.label);
    counters[cat] = (counters[cat] ?? 0) + 1;
    tokenByValue.set(d.match, `[#${cat.toUpperCase()}_${counters[cat]}#]`);
  }

  // Second pass (right-to-left): splice so earlier offsets stay valid.
  let out = text;
  for (const d of [...detections].sort((a, b) => b.start - a.start)) {
    const token = tokenByValue.get(d.match) as string;
    out = out.slice(0, d.start) + token + out.slice(d.end);
  }
  return out;
}

/**
 * Count findings grouped by label, most frequent first, for the summary overlay.
 * A group is marked `origin: 'team'` only when *every* finding in it came from a
 * team rule — a label shared with the default catalogue stays unbadged rather
 * than claiming the team wrote a rule it didn't.
 */
export function summarize(detections: Detection[]): GhostSummary {
  const byLabel = new Map<string, { count: number; allTeam: boolean }>();
  for (const d of detections) {
    const entry = byLabel.get(d.label);
    const isTeam = d.origin === 'team';
    if (entry) {
      entry.count++;
      entry.allTeam &&= isTeam;
    } else {
      byLabel.set(d.label, { count: 1, allTeam: isTeam });
    }
  }
  const items = [...byLabel.entries()]
    .map(([label, { count, allTeam }]) =>
      allTeam ? { label, count, origin: 'team' as const } : { label, count },
    )
    .sort((a, b) => b.count - a.count);
  return { total: detections.length, items };
}
