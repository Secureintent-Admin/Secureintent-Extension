import type { ShadowEvent, ShadowPolicy, TestSession, VisitEvent } from './visits';

// Fixed loopback destination; env files cannot redirect this harness to production.
export const SHADOW_TEST_API = 'http://127.0.0.1:8791';
export class TestApiError extends Error {
  constructor(public status: number) {
    super('Local test request failed');
  }
}
async function request(path: string, token?: string, body?: unknown): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(SHADOW_TEST_API + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'X-SI-Shadow-Test': '1',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new TestApiError(response.status);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export async function createTestSession(): Promise<TestSession> {
  const value = await request('/v1/shadow/test-session', undefined, {
    scenario: 'business',
    consent: true,
  });
  if (
    !record(value) ||
    value.localOnly !== true ||
    value.plan !== 'business_pro' ||
    typeof value.token !== 'string' ||
    !/^[0-9a-f-]{36}$/.test(value.token) ||
    typeof value.seatId !== 'string' ||
    !/^[0-9a-f-]{36}$/.test(value.seatId) ||
    typeof value.orgId !== 'string' ||
    !/^test-org-[a-z]+$/.test(value.orgId) ||
    typeof value.seatLabel !== 'string' ||
    !/^Seat [0-9]+$/.test(value.seatLabel) ||
    typeof value.expiresAt !== 'number' ||
    value.expiresAt <= Date.now()
  )
    throw new Error('Invalid test session');
  return {
    token: value.token,
    seatId: value.seatId,
    seatLabel: value.seatLabel,
    orgId: value.orgId,
    plan: value.plan,
    expiresAt: value.expiresAt,
    localOnly: true,
  };
}
export async function sendTestVisits(token: string, events: VisitEvent[]): Promise<string[]> {
  const value = await request('/v1/shadow/visits', token, { events });
  if (
    !record(value) ||
    !Array.isArray(value.acceptedIds) ||
    !value.acceptedIds.every(
      (id) => typeof id === 'string' && events.some((event) => event.eventId === id),
    )
  ) {
    throw new Error('Invalid acknowledgement');
  }
  return value.acceptedIds;
}
export async function sendTestTelemetry(token: string, events: ShadowEvent[]): Promise<string[]> {
  const value = await request('/v1/shadow/telemetry', token, { events });
  if (
    !record(value) ||
    !Array.isArray(value.acceptedIds) ||
    !value.acceptedIds.every(
      (id) => typeof id === 'string' && events.some((event) => event.eventId === id),
    )
  )
    throw new Error('Invalid acknowledgement');
  return value.acceptedIds;
}
export type TestReadback = {
  total: number;
  events: { eventId: string; hostname: string; timestamp: number }[];
};
export async function readTestVisits(token: string): Promise<TestReadback> {
  const value = await request('/v1/shadow/visits', token);
  if (!record(value) || typeof value.total !== 'number' || !Array.isArray(value.events)) {
    throw new Error('Invalid readback');
  }
  const events = value.events.flatMap((event) =>
    record(event) &&
    typeof event.eventId === 'string' &&
    /^[0-9a-f-]{36}$/.test(event.eventId) &&
    typeof event.hostname === 'string' &&
    /^[a-z0-9.-]+$/.test(event.hostname) &&
    typeof event.timestamp === 'number'
      ? [{ eventId: event.eventId, hostname: event.hostname, timestamp: event.timestamp }]
      : [],
  );
  return { total: value.total, events };
}

export type TestActivity = {
  seatLabel: string;
  visits: number;
  pasteAttempts: number;
  pasteBytes: number;
  sensitiveEvents: number;
};
export async function readTestActivity(token: string): Promise<TestActivity> {
  const value = await request('/v1/shadow/activity', token);
  if (
    !record(value) ||
    typeof value.seatLabel !== 'string' ||
    !['visits', 'pasteAttempts', 'pasteBytes', 'sensitiveEvents'].every(
      (key) => typeof value[key] === 'number' && Number.isSafeInteger(value[key]),
    )
  )
    throw new Error('Invalid activity readback');
  return value as TestActivity;
}

export async function readTestPolicy(token: string): Promise<ShadowPolicy> {
  const value = await request('/v1/shadow/policy', token);
  if (
    !record(value) ||
    typeof value.version !== 'number' ||
    !Number.isSafeInteger(value.version) ||
    value.version < 0 ||
    value.refreshAfterSeconds !== 300 ||
    !Array.isArray(value.services) ||
    !value.services.every(
      (item) =>
        record(item) &&
        typeof item.serviceId === 'string' &&
        item.serviceId.length > 0 &&
        ['sanctioned', 'recognized', 'review'].includes(String(item.classification)) &&
        typeof item.pasteBlocked === 'boolean',
    )
  )
    throw new Error('Invalid policy response');
  return value as ShadowPolicy;
}
