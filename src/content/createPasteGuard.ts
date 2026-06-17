import { browser, type ContentScriptContext, storage } from '#imports';
import { DEFAULT_BUNDLE, getActiveBundle } from '@/lib/config';
import { elapsedMs, siDebug, siError } from '@/lib/debug';
import {
  compilePatterns,
  detectSecrets,
  GHOST_EXTRA_PATTERNS,
  GHOST_MIN_CHARS,
  sanitize,
  summarize,
  TOKEN_RE,
  tokenizeSecrets,
} from '@/lib/detection';
import { notifyAction, notifyDetections } from '@/lib/features';
import {
  computeFingerprint,
  type Fingerprint,
  getOrCreateSalt,
  type KeyValueStore,
} from '@/lib/fingerprint';
import type { TelemetryAction } from '@/lib/telemetry/types';
import { type VaultStore, vaultPut, vaultSnapshot } from '@/lib/vault';
import { mountOverlay } from '@/overlay/mount';
import { buildEvent, sendTelemetry } from '@/services/telemetryService';
import { enabledItem, isEnabled, recordBlocked } from '@/settings';
import { findComposer } from './findComposer';
import type { SiteConfig } from './types';

const ACTION_BY_OVERLAY: Record<'paste' | 'redact' | 'cancel', TelemetryAction> = {
  paste: 'paste_anyway',
  redact: 'paste_anonymously',
  cancel: 'cancelled',
};
const browserStore: KeyValueStore = {
  get: async (key) => (await storage.getItem<string>(`local:${key}`)) ?? undefined,
  set: (key, value) => storage.setItem(`local:${key}`, value),
};
// RAM-only (cleared on browser close) — holds token→secret maps for rehydration.
const sessionStore: VaultStore = {
  get: async (key) => (await storage.getItem<string>(`session:${key}`)) ?? undefined,
  set: (key, value) => storage.setItem(`session:${key}`, value),
};
// Match-all variant of the single-token regex, for scanning copied selections.
const TOKEN_GLOBAL = new RegExp(TOKEN_RE.source, 'g');

function insertText(el: HTMLElement, text: string): void {
  el.focus();
  // Some sites (e.g. GitHub Copilot) select the whole field on programmatic
  // focus. Collapse any active selection first so we append at the caret
  // instead of overwriting the user's existing text.
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    if (el.selectionStart !== el.selectionEnd) {
      const caret = el.selectionEnd ?? el.value.length;
      el.setSelectionRange(caret, caret);
    }
  } else {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) {
      // Rich editors (e.g. Kimi's Lexical) drop the selection when focus moves
      // to our overlay, leaving execCommand nowhere to insert. Restore a caret
      // at the end of the editor.
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    } else if (!sel.isCollapsed) {
      sel.collapseToEnd();
    }
  }
  document.execCommand('insertText', false, text);
}

// Content scripts from the same extension share one isolated-world `window`, so a
// dedicated per-site guard marks it here and the catch-all fallback guard checks it
// at paste time — preventing a double overlay on the 19 supported sites without
// maintaining an exclude-list.
const DEDICATED_FLAG = '__secureintentDedicated__';
function markDedicated(): void {
  (window as unknown as Record<string, boolean>)[DEDICATED_FLAG] = true;
}
function dedicatedActive(): boolean {
  return Boolean((window as unknown as Record<string, boolean>)[DEDICATED_FLAG]);
}

