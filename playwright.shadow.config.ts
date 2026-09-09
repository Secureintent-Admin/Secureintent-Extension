import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'shadow.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 8000 },
  use: { trace: 'off', screenshot: 'only-on-failure' },
  outputDir: 'test-results/shadow',
});
