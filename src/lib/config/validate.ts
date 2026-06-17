import type { ConfigBundle } from './types';

const TYPES = new Set(['known-key', 'private-key', 'env-credential', 'pii']);

export function validateBundle(b: unknown): b is ConfigBundle {
  if (typeof b !== 'object' || b === null) return false;
  const o = b as Record<string, unknown>;
  if (typeof o.version !== 'number') return false;
  if (typeof o.killSwitch !== 'boolean') return false;
  if (o.aggressive !== undefined && typeof o.aggressive !== 'boolean') return false;
  if (!Array.isArray(o.patterns)) return false;
  if (typeof o.sites !== 'object' || o.sites === null) return false;
  for (const p of o.patterns as Array<Record<string, unknown>>) {
    if (typeof p.regex !== 'string' || p.regex.length === 0) return false;
    if (typeof p.label !== 'string') return false;
    if (!TYPES.has(p.type as string)) return false;
    if (p.validate !== undefined && typeof p.validate !== 'string') return false;
  }
  for (const s of Object.values(o.sites as Record<string, unknown>)) {
    if (typeof s !== 'object' || s === null) return false;
    if (typeof (s as Record<string, unknown>).inputSelector !== 'string') return false;
  }
  return true;
}
