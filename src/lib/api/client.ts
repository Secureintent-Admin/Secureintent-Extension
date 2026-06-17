export const API_BASE = 'https://api.secureintent.ai';

export async function getJson<T>(path: string): Promise<T> {
  // no-store: config must never come from the HTTP cache (always latest bundle)
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

// Fire-and-forget POST: never throws, survives navigation.
export function postJson(path: string, body: unknown): void {
  fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {});
}
