import { browser, defineBackground } from '#imports';
import {
  createTestSession,
  readTestVisits,
  sendTestVisits,
  TestApiError,
} from '@/lib/shadow/test-api';
import {
  canDiscover,
  emptyVisitState,
  enqueueVisit,
  makeVisit,
  VISIT_TTL,
  type VisitState,
} from '@/lib/shadow/visits';

const STORAGE_KEY = 'si_shadow_test_state_v1';
const ALARM = 'si-shadow-local-flush';
export default defineBackground(() => {
  // Serialise storage updates and sends so concurrent tabs cannot overwrite events.
  let tail: Promise<unknown> = Promise.resolve();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = tail.then(work, work);
    tail = next.catch(() => undefined);
    return next;
  };
  async function load(): Promise<VisitState> {
    const stored = (await browser.storage.local.get(STORAGE_KEY))[STORAGE_KEY] as
      | VisitState
      | undefined;
    return stored ?? emptyVisitState();
  }
  const save = (state: VisitState) => browser.storage.local.set({ [STORAGE_KEY]: state });
  async function flush() {
    let state = await load();
    if (!canDiscover(state.session, Date.now())) {
      if (state.session)
        await save({
          ...emptyVisitState(),
          error: 'Test session expired. Enable again to continue.',
        });
      return;
    }
    const queue = state.queue.filter((event) => event.timestamp >= Date.now() - VISIT_TTL);
    state = { ...state, queue, dropped: state.dropped + state.queue.length - queue.length };
    await save(state);
    if (!queue.length || !state.session) return;
    try {
      const ids = await sendTestVisits(state.session.token, queue.slice(0, 25));
      await save({
        ...state,
        queue: queue.filter((event) => !ids.includes(event.eventId)),
        lastSync: Date.now(),
        error: null,
      });
    } catch (error) {
      if (error instanceof TestApiError && [401, 403].includes(error.status)) {
        await save({
          ...emptyVisitState(),
          error: 'Test session no longer authorised. Enable again.',
        });
      } else if (error instanceof TestApiError && error.status === 400) {
        await save({
          ...state,
          queue: queue.slice(25),
          dropped: state.dropped + Math.min(25, queue.length),
          error: 'Invalid test batch discarded.',
        });
      } else {
        await save({ ...state, error: 'Local backend unavailable; metadata queued for retry.' });
      }
    }
  }
  browser.alarms.create(ALARM, { periodInMinutes: 1 });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) void serial(flush).catch(() => undefined);
  });
  // Trusted extension pages own consent/session controls; content scripts only report a visit.
  browser.runtime.onMessage.addListener((message, sender, respond) => {
    if (!message || typeof message !== 'object') return false;
    if (message.type === 'si-shadow-visit') {
      if (
        sender.id !== browser.runtime.id ||
        sender.tab?.id === undefined ||
        typeof message.eventId !== 'string' ||
        Object.keys(message).length !== 2
      )
        return false;
      const event = makeVisit(
        { url: sender.url, frameId: sender.frameId, incognito: sender.tab.incognito },
        message.eventId,
        Date.now(),
      );
      if (!event) return false;
      void serial(async () => {
        await save(enqueueVisit(await load(), event, Date.now()));
        await flush();
      }).then(
        () => respond({ ok: true }),
        () => respond({ ok: false }),
      );
      return true;
    }
    if (sender.id !== browser.runtime.id || sender.url !== browser.runtime.getURL('/popup.html'))
      return false;
    if (
      !['si-shadow-enable', 'si-shadow-disable', 'si-shadow-status', 'si-shadow-flush'].includes(
        message.type,
      )
    )
      return false;
    void serial(async () => {
      if (message.type === 'si-shadow-enable') {
        if (message.consent !== true) throw new Error('Consent required');
        await save({ ...emptyVisitState(), session: await createTestSession() });
      } else if (message.type === 'si-shadow-disable') {
        await save(emptyVisitState());
      } else if (message.type === 'si-shadow-flush') {
        await flush();
      }
      let state = await load();
      if (state.session && !canDiscover(state.session, Date.now())) {
        state = { ...emptyVisitState(), error: 'Test session expired. Enable again.' };
        await save(state);
      }
      let readback = null;
      if (state.session) {
        try {
          readback = await readTestVisits(state.session.token);
        } catch {
          /* show local state offline */
        }
      }
      return {
        enabled: canDiscover(state.session, Date.now()),
        seatLabel: state.session?.seatLabel ?? null,
        queued: state.queue.length,
        dropped: state.dropped,
        lastSync: state.lastSync,
        error: state.error,
        readback,
      };
    }).then(respond, () =>
      respond({
        error: 'Could not reach the local test backend. Check it is running on port 8791.',
      }),
    );
    return true;
  });
});
