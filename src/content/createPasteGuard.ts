import { browser, type ContentScriptContext, storage } from '#imports';
import { DEFAULT_BUNDLE, getActiveBundle } from '@/lib/config';
import { acceptTerms, consentItem, consentSatisfied, isConsentAccepted } from '@/lib/consent';
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
import { getEntitlementSnapshot, hasFeatureCached, initEntitlementCache } from '@/lib/entitlement';
import { notifyAction, notifyDetections } from '@/lib/features';
import {
  computeFingerprint,
  type Fingerprint,
  getOrCreateSalt,
  type KeyValueStore,
} from '@/lib/fingerprint';
import { canAnonymize, consumeAnonymize } from '@/lib/quota';
import type { TelemetryAction } from '@/lib/telemetry/types';
import { type VaultStore, vaultPut, vaultSnapshot } from '@/lib/vault';
import { mountOverlay } from '@/overlay/mount';
import { mountConsentGate } from '@/overlay/mountConsentGate';
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

  // Slate editors (e.g. Discord, Notion) keep their own model and ignore
  // execCommand inserts — the text appears but the message stays unsendable.
  // Feed them a synthetic paste instead, which their paste handler reconciles
  // into editor state. (Our guard ignores it: it's not a trusted event.)
  const slate = el.closest('[data-slate-editor="true"]');
  if (slate) {
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      const handled = !slate.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
      );
      if (handled) return; // editor consumed the paste
    } catch {
      // DataTransfer/ClipboardEvent unavailable — fall through to execCommand.
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

  // Terms & Privacy consent, cached synchronously (read in the paste handler
  // before any await). Blocking: no warning is shown until the user accepts.
  let consented = await isConsentAccepted();
  consentItem.watch((value) => {
    consented = consentSatisfied(value);
  });

  // preventDefault must run before any await, so cache enabled synchronously
  let enabled = await isEnabled();
  enabledItem.watch((value) => {
    enabled = value ?? true;
  });

  // Prime the entitlement cache so the gate can be read synchronously in the
  // overlay action handler (pro features: rehydrate / ghost).
  await initEntitlementCache();

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

  // In-memory token→secret cache for rehydration. The paste handler swaps tokens
  // back synchronously, so it reads from this Map rather than the async session
  // vault. RAM-only, cleared on page unload; hydrated from the session vault so
  // tokens survive a same-session page reload.
  const memVault = new Map<string, string>();
  vaultSnapshot(sessionStore, origin, Date.now())
    .then((snap) => {
      for (const [token, secret] of Object.entries(snap)) memVault.set(token, secret);
    })
    .catch((err) => siError(config.name, 'vault hydrate failed', err));

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

        // Rehydrate: if the pasted text carries our tokens, prompt to swap them
        // back to the real secrets at insert time (or keep the tokens / cancel).
        // The secret stays out of the OS clipboard — it only ever materializes on
        // insert. Fails open on any error.
        if (TOKEN_RE.test(text)) {
          const tokens = new Set(text.match(TOKEN_GLOBAL) ?? []);
          let restored = text;
          let known = 0;
          for (const token of tokens) {
            const secret = memVault.get(token);
            if (secret !== undefined) {
              restored = restored.split(token).join(secret);
              known++;
            }
          }
          if (known > 0) {
            e.preventDefault();
            e.stopImmediatePropagation();
            open = true;
            const overlay = await mountOverlay(ctx, {
              site: config.name,
              text,
              detections: [],
              rehydrate: { tokenCount: known },
              onAction: (action) => {
                if (action === 'rehydrate') insertText(input, restored);
                else if (action === 'paste') insertText(input, text); // keep tokens as-is
                // cancel → drop the paste entirely
                overlay.remove();
                open = false;
                siDebug(config.name, 'rehydrate prompt', { action, tokens: known });
              },
            });
            return;
          }
          // Unknown/expired tokens aren't secrets — fall through to normal handling.
        }

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
        // Show the actual secret warning for this paste. Extracted so the
        // consent gate can call it after the user agrees (first-paste consent).
        const showWarning = async () => {
          recordBlocked(detections.length); // popup total; on-device only
          // per-tab action badge (background owns browser.action)
          browser.runtime
            .sendMessage({ type: 'si-detected', count: detections.length })
            .catch(() => {});

          // Feature-hook seam: registered features observe detections (metadata
          // only — raw text is never passed). Fire-and-forget.
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

          // Gate the pro action for this overlay. Ghost pastes need the `ghost`
          // feature (Pro-only). Standard anonymise is free with a monthly quota,
          // then Pro — canAnonymize() reflects Pro OR remaining free allowance.
          const snapshot = getEntitlementSnapshot();
          const proAction = ghostMode ? hasFeatureCached('ghost') : await canAnonymize(snapshot);

          open = true;
          const tMount = performance.now();
          const overlay = await mountOverlay(ctx, {
            site: config.name,
            text,
            detections,
            summary: ghostMode ? summarize(detections) : undefined,
            pro: proAction,
            onAction: (action) => {
              if (action === 'upgrade') {
                // Hand off to the background to open the pricing / tiers page.
                browser.runtime.sendMessage({ type: 'si-open-tiers' }).catch(() => {});
                overlay.remove();
                open = false;
                return;
              }
              if (action === 'rehydrate') return; // only the rehydrate overlay emits this
              if (action === 'paste') insertText(input, text);
              else if (action === 'sanitize' && proAction) {
                // Ghost: strip every finding to a typed placeholder. Irreversible.
                insertText(input, sanitize(text, detections));
              } else if (action === 'redact' && proAction) {
                // Count this Anonymise & Paste against the monthly quota (no-op for
                // Pro). Fire-and-forget — canAnonymize() already gated the action.
                consumeAnonymize(snapshot).catch(() => {});
                // Dehydrate: replace secrets with reversible tokens and stash the
                // token→secret map so a later paste can rehydrate them.
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
                      plan: snapshot.plan,
                      source: snapshot.source,
                      signedIn: snapshot.signedIn,
                      businessDomain: snapshot.businessDomain,
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
        };

        // Blocking consent gate: on the first paste that would warn, require the
        // user to accept Terms & Privacy before the extension protects anything.
        if (!consented) {
          open = true;
          const gate = await mountConsentGate(ctx, {
            onAgree: () => {
              acceptTerms().catch((err) => siError(config.name, 'consent save failed', err));
              gate.remove();
              void showWarning(); // now show the real warning for this same paste
            },
            onCancel: () => {
              gate.remove();
              open = false;
            },
          });
          return;
        }

        await showWarning();
      } catch (err) {
        siError(config.name, 'paste guard error, allowing paste', err);
        recoverPaste?.(); // fail open: re-insert the text we blocked
        open = false;
      }
    },
    { capture: true },
  );
}
