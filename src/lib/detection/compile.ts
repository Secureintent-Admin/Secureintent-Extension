import type { Pattern } from './patterns';
import type { SecretType } from './types';

export interface RawPattern {
  type: SecretType;
  label: string;
  regex: string;
  flags?: string;
  validate?: string; // optional post-match validator name (e.g. 'card')
}

// invalid regex strings are dropped rather than thrown — bad config must not break the guard
export function compilePatterns(raw: RawPattern[]): Pattern[] {
  const out: Pattern[] = [];
  for (const p of raw) {
    try {
      out.push({
        type: p.type,
        label: p.label,
        regex: new RegExp(p.regex, p.flags ?? 'g'),
        validate: p.validate,
      });
    } catch {
      // skip malformed pattern
    }
  }
  return out;
}
