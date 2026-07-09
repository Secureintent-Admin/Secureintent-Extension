import type { Fingerprint } from '@/lib/fingerprint';
import type { SecretType } from '../detection';

export type TelemetryAction = 'paste_anonymously' | 'paste_anyway' | 'cancelled';

export interface TelemetryDetection {
  fingerprint: Fingerprint;
  type: SecretType;
  label: string;
}

export interface TelemetryEvent {
  eventId: string;
  site: string;
  policyVersion: number;
  detections: TelemetryDetection[];
  action: TelemetryAction;
  // User context — for segmenting telemetry by tier / business. No PII: only the
  // plan, how it was granted, whether signed in, and (business tier) the domain.
  plan: string;
  source: string;
  signedIn: boolean;
  businessDomain: string | null;
}
