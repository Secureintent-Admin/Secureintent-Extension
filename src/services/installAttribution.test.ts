import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from '#imports';
import { acceptTerms } from '@/lib/consent';
import { markInstallPending, reportInstall, syncUninstallUrl } from './installAttribution';

// browser.cookies isn't implemented by fake-browser — stub the one call we make.
const cookies: Record<string, string> = {};
vi.stubGlobal('crypto', { ...globalThis.crypto, randomUUID: () => 'install-uuid-0000-0000' });

beforeEach(() => {
  fakeBrowser.reset();
  for (const k of Object.keys(cookies)) delete cookies[k];
  (fakeBrowser as unknown as { cookies: unknown }).cookies = {
    get: vi.fn(async ({ name }: { name: string }) =>
      cookies[name] ? { value: cookies[name] } : null,
    ),
  };
  // fake-browser implements neither of these — the uninstall URL is the whole
  // mechanism for hearing about a removal, so stub what it needs.
  uninstallUrls.length = 0;
  fakeBrowser.runtime.setUninstallURL = vi.fn(async (url: string) => {
    uninstallUrls.push(url);
  }) as unknown as typeof fakeBrowser.runtime.setUninstallURL;
  fakeBrowser.runtime.getPlatformInfo = vi.fn(async () => ({
    os: 'mac',
    arch: 'arm64',
    nacl_arch: 'arm64',
  })) as unknown as typeof fakeBrowser.runtime.getPlatformInfo;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 200 })),
  );
});

const body = () =>
  JSON.parse(String((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body));

/** Every address handed to the browser, newest last. */
const uninstallUrls: string[] = [];
const lastUninstallUrl = () => uninstallUrls[uninstallUrls.length - 1];

describe('reportInstall', () => {
  it('does nothing when no install is pending', async () => {
    await expect(reportInstall()).resolves.toBe('not-pending');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends on Chrome without waiting for the Terms accept', async () => {
    await markInstallPending();
    cookies.si_creator = 'jhon';
    await expect(reportInstall()).resolves.toBe('sent');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('holds until consent on the Firefox build (AMO declares required: none)', async () => {
    vi.resetModules();
    vi.doMock('@/lib/clerkConfig', () => ({
      IS_FIREFOX: true,
      WEB_APP_URL: 'https://secureintent.ai',
    }));
    const ff = await import('./installAttribution');
    await ff.markInstallPending();
    cookies.si_creator = 'jhon';

    await expect(ff.reportInstall()).resolves.toBe('awaiting-consent');
    expect(fetch).not.toHaveBeenCalled();

    await acceptTerms();
    await expect(ff.reportInstall()).resolves.toBe('sent');
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.doUnmock('@/lib/clerkConfig');
    vi.resetModules();
  });

  it('sends the creator, medium and campaign it finds in the cookies', async () => {
    await markInstallPending();
    await acceptTerms();
    cookies.si_creator = 'jhon';
    cookies.si_creator_medium = 'creator';
    cookies.si_creator_campaign = 'launch_2026';

    await expect(reportInstall()).resolves.toBe('sent');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(body()).toMatchObject({
      installId: 'install-uuid-0000-0000',
      creator: 'jhon',
      medium: 'creator',
      campaign: 'launch_2026',
    });

    // Reported once; a later call (e.g. the sync alarm) must not re-send.
    await expect(reportInstall()).resolves.toBe('not-pending');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reports an organic install too — without the organic ones there is no denominator', async () => {
    await markInstallPending();
    await acceptTerms();

    await expect(reportInstall()).resolves.toBe('sent');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(body()).toMatchObject({ installId: 'install-uuid-0000-0000', creator: null });

    // Still once only: the alarm must not re-send what already landed.
    await expect(reportInstall()).resolves.toBe('not-pending');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('carries the build so one version can be told from another in the numbers', async () => {
    await markInstallPending();
    await acceptTerms();
    await expect(reportInstall()).resolves.toBe('sent');
    const sent = body();
    // `browser` comes from a build-time define that isn't set under vitest, so
    // only assert what the runtime itself supplies.
    expect(typeof sent.version).toBe('string');
    expect(typeof sent.os).toBe('string');
  });

  it('stays pending after a server error so the alarm can retry', async () => {
    await markInstallPending();
    await acceptTerms();
    cookies.si_creator = 'jhon';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 })),
    );

    await expect(reportInstall()).resolves.toBe('error');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    );
    await expect(reportInstall()).resolves.toBe('sent');
  });

  it('gives up on a 4xx, which will never succeed', async () => {
    await markInstallPending();
    await acceptTerms();
    cookies.si_creator = 'jhon';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 400 })),
    );

    await expect(reportInstall()).resolves.toBe('error');
    await expect(reportInstall()).resolves.toBe('not-pending');
  });

  it('stays pending when the network throws (offline at install)', async () => {
    await markInstallPending();
    await acceptTerms();
    cookies.si_creator = 'jhon';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );

    await expect(reportInstall()).resolves.toBe('error');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    );
    await expect(reportInstall()).resolves.toBe('sent');
  });
});

/**
 * MV3 stops the extension the instant it is removed, so this URL — registered
 * while we are still alive — is the only way an uninstall is ever heard about.
 */
describe('syncUninstallUrl', () => {
  it('registers nothing until there is an install to report', async () => {
    await syncUninstallUrl();
    expect(lastUninstallUrl()).toBe('');
  });

  it('points at the API with the install id and the build', async () => {
    await markInstallPending();
    await acceptTerms();
    await syncUninstallUrl();

    const url = new URL(lastUninstallUrl());
    expect(url.pathname).toBe('/v1/uninstall');
    expect(url.searchParams.get('id')).toBe('install-uuid-0000-0000');
    expect(url.searchParams.get('os')).toBe('mac');
    expect(url.searchParams.get('v')).toBe(String(url.searchParams.get('v')));
    // Nothing about the person, and nothing we could not already see.
    expect(url.search).not.toMatch(/email|user|@/i);
  });

  it('carries the token once the server has issued one', async () => {
    await markInstallPending();
    await acceptTerms();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ ok: true, token: 'abc123' }), { status: 200 }),
      ),
    );
    await reportInstall();

    expect(new URL(lastUninstallUrl()).searchParams.get('t')).toBe('abc123');
  });

  it('stays unarmed on Firefox until the Terms are accepted', async () => {
    vi.resetModules();
    vi.doMock('@/lib/clerkConfig', () => ({
      IS_FIREFOX: true,
      WEB_APP_URL: 'https://secureintent.ai',
    }));
    const ff = await import('./installAttribution');
    await ff.markInstallPending();

    await ff.syncUninstallUrl();
    expect(lastUninstallUrl()).toBe(''); // AMO is promised nothing is sent

    await acceptTerms();
    await ff.syncUninstallUrl();
    expect(lastUninstallUrl()).toContain('/v1/uninstall');

    vi.doUnmock('@/lib/clerkConfig');
    vi.resetModules();
  });

  it('never throws into the background startup path', async () => {
    await markInstallPending();
    await acceptTerms();
    fakeBrowser.runtime.setUninstallURL = vi.fn(async () => {
      throw new Error('not supported');
    }) as unknown as typeof fakeBrowser.runtime.setUninstallURL;
    await expect(syncUninstallUrl()).resolves.toBeUndefined();
  });
});
