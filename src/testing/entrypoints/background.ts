import { browser, defineBackground } from '#imports';
import {
  createTestSession,
  readTestActivity,
  readTestPolicy,
  readTestVisits,
  sendTestTelemetry,
  TestApiError,
} from '@/lib/shadow/test-api';
import {
  canDiscover,
  emptyVisitState,
  enqueueEvent,
  makeDlpEvent,
  makePasteVolume,
  makeVisit,
  VISIT_TTL,
  type VisitState,
} from '@/lib/shadow/visits';
import { installPasteWorkerBackground } from '@/services/pasteWorkerBackground';

export const SHADOW_STATE_KEY = 'si_shadow_test_state_v1';
const ALARM = 'si-shadow-local-sync';

export default defineBackground(() => {
  installPasteWorkerBackground();
  let tail: Promise<unknown> = Promise.resolve();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = tail.then(work, work);
    tail = next.catch(() => undefined);
    return next;
  };
  async function load(): Promise<VisitState> {
    const stored = (await browser.storage.local.get(SHADOW_STATE_KEY))[SHADOW_STATE_KEY] as
      | Partial<VisitState>
      | undefined;
    const empty = emptyVisitState();
    return stored
      ? {
          ...empty,
          ...stored,
          session: stored.session ?? null,
          queue: Array.isArray(stored.queue) ? stored.queue : [],
          seen: Array.isArray(stored.seen) ? stored.seen : [],
          policy: stored.policy ?? null,
          policyFetchedAt: stored.policyFetchedAt ?? null,
        }
      : empty;
  }
  const save = (state: VisitState) => browser.storage.local.set({ [SHADOW_STATE_KEY]: state });

  async function refreshPolicy(current?: VisitState): Promise<VisitState> {
    const state = current ?? (await load());
    if (!canDiscover(state.session, Date.now()) || !state.session) return state;
    try {
      const next = {
        ...state,
        policy: await readTestPolicy(state.session.token),
        policyFetchedAt: Date.now(),
      };
      await save(next);
      return next;
    } catch {
      return state;
    }
  }

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
      const ids = await sendTestTelemetry(state.session.token, queue.slice(0, 25));
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
    if (alarm.name !== ALARM) return;
    void serial(async () => {
      await refreshPolicy();
      await flush();
    }).catch(() => undefined);
  });

  browser.runtime.onMessage.addListener((message, sender, respond) => {
    if (!message || typeof message !== 'object') return false;
    const source = { url: sender.url, frameId: sender.frameId, incognito: sender.tab?.incognito };
    if (message.type === 'si-shadow-visit') {
      if (
        sender.id !== browser.runtime.id ||
        sender.tab?.id === undefined ||
        typeof message.eventId !== 'string' ||
        Object.keys(message).length !== 2
      )
        return false;
      const event = makeVisit(source, message.eventId, Date.now());
      if (!event) return false;
      void serial(async () => {
        await save(enqueueEvent(await load(), event, Date.now()));
        await flush();
      }).then(
        () => respond({ ok: true }),
        () => respond({ ok: false }),
      );
      return true;
    }
    if (message.type === 'si-shadow-paste-volume') {
      if (
        sender.id !== browser.runtime.id ||
        sender.tab?.id === undefined ||
        typeof message.eventId !== 'string' ||
        typeof message.byteSize !== 'number' ||
        Object.keys(message).length !== 3
      )
        return false;
      const event = makePasteVolume(source, message.eventId, message.byteSize, Date.now());
      if (!event) return false;
      void serial(async () => {
        await save(enqueueEvent(await load(), event, Date.now()));
        await flush();
      }).then(
        () => respond({ ok: true }),
        () => respond({ ok: false }),
      );
      return true;
    }
    if (message.type === 'si-shadow-dlp') {
      if (sender.id !== browser.runtime.id || sender.tab?.id === undefined) return false;
      const keys = [
        'type',
        'eventId',
        'pasteEventId',
        'detectionType',
        'reason',
        'action',
        'findingCount',
      ];
      if (Object.keys(message).length !== keys.length || keys.some((key) => !(key in message)))
        return false;
      const event = makeDlpEvent(source, message, Date.now());
      if (!event) return false;
      void serial(async () => {
        await save(enqueueEvent(await load(), event, Date.now()));
        await flush();
      }).then(
        () => respond({ ok: true }),
        () => respond({ ok: false }),
      );
      return true;
    }
    if (message.type === 'si-shadow-policy') {
      if (
        sender.id !== browser.runtime.id ||
        sender.tab?.id === undefined ||
        Object.keys(message).length !== 1
      )
        return false;
      void serial(async () => {
        let state = await load();
        if (
          state.session &&
          (!state.policyFetchedAt || Date.now() - state.policyFetchedAt >= 5 * 60_000)
        )
          state = await refreshPolicy(state);
        const target = makePasteVolume(source, crypto.randomUUID(), 0, Date.now());
        return {
          enabled: canDiscover(state.session, Date.now()),
          service: target
            ? (state.policy?.services.find((item) => item.serviceId === target.serviceId) ?? {
                serviceId: target.serviceId,
                classification: 'recognized',
                pasteBlocked: false,
              })
            : null,
          version: state.policy?.version ?? 0,
        };
      }).then(respond, () => respond({ enabled: false, service: null, version: 0 }));
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
        await refreshPolicy();
      } else if (message.type === 'si-shadow-disable') {
        await save(emptyVisitState());
      } else if (message.type === 'si-shadow-flush') {
        await refreshPolicy();
        await flush();
      }
      let state = await load();
      if (state.session && !canDiscover(state.session, Date.now())) {
        state = { ...emptyVisitState(), error: 'Test session expired. Enable again.' };
        await save(state);
      }
      let readback = null;
      let activity = null;
      if (state.session) {
        try {
          [readback, activity] = await Promise.all([
            readTestVisits(state.session.token),
            readTestActivity(state.session.token),
          ]);
        } catch {
          // Keep local status usable while the loopback worker is offline.
        }
      }
      return {
        enabled: canDiscover(state.session, Date.now()),
        seatLabel: state.session?.seatLabel ?? null,
        queued: state.queue.length,
        dropped: state.dropped,
        lastSync: state.lastSync,
        policyVersion: state.policy?.version ?? 0,
        error: state.error,
        readback,
        activity,
      };
    }).then(respond, () =>
      respond({
        error: 'Could not reach the local test backend. Check it is running on port 8791.',
      }),
    );
    return true;
  });
});
