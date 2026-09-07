import { defineUnlistedScript } from '#imports';
import { createPasteComputation } from '@/lib/paste/process';
import type { PasteCommand, PasteReply } from '@/lib/paste/protocol';

export default defineUnlistedScript(() => {
  const compute = createPasteComputation();
  const scope = globalThis as unknown as {
    onmessage: (event: MessageEvent<PasteCommand>) => void;
    postMessage(reply: PasteReply): void;
  };
  scope.onmessage = ({ data }) => {
    try {
      scope.postMessage({ id: data.id, ok: true, result: compute(data) });
    } catch {
      // Never include pasted text, matches, or exception details in IPC/logs.
      scope.postMessage({
        id: data.id,
        ok: false,
        error: 'Paste processing failed or exceeded its limits',
      });
    }
  };
});
