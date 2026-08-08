import type { Detection, SecretType } from './types';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskAssessment {
  score: number;
  level: RiskLevel;
  reasons: string[];
}

const CONTEXT_RADIUS = 72;

const BASE_SCORE: Record<SecretType, number> = {
  'private-key': 95,
  'known-key': 72,
  'env-credential': 68,
  pii: 70,
};

const CREDENTIAL_CONTEXT =
  /\b(?:api[ _-]?key|access[ _-]?key|auth(?:orization)?|bearer|client[ _-]?secret|credential|password|passwd|private[ _-]?key|secret|token)\b/i;
const ASSIGNMENT_CONTEXT =
  /\b(?:api[ _-]?key|access[ _-]?key|client[ _-]?secret|password|passwd|secret|token)\s*[:=]\s*["']?$/i;
const HASH_CONTEXT = /\b(?:checksum|digest|etag|git[ _-]?commit|md5|sha(?:1|224|256|384|512)?)\b/i;
const EXAMPLE_CONTEXT = /\b(?:demo|docs?|example|fake|placeholder|sample)\b/i;

function levelFor(score: number): RiskLevel {
  if (score >= 90) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
}

function baselineReason(detection: Detection): string {
  if (detection.type === 'private-key') return 'Matches a private-key structure';
  if (detection.type === 'env-credential')
    return 'Matches a credential assignment or connection string';
  if (detection.type === 'pii') return 'Matches a validated sensitive-data format';
  if (detection.label.startsWith('High-entropy')) return 'Looks like a random high-entropy value';
  return `Matches the known ${detection.label} format`;
}

/**
 * Score a detection using its type plus nearby, non-secret text. Pure and local:
 * context is never stored, logged, or sent to feature hooks/telemetry.
 */
export function assessRisk(text: string, detection: Detection): RiskAssessment {
  const entropyFinding = detection.label.startsWith('High-entropy');
  let score = entropyFinding ? 45 : BASE_SCORE[detection.type];
  const reasons = [baselineReason(detection)];
  const before = text.slice(Math.max(0, detection.start - CONTEXT_RADIUS), detection.start);
  const after = text.slice(detection.end, Math.min(text.length, detection.end + CONTEXT_RADIUS));
  // Treat common identifier separators as word boundaries so DATABASE_PASSWORD,
  // api-secret, and client_secret carry the same signal as natural-language text.
  const normalizedBefore = before.replace(/[_-]+/g, ' ');
  const context = `${normalizedBefore} ${after.replace(/[_-]+/g, ' ')}`;

  if (CREDENTIAL_CONTEXT.test(context)) {
    score += 12;
    reasons.push('Nearby text identifies it as a credential');
  }
  if (ASSIGNMENT_CONTEXT.test(normalizedBefore)) {
    score += 8;
    reasons.push('It is assigned to a sensitive variable');
  }

  // These reductions apply only to broad entropy detections. A provider-specific
  // key remains high risk even when pasted inside documentation or sample code.
  if (entropyFinding) {
    if (HASH_CONTEXT.test(context)) {
      score -= 28;
      reasons.push('Checksum or digest context lowers confidence');
    }
    if (EXAMPLE_CONTEXT.test(context)) {
      score -= 12;
      reasons.push('Example or documentation context lowers confidence');
    }
  }

  // Critical is reserved for inherently critical structures such as private keys;
  // contextual words alone must not make a provider key look more severe than that.
  const ceiling = detection.type === 'private-key' ? 100 : 89;
  score = Math.max(0, Math.min(ceiling, score));
  return { score, level: levelFor(score), reasons };
}
