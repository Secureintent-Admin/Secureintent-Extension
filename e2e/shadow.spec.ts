import path from 'node:path';
import { readFileSync } from 'node:fs';
import { chromium, expect, test, type BrowserContext, type Page, type Worker } from '@playwright/test';
import type { AiService } from '../src/lib/shadow/catalog';

const AI_CATALOG: { services: AiService[] } = JSON.parse(readFileSync('src/lib/shadow/catalog.json', 'utf8'));

declare const chrome: {
  storage: { local: {
    get(key: string): Promise<
      Record<
        string,
        { session: { token: string; seatLabel: string }; queue: object[]; seen: object[] }
      >
    >;
    set(value: Record<string, unknown>): Promise<void>;
  } };
};
const API = 'http://127.0.0.1:8791';
const HEADERS = { 'X-SI-Shadow-Test': '1' };
const KEY = 'si_shadow_test_state_v1';
let context: BrowserContext;
let popup: Page;
let worker: Worker;
let payloads: string[];
const getState = () => worker.evaluate(async key => (await chrome.storage.local.get(key))[key], KEY);

async function enable() {
  await popup.getByRole('checkbox').check();
  await popup.getByRole('button', { name: 'Enable local test', exact: true }).click();
  await expect(popup.getByRole('button', { name: 'Disable & clear pending metadata' })).toBeVisible();
}
async function recordedCount() {
  const state = await getState();
  const response = await context.request.get(API + '/v1/shadow/visits', {
    headers: { ...HEADERS, Authorization: `Bearer ${state.session.token}` },
  });
  expect(response.status()).toBe(200);
  return (await response.json()).total as number;
}

async function activity() {
  const state = await getState();
  const response = await context.request.get(API + '/v1/shadow/activity', {
    headers: { ...HEADERS, Authorization: `Bearer ${state.session.token}` },
  });
  expect(response.status()).toBe(200);
  return response.json() as Promise<{
    visits: number;
    pasteAttempts: number;
    pasteBytes: number;
    sensitiveEvents: number;
  }>;
}

