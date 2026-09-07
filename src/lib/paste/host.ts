import { browser } from '#imports';
import {
  IDLE_TIMEOUT_MS,
  MAX_PASTE_WORKERS,
  PASTE_PORT,
  type PasteCommand,
  type PasteReply,
  WORK_TIMEOUT_MS,
} from './protocol';

/** Private runtime ports only; no page/window messaging or web-accessible assets. */
export function installPasteWorkerHost(
  makeWorker = () => new Worker(browser.runtime.getURL('/paste-worker.js')),
) {
  let running = 0;
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== PASTE_PORT) return;
    if (
      port.sender?.id !== browser.runtime.id ||
      port.sender.tab?.id == null ||
      running >= MAX_PASTE_WORKERS
    ) {
      port.disconnect();
      return;
    }
    let worker: Worker;
    try {
      worker = makeWorker();
    } catch {
      port.disconnect();
      return;
    }
    running++;
    let closed = false;
    let pending: number | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const close = () => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      worker.terminate();
      running--;
      port.onMessage.removeListener(onMessage);
      port.onDisconnect.removeListener(close);
      port.disconnect();
    };
    const reply = (data: PasteReply) => {
      try {
        port.postMessage(data);
      } catch {
        close();
      }
    };
    const fail = (message: string) => {
      if (pending !== undefined) reply({ id: pending, ok: false, error: message });
      close();
    };
    const onMessage = (command: PasteCommand) => {
      if (closed) return;
      if (pending !== undefined || !Number.isSafeInteger(command?.id) || command.id < 1) {
        close();
        return;
      }
      clearTimeout(timer);
      pending = command.id;
      // This timer is outside the worker: even a catastrophic regex can be stopped.
      timer = setTimeout(
        () => fail('Paste processing timed out; nothing was inserted'),
        WORK_TIMEOUT_MS,
      );
      try {
        worker.postMessage(command);
      } catch {
        fail('Paste processing could not start');
      }
    };
    worker.onmessage = ({ data }: MessageEvent<PasteReply>) => {
      if (closed || data.id !== pending) return;
      clearTimeout(timer);
      reply(data);
      if (closed) return;
      if (!data.ok) {
        close();
        return;
      }
      pending = undefined;
      timer = setTimeout(close, IDLE_TIMEOUT_MS);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      fail('Paste processor stopped unexpectedly');
    };
    worker.onmessageerror = () => fail('Paste processor returned an unreadable result');
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(close);
    timer = setTimeout(close, IDLE_TIMEOUT_MS);
  });
}
