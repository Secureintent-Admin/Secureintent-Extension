import { describe, expect, it } from 'vitest';
import {
  canDiscover,
  emptyVisitState,
  enqueueVisit,
  makeVisit,
  QUEUE_LIMIT,
  type TestSession,
  VISIT_TTL,
} from './visits';

const now = 1_790_000_000_000;
const session: TestSession = {
  token: 'test',
  seatId: 'seat-test',
  seatLabel: 'Seat 1',
  orgId: 'test-org-alpha',
  plan: 'business_pro',
  expiresAt: now + VISIT_TTL,
  localOnly: true,
};
const id = '88267dc6-3915-4a2d-957f-848f211fce45';
const sender = { url: 'https://chatgpt.com/c/PRIVATE-CHAT?prompt=PRIVATE-TEXT#SECRET', frameId: 0 };
describe('hostname-only visits', () => {
  it('discards all URL details before returning a metadata event', () => {
    const event = makeVisit(sender, id, now);
    expect(event?.hostname).toBe('chatgpt.com');
    expect(Object.keys(event!).sort()).toEqual([
      'catalogVersion',
      'eventId',
      'hostname',
      'schemaVersion',
      'serviceId',
      'timestamp',
      'type',
    ]);
    expect(JSON.stringify(event)).not.toMatch(/PRIVATE|SECRET|https:|prompt|\/c\//);
  });
  it.each([
    { ...sender, frameId: 1 },
    { ...sender, frameId: undefined },
    { ...sender, incognito: true },
    { ...sender, url: 'https://example.com' },
    { ...sender, url: 'http://chatgpt.com' },
    { ...sender, url: 'https://chatgpt.com:1234' },
    { ...sender, url: 'https://github.com/openai/project' },
    { ...sender, url: 'https://user:secret@chatgpt.com' },
    { ...sender, url: 'invalid' },
  ])('ignores unsupported or non-top-level navigation %#', (input) =>
    expect(makeVisit(input, id, now)).toBeNull());
  it('recognises only the GitHub Copilot route and logs its hostname', () => {
    expect(
      makeVisit({ ...sender, url: 'https://github.com/copilot/c/PRIVATE?prompt=SECRET' }, id, now)
        ?.hostname,
    ).toBe('github.com');
    expect(makeVisit(sender, 'a-chat-id', now)).toBeNull();
  });
  it('requires opted-in, unexpired Business team context', () => {
    expect(canDiscover(session, now)).toBe(true);
    for (const value of [
      null,
      { ...session, plan: 'developer' },
      { ...session, plan: 'developer_pro' },
      { ...session, orgId: null },
      { ...session, expiresAt: now },
    ]) {
      expect(canDiscover(value, now)).toBe(false);
      expect(
        enqueueVisit({ ...emptyVisitState(), session: value }, makeVisit(sender, id, now)!, now)
          .queue,
      ).toEqual([]);
    }
  });
  it('deduplicates observer retries even after a successful upload', () => {
    const event = makeVisit(sender, id, now)!;
    const state = enqueueVisit({ ...emptyVisitState(), session }, event, now);
    expect(enqueueVisit(state, event, now).queue).toHaveLength(1);
    expect(enqueueVisit({ ...state, queue: [] }, event, now).queue).toHaveLength(0);
  });
  it('bounds offline storage and tracks dropped metadata', () => {
    let state = { ...emptyVisitState(), session };
    for (let i = 0; i < QUEUE_LIMIT + 4; i++) {
      state = enqueueVisit(
        state,
        makeVisit(sender, `88267dc6-3915-4a2d-957f-${i.toString(16).padStart(12, '0')}`, now)!,
        now,
      ) as typeof state;
    }
    expect(state.queue).toHaveLength(QUEUE_LIMIT);
    expect(state.dropped).toBe(4);
  });
  it('expires old metadata and clears queue on session expiry', () => {
    const oldEvent = makeVisit(sender, id, now - VISIT_TTL - 1)!;
    const nextEvent = makeVisit(sender, crypto.randomUUID(), now)!;
    const state = enqueueVisit(
      { ...emptyVisitState(), session, queue: [oldEvent] },
      nextEvent,
      now,
    );
    expect(state.queue).toEqual([nextEvent]);
    expect(state.dropped).toBe(1);
    expect(enqueueVisit(state, nextEvent, session.expiresAt).session).toBeNull();
    expect(enqueueVisit(state, nextEvent, session.expiresAt).queue).toEqual([]);
  });
});