test.beforeEach(async () => {
  payloads = [];
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${path.resolve('dist-shadow/chrome-mv3')}`,
      `--load-extension=${path.resolve('dist-shadow/chrome-mv3')}`],
  });
  // AI page fixtures are entirely local; NEVER contact provider sites in this suite.
  await context.route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith(API + '/')) {
      if (url.endsWith('/v1/shadow/telemetry') && route.request().method() === 'POST') {
        payloads.push(route.request().postData() ?? '');
      }
      await route.continue();
    } else if (url.startsWith('chrome-extension://')) {
      await route.continue();
    } else {
      await route.fulfill({ contentType: 'text/html',
        body: '<!doctype html><title>PRIVATE PAGE TITLE</title><textarea>PRIVATE PAGE CONTENT</textarea>' });
    }
  });
  worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  popup = await context.newPage();
  await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
  await expect(popup.getByText('Shadow AI Discovery', { exact: true })).toBeVisible();
});
test.afterEach(async () => { await context?.close(); });

test('consent, catalog, hostname-only visits and navigation deduplication', async () => {
  const ai = await context.newPage();
  await ai.goto('https://chatgpt.com/c/PRIVATE-CHAT?prompt=PRIVATE-PROMPT#PRIVATE-FRAGMENT');
  await expect.poll(async () => (await getState())?.queue ?? []).toEqual([]);
  await expect(popup.getByRole('button', { name: 'Enable local test' })).toBeDisabled();
  await popup.getByRole('button', { name: 'View AI catalog' }).click();
  await expect(popup.getByText('Google AI Studio', { exact: true })).toBeVisible();
  await enable();
  await ai.reload();
  await expect.poll(recordedCount).toBe(1);
  await ai.evaluate(() => {
    history.pushState({}, '', '/c/ANOTHER-PRIVATE?prompt=SECRET');
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('pageshow'));
  });
  await popup.getByRole('button', { name: 'Sync & refresh' }).click();
  await expect(popup.getByText(/1 recorded visits/)).toBeVisible();
  await ai.goto('https://github.com/openai/ordinary-repository');
  await ai.evaluate(() => {
    const frame = document.createElement('iframe');
    frame.src = 'https://claude.ai/chat/PRIVATE-FRAME';
    document.body.append(frame);
  });
  await expect.poll(async () => ai.frames().length).toBe(2);
  expect(await recordedCount()).toBe(1);
  await ai.goto('https://github.com/copilot/c/PRIVATE?prompt=PRIVATE-PROMPT');
  await expect.poll(recordedCount).toBe(2);
  await ai.reload();
  await expect.poll(recordedCount).toBe(3);
  const state = await getState();
  expect(JSON.stringify(state)).not.toMatch(/PRIVATE|SECRET|prompt|https:\/\/|\/copilot/);
  expect(payloads.length).toBeGreaterThanOrEqual(3);
  for (const body of payloads) {
    expect(body).not.toMatch(/PRIVATE|SECRET|prompt|content|seatId|orgId|url|path|https:/);
    for (const event of JSON.parse(body).events) {
      expect(Object.keys(event).sort()).toEqual(['catalogVersion', 'eventId', 'hostname', 'schemaVersion', 'serviceId', 'timestamp', 'type']);
    }
  }
  await popup.getByRole('button', { name: 'Sync & refresh' }).click();
  await expect(popup.getByText(/3 recorded visits/)).toBeVisible();
  await popup.screenshot({ path: test.info().outputPath('shadow-local-popup.png'), fullPage: true });
  await popup.getByRole('button', { name: 'Disable & clear pending metadata' }).click();
  await expect(popup.getByRole('button', { name: 'Enable local test' })).toBeVisible();
  expect((await getState()).session).toBeNull();
  await ai.goto('https://claude.ai/chat/PRIVATE-AFTER-DISABLE');
  await expect.poll(async () => (await getState()).queue.length).toBe(0);
});

test('captures all catalog hostnames, but not lookalikes', async () => {
  await enable();
  const ai = await context.newPage();
  let count = 0;
  for (const service of AI_CATALOG.services) {
    for (const hostname of service.hostnames) {
      await ai.goto(`https://${hostname}${service.id === 'github-copilot' ? '/copilot' : '/'}`);
      count++;
      await expect.poll(recordedCount).toBe(count);
    }
  }
  await ai.goto('https://chatgpt.com.evil.test/');
  await popup.getByRole('button', { name: 'Sync & refresh' }).click();
  expect(await recordedCount()).toBe(count);
});

test('counts clean and sensitive paste attempts without sending pasted text', async () => {
  await enable();
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'https://chatgpt.com',
  });
  const ai = await context.newPage();
  await ai.goto('https://chatgpt.com/');
  const composer = ai.locator('textarea');
  await composer.fill('');
  await composer.click();

  const clean = 'hello from a clean UTF-8 paste π';
  await ai.evaluate((text) => navigator.clipboard.writeText(text), clean);
  await composer.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
  await expect(composer).toHaveValue(clean);
  await expect.poll(async () => (await activity()).pasteAttempts).toBe(1);
  expect((await activity()).pasteBytes).toBe(new TextEncoder().encode(clean).byteLength);

  await composer.fill('');
  const secret = 'sk-proj-abcdefghijklmnopqrstuvwxyz123456';
  await ai.evaluate((text) => navigator.clipboard.writeText(text), secret);
  await composer.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
  await expect(ai.locator('[data-si-shadow-test="warning"]')).toHaveCount(1);
  await ai.keyboard.press('Escape');
  await expect(ai.locator('[data-si-shadow-test="warning"]')).toHaveCount(0);
  await expect(composer).toHaveValue('');
  await expect.poll(async () => (await activity()).sensitiveEvents).toBe(1);

  const state = await getState();
  expect(JSON.stringify(state)).not.toContain(secret);
  expect(payloads.join('\n')).not.toContain(secret);
  const adminResponse = await context.request.post(API + '/v1/shadow/test-session', {
    headers: HEADERS,
    data: { scenario: 'business-admin', consent: true },
  });
  expect(adminResponse.status()).toBe(201);
  const admin = await adminResponse.json();
  const ledgerResponse = await context.request.post(API + '/v1/shadow/admin/ledger', {
    headers: { ...HEADERS, Authorization: `Bearer ${admin.token}` },
    data: { days: 30, limit: 100, offset: 0 },
  });
  expect(ledgerResponse.status()).toBe(200);
  const ledger = await ledgerResponse.json();
  expect(ledger.events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        hostname: 'chatgpt.com',
        seatLabel: state.session.seatLabel,
        reason: 'OpenAI API key',
        action: 'cancelled',
      }),
    ]),
  );
  expect(JSON.stringify(ledger)).not.toContain(secret);
});

