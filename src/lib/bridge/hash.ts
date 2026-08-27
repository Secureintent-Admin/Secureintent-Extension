// FNV-1a, 64-bit — the desktop's `content_hash` (engine/src/policy.rs), reproduced
// exactly so a hash computed here means the same thing there.
//
// It identifies one copy for the few seconds either side needs to know the other
// already dealt with it. Not a security primitive and not our telemetry
// fingerprint — those are salted SHA-256 and go to the Worker. This is a short
// local identifier, unsalted because both sides have to arrive at the same number
// without having shared anything first.

const OFFSET = 0xcbf29ce484222325n;
const PRIME = 0x100000001b3n;
const MASK = 0xffffffffffffffffn;

/**
 * Hash the UTF-8 bytes of `text`, as the desktop hashes `s.as_bytes()`.
 *
 * Returns a **bigint**, and that matters. A u64 routinely exceeds
 * `Number.MAX_SAFE_INTEGER`, so going through `Number` corrupts it —
 * 16654208175385433931 comes back as 16654208175385434000. The desktop would
 * then look up a hash we never sent, every dedup would miss, and nothing would
 * report an error. See `handledFrame` for how it reaches the wire intact.
 */
export function contentHash(text: string): bigint {
  const bytes = new TextEncoder().encode(text);
  let hash = OFFSET;
  for (const b of bytes) {
    hash = (hash ^ BigInt(b)) & MASK;
    hash = (hash * PRIME) & MASK;
  }
  return hash;
}

/**
 * The `handled` frame, built by hand.
 *
 * `JSON.stringify` cannot help here: it has no bigint support, and converting to
 * Number first is the corruption above. The digits are written straight into the
 * JSON instead — safe because they are digits we generated, never input.
 * `serde_json` parses the literal into a u64 exactly.
 */
export function handledFrame(hash: bigint, ttlMs: number): string {
  return `{"type":"handled","hash":${hash.toString()},"ttl_ms":${Math.floor(ttlMs)}}`;
}
