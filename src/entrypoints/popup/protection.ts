// Protection status for the popup. The paste guard (dedicated + catch-all
// fallback) runs on every http(s) page, so we just show the current hostname —
// no per-site list to maintain.

export type ProtectionStatus =
  | { kind: 'active'; host: string } // guard runs on this page
  | { kind: 'inactive' } // browser/internal page — no guard
  | { kind: 'paused' }; // user turned protection off

/** Resolve the popup's protection status from the active tab URL + enabled flag. */
export function protectionStatus(url: string | undefined, enabled: boolean): ProtectionStatus {
  if (!enabled) return { kind: 'paused' };
  if (!url || !/^https?:\/\//i.test(url)) return { kind: 'inactive' };
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return { kind: 'active', host };
  } catch {
    return { kind: 'inactive' };
  }
}
