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
  orgId?: string | null;
  actorId?: string | null;
}): TelemetryEvent {
  // Build-time browser flag from WXT (chrome | firefox | edge | opera | safari).
  return { eventId: crypto.randomUUID(), browser: import.meta.env.BROWSER, ...input };
}

export function sendTelemetry(event: TelemetryEvent): void {
  postJson('/v1/telemetry', event);
}
