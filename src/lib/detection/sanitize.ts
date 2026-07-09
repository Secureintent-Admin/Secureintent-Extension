import type { Detection } from './types';

export interface GhostSummary {
  total: number;
  items: { label: string; count: number }[];
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

/** Count findings grouped by label, most frequent first, for the summary overlay. */
export function summarize(detections: Detection[]): GhostSummary {
  const byLabel = new Map<string, number>();
  for (const d of detections) byLabel.set(d.label, (byLabel.get(d.label) ?? 0) + 1);
  const items = [...byLabel.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
  return { total: detections.length, items };
}
