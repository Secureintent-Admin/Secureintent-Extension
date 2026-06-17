import type { Detection } from './types';

const MASK_CHAR = '*';
const MIN_MASK = 3;
const MAX_MASK = 6;

export function maskFor(length: number, char: string = MASK_CHAR): string {
  return char.repeat(Math.min(Math.max(length, MIN_MASK), MAX_MASK));
}

export function redact(text: string, detections: Detection[]): string {
  if (detections.length === 0) return text;

  // right-to-left so earlier offsets stay valid as we splice
  const ordered = [...detections].sort((a, b) => b.start - a.start);
  let out = text;
  for (const d of ordered) {
    out = out.slice(0, d.start) + maskFor(d.match.length) + out.slice(d.end);
  }
  return out;
}
