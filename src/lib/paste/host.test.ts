import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { installPasteWorkerHost } from './host';
import { IDLE_TIMEOUT_MS, MAX_PASTE_WORKERS, PASTE_PORT, WORK_TIMEOUT_MS } from './protocol';

function events() {
  const listeners = new Set<(...args: unknown[]) => void>();
  return {
    addListener: (fn: (...args: unknown[]) => void) => listeners.add(fn),
    removeListener: (fn: (...args: unknown[]) => void) => listeners.delete(fn),
    fire: (...args: unknown[]) => {
      for (const fn of [...listeners]) fn(...args);
    },
  };
}
function connection() {
  const port = {
    name: PASTE_PORT,
    sender: { id: fakeBrowser.runtime.id, tab: { id: 1 } },
    onMessage: events(),
    onDisconnect: events(),
    postMessage: vi.fn(),
    disconnect: vi.fn(() => port.onDisconnect.fire()),
  };
  return port;
}
function setup() {
  const worker = {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    onmessage: undefined as Worker['onmessage'] | undefined,
    onerror: undefined as Worker['onerror'] | undefined,
    onmessageerror: undefined as Worker['onmessageerror'] | undefined,
  };
  const listen = vi
    .spyOn(fakeBrowser.runtime.onConnect, 'addListener')
    .mockImplementation(() => {});
  const makeWorker = vi.fn(() => worker as unknown as Worker);
  installPasteWorkerHost(makeWorker);
  const connect = listen.mock.calls.at(-1)![0];
  return {
    worker,
    makeWorker,
    connect: (port: ReturnType<typeof connection>) => connect(port as never),
  };
}
beforeEach(() => {
  fakeBrowser.reset();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test('terminates a stuck worker using a timer outside the worker', async () => {
  const { worker, connect } = setup();
  const port = connection();
  connect(port);
  port.onMessage.fire({ id: 1, operation: 'scan', input: {} });
  await vi.advanceTimersByTimeAsync(WORK_TIMEOUT_MS);
  expect(worker.terminate).toHaveBeenCalledTimes(1);
  expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({ id: 1, ok: false }));
  expect(port.disconnect).toHaveBeenCalled();
});

test('disconnect cancels a running regex immediately and drops late replies', () => {
  const { worker, connect } = setup();
  const port = connection();
  connect(port);
  port.onMessage.fire({ id: 1, operation: 'scan', input: {} });
  port.onDisconnect.fire();
  worker.onmessage?.call(
    worker as unknown as Worker,
    new MessageEvent('message', { data: { id: 1, ok: true, result: [] } }),
  );
  expect(worker.terminate).toHaveBeenCalledTimes(1);
  expect(port.postMessage).not.toHaveBeenCalled();
});

test('idle paste data is discarded and capacity is bounded and released', async () => {
  const { worker, makeWorker, connect } = setup();
  for (let i = 0; i < MAX_PASTE_WORKERS; i++) connect(connection());
  const overflow = connection();
  connect(overflow);
  expect(overflow.disconnect).toHaveBeenCalled();
  expect(makeWorker).toHaveBeenCalledTimes(MAX_PASTE_WORKERS);
  await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS);
  expect(worker.terminate).toHaveBeenCalledTimes(MAX_PASTE_WORKERS);
  connect(connection());
  expect(makeWorker).toHaveBeenCalledTimes(MAX_PASTE_WORKERS + 1);
});

test('rejects non-content-script senders before creating a worker', () => {
  const { makeWorker, connect } = setup();
  const port = connection();
  port.sender.id = 'different-extension';
  connect(port);
  expect(makeWorker).not.toHaveBeenCalled();
  expect(port.disconnect).toHaveBeenCalled();
});

test('successful replies reset the deadline without losing the session', async () => {
  const { worker, connect } = setup();
  const port = connection();
  connect(port);
  port.onMessage.fire({ id: 1, operation: 'scan', input: {} });
  worker.onmessage?.call(
    worker as unknown as Worker,
    new MessageEvent('message', { data: { id: 1, ok: true, result: [] } }),
  );
  await vi.advanceTimersByTimeAsync(WORK_TIMEOUT_MS + 1);
  expect(worker.terminate).not.toHaveBeenCalled();
  port.onMessage.fire({ id: 2, operation: 'sanitize', input: null });
  expect(worker.postMessage).toHaveBeenCalledTimes(2);
  port.onDisconnect.fire();
});
