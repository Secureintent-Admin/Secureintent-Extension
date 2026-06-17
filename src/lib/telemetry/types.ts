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
}
