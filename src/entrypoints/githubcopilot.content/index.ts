import { defineContentScript } from '#imports';
import '@/overlay/overlay.css';
import { createPasteGuard } from '@/content/createPasteGuard';

export default defineContentScript({
  // Scope strictly to the standalone Copilot surface and its sub-paths.
  matches: ['*://github.com/copilot', '*://github.com/copilot/*'],
  cssInjectionMode: 'ui',
  runAt: 'document_start', // before the page's scripts, so our capture-phase listener wins
  async main(ctx) {
    await createPasteGuard(ctx, { name: 'GitHub Copilot', siteKey: 'githubcopilot' });
  },
});
