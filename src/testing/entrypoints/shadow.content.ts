import { browser, defineContentScript } from '#imports';
import { catalogMatchPatterns, recognizeAiPage } from '@/lib/shadow/catalog';

export default defineContentScript({
  matches: catalogMatchPatterns(),
  allFrames: false,
  runAt: 'document_idle',
  main() {
    // Once per top-level document, never on focus, paste, or SPA chat changes.
    if (window.top !== window || !recognizeAiPage(location.hostname, location.pathname)) return;
    void browser.runtime
      .sendMessage({ type: 'si-shadow-visit', eventId: crypto.randomUUID() })
      .catch(() => undefined);
  },
});
