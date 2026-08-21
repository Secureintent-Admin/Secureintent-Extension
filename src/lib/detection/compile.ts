import type { Pattern } from './patterns';
import type { PatternOrigin, SecretType } from './types';

export interface RawPattern {
  type: SecretType;
  label: string;
  regex: string;
  flags?: string;
  validate?: string; // optional post-match validator name (e.g. 'card')
  /** Team-authored pattern marker written by the Worker; our catalogue omits it. */
  origin?: PatternOrigin;
}

// invalid regex strings are dropped rather than thrown — bad config must not break the guard
export function compilePatterns(raw: RawPattern[]): Pattern[] {
  const out: Pattern[] = [];
  for (const p of raw) {
    try {
      const pattern: Pattern = {
        type: p.type,
        label: p.label,
        regex: new RegExp(p.regex, p.flags ?? 'g'),
        validate: p.validate,
      };
      // Only attach the key when the bundle carried one, so a default-catalogue
      // pattern compiles to exactly the object it compiled to before origins existed.
      if (p.origin !== undefined) pattern.origin = p.origin;
      out.push(pattern);
    } catch {
      // skip malformed pattern
    }
  }
  return out;
}
