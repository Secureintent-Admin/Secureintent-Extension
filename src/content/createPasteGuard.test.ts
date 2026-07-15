import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULT_BUNDLE, saveBundle } from '@/lib/config';
import { acceptTerms, consentItem } from '@/lib/consent';
import type { OverlayAction } from '@/overlay/Overlay';
import * as telemetryService from '@/services/telemetryService';
import { getBlockedCount, setEnabled } from '@/settings';
import { createPasteGuard } from './createPasteGuard';

// Mock the shadow-DOM overlay: capture props, return a fake handle.
const { mountOverlayMock } = vi.hoisted(() => ({ mountOverlayMock: vi.fn() }));
vi.mock('../overlay/mount', () => ({ mountOverlay: mountOverlayMock }));

// Mock the consent gate mount (closed shadow DOM can't render in jsdom).
const { mountConsentGateMock } = vi.hoisted(() => ({ mountConsentGateMock: vi.fn() }));
vi.mock('../overlay/mountConsentGate', () => ({ mountConsentGate: mountConsentGateMock }));

// Mock the entitlement gate. Default: pro unlocked (existing behavior tests).
// proRef.value → ghost gating (hasFeatureCached). anonRef.value → anonymise
// allowance (canAnonymize): true = Pro or free quota left, false = quota exhausted.
const { proRef, anonRef } = vi.hoisted(() => ({
  proRef: { value: true },
  anonRef: { value: true },
}));
vi.mock('@/lib/entitlement', () => ({
  initEntitlementCache: vi.fn(async () => () => {}),
  hasFeatureCached: vi.fn(() => proRef.value),
  getEntitlementSnapshot: vi.fn(() => ({
    plan: 'developer',
    source: 'none',
    pro: false,
    signedIn: false,
    businessDomain: null,
  })),
}));
vi.mock('@/lib/quota', () => ({
  canAnonymize: vi.fn(async () => anonRef.value),
  consumeAnonymize: vi.fn(async () => anonRef.value),
}));

const SECRET = 'sk-' + 'a'.repeat(30);

// Real paste events expose composedPath() (target + ancestors); the guard reads it
// instead of e.target so shadow-DOM composers are reachable. Mirror that here.
function composedPathFrom(target: EventTarget | null): EventTarget[] {
  const path: EventTarget[] = [];
  let node = target as Node | null;
  while (node) {
    path.push(node);
    node = node.parentNode;
  }
  path.push(window);
  return path;
}

interface FakeCtx {
  addEventListener: (target: unknown, type: string, cb: (e: unknown) => unknown) => void;
}

function setup() {
  const handlers: Record<string, (e: unknown) => unknown> = {};
  const ctx: FakeCtx = {
    addEventListener: (_t, type, cb) => {
      handlers[type] = cb;
    },
  };
  const input = document.createElement('div');
  input.id = 'prompt-textarea';
  document.body.appendChild(input);

  const makeEvent = (text: string, target: EventTarget | null = input) => ({
    target,
    isTrusted: true,
    clipboardData: { getData: () => text },
    preventDefault: vi.fn(),
    stopImmediatePropagation: vi.fn(),
    composedPath: () => composedPathFrom(target),
  });

  return {
    input,
    start: () => createPasteGuard(ctx as never, { name: 'ChatGPT', siteKey: 'chatgpt' }),
    firePaste: (e: ReturnType<typeof makeEvent>) => handlers.paste?.(e),
    makeEvent,
  };
}

function lastOnAction(): (a: OverlayAction) => void {
  return mountOverlayMock.mock.calls.at(-1)![1].onAction;
}

// Spy on sendTelemetry for the entire suite so prior tests' fingerprintsPromise resolutions
// don't bleed into the telemetry assertion test.
const sendTelemetrySpy = vi.spyOn(telemetryService, 'sendTelemetry').mockImplementation(() => {});

