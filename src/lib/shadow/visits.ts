import { AI_CATALOG, normalizeHostname, recognizeAiPage } from './catalog';

export const QUEUE_LIMIT = 500;
export const VISIT_TTL = 86_400_000;
export type VisitEvent = {
  schemaVersion: 1;
  eventId: string;
  type: 'ai_page_visit';
  timestamp: number;
  hostname: string;
  serviceId: string;
  catalogVersion: number;
};
export type TestSession = {
  token: string;
  seatId: string;
  seatLabel: string;
  orgId: string | null;
  plan: string;
  expiresAt: number;
  localOnly: true;
};
export type VisitState = {
  session: TestSession | null;
  queue: VisitEvent[];
  seen: { eventId: string; timestamp: number }[];
  dropped: number;
  lastSync: number | null;
  error: string | null;
};
export const emptyVisitState = (): VisitState => ({
  session: null,
  queue: [],
  seen: [],
  dropped: 0,
  lastSync: null,
  error: null,
});

export function canDiscover(session: TestSession | null, now: number): boolean {
  return (
    !!session &&
    session.localOnly === true &&
    session.plan === 'business_pro' &&
    !!session.orgId &&
    session.expiresAt > now
  );
}

/** Browser-supplied URL is transient input; only a catalog hostname survives. */
export function makeVisit(
  sender: { url?: string; frameId?: number; incognito?: boolean },
  eventId: string,
  now: number,
): VisitEvent | null {
  if (
    sender.frameId !== 0 ||
    sender.incognito ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(eventId)
  )
    return null;
  try {
    const url = new URL(sender.url ?? '');
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const hostname = normalizeHostname(url.hostname);
    const service = hostname && recognizeAiPage(hostname, url.pathname);
    if (!hostname || !service) return null;
    return {
      schemaVersion: 1,
      eventId,
      type: 'ai_page_visit',
      timestamp: now,
      hostname,
      serviceId: service.id,
      catalogVersion: AI_CATALOG.version,
    };
  } catch {
    return null;
  }
}

export function enqueueVisit(state: VisitState, event: VisitEvent, now: number): VisitState {
  if (!canDiscover(state.session, now))
    return {
      ...emptyVisitState(),
      error: state.session ? 'Test session expired or not Business' : null,
    };
  const queue = state.queue.filter((item) => item.timestamp >= now - VISIT_TTL);
  const seen = state.seen.filter((item) => item.timestamp >= now - VISIT_TTL);
  if (seen.some((item) => item.eventId === event.eventId)) return { ...state, queue, seen };
  const overflow = queue.length >= QUEUE_LIMIT ? 1 : 0;
  return {
    ...state,
    queue: [...queue.slice(overflow), event],
    seen: [...seen, { eventId: event.eventId, timestamp: event.timestamp }].slice(-2 * QUEUE_LIMIT),
    dropped: state.dropped + (state.queue.length - queue.length) + overflow,
  };
}
