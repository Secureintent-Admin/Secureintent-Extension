import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Locator, Page } from '@playwright/test';
import { DEFAULT_BUNDLE } from '../src/lib/config/default';
import { expect, test } from './fixtures';

declare const chrome: { storage: { local: { set(items: Record<string, unknown>): Promise<void> } } };

// LIVE per-site paste-guard scenario suite. Drives the real sites in a persistent
// Chromium context with the built extension loaded, reusing the SHARED ./.auth/profile
// dir so logins captured by `pnpm e2e:login` persist into the run.
//
// This suite REQUIRES the e2e build (WXT_E2E=1 pnpm build) which opens the overlay's
// shadow root so Playwright can pierce it and click the overlay buttons. In production
// the shadow root stays closed.
//
// Headed by default; set HEADLESS=1 to run without a display. Each site is its own
// test so a single failing/login-walled site doesn't abort the rest.

const dirname = path.dirname(fileURLToPath(import.meta.url));

// All live tests share the saved-login profile (./.auth/profile) via the
// worker-scoped context fixture.
test.use({ userDataDir: path.resolve(dirname, '../.auth/profile') });

// A trusted paste of PASTE trips the "OpenAI API key" pattern
// (sk- followed by 20+ [A-Za-z0-9_-]) so the guard mounts its overlay.
const SECRET = `sk-${'a'.repeat(30)}`;
const PASTE = `my key is ${SECRET} end`;

