import { maskFor } from './redact';
import type { Detection } from './types';

export interface SecretLocation {
  line: number; // 1-based line where the secret starts
  snippet: string; // line text, secret masked and windowed; never the raw secret
}

const WINDOW = 32; // chars of context to keep on each side of the secret
const DISPLAY_MASK = '●'; // filled dot reads cleaner than '*' in the overlay

export function locateInText(text: string, d: Detection): SecretLocation {
  const line = text.slice(0, d.start).split('\n').length;

  const lineStart = text.lastIndexOf('\n', d.start - 1) + 1;
  const nextBreak = text.indexOf('\n', d.start);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;

  const before = text.slice(lineStart, d.start);
  const after = text.slice(Math.min(d.end, lineEnd), lineEnd);
  const maskedLen = Math.min(d.end, lineEnd) - d.start;

  let head = before;
  let tail = after;
  if (head.length > WINDOW) head = `…${head.slice(-WINDOW)}`;
  if (tail.length > WINDOW) tail = `${tail.slice(0, WINDOW)}…`;

  return { line, snippet: `${head}${maskFor(maskedLen, DISPLAY_MASK)}${tail}` };
}
