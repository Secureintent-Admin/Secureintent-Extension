import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Deterministic e2e for the dehydrate ⇄ rehydrate round-trip. Runs against the
// catch-all fallback guard on an UNSUPPORTED origin (no login required). REQUIRES
// the e2e build (WXT_E2E=1 pnpm build) which opens the overlay shadow root so we
// can click "Paste anonymously".
//
// This also covers the storage.session access-level fix: the content-script vault
// write only succeeds because the background grants TRUSTED_AND_UNTRUSTED_CONTEXTS.
// Without it, the token→secret map is never stored and rehydrate cannot work.

const SECRET = `sk-${'a'.repeat(30)}`;
const SITE = 'https://example.com/'; // not supported → fallback guard owns it
const PAGE = `<!doctype html><meta charset="utf-8"><body>
  <textarea id="ta"></textarea>
  <div id="out"></div>
</body>`;
const TOKEN_RE = /⟦SI:[0-9a-f]{8}⟧/;

async function paste(page: Page, text: string): Promise<void> {
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
  await page.keyboard.press('ControlOrMeta+V');
}

// Put text into #out, select it, and copy it off the page (a trusted Ctrl/Cmd+C
// so the guard's capture-phase copy listener fires). Returns the resulting
// clipboard contents after any rehydration.
async function selectAndCopy(page: Page, text: string): Promise<string> {
  await page.evaluate((t) => {
    const out = document.getElementById('out');
    if (!out) throw new Error('missing #out');
    out.textContent = t;
    const range = document.createRange();
    range.selectNodeContents(out);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, text);
  await page.keyboard.press('ControlOrMeta+C');
  return page.evaluate(() => navigator.clipboard.readText());
}

test('dehydrate then rehydrate restores the secret on copy', async ({ context }) => {
  const page = await context.newPage();
  await page.route(SITE, (route) => route.fulfill({ contentType: 'text/html', body: PAGE }));
  const overlay = page.locator('secureintent-overlay');

  await page.goto(SITE, { waitUntil: 'domcontentloaded' });

  // 1. Dehydrate: paste a secret and choose "Paste anonymously".
  await page.locator('#ta').click();
  await paste(page, `here ${SECRET} end`);
  await expect(overlay).toBeAttached({ timeout: 5_000 });
  await overlay.getByText('Paste anonymously', { exact: true }).click();
  await expect(overlay).toHaveCount(0);

  // The composer now holds a reversible token, not the raw secret.
  const masked = await page.locator('#ta').inputValue();
  expect(masked).not.toContain(SECRET);
  const token = masked.match(TOKEN_RE)?.[0];
  expect(token, 'composer should contain an SI token').toBeTruthy();

  // 2. Rehydrate: copy "model output" containing the token. The vault write is
  // fire-and-forget; poll the copy until the mapping has landed.
  await expect
    .poll(async () => selectAndCopy(page, `const key = "${token}";`), { timeout: 5_000 })
    .toContain(SECRET);

  const clip = await selectAndCopy(page, `const key = "${token}";`);
  expect(clip).not.toContain(token as string); // token fully replaced

  await page.close();
});

test('copying text without our tokens is left untouched', async ({ context }) => {
  const page = await context.newPage();
  await page.route(SITE, (route) => route.fulfill({ contentType: 'text/html', body: PAGE }));
  await page.goto(SITE, { waitUntil: 'domcontentloaded' });

  const plain = 'just some normal text to copy';
  expect(await selectAndCopy(page, plain)).toBe(plain);

  await page.close();
});