describe('createPasteGuard', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await acceptTerms(); // default: Terms already accepted (existing behavior tests)
    proRef.value = true; // default: pro unlocked
    anonRef.value = true; // default: anonymise allowed (quota available)
    mountOverlayMock.mockReset();
    mountOverlayMock.mockResolvedValue({ remove: vi.fn() });
    mountConsentGateMock.mockReset();
    mountConsentGateMock.mockResolvedValue({ remove: vi.fn() });
    document.execCommand = vi.fn(() => true);
    sendTelemetrySpy.mockClear();
    // reset the cross-content-script "a dedicated guard is active" window flag
    (window as unknown as Record<string, boolean>).__secureintentDedicated__ = false;
  });
  afterEach(() => document.body.replaceChildren());

  test('unconsented first paste shows the consent gate (not the warning); agreeing then warns', async () => {
    await consentItem.setValue(null); // Terms not yet accepted
    const t = setup();
    await t.start();
    await t.firePaste(t.makeEvent(`x ${SECRET} y`));

    // Consent gate shown; the actual secret warning is withheld until they agree.
    expect(mountConsentGateMock).toHaveBeenCalledTimes(1);
    expect(mountOverlayMock).not.toHaveBeenCalled();

    // Agree → consent recorded and the real warning now shows for this same paste.
    const gateProps = mountConsentGateMock.mock.calls[0][1] as {
      onAgree: () => void;
      onCancel: () => void;
    };
    gateProps.onAgree();
    await vi.waitFor(() => expect(mountOverlayMock).toHaveBeenCalledTimes(1));
    await vi.waitFor(async () => expect(await consentItem.getValue()).not.toBeNull());
  });

  test('unconsented paste that is then cancelled inserts nothing', async () => {
    await consentItem.setValue(null);
    const t = setup();
    await t.start();
    await t.firePaste(t.makeEvent(`x ${SECRET} y`));

    const gateProps = mountConsentGateMock.mock.calls[0][1] as { onCancel: () => void };
    gateProps.onCancel();
    expect(mountOverlayMock).not.toHaveBeenCalled();
    expect(document.execCommand).not.toHaveBeenCalled();
    expect(await consentItem.getValue()).toBeNull(); // still not accepted
  });

  test('lets a clean paste through without blocking', async () => {
    const t = setup();
    await t.start();
    const e = t.makeEvent('just a normal message');
    await t.firePaste(e);

    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(mountOverlayMock).not.toHaveBeenCalled();
  });

  test('blocks a paste containing a secret and shows the overlay', async () => {
    const t = setup();
    await t.start();
    const e = t.makeEvent(`here ${SECRET} end`);
    await t.firePaste(e);

    expect(e.preventDefault).toHaveBeenCalled();
    expect(mountOverlayMock).toHaveBeenCalledTimes(1);
    expect(mountOverlayMock.mock.calls[0][1].site).toBe('ChatGPT');
    expect(mountOverlayMock.mock.calls[0][1].detections).toHaveLength(1);
  });

  test('does not block when protection is disabled', async () => {
    await setEnabled(false);
    const t = setup();
    await t.start();
    const e = t.makeEvent(`here ${SECRET} end`);
    await t.firePaste(e);

    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(mountOverlayMock).not.toHaveBeenCalled();
  });

  test('records the number of secrets intercepted', async () => {
    const t = setup();
    await t.start();
    await t.firePaste(t.makeEvent(`${SECRET} and ${'ghp_' + 'b'.repeat(36)}`));

    // recordBlocked is fire-and-forget, so poll for the write to land.
    await vi.waitFor(async () => expect(await getBlockedCount()).toBe(2));
  });

  test('ignores programmatic (untrusted) pastes to avoid re-insert loops', async () => {
    const t = setup();
    await t.start();
    const e = { ...t.makeEvent(`here ${SECRET} end`), isTrusted: false };
    await t.firePaste(e);

    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(mountOverlayMock).not.toHaveBeenCalled();
  });

  test('ignores pastes targeted outside the input', async () => {
    const t = setup();
    await t.start();
    const outside = document.createElement('textarea');
    document.body.appendChild(outside);
    const e = t.makeEvent(`here ${SECRET} end`, outside);
    await t.firePaste(e);

    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(mountOverlayMock).not.toHaveBeenCalled();
  });

  test('"paste" action inserts the original text', async () => {
    const t = setup();
    await t.start();
    await t.firePaste(t.makeEvent(`x ${SECRET} y`));
    lastOnAction()('paste');

    expect(document.execCommand).toHaveBeenCalledWith('insertText', false, `x ${SECRET} y`);
  });

  test('Slate editors (e.g. Discord) receive a synthetic paste, not execCommand', async () => {
    // jsdom can't construct DataTransfer/ClipboardEvent — provide Event-based fakes.
    class FakeDT {
      private d = '';
      setData(_t: string, v: string) {
        this.d = v;
      }
      getData() {
        return this.d;
      }
    }
    class FakeClipboardEvent extends Event {
      clipboardData: FakeDT | undefined;
      constructor(type: string, init?: { clipboardData?: FakeDT } & EventInit) {
        super(type, init);
        this.clipboardData = init?.clipboardData;
      }
    }
    vi.stubGlobal('DataTransfer', FakeDT);
    vi.stubGlobal('ClipboardEvent', FakeClipboardEvent);

    const t = setup();
    t.input.setAttribute('data-slate-editor', 'true');
    let pasted: string | null = null;
    t.input.addEventListener('paste', (e) => {
      pasted = (e as unknown as FakeClipboardEvent).clipboardData?.getData() ?? '';
      e.preventDefault(); // Slate consumes the paste
    });

    await t.start();
    await t.firePaste(t.makeEvent(`x ${SECRET} y`));
    (document.execCommand as ReturnType<typeof vi.fn>).mockClear();
    lastOnAction()('paste');

    expect(pasted).toContain(SECRET);
    expect(document.execCommand).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  test('"redact" action inserts text with the secret removed', async () => {
    const t = setup();
    await t.start();
    await t.firePaste(t.makeEvent(`x ${SECRET} y`));
    lastOnAction()('redact');

    const inserted = (document.execCommand as ReturnType<typeof vi.fn>).mock.calls.at(-1)![2];
    expect(inserted).not.toContain(SECRET);
    expect(inserted).toContain('x ');
  });

  test('free user with quota exhausted: overlay pro=false and "redact" is gated', async () => {
    proRef.value = false; // no ghost feature
    anonRef.value = false; // monthly anonymise quota used up
    const t = setup();
    await t.start();
    await t.firePaste(t.makeEvent(`x ${SECRET} y`));

    // Overlay renders the locked Pro state (upgrade prompt).
    expect(mountOverlayMock.mock.calls[0][1].pro).toBe(false);

    // Even if the (locked) action fires, the pro path does not run.
    lastOnAction()('redact');
    const calls = (document.execCommand as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.every((c) => !/⟦SI:[0-9a-f]{8}⟧/.test(String(c[2])))).toBe(true);
  });

  test('free user with quota left: overlay pro=true and "redact" anonymises', async () => {
    proRef.value = false; // no ghost feature
    anonRef.value = true; // free monthly quota available
    const t = setup();
    await t.start();
    await t.firePaste(t.makeEvent(`x ${SECRET} y`));
    expect(mountOverlayMock.mock.calls[0][1].pro).toBe(true);
    lastOnAction()('redact');
    const inserted = (document.execCommand as ReturnType<typeof vi.fn>).mock.calls.at(-1)![2];
    expect(inserted).toMatch(/⟦SI:[0-9a-f]{8}⟧/);
  });

  test('"redact" action inserts reversible SI tokens in place of the secret', async () => {
    const t = setup();
    await t.start();
    await t.firePaste(t.makeEvent(`x ${SECRET} y`));
    lastOnAction()('redact');

    const inserted = (document.execCommand as ReturnType<typeof vi.fn>).mock.calls.at(-1)![2];
    expect(inserted).not.toContain(SECRET);
    expect(inserted).toMatch(/⟦SI:[0-9a-f]{8}⟧/);
  });

  // Dehydrate a secret, then paste its token back, returning the token string.
  async function dehydrateToken(t: ReturnType<typeof setup>): Promise<string> {
    await t.firePaste(t.makeEvent(`x ${SECRET} y`));
    lastOnAction()('redact'); // populates memVault synchronously
    const inserted = (document.execCommand as ReturnType<typeof vi.fn>).mock.calls.at(-1)![2];
    return inserted.match(/⟦SI:[0-9a-f]{8}⟧/)![0];
  }

  test('rehydrate: pasting a token prompts, and "Rehydrate" restores the real secret', async () => {
    const t = setup();
    await t.start();
    const token = await dehydrateToken(t);

    const e = t.makeEvent(`const key = "${token}";`);
    await t.firePaste(e);
    expect(e.preventDefault).toHaveBeenCalled();
    // A rehydrate overlay is shown rather than swapping silently.
    expect(mountOverlayMock.mock.calls.at(-1)![1].rehydrate).toEqual({ tokenCount: 1 });

    lastOnAction()('rehydrate');
    const out = (document.execCommand as ReturnType<typeof vi.fn>).mock.calls.at(-1)![2];
    expect(out).toBe(`const key = "${SECRET}";`);
  });

  test('rehydrate: "Keep tokens" inserts the token text unchanged', async () => {
    const t = setup();
    await t.start();
    const token = await dehydrateToken(t);

    await t.firePaste(t.makeEvent(`const key = "${token}";`));
    lastOnAction()('paste');
    const out = (document.execCommand as ReturnType<typeof vi.fn>).mock.calls.at(-1)![2];
    expect(out).toBe(`const key = "${token}";`);
    expect(out).not.toContain(SECRET);
  });

  test('rehydrate: "Cancel" drops the paste (nothing inserted)', async () => {
    const t = setup();
    await t.start();
    const token = await dehydrateToken(t);
    const insertsBefore = (document.execCommand as ReturnType<typeof vi.fn>).mock.calls.length;

    await t.firePaste(t.makeEvent(`const key = "${token}";`));
    lastOnAction()('cancel');
    expect((document.execCommand as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      insertsBefore,
    );
  });

  test('rehydrate: pasting text without tokens is left untouched', async () => {
    const t = setup();
    await t.start();
    const e = t.makeEvent('just some normal pasted text');
    await t.firePaste(e);

    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(document.execCommand).not.toHaveBeenCalled();
  });

  test('large paste routes to Ghost: summary overlay, Sanitize & paste strips IPs/emails', async () => {
    const t = setup();
    await t.start();
    const filler = 'application log line number forty-two here '.repeat(60); // > 2000 chars
    const log = `${filler} host 10.0.0.5 contacted ops@corp.com ${filler}`;
    await t.firePaste(t.makeEvent(log));

    const props = mountOverlayMock.mock.calls.at(-1)![1];
    expect(props.summary).toBeTruthy();
    expect(props.summary.total).toBeGreaterThanOrEqual(2);

    lastOnAction()('sanitize');
    const inserted = (document.execCommand as ReturnType<typeof vi.fn>).mock.calls.at(-1)![2];
    expect(inserted).not.toContain('10.0.0.5');
    expect(inserted).not.toContain('ops@corp.com');
    expect(inserted).toContain('[#IP_1#]');
    expect(inserted).toContain('[#EMAIL_1#]');
  });

  test('small paste uses the normal per-finding overlay (no Ghost summary)', async () => {
    const t = setup();
    await t.start();
    await t.firePaste(t.makeEvent(`x ${SECRET} y`));

    const props = mountOverlayMock.mock.calls.at(-1)![1];
    expect(props.summary).toBeUndefined();
    expect(props.detections).toHaveLength(1);
  });

  test('large paste of only internal IPs (no keys) still triggers Ghost', async () => {
    const t = setup();
    await t.start();
    const log = `${'x'.repeat(2100)} 192.168.1.1`;
    await t.firePaste(t.makeEvent(log));

    const props = mountOverlayMock.mock.calls.at(-1)![1];
    expect(props.summary.total).toBe(1);
  });

  test('large benign paste with nothing sensitive passes through', async () => {
    const t = setup();
    await t.start();
    const e = t.makeEvent('lorem ipsum dolor sit amet '.repeat(120));
    await t.firePaste(e);

    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(mountOverlayMock).not.toHaveBeenCalled();
  });

  test('"cancel" action inserts nothing', async () => {
    const t = setup();
    await t.start();
    await t.firePaste(t.makeEvent(`x ${SECRET} y`));
    lastOnAction()('cancel');

    expect(document.execCommand).not.toHaveBeenCalled();
  });

  test('emits a telemetry event with paste_anonymously action and no raw secret on "redact"', async () => {
    const t = setup();
    await t.start();
    await t.firePaste(t.makeEvent(`x ${SECRET} y`));

    lastOnAction()('redact');

    const event = await vi.waitFor(() => {
      const call = sendTelemetrySpy.mock.calls.find(([e]) => e?.action === 'paste_anonymously');
      expect(call).toBeTruthy();
      return call![0];
    });

    expect(event.detections).toHaveLength(1);
    expect(event.detections[0].fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(event.detections[0].label).toBe('OpenAI API key');
    expect(JSON.stringify(event)).not.toContain('sk-');
  });

  test('uses the bundle inputSelector for the site when present', async () => {
    // Seed the bundle with a custom selector for 'chatgpt'
    await saveBundle({ ...DEFAULT_BUNDLE, sites: { chatgpt: { inputSelector: '#custom-input' } } });

    // Build a harness that uses the bundle selector, not the fallback
    let handler: ((e: unknown) => unknown) | undefined;
    const ctx = {
      addEventListener: (_t: unknown, _type: string, cb: (e: unknown) => unknown) => {
        handler = cb;
      },
    };
    const customInput = document.createElement('div');
    customInput.id = 'custom-input';
    document.body.appendChild(customInput);

    await createPasteGuard(ctx as never, { name: 'ChatGPT', siteKey: 'chatgpt' });

    const e = {
      target: customInput,
      isTrusted: true,
      clipboardData: { getData: () => `here ${SECRET} end` },
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
      composedPath: () => composedPathFrom(customInput),
    };
    await handler?.(e);

    // The guard should have matched the bundle's #custom-input and blocked the paste
    expect(e.preventDefault).toHaveBeenCalled();
    expect(mountOverlayMock).toHaveBeenCalledTimes(1);
  });

  test('comma-selector: paste into second field (body div) is blocked', async () => {
    const commaSelector = 'textarea[name="title"], div[contenteditable="true"][name="body"]';
    await saveBundle({ ...DEFAULT_BUNDLE, sites: { reddit: { inputSelector: commaSelector } } });

    let handler: ((e: unknown) => unknown) | undefined;
    const ctx = {
      addEventListener: (_t: unknown, _type: string, cb: (e: unknown) => unknown) => {
        handler = cb;
      },
    };

    const bodyDiv = document.createElement('div');
    bodyDiv.setAttribute('contenteditable', 'true');
    bodyDiv.setAttribute('name', 'body');
    document.body.appendChild(bodyDiv);

    await createPasteGuard(ctx as never, { name: 'Reddit', siteKey: 'reddit' });

    const e = {
      target: bodyDiv,
      isTrusted: true,
      clipboardData: { getData: () => `here ${SECRET} end` },
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
      composedPath: () => composedPathFrom(bodyDiv),
    };
    await handler?.(e);

    expect(e.preventDefault).toHaveBeenCalled();
    expect(mountOverlayMock).toHaveBeenCalledTimes(1);
  });

  test('does not block when killSwitch is active', async () => {
    await saveBundle({ ...DEFAULT_BUNDLE, killSwitch: true });

    const t = setup();
    await t.start();
    const e = t.makeEvent(`here ${SECRET} end`);
    await t.firePaste(e);

    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(mountOverlayMock).not.toHaveBeenCalled();
  });

  const HASH = 'd41d8cd98f00b204e9800998ecf8427e3bbce4dbca09a9e3aeb5c55a40a5a51a';

  test('aggressive (pilot) flags a high-entropy hash', async () => {
    await saveBundle({ ...DEFAULT_BUNDLE, aggressive: true });
    const t = setup();
    await t.start();
    const e = t.makeEvent(`hash ${HASH} end`);
    await t.firePaste(e);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  test('standard tuning (aggressive: false) does NOT flag the same hash', async () => {
    await saveBundle({ ...DEFAULT_BUNDLE, aggressive: false });
    const t = setup();
    await t.start();
    const e = t.makeEvent(`hash ${HASH} end`);
    await t.firePaste(e);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(mountOverlayMock).not.toHaveBeenCalled();
  });

  test('fail-open: re-inserts the blocked paste when mountOverlay throws', async () => {
    // Arrange: make mountOverlay reject so the catch branch is exercised
    mountOverlayMock.mockRejectedValueOnce(new Error('mount boom'));

    const t = setup();
    await t.start();

    const text = `here ${SECRET} end`;
    const e = t.makeEvent(text);

    // Act: fire the paste and wait for the rejection to propagate through the async handler
    await t.firePaste(e);
    // The handler is async; give the microtask queue a tick to settle
    await new Promise((r) => setTimeout(r, 0));

    // The paste was intercepted (blocked) before the error
    expect(e.preventDefault).toHaveBeenCalled();

    // Fail-open: execCommand must have been called to re-insert the original text
    expect(document.execCommand).toHaveBeenCalledWith('insertText', false, text);
  });
});

describe('fallback guard (catch-all)', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await acceptTerms(); // default: Terms already accepted (existing behavior tests)
    proRef.value = true; // default: pro unlocked
    anonRef.value = true; // default: anonymise allowed (quota available)
    mountOverlayMock.mockReset();
    mountOverlayMock.mockResolvedValue({ remove: vi.fn() });
    mountConsentGateMock.mockReset();
    mountConsentGateMock.mockResolvedValue({ remove: vi.fn() });
    document.execCommand = vi.fn(() => true);
    (window as unknown as Record<string, boolean>).__secureintentDedicated__ = false;
  });
  afterEach(() => document.body.replaceChildren());

  function setupFallback() {
    let handler: ((e: unknown) => unknown) | undefined;
    const ctx = {
      addEventListener: (_t: unknown, _type: string, cb: (e: unknown) => unknown) => {
        handler = cb;
      },
    };
    const input = document.createElement('textarea'); // matches the generic fallback selector
    document.body.appendChild(input);
    const e = {
      target: input,
      isTrusted: true,
      clipboardData: { getData: () => `here ${SECRET} end` },
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
      composedPath: () => composedPathFrom(input),
    };
    return {
      e,
      start: () => createPasteGuard(ctx as never, { name: 'example.com', siteKey: 'fallback' }),
      firePaste: () => handler?.(e),
    };
  }

  test('blocks a secret on an unsupported site (no dedicated guard present)', async () => {
    const t = setupFallback();
    await t.start();
    await t.firePaste();
    expect(t.e.preventDefault).toHaveBeenCalled();
    expect(mountOverlayMock).toHaveBeenCalledTimes(1);
  });

  test('bails when a dedicated guard already owns the page', async () => {
    // a dedicated (non-fallback) guard marks the shared window flag synchronously
    (window as unknown as Record<string, boolean>).__secureintentDedicated__ = true;
    const t = setupFallback();
    await t.start();
    await t.firePaste();
    expect(t.e.preventDefault).not.toHaveBeenCalled();
    expect(mountOverlayMock).not.toHaveBeenCalled();
  });
});
