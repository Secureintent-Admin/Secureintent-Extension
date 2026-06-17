import { defineContentScript } from '#imports';
import '@/overlay/overlay.css';
import { createPasteGuard } from '@/content/createPasteGuard';

export default defineContentScript({
  matches: ['*://bolt.new/*'],
  cssInjectionMode: 'ui',
  runAt: 'document_start', // before the page's scripts, so our capture-phase listener wins
  async main(ctx) {
    await createPasteGuard(ctx, { name: 'Bolt', siteKey: 'bolt' });
  },
});