test('retries offline metadata, deduplicates backend replays, and clears pending events on disable', async () => {
  await enable();
  await context.route(API + '/v1/shadow/telemetry', route =>
    route.request().method() === 'POST' ? route.abort() : route.fallback(),
  );
  const ai = await context.newPage();
  await ai.goto('https://claude.ai/chat/PRIVATE');
  await expect.poll(async () => (await getState()).queue.length).toBe(1);
  const saved = await getState();
  expect(await recordedCount()).toBe(0);
  await context.unroute(API + '/v1/shadow/telemetry');
  await popup.getByRole('button', { name: 'Sync & refresh' }).click();
  await expect.poll(recordedCount).toBe(1);
  await expect.poll(async () => (await getState()).queue.length).toBe(0);
  const replay = await context.request.post(API + '/v1/shadow/telemetry', {
    headers: { ...HEADERS, Authorization: `Bearer ${saved.session.token}` }, data: { events: saved.queue },
  });
  expect(replay.status()).toBe(200);
  expect(await recordedCount()).toBe(1);
  await context.route(API + '/v1/shadow/telemetry', route =>
    route.request().method() === 'POST' ? route.abort() : route.fallback(),
  );
  await ai.reload();
  await expect.poll(async () => (await getState()).queue.length).toBe(1);
  await popup.getByRole('button', { name: 'Disable & clear pending metadata' }).click();
  await expect.poll(async () => (await getState()).queue.length).toBe(0);
  await context.unroute(API + '/v1/shadow/telemetry');
  await enable();
  expect(await recordedCount()).toBe(0); // new session cannot receive previous seat's pending events
});

test('backend rejects privacy violations, non-Business identities and tenant spoofing', async () => {
  const api = context.request;
  const event = { schemaVersion: 1, eventId: crypto.randomUUID(), type: 'ai_page_visit',
    timestamp: Date.now(), hostname: 'chatgpt.com', serviceId: 'chatgpt', catalogVersion: 1 };
  for (const scenario of ['free', 'pro', 'business-no-team']) {
    const response = await api.post(API + '/v1/shadow/test-session', { headers: HEADERS, data: { scenario, consent: true } });
    expect(response.status()).toBe(201);
    const session = await response.json();
    const result = await api.post(API + '/v1/shadow/telemetry', {
      headers: { ...HEADERS, Authorization: `Bearer ${session.token}` }, data: { events: [event] },
    });
    expect(result.status()).toBe(403);
  }
  await enable();
  const state = await getState();
  const headers = { ...HEADERS, Authorization: `Bearer ${state.session.token}` };
  for (const data of [{ events: [{ ...event, url: 'https://chatgpt.com/c/PRIVATE' }] },
    { events: [{ ...event, hostname: 'chatgpt.com?prompt=PRIVATE' }] },
    { events: [event], orgId: 'test-org-beta' }, { events: [{ ...event, seatId: 'another' }] }]) {
    expect((await api.post(API + '/v1/shadow/telemetry', { headers, data })).status()).toBe(400);
  }
  expect((await api.post(API + '/v1/shadow/telemetry', { headers, data: { events: [event] } })).status()).toBe(200);
  const other = await api.post(API + '/v1/shadow/test-session', { headers: HEADERS, data: { scenario: 'business-other', consent: true } });
  const otherSession = await other.json();
  const otherRead = await api.get(API + '/v1/shadow/visits', { headers: { ...HEADERS, Authorization: `Bearer ${otherSession.token}` } });
  expect((await otherRead.json()).total).toBe(0);
  expect((await api.post(API + '/v1/shadow/test-session', { headers: { ...HEADERS, Origin: 'https://evil.test' }, data: { scenario: 'business', consent: true } })).status()).toBe(403);
  expect((await api.post(API + '/v1/shadow/test-session', { headers: HEADERS, data: { scenario: 'business', consent: false } })).status()).toBe(400);
});
