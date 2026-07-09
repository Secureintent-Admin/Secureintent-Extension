import { postJson } from '@/lib/api/client';
import type { TelemetryAction, TelemetryDetection, TelemetryEvent } from '@/lib/telemetry/types';

export function buildEvent(input: {
  site: string;
  policyVersion: number;
  detections: TelemetryDetection[];
  action: TelemetryAction;
  plan: string;
  source: string;
  signedIn: boolean;
  businessDomain: string | null;
}): TelemetryEvent {
  return { eventId: crypto.randomUUID(), ...input };
}

export function sendTelemetry(event: TelemetryEvent): void {
  postJson('/v1/telemetry', event);
}