// One sample per pattern in DEFAULT_BUNDLE.patterns (src/lib/config/default.ts). Each
// sample is crafted to trip EXACTLY its own pattern, so the overlay surfaces that one
// label. Used by the "every secret pattern" coverage test below.
const PATTERN_SAMPLES: { label: string; sample: string }[] = [
  {
    label: 'Private key (PEM)',
    sample: '-----BEGIN PRIVATE KEY-----\nMIIBVgIBADANBgkqhkiG9w0BAQEFAASCAUAwggE8\n-----END PRIVATE KEY-----',
  },
  { label: 'OpenAI API key', sample: 'sk-abcdefghijklmnopqrstuvwxyz012345' },
  { label: 'AWS access key ID', sample: 'AKIAIOSFODNN7EXAMPLE' },
  { label: 'GitHub token', sample: 'ghp_1234567890abcdefghijklmnopqrstuvwxyzAB' },
  { label: 'Google API key', sample: 'AIzaSyA1234567890abcdefghijklmnopqrstuv' },
  { label: 'Stripe key', sample: 'sk_live_4eC39HqLyjWDarjtT1zdp7dc1234' },
  { label: 'Slack token', sample: 'xoxb-1234567890-abcdefghij' },
  {
    label: 'JWT',
    sample: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N',
  },
  {
    label: 'Connection string with credentials',
    sample: 'postgres://admin:secretpass@db.example.com:5432/app',
  },
  { label: 'Credential assignment', sample: 'API_KEY=abcdef123456' },
  { label: 'Anthropic API key', sample: 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123' },
  {
    label: 'GitHub fine-grained PAT',
    sample: 'github_pat_11ABCDEFGH0123456789abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJ',
  },
  { label: 'GitLab PAT', sample: 'glpat-abcdefghijklmnopqrstuvwx' },
  { label: 'npm token', sample: 'npm_0123456789abcdefghijklmnopqrstuvwxyz' },
  { label: 'Hugging Face token', sample: 'hf_abcdefghijklmnopqrstuvwxyz0123456789' },
  {
    label: 'SendGrid API key',
    sample: 'SG.abcdefghijklmnopqrstuv.abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',
  },
  {
    label: 'Slack webhook URL',
    sample: 'https://hooks.slack.com/services/T00000000/B00000000/abcdefghijklmnopqrstuvwx',
  },
  { label: 'Twilio account SID', sample: 'AC0123456789abcdef0123456789abcdef' },
  {
    label: 'Discord bot token',
    sample: 'Maaaaaaaaaaaaaaaaaaaaaaa.bbbbbb.ccccccccccccccccccccccccccc',
  },
  { label: 'Dropbox access token', sample: 'sl.' + 'A'.repeat(135) },
  { label: 'Notion integration token', sample: 'secret_' + 'a'.repeat(43) },
  { label: 'Firebase Cloud Messaging server key', sample: 'AAAA' + 'B'.repeat(7) + ':APA91b' + 'C'.repeat(134) },
  { label: 'Google OAuth refresh token', sample: '1//0' + 'g'.repeat(40) },
  {
    label: 'Azure storage connection string',
    sample:
      'DefaultEndpointsProtocol=https;AccountName=mystore;AccountKey=abc123def456ghi789==;EndpointSuffix=core.windows.net',
  },
  {
    label: 'AWS secret access key',
    sample: 'aws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  },
  { label: 'Credit card number', sample: '4597 3579 1372 4576' },
  {
    label: 'High-entropy hex string',
    sample: 'd41d8cd98f00b204e9800998ecf8427e3bbce4dbca09a9e3aeb5c55a40a5a51a',
  },
  { label: 'High-entropy base64 string', sample: 'v/Yw7J1kR+L8xM9pT3qN5zC2bV4jH6mF0gD1sW3nK8c=' },
];

// Everyday text that must NOT trigger the guard — even in pilot/aggressive mode.
const NEGATIVE_SAMPLES: { name: string; sample: string }[] = [
  { name: 'a normal sentence', sample: 'Please review the pull request and merge it when ready.' },
  { name: 'secret/password mentioned in prose', sample: 'The secretary said to reset your password soon.' },
  { name: 'an email address', sample: 'Contact us at john.wright@secureintent.ai for help.' },
  { name: 'a UUID', sample: 'request id 550e8400-e29b-41d4-a716-446655440000' },
  { name: 'an ISO timestamp', sample: 'updated 2026-06-08T14:20:00Z' },
  { name: 'a hex colour', sample: 'background: #1a2b3c; color: #ffffff;' },
  { name: 'an IPv4 address', sample: 'server at 192.168.1.1 port 5432' },
  { name: 'a phone number', sample: 'call +44 7911 123456 today' },
  { name: 'a normal code line', sample: 'const apiUrl = getConfig().endpoint;' },
  { name: 'an invalid-Luhn card', sample: 'card 4597 3579 1372 4577 here' },
];

type Site = { key: keyof typeof DEFAULT_BUNDLE.sites; url: string };

const SITES: Site[] = [
  { key: 'chatgpt', url: 'https://chatgpt.com/' },
  { key: 'claude', url: 'https://claude.ai/' },
  { key: 'gemini', url: 'https://gemini.google.com/' },
  { key: 'perplexity', url: 'https://www.perplexity.ai/' },
  { key: 'copilot', url: 'https://copilot.microsoft.com/' },
  { key: 'grok', url: 'https://grok.com/' },
  { key: 'mistral', url: 'https://chat.mistral.ai/' },
  { key: 'meta', url: 'https://meta.ai/' },
  { key: 'poe', url: 'https://poe.com/' },
  { key: 'v0', url: 'https://v0.app/' },
  { key: 'bolt', url: 'https://bolt.new/' },
  { key: 'lovable', url: 'https://lovable.dev/' },
  { key: 'replit', url: 'https://replit.com/' },
  // Reddit's composer lives behind /submit; the selector is a comma list, so .first().
  { key: 'reddit', url: 'https://www.reddit.com/submit' },
  { key: 'deepseek', url: 'https://chat.deepseek.com/' },
  { key: 'duck', url: 'https://duck.ai/' },
  // GitHub Copilot Chat opens as a side panel; /copilot is the standalone surface.
  { key: 'githubcopilot', url: 'https://github.com/copilot' },
  { key: 'kimi', url: 'https://kimi.com/' },
  { key: 'qwen', url: 'https://chat.qwen.ai/' },
];

// --- composer helpers (handle textarea/input vs contenteditable) ---
// We click() rather than focus() to place a real caret: rich editors like Kimi's
// Lexical ignore typing/paste unless a genuine selection exists, which programmatic
// focus() does not create.

async function composerKind(locator: Locator): Promise<'value' | 'text'> {
  const tag = await locator.evaluate((el) => el.tagName);
  return tag === 'TEXTAREA' || tag === 'INPUT' ? 'value' : 'text';
}

async function readComposer(locator: Locator): Promise<string> {
  if ((await composerKind(locator)) === 'value') return locator.inputValue();
  return locator.innerText();
}

// Place a real caret in the composer. Some sites (Kimi) ship the editor dormant
// (contenteditable="false") and upgrade it to a live Lexical editor only after a
// trusted interaction; Playwright's click() is trusted, but the flip to
// contenteditable="true" is async — so click, then wait for it to become editable
// before driving it. No-op for textareas and already-live contenteditables.
async function focusComposer(locator: Locator): Promise<void> {
  await locator.click();
  const editable = await locator.getAttribute('contenteditable');
  if (editable === null) return; // textarea/input
  await expect(locator).toHaveAttribute('contenteditable', 'true', { timeout: 8_000 });
  await locator.click(); // caret now lands inside the live editor
}

async function clearComposer(locator: Locator): Promise<void> {
  await focusComposer(locator);
  await locator.press('ControlOrMeta+A');
  await locator.press('Delete');
}

async function typeInComposer(locator: Locator, text: string): Promise<void> {
  await focusComposer(locator);
  await locator.page().keyboard.type(text);
}

async function paste(page: Page, text: string): Promise<void> {
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
  await page.keyboard.press('ControlOrMeta+V');
}

for (const site of SITES) {
  test(`${site.key}: paste-guard scenarios`, async ({ context }, testInfo) => {
    const page = await context.newPage();

    // open shadow → Playwright pierces; target overlay buttons by visible text.
    // (Do NOT use getByRole name 'Cancel' — the close ✕ also has that name.)
    const overlay = page.locator('secureintent-overlay');

    try {
      await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      const composer = page.locator(DEFAULT_BUNDLE.sites[site.key].inputSelector).first();
      await composer.waitFor({ state: 'attached', timeout: 15_000 });

      await test.step('lets a benign paste through (no overlay)', async () => {
        await clearComposer(composer);
        await focusComposer(composer);
        await paste(page, 'just a normal message, nothing secret here');
        await page.waitForTimeout(700);
        await expect(overlay).toHaveCount(0);
        expect(await readComposer(composer)).toContain('normal message');
      });

      await test.step('detects on a fresh paste', async () => {
        await clearComposer(composer);
        await focusComposer(composer);
        await paste(page, PASTE);
        await expect(overlay).toBeAttached({ timeout: 12_000 });
        await expect(overlay.getByText('OpenAI API key')).toBeVisible({ timeout: 12_000 });
      });

      await test.step('Cancel inserts nothing', async () => {
        await overlay.getByText('Cancel', { exact: true }).click();
        await expect(overlay).toHaveCount(0);
        expect(await readComposer(composer)).not.toContain('sk-aaaa');
      });

      await test.step('Paste anyway keeps existing text + inserts the secret', async () => {
        await clearComposer(composer);
        await typeInComposer(composer, 'ping ');
        await paste(page, PASTE);
        await expect(overlay).toBeAttached({ timeout: 12_000 });
        await overlay.getByText('Paste anyway', { exact: true }).click();
        await expect(overlay).toHaveCount(0);
        const text = await readComposer(composer);
        expect(text).toContain('ping');
        expect(text).toContain(SECRET);
      });

      await test.step('Paste anonymously tokenizes the secret', async () => {
        await clearComposer(composer);
        await focusComposer(composer);
        await paste(page, PASTE);
        await expect(overlay).toBeAttached({ timeout: 12_000 });
        await overlay.getByText('Paste anonymously', { exact: true }).click();
        await expect(overlay).toHaveCount(0);
        const text = await readComposer(composer);
        expect(text).not.toContain(SECRET); // raw secret gone
        expect(text).toMatch(/⟦SI:[0-9a-f]{8}⟧/); // tokenizeSecrets inserts a reversible token
      });
    } catch (err) {
      // Pages come from a manually-managed persistent context, so Playwright's
      // auto-screenshot doesn't fire — attach one explicitly before the page closes.
      const shot = await page.screenshot({ fullPage: true }).catch(() => null);
      if (shot) await testInfo.attach('failure', { body: shot, contentType: 'image/png' });
      throw err;
    } finally {
      await page.close();
    }
  });
}

test('paused (disabled) → guard does not fire', async ({ context }) => {
  const sws = context.serviceWorkers();
  const sw = sws[0] ?? (await context.waitForEvent('serviceworker'));
  await sw.evaluate(() => chrome.storage.local.set({ si_enabled: false }));
  try {
    const page = await context.newPage();
    const overlay = page.locator('secureintent-overlay');
    await page.goto('https://gemini.google.com/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const composer = page.locator(DEFAULT_BUNDLE.sites.gemini.inputSelector).first();
    await composer.waitFor({ state: 'attached', timeout: 15_000 });
    await focusComposer(composer);
    await paste(page, PASTE);
    await page.waitForTimeout(1000);
    await expect(overlay).toHaveCount(0);
    await page.close();
  } finally {
    await sw.evaluate(() => chrome.storage.local.set({ si_enabled: true }));
  }
});

test('emits a telemetry event with the right shape on action', async ({ context }) => {
  const page = await context.newPage();
  const overlay = page.locator('secureintent-overlay');
  let body: string | null = null;
  await page.route('**/v1/telemetry', async (route) => {
    body = route.request().postData();
    await route.fulfill({ status: 202, contentType: 'application/json', body: '{"accepted":1}' });
  });

  await page.goto('https://gemini.google.com/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const composer = page.locator(DEFAULT_BUNDLE.sites.gemini.inputSelector).first();
  await composer.waitFor({ state: 'attached', timeout: 15_000 });
  await focusComposer(composer);
  await paste(page, PASTE);
  await expect(overlay).toBeAttached({ timeout: 12_000 });
  await overlay.getByText('Paste anonymously', { exact: true }).click();

  await expect.poll(() => body, { timeout: 6_000 }).not.toBeNull();
  const event = JSON.parse(body!);
  expect(event.action).toBe('paste_anonymously');
  expect(event.site).toBeTruthy();
  expect(event.detections[0].fingerprint).toMatch(/^[0-9a-f]{64}$/);
  expect(event.detections[0].type).toBe('known-key');
  expect(event.detections[0].label).toBe('OpenAI API key');
  expect(body).not.toContain('sk-aaaa');
  await page.close();
});

test('chatgpt: detects every secret pattern we guard against', async ({ context }) => {
  const page = await context.newPage();
  const overlay = page.locator('secureintent-overlay');
  await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const composer = page.locator(DEFAULT_BUNDLE.sites.chatgpt.inputSelector).first();
  await composer.waitFor({ state: 'attached', timeout: 15_000 });

  for (const { label, sample } of PATTERN_SAMPLES) {
    await test.step(`detects ${label}`, async () => {
      await clearComposer(composer);
      await focusComposer(composer);
      await paste(page, sample);
      await expect(overlay).toBeAttached({ timeout: 12_000 });
      await expect(overlay.getByText(label, { exact: true })).toBeVisible({ timeout: 12_000 });
      await overlay.getByText('Cancel', { exact: true }).click();
      await expect(overlay).toHaveCount(0);
    });
  }
  await page.close();
});

test('chatgpt: does not flag everyday text (no false positives)', async ({ context }) => {
  const page = await context.newPage();
  const overlay = page.locator('secureintent-overlay');
  await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const composer = page.locator(DEFAULT_BUNDLE.sites.chatgpt.inputSelector).first();
  await composer.waitFor({ state: 'attached', timeout: 15_000 });

  for (const { name, sample } of NEGATIVE_SAMPLES) {
    await test.step(`ignores ${name}`, async () => {
      await clearComposer(composer);
      await focusComposer(composer);
      await paste(page, sample);
      await page.waitForTimeout(700);
      await expect(overlay).toHaveCount(0);
    });
  }
  await page.close();
});
