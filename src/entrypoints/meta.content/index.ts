import { defineContentScript } from '#imports';
import '@/overlay/overlay.css';
import { createPasteGuard } from '@/content/createPasteGuard';

export default defineContentScript({
  matches: ['*://meta.ai/*', '*://www.meta.ai/*'],
  cssInjectionMode: 'ui',
  runAt: 'document_start', // before the page's scripts, so our capture-phase listener wins
  async main(ctx) {
    await createPasteGuard(ctx, { name: 'Meta AI', siteKey: 'meta' });
  },
});
