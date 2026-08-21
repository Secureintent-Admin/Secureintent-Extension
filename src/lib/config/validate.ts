import type { ConfigBundle } from './types';

const TYPES = new Set(['known-key', 'private-key', 'env-credential', 'pii']);

function validPattern(v: unknown): boolean {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  if (typeof p.regex !== 'string' || p.regex.length === 0) return false;
  if (typeof p.label !== 'string') return false;
  if (!TYPES.has(p.type as string)) return false;
  if (p.validate !== undefined && typeof p.validate !== 'string') return false;
  return true;
}

/**
 * Team Policy shape check. Strict on purpose: a policy is an enforcement rule,
 * so a half-readable one must not be applied at all (the caller rejects the
 * whole bundle and keeps the last good one, exactly as for a bad pattern).
 */
function validPolicy(v: unknown): boolean {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  if (typeof p.blockInsteadOfWarn !== 'boolean') return false;
  if (typeof p.requireSessionLock !== 'boolean') return false;
  // Optional by design. The Worker merges a team's extra patterns straight into
  // `bundle.patterns` so they run through the normal detection path, and then
  // OMITS them here — carrying both would register every org pattern twice.
  // Requiring the field would make us reject the real bundle outright, which
  // costs a team its patterns AND the kill switch.
  if (p.extraPatterns !== undefined) {
    if (!Array.isArray(p.extraPatterns) || !p.extraPatterns.every(validPattern)) return false;
  }
  if (!Array.isArray(p.blockedSites)) return false;
  if (!p.blockedSites.every((s) => typeof s === 'string')) return false;
  return true;
}

export function validateBundle(b: unknown): b is ConfigBundle {
  if (typeof b !== 'object' || b === null) return false;
  const o = b as Record<string, unknown>;
  if (typeof o.version !== 'number') return false;
  if (typeof o.killSwitch !== 'boolean') return false;
  if (o.aggressive !== undefined && typeof o.aggressive !== 'boolean') return false;
  if (!Array.isArray(o.patterns)) return false;
  if (typeof o.sites !== 'object' || o.sites === null) return false;
  for (const p of o.patterns as unknown[]) {
    if (!validPattern(p)) return false;
  }
  for (const s of Object.values(o.sites as Record<string, unknown>)) {
    if (typeof s !== 'object' || s === null) return false;
    if (typeof (s as Record<string, unknown>).inputSelector !== 'string') return false;
  }
  // Team Policy is optional — every anonymous install and every bundle
  // published before Team Policy Sync omits it and must stay just as valid.
  if (o.policy !== undefined && !validPolicy(o.policy)) return false;
  if (o.policyVersion !== undefined && typeof o.policyVersion !== 'number') return false;
  return true;
}
