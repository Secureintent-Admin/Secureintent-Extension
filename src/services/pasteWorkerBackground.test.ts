import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  contexts: vi.fn(),
  create: vi.fn(),
  listen: vi.fn(),
}));
vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      id: 'test-extension',
      getURL: (path: string) => `chrome-extension://test-extension${path}`,
      getContexts: mocks.contexts,
      onMessage: { addListener: mocks.listen },
    },
    offscreen: { createDocument: mocks.create },
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.contexts.mockResolvedValue([]);
  mocks.create.mockResolvedValue(undefined);
});
async function listener() {
  const { installPasteWorkerBackground } = await import('./pasteWorkerBackground');
  installPasteWorkerBackground();
  return mocks.listen.mock.calls[0][0];
}
const message = { type: 'si-paste-worker-ready' };
const sender = { id: 'test-extension', tab: { id: 1 } };

test('concurrent tabs share offscreen creation and reuse an existing host', async () => {
  const listen = await listener();
  let resolve!: () => void;
  mocks.create.mockImplementationOnce(
    () =>
      new Promise<void>((r) => {
        resolve = r;
      }),
  );
  const first = vi.fn();
  const second = vi.fn();
  listen(message, sender, first);
  listen(message, sender, second);
  await vi.waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
  resolve();
  await vi.waitFor(() => expect(first).toHaveBeenCalledWith({ ok: true }));
  expect(second).toHaveBeenCalledWith({ ok: true });
  mocks.contexts.mockResolvedValue([{}]);
  const third = vi.fn();
  listen(message, sender, third);
  await vi.waitFor(() => expect(third).toHaveBeenCalledWith({ ok: true }));
  expect(mocks.create).toHaveBeenCalledTimes(1);
});

test('failed host creation releases the single-flight lock for retry', async () => {
  const listen = await listener();
  mocks.create.mockRejectedValueOnce(new Error('unavailable'));
  const first = vi.fn();
  listen(message, sender, first);
  await vi.waitFor(() => expect(first).toHaveBeenCalledWith({ ok: false }));
  const second = vi.fn();
  listen(message, sender, second);
  await vi.waitFor(() => expect(second).toHaveBeenCalledWith({ ok: true }));
  expect(mocks.create).toHaveBeenCalledTimes(2);
});

test('only an own-extension content script can request a host', async () => {
  const listen = await listener();
  const reply = vi.fn();
  listen(message, { id: 'foreign-extension', tab: { id: 1 } }, reply);
  listen(message, { id: 'test-extension' }, reply);
  expect(reply).toHaveBeenCalledWith({ ok: false });
  expect(mocks.create).not.toHaveBeenCalled();
});
