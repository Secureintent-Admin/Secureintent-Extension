import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  // Live sites are inherently flaky (heavy pages, anti-bot); retry once before failing.
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
});
