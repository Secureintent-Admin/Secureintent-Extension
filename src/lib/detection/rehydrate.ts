import { TOKEN_RE } from './tokenize';

/** Replace only tokens present in the original text; never cascade replacements. */
export function rehydrateTokens(
  text: string,
  vault: ReadonlyMap<string, string>,
  maxOutputChars = 2_000_000,
) {
  const known = new Set<string>();
  let outputChars = text.length;
  if (outputChars > maxOutputChars) throw new RangeError('Restored paste is too large');
  const restored = text.replace(new RegExp(TOKEN_RE.source, 'g'), (token) => {
    const secret = vault.get(token);
    if (secret === undefined) return token;
    outputChars += secret.length - token.length;
    if (outputChars > maxOutputChars) throw new RangeError('Restored paste is too large');
    known.add(token);
    return secret; // Callback preserves literal $&, $1, etc. in secrets.
  });
  return { text: restored, tokenCount: known.size };
}
