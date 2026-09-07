import type { Page } from '@playwright/test';
import { DEFAULT_BUNDLE } from '../src/lib/config/default';
import { expect, test } from './fixtures';

declare const chrome: {
  storage: {
    local: {
      remove(keys: string[]): Promise<void>;
      set(items: Record<string, unknown>): Promise<void>;
    };
  };
};

const SECRET = `sk-${'a'.repeat(30)}`;
const OTHER = `sk-${'b'.repeat(30)}`;
const SITE = 'https://example.com/';
const HTML = '<!doctype html><meta charset="utf-8"><textarea id="ta"></textarea>';

async function paste(page: Page, text: string) {
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
  await page.keyboard.press('ControlOrMeta+V');
}

// Requires WXT_E2E=1 for the existing test-only open shadow root.
test.beforeEach(async ({ context }) => {
  await context.serviceWorkers()[0].evaluate(async () => {
    await chrome.storage.local.remove(['si_config', 'si_config_synced']);
  });
});

test('a second paste stays blocked until the first warning is resolved', async ({ context }) => {
  const page = await context.newPage();
  await page.route(SITE, (r) => r.fulfill({ contentType: 'text/html', body: HTML }));
  await page.goto(SITE);
  await page.locator('#ta').click();
  await paste(page, SECRET);
  const overlay = page.locator('secureintent-overlay');
  await expect(overlay.getByRole('button', { name: 'Paste anyway', exact: true })).toBeVisible();
  // The composer retains focus in the warning. Explicit focus also tests
  // guarding the input even if a page/editor programmatically restores focus.
  await page.locator('#ta').focus();
  await paste(page, OTHER);
  await expect(page.locator('#ta')).toHaveValue('');
  await expect(overlay).toHaveCount(1);
  await overlay.getByRole('button', { name: 'Cancel', exact: true }).last().click();
  await expect(overlay).toHaveCount(0);
  await page.locator('#ta').click();
  await paste(page, OTHER);
  await expect(overlay).toHaveCount(1);
  await expect(page.locator('#ta')).toHaveValue('');
  await page.close();
});

test('oversized paste is explained and dismissal leaves the next paste protected', async ({
  context,
}) => {
  const page = await context.newPage();
  await page.route(SITE, (r) => r.fulfill({ contentType: 'text/html', body: HTML }));
  await page.goto(SITE);
  await page.locator('#ta').click();
  await paste(page, 'x'.repeat(2_000_001));
  const status = page.locator('secureintent-paste-status');
  await expect(status.getByText('Paste is too large', { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('paste-too-large.png') });
  await expect(page.locator('#ta')).toHaveValue('');
  await status.getByRole('button', { name: 'Dismiss' }).click();
  await expect(status).toHaveCount(0);
  await page.locator('#ta').click();
  await paste(page, SECRET);
  await expect(page.locator('secureintent-overlay')).toHaveCount(1);
  await page.close();
});

test('a large benign paste is inserted exactly once after scanning', async ({ context }) => {
  const page = await context.newPage();
  await page.route(SITE, (r) => r.fulfill({ contentType: 'text/html', body: HTML }));
  await page.goto(SITE);
  await page.locator('#ta').click();
  const text = 'ordinary safe text '.repeat(8000);
  await paste(page, text);
  await expect(page.locator('#ta')).toHaveValue(text);
  await expect(page.locator('secureintent-paste-status')).toHaveCount(0);
  await expect(page.locator('secureintent-overlay')).toHaveCount(0);
  await page.close();
});

test('a rule with only case-insensitive flags warns without an infinite scan', async ({
  context,
}) => {
  const bundle = {
    ...DEFAULT_BUNDLE,
    patterns: [
      { type: 'known-key', label: 'Test team token', regex: 'acme-secret-[0-9]+', flags: 'i' },
    ],
  };
  await context
    .serviceWorkers()[0]
    .evaluate((b) => chrome.storage.local.set({ si_config: b }), bundle);
  const page = await context.newPage();
  await page.route(SITE, (r) => r.fulfill({ contentType: 'text/html', body: HTML }));
  await page.goto(SITE);
  await page.locator('#ta').click();
  await paste(page, 'ACME-SECRET-1234');
  await expect(
    page.locator('secureintent-overlay').getByText('Test team token', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('#ta')).toHaveValue('');
  await page.close();
});
