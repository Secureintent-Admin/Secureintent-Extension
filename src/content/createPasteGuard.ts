import { browser, type ContentScriptContext, storage } from '#imports';
import { DEFAULT_BUNDLE, getActiveBundle, getPolicy, isBlockedHost } from '@/lib/config';
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
import { consumeAnonymize, formatQuotaReset, getAnonymizeStatus } from '@/lib/quota';
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

  // Team Policy Sync. A policy can only ride in on a bundle that passed
  // validation + Ed25519 verification in syncConfig — nothing else ever writes
  // the active bundle — so reaching here already means "signed by the Worker".
  const policy = getPolicy(bundle);
  // A blocked destination admits nothing at all — not the raw text, not an
  // anonymised or sanitized version of it. The rule is about the site, not the
  // secret, so every insert path is closed here.
  const policyBlockedHost = isBlockedHost(location.hostname, policy.blockedSites);
  // Under a policy that forbids the raw text, we must NOT re-insert it when our
  // own code throws: that fail-open recovery would turn our bug into exactly the
  // leak the policy exists to stop. The user still isn't trapped — the page and
  // every other paste keep working; only this one paste is dropped.
  const allowRawPaste = !policy.blockInsteadOfWarn && !policyBlockedHost;

  siDebug(config.name, 'guard active', { selector: inputSelector });
  if (policy.blockInsteadOfWarn || policy.requireSessionLock || policyBlockedHost) {
    siDebug(config.name, 'team policy active', {
      policyVersion: bundle.policyVersion ?? null,
      blockInsteadOfWarn: policy.blockInsteadOfWarn,
      blockedHost: policyBlockedHost,
    });
  }

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
        // insert. Fails open on any error. Rehydrate is a Pro feature: without the
        // entitlement, skip the prompt entirely and let the tokens paste as-is.
        // Never offered on a policy-blocked host — restoring a real secret into a
        // destination the team forbids is the one thing that rule prohibits. The
        // inert tokens themselves may still paste; they carry nothing.
        if (!policyBlockedHost && hasFeatureCached('rehydrate') && TOKEN_RE.test(text)) {
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
        // A blocked destination is about the SITE, not the secret: the admin is
        // told "the extension refuses every paste, whether or not it finds a
        // secret", so a clean paste must be stopped here too. Letting it through
        // would quietly break the promise the console makes to whoever set the
        // rule — and these are the sites a team has decided to feed nothing.
        if (detections.length === 0 && !policyBlockedHost) return; // normal paste

        e.preventDefault();
        e.stopImmediatePropagation();
        if (allowRawPaste) recoverPaste = () => insertText(input, text);
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
          // then Pro — the status below reflects Pro OR remaining free allowance.
          const snapshot = getEntitlementSnapshot();
          const quota = ghostMode ? null : await getAnonymizeStatus(snapshot);
          const proAction = ghostMode
            ? hasFeatureCached('ghost')
            : Boolean(quota && (quota.unlimited || quota.remaining > 0));
          // "Spent your free allowance" is a different situation from "never had
          // this feature", so the overlay is told which one it is: a user at 0/10
          // needs the reset date, not a plain Pro badge.
          const quotaExhausted =
            quota && !quota.unlimited && quota.remaining <= 0
              ? { limit: quota.limit, resetsOn: formatQuotaReset() }
              : undefined;

          open = true;
          const tMount = performance.now();
          const overlay = await mountOverlay(ctx, {
            site: config.name,
            text,
            detections,
            summary: ghostMode ? summarize(detections) : undefined,
            pro: proAction,
            quotaExhausted,
            // Team policy: a blocked destination gets the notice view (no paste
            // route at all); blockInsteadOfWarn just drops "Paste anyway".
            policyBlock: policyBlockedHost ? { host: location.hostname } : undefined,
            blockRawPaste: policy.blockInsteadOfWarn,
            onAction: (action) => {
              if (action === 'upgrade') {
                // Hand off to the background to open the account page — the one
                // place an already-installed user can actually buy or manage a plan.
                browser.runtime.sendMessage({ type: 'si-open-upgrade' }).catch(() => {});
                overlay.remove();
                open = false;
                return;
              }
              if (action === 'rehydrate') return; // only the rehydrate overlay emits this
              // `allowRawPaste` is re-checked here, not just in the UI: the
              // policy has to hold even if the overlay were driven some other
              // way. Under a block the paste is simply dropped (= cancel).
              if (action === 'paste') {
                if (allowRawPaste) insertText(input, text);
              } else if (action === 'sanitize' && proAction && !policyBlockedHost) {
                // Ghost: strip every finding to a typed placeholder. Irreversible.
                insertText(input, sanitize(text, detections));
              } else if (action === 'redact' && proAction && !policyBlockedHost) {
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
                // A refused "paste" inserted nothing, so it is reported as
                // cancelled — never as paste_anyway, which would tell the team's
                // dashboard a secret went through when it did not.
                const telemetryAction =
                  action === 'paste' && !allowRawPaste ? 'cancelled' : ACTION_BY_OVERLAY[action];
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
                      orgId: snapshot.orgId,
                      actorId: snapshot.actorId,
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