export async function createPasteGuard(
  ctx: ContentScriptContext,
  config: SiteConfig,
): Promise<void> {
  const isFallback = config.siteKey === 'fallback';
  if (!isFallback) markDedicated(); // synchronous: runs before the awaits below

  const salt = await getOrCreateSalt(browserStore);
  let open = false;

  // preventDefault must run before any await, so cache enabled synchronously
  let enabled = await isEnabled();
  enabledItem.watch((value) => {
    enabled = value ?? true;
  });

  const bundle = await getActiveBundle();
  const compiled = compilePatterns(bundle.patterns);
  // entropy patterns are pilot-only; standard tuning (aggressive: false) drops them
  const patterns =
    bundle.aggressive === false ? compiled.filter((p) => p.validate !== 'entropy') : compiled;
  // Ghost Sanitizer: large pastes get the aggressive expanded set (keys + internal
  // IPs + emails), entropy excluded so log hashes/SHAs don't get stripped.
  const ghostPatterns = [
    ...compiled.filter((p) => p.validate !== 'entropy'),
    ...GHOST_EXTRA_PATTERNS,
  ];
  const ghostMin =
    typeof bundle.ghost?.minChars === 'number' ? bundle.ghost.minChars : GHOST_MIN_CHARS;
  const inputSelector =
    bundle.sites[config.siteKey]?.inputSelector ??
    DEFAULT_BUNDLE.sites[config.siteKey]?.inputSelector;
  if (!inputSelector) return; // unknown site — nothing to guard

  siDebug(config.name, 'guard active', { selector: inputSelector });

  const origin = location.origin;

  // In-memory token→secret cache. The copy handler must rewrite the clipboard
  // synchronously (before any await), so it cannot read the async session vault
  // directly; this Map mirrors it. RAM-only, cleared on page unload. Hydrated
  // from the session vault so tokens survive a same-session page reload.
  const memVault = new Map<string, string>();
  vaultSnapshot(sessionStore, origin, Date.now())
    .then((snap) => {
      for (const [token, secret] of Object.entries(snap)) memVault.set(token, secret);
    })
    .catch((err) => siError(config.name, 'vault hydrate failed', err));

  // Rehydrate: when the user copies the model's reply, swap any of our tokens
  // back to the real secrets so pasted-back code just works. Must run fully
  // synchronously (clipboard mutation has to happen inside the copy event).
  // Fails open: any error leaves the native copy untouched.
  ctx.addEventListener(
    document,
    'copy',
    (event) => {
      try {
        const e = event as ClipboardEvent;
        const selection = window.getSelection()?.toString() ?? '';
        if (!selection || !TOKEN_RE.test(selection)) return; // nothing of ours
        const tokens = new Set(selection.match(TOKEN_GLOBAL) ?? []);
        let out = selection;
        let changed = false;
        for (const token of tokens) {
          const secret = memVault.get(token);
          if (secret !== undefined) {
            out = out.split(token).join(secret);
            changed = true;
          }
        }
        if (!changed) return; // tokens unknown/expired — leave the copy untouched
        e.clipboardData?.setData('text/plain', out);
        e.preventDefault();
        e.stopImmediatePropagation();
        siDebug(config.name, 'rehydrated copy', { tokens: tokens.size });
      } catch (err) {
        siError(config.name, 'rehydrate error, copy left unchanged', err);
      }
    },
    { capture: true },
  );

  ctx.addEventListener(
    document,
    'paste',
    async (event) => {
      const e = event as ClipboardEvent;
      let recoverPaste: (() => void) | null = null;
      try {
        if (isFallback && dedicatedActive()) return; // a dedicated guard owns this site
        if (open) return;
        if (!enabled) return; // protection off — let the paste through
        if (bundle.killSwitch) return; // remote kill-switch — let the paste through
        if (!e.isTrusted) return; // ignore programmatic pastes (e.g. our own re-inserts)

        // composedPath includes shadow-internal nodes, so sites whose composer lives
        // inside a web-component shadow root (e.g. Reddit) are matched too.
        const input = findComposer(e.composedPath(), inputSelector);
        if (!input) return;

        const text = e.clipboardData?.getData('text/plain') ?? '';
        if (!text) return;

        // Large pastes look like log/terminal dumps: take the aggressive Ghost
        // path (expanded ruleset + summary overlay) instead of the per-finding one.
        const ghostMode = text.length >= ghostMin;
        const tDetect = performance.now();
        const detections = detectSecrets(text, ghostMode ? ghostPatterns : patterns);
        const detectMs = elapsedMs(tDetect);
        if (detections.length === 0) return; // let normal paste happen

        e.preventDefault();
        e.stopImmediatePropagation();
        recoverPaste = () => insertText(input, text);
        recordBlocked(detections.length); // popup total; on-device only
        // per-tab action badge (background owns browser.action)
        browser.runtime
          .sendMessage({ type: 'si-detected', count: detections.length })
          .catch(() => {});

        // Open-core seam: premium features observe detections (metadata only —
        // raw text is never passed). Fire-and-forget; no-op in the free build.
        const featureCtx = {
          site: config.name,
          siteKey: config.siteKey,
          detectionCount: detections.length,
          types: detections.map((d) => d.type),
          labels: detections.map((d) => d.label),
        };
        notifyDetections(featureCtx);

        // Telemetry is per-finding (one fingerprint each). Ghost pastes can hold
        // hundreds of findings, so telemetry is skipped for them in this build.
        const fingerprintsPromise = ghostMode
          ? null
          : Promise.all(
              detections.map(async (d) => {
                const fingerprint = await computeFingerprint(d.match, salt);
                siDebug(config.name, 'fingerprint', { label: d.label, fingerprint });
                return { fingerprint, type: d.type, label: d.label };
              }),
            ).catch(
              (
                err,
              ): {
                fingerprint: Fingerprint;
                type: (typeof detections)[number]['type'];
                label: string;
              }[] => {
                siError(config.name, 'fingerprint error, telemetry suppressed', err);
                return [];
              },
            );

        open = true;
        const tMount = performance.now();
        const overlay = await mountOverlay(ctx, {
          site: config.name,
          text,
          detections,
          summary: ghostMode ? summarize(detections) : undefined,
          onAction: (action) => {
            if (action === 'paste') insertText(input, text);
            else if (action === 'sanitize') {
              // Ghost: strip every finding to a typed placeholder. Irreversible.
              insertText(input, sanitize(text, detections));
            } else if (action === 'redact') {
              // Dehydrate: replace secrets with reversible tokens and stash the
              // token→secret map so a later copy can rehydrate them.
              const { text: masked, entries } = tokenizeSecrets(text, detections);
              insertText(input, masked);
              for (const { token, secret } of entries) memVault.set(token, secret); // sync read path
              vaultPut(sessionStore, origin, entries, Date.now()).catch((err) =>
                siError(config.name, 'vault put failed', err),
              );
            }
            notifyAction({ ...featureCtx, action }); // pro: audit log / team report
            if (!ghostMode && action !== 'sanitize' && fingerprintsPromise) {
              const telemetryAction = ACTION_BY_OVERLAY[action];
              fingerprintsPromise.then((dets) => {
                if (dets.length === 0) return;
                sendTelemetry(
                  buildEvent({
                    site: config.name,
                    policyVersion: bundle.version,
                    detections: dets,
                    action: telemetryAction,
                  }),
                );
              });
            }
            overlay.remove();
            open = false;
          },
        });

        siDebug(config.name, 'paste blocked', {
          secrets: detections.length,
          types: detections.map((d) => d.type),
          detectMs,
          mountMs: elapsedMs(tMount),
        });
      } catch (err) {
        siError(config.name, 'paste guard error, allowing paste', err);
        recoverPaste?.(); // fail open: re-insert the text we blocked
        open = false;
      }
    },
    { capture: true },
  );
}
