import { browser } from '#imports';
import { installPasteWorkerHost } from '@/lib/paste/host';
import { PASTE_READY } from '@/lib/paste/protocol';

const OFFSCREEN_URL = '/paste-offscreen.html';
let creating: Promise<void> | undefined;

async function ensureOffscreen() {
  if (creating) return creating;
  const create = async () => {
    const url = browser.runtime.getURL(OFFSCREEN_URL);
    if (browser.runtime.getContexts) {
      const contexts = await browser.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [url],
      });
      if (contexts.length) return;
    } else {
      // Chrome 109–115: getContexts was introduced in 116.
      const scope = globalThis as unknown as {
        clients: { matchAll(): Promise<{ url: string }[]> };
      };
      if ((await scope.clients.matchAll()).some((client) => client.url === url)) return;
    }
    await browser.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['WORKERS'],
      justification:
        'Run local secret scanning in cancellable workers without blocking website tabs.',
    });
  };
  creating = create().finally(() => {
    creating = undefined;
  });
  return creating;
}

export function installPasteWorkerBackground() {
  // Firefox MV2 already has a private background document with Worker support.
  if (import.meta.env.BROWSER === 'firefox') installPasteWorkerHost();
  browser.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== PASTE_READY) return false;
    if (sender.id !== browser.runtime.id || sender.tab?.id == null) {
      respond({ ok: false });
      return false;
    }
    (import.meta.env.BROWSER === 'firefox' ? Promise.resolve() : ensureOffscreen()).then(
      () => respond({ ok: true }),
      () => respond({ ok: false }),
    );
    return true;
  });
}
