import { createServer, type Server } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BrowserContext, chromium, expect, test } from '@playwright/test';

/**
 * The install → creator report, end to end in a real Chromium.
 *
 * Loading an unpacked extension fires `onInstalled` with reason `install`, exactly
 * like a store install, so this exercises the real path: read the creator cookie
 * that the landing page left on our domain, POST it once, never send twice.
 *
 * Run with `pnpm e2e:install`, which builds the extension against the local port
 * below — so nothing here can reach the production API or database.
 */

/**
 * The extension's own global. These callbacks are stringified and run inside the
 * service worker, not in this file, so the e2e project has no ambient extension
 * types — declare only the two calls used below.
 */
declare const chrome: {
  storage: { local: { get(keys: string[]): Promise<Record<string, unknown>> } };
  runtime: { setUninstallURL(url: string): Promise<void> };
};

const dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(dirname, '../dist/chrome-mv3');
const PORT = 8788; // must match WXT_API_BASE in the e2e:install script

interface Captured {
  installId: string;
  creator: string | null;
  medium: string | null;
  campaign: string | null;
  browser: string;
  version: string;
  os: string;
}

const TOKEN = 'e2etoken0123456789abcdef01234567';

/** Stand-in for the Worker: records what the extension posted. */
function startApi(received: Captured[]): Promise<Server> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (req.method !== 'POST' || !req.url?.startsWith('/v1/install')) {
        res.writeHead(404).end();
        return;
      }
      let body = '';
      req.on('data', (c) => {
        body += c;
      });
      req.on('end', () => {
        received.push(JSON.parse(body));
        res.writeHead(200, {
          'content-type': 'application/json',
          'access-control-allow-origin': '*',
        }).end(JSON.stringify({ ok: true, recorded: true, token: TOKEN }));
      });
    });
    server.listen(PORT, () => resolve(server));
  });
}

/** A profile that has already visited a creator link, i.e. holds the cookie. */
async function profileWithCreatorCookie(creator: string): Promise<string> {
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'si-install-'));
  // Phase one: no extension yet. The cookie has to exist *before* the install,
  // which is what happens in reality — the click precedes the install.
  const seed = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: Boolean(process.env.HEADLESS),
  });
  // `expires` matters: without it these are session cookies and the profile drops
  // them on close, which is not what the landing page writes (max-age 90 days).
  const common = {
    domain: '.secureintent.ai',
    path: '/',
    secure: true,
    expires: Math.floor(Date.now() / 1000) + 7776000,
  } as const;
  await seed.addCookies([
    { name: 'si_creator', value: creator, ...common },
    { name: 'si_creator_medium', value: 'creator', ...common },
    { name: 'si_creator_campaign', value: 'launch_2026', ...common },
  ]);
  await seed.close(); // flushes cookies into the profile on disk
  return userDataDir;
}

/** Phase two: same profile, extension loaded → `onInstalled` fires for real. */
async function installExtension(userDataDir: string): Promise<BrowserContext> {
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: Boolean(process.env.HEADLESS),
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker');
  return context;
}

test('reports the creator behind the install, exactly once', async () => {
  const received: Captured[] = [];
  const api = await startApi(received);
  const userDataDir = await profileWithCreatorCookie('jhon');
  const context = await installExtension(userDataDir);

  try {
    await expect.poll(() => received.length, { timeout: 15_000 }).toBe(1);

    const [report] = received;
    expect(report.creator).toBe('jhon');
    expect(report.medium).toBe('creator');
    expect(report.campaign).toBe('launch_2026');
    expect(report.browser).toBe('chrome');
    expect(report.installId).toMatch(/^[0-9a-f-]{36}$/i);
    // The build, so one version can be told from another in the numbers.
    expect(report.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(typeof report.os).toBe('string');

    // Waking the background again must not produce a second install: the report
    // runs on every startup, and only the pending flag stops it repeating.
    const page = await context.newPage();
    await page.goto('about:blank');
    await new Promise((r) => setTimeout(r, 3000));
    expect(received).toHaveLength(1);
  } finally {
    await context.close();
    api.close();
  }
});

test('reports an organic install too, just without a creator', async () => {
  const received: Captured[] = [];
  const api = await startApi(received);
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'si-install-none-'));
  const context = await installExtension(userDataDir);

  try {
    // Most installs come from the store listing. Dropping them would leave no
    // denominator, and no way to read any other number.
    await expect.poll(() => received.length, { timeout: 15_000 }).toBe(1);
    expect(received[0].creator).toBeNull();
    expect(received[0].installId).toMatch(/^[0-9a-f-]{36}$/i);
  } finally {
    await context.close();
    api.close();
  }
});

/**
 * The uninstall ping. Nothing of ours runs when the extension is removed, so the
 * address has to be registered now and opened by the browser later — which means
 * the only things a test can prove in a real Chromium are that the extension has
 * what the URL needs, that Chrome accepts the address (it rejects anything that
 * isn't a valid http(s) URL), and that the address does the right thing when
 * opened. The registration call itself is covered by the unit tests.
 */
test('arms an uninstall URL Chrome accepts, carrying the install and its token', async () => {
  const received: Captured[] = [];
  const api = await startApi(received);
  const userDataDir = await profileWithCreatorCookie('jhon');
  const context = await installExtension(userDataDir);

  try {
    await expect.poll(() => received.length, { timeout: 15_000 }).toBe(1);
    const [sw] = context.serviceWorkers();

    // What the extension kept: the id it reported under, and the token the
    // server handed back for proving this ping belongs to a real install.
    const stored = await sw.evaluate(async () => {
      const s = await chrome.storage.local.get(['si_install_id', 'si_install_token']);
      return { id: s.si_install_id as string, token: s.si_install_token as string };
    });
    expect(stored.id).toBe(received[0].installId);
    expect(stored.token).toBe(TOKEN);

    // Chrome validates this address; an unacceptable one throws here.
    const url =
      `http://localhost:${PORT}/v1/uninstall?id=${stored.id}&v=1.0.0&b=chrome&os=mac` +
      `&t=${stored.token}`;
    const accepted = await sw.evaluate(async (u) => {
      try {
        await chrome.runtime.setUninstallURL(u);
        return 'ok';
      } catch (e) {
        return String(e);
      }
    }, url);
    expect(accepted).toBe('ok');
  } finally {
    await context.close();
    api.close();
  }
});
