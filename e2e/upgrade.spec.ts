import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Confirms the upgrade CTA opens the account page — the one destination for the
// "upgrade" intent, and the only one that does anything for someone who already
// has the extension installed (the marketing #tiers card just says "Install
// SecureIntent"). A free user's Ghost "Sanitize & paste" is Pro-locked; clicking
// it should open https://secureintent.ai/account.html. Needs the open e2e shadow
// build (WXT_E2E=1).

const SECRET = `sk-${'a'.repeat(30)}`;
const SITE = 'https://example.com/';
const PAGE = `<!doctype html><meta charset="utf-8"><body><textarea id="ta"></textarea></body>`;

async function paste(page: Page, text: string): Promise<void> {
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
  await page.keyboard.press('ControlOrMeta+V');
}

test('overlay "Pro" upgrade opens the account page', async ({ context }) => {
  // Stub the web app so the opened tab loads without hitting the network.
  await context.route('https://secureintent.ai/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>account</title>' }),
  );

  const page = await context.newPage();
  await page.route(SITE, (route) => route.fulfill({ contentType: 'text/html', body: PAGE }));
  await page.goto(SITE, { waitUntil: 'domcontentloaded' });
  await page.locator('#ta').click();

  // Large paste → Ghost path; "Sanitize & paste" is Pro-locked for a free user.
  const bigLog = `deploy ${SECRET} `.padEnd(60) + 'a line of otherwise harmless log text\n'.repeat(120);
  await paste(page, bigLog);

  const overlay = page.locator('secureintent-overlay');
  await expect(overlay).toBeAttached({ timeout: 5_000 });

  const accountTab = context.waitForEvent('page');
  await overlay.getByRole('button', { name: /Pro/ }).click();
  const tab = await accountTab;
  expect(tab.url()).toContain('secureintent.ai');
  expect(tab.url()).toContain('account.html');
  expect(tab.url()).not.toContain('#tiers');
});
