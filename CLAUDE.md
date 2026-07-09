# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The browser-extension half of **SecureIntent.AI** — a DLP (data-loss-prevention) tool that warns
developers *before* they paste secrets into untrusted destinations. See [PROJECT.MD](PROJECT.MD) for
the full Statement of Work, scope, and timeline.

The end-to-end design:

- Content scripts capture **paste events** and render warnings in a **closed Shadow DOM overlay**
  (closed so host pages can't inspect or tamper with it).
- A **client-side pre-filter** does cheap detection on-device using a signed pattern bundle fetched
  from the Worker. The `killSwitch` field in the bundle can disable the guard remotely.
- Worker → **Cloudflare Queue → ClickHouse** for telemetry. Pattern bundles are Ed25519-signed and
  refreshed every 2 hours via a background alarm (and on popup demand).
- **Raw pasted text never leaves the device** — only a salted SHA-256 fingerprint is sent. Treat this
  privacy boundary as a hard constraint in any code that touches paste content.
- Cross-browser from one codebase: Chrome, Edge, Firefox, Opera.

The sibling `../backend` directory holds the Cloudflare Worker (Hono) that serves the signed config
bundle (from `/v1/config`) and ingests telemetry (`/v1/telemetry`) to ClickHouse. The bundle is
served from code (no DB); the signing private key is a Worker secret.

## Stack

[WXT](https://wxt.dev) (extension framework, wraps Vite) + React 19 + TypeScript. WXT handles the
manifest, MV3 entrypoint wiring, cross-browser builds, and HMR — there is no hand-written
`manifest.json`. **Biome** is the linter/formatter (not ESLint/Prettier). **Semgrep** runs custom
rules in `semgrep/`. **Playwright** drives the live end-to-end suite in `e2e/`.

## Commands

**Use `pnpm` for everything** (the project is pinned to pnpm; do not use npm/yarn).

```bash
pnpm dev            # dev server, Chrome target, HMR
pnpm dev:firefox    # dev server, Firefox target
pnpm build          # production build → .output/chrome-mv3/
pnpm zip            # packaged zip for store submission (Chrome)
pnpm compile        # tsc --noEmit — type-check
pnpm lint           # biome lint
pnpm check          # biome check (lint + format); check:fix to auto-fix
pnpm format         # biome format --write
pnpm semgrep        # run custom Semgrep rules (semgrep/), fail on findings
pnpm test           # vitest run (unit tests, colocated *.test.ts)
pnpm test:watch     # vitest watch
pnpm coverage       # vitest run --coverage
```

Run a single test file: `pnpm test <name>` (e.g. `pnpm test detection`) — vitest filters by path
substring.

Unit tests use Vitest with the `WxtVitest` plugin (`vitest.config.ts`), jsdom, and
`wxt/testing/fake-browser` for `browser.*`/storage. Test files live next to the code as
`*.test.ts(x)`. SOW target is ≥85% coverage on pure logic (`src/lib/`, `src/content/`,
`src/services/`); thin `createShadowRootUi` mount wrappers in `src/overlay/mount*.ts` are excluded and
verified via build + manual load.

**E2E** (Playwright, builds the extension then loads it in a real Chromium):

```bash
pnpm e2e               # canary + fallback specs (no live network)
pnpm e2e:live          # live LLM sites (needs e2e:login session first)
pnpm e2e:roundtrip     # anonymize → rehydrate vault roundtrip
pnpm e2e:ghost         # large-log sanitization
pnpm e2e:session-lock  # cloud-console PIN lock
pnpm e2e:login         # one-time: capture a logged-in browser session
```

## Code layout

All source lives under `src/` (WXT `srcDir: 'src'`). Per-site content scripts are **thin** — each just
passes `{ name, siteKey }` to `createPasteGuard`. All real logic lives in pure, testable modules under
`src/content/`, `src/lib/`, and `src/services/`.

**Adding a new site** requires a new `src/entrypoints/<site>.content/index.ts` that passes
`{ name, siteKey }` to `createPasteGuard`, a `matches` host list, and a selector entry in
`src/content/siteSelectors.ts` (plus a manifest change → store resubmit). Changing an existing site's
selector or patterns is done via a remote bundle update (no resubmit). Even with no dedicated
entrypoint a site is still covered by the **fallback** catch-all guard; dedicated entrypoints exist for
beating the page's own handlers and site-specific selectors. Keep the popup's supported-host list in
sync.

```
src/
  entrypoints/
    <site>.content/index.ts     # one thin guard per site: chatgpt, claude, gemini, perplexity,
                                #   copilot, githubcopilot, grok, mistral, meta, poe, v0, bolt,
                                #   lovable, replit, reddit, deepseek, duck, kimi, qwen
    fallback.content/index.ts   # catch-all guard on *://*/* — no-ops where a dedicated guard ran
                                #   (shared window flag) so sites are never double-guarded
    sessionlock.content/index.ts# cloud-console PIN lock (AWS/GCP/Azure/CF/DO/Heroku/… consoles)
    background.ts               # MV3 service worker: config sync alarm, badge bumps, vault opt-in
    popup/                      # React popup: enable/pause, intercepted count, PIN setup, refresh
  content/                      # paste-guard + session-lock logic (was src/lib/content/)
    createPasteGuard.ts         # paste capture → detect → fingerprint → overlay → insert/anon/cancel
    createSessionLock.ts        # inactivity/tab-away → PIN gate over high-risk consoles
    siteSelectors.ts            # per-siteKey input selectors (static fallback for the bundle)
    findComposer.ts             # walk the event path to the composer element
    fallbackSelector.ts         # generic text-entry selector for the catch-all guard
    types.ts                    # SiteConfig { name, siteKey }
  lib/
    detection/
      patterns.ts               # static offline regex catalog (TYPE_RANK, PATTERNS)
      validators.ts             # post-match validators (Luhn card check, entropy) cut false positives
      compile.ts / index.ts     # compilePatterns + detectSecrets (overlap-resolve by rank then length)
      redact.ts                 # fixed-width masking
      tokenize.ts               # tokenizeSecrets: secret → ⟦SI:xxxxxxxx⟧ token + VaultEntry list
      ghost.ts / sanitize.ts    # large-log "ghost" scrub: extra patterns for IPs/emails + summarize
      locate.ts                 # line# + masked windowed snippet (no raw secret)
    vault/index.ts              # RAM-only token→secret store in storage.session (rehydrate anon pastes)
    lock/index.ts               # PIN hashing/verify (reuses fingerprint salt + SHA-256)
    fingerprint/                # per-install salt + fingerprint(secret, salt): SHA-256, never leaves device
    config/                     # ConfigBundle shapes, store, validate, verify (Ed25519), default fallback
    api/client.ts               # getJson (no-store) + postJson (keepalive) + API_BASE
    telemetry/                  # TelemetryEvent types (build/send now live in services/)
    features/                   # internal feature-hook registry (registerFeature / notify*)
    badge.ts                    # per-tab intercepted-count toolbar badge
    settings/index.ts           # enabled toggle, blocked count, session-lock config
    debug/index.ts              # siDebug / siError / elapsedMs structured console output
  services/                     # I/O orchestration over pure lib modules
    configService.ts            # syncConfig: fetch /v1/config → validate → verify → persist if newer
    scheduler.ts                # SYNC_ALARM + handleRefreshMessage (popup-triggered sync)
    telemetryService.ts         # buildEvent (fresh UUID) + sendTelemetry (fire-and-forget POST)
  overlay/                      # React dialogs + closed-shadow-DOM mounts
    Overlay.tsx                 # paste warning: detections, masked snippets, 3 actions
    SessionLock.tsx / LockWarning.tsx
    mount.ts / mountSessionLock.ts / mountLockWarning.ts   # createShadowRootUi wrappers (test-excluded)
  core.ts                       # internal API barrel (reusable guard/overlay/detection exports)
  components/Logo.tsx           # brand mark (inlined SVG, renders inside closed shadow DOM)
  public/ assets/               # static + bundled assets
```

## Key invariants

- **Raw pasted text never leaves the device** — only the salted SHA-256 fingerprint is computed and
  sent in telemetry. Never log or transmit paste text. The same boundary applies to the vault (token →
  secret pairs live only in `storage.session`, never on disk, never to network).
- The overlay uses a **closed** shadow root; both guards **fail open** (any error lets the paste/page
  through rather than trapping the user).
- The paste handler must call `preventDefault`/`stopImmediatePropagation` **synchronously**, before
  any `await`. The `enabled` flag and the vault snapshot are cached in local vars (refreshed via
  watchers) and read synchronously — don't turn those into `await`s inside the handler.
- Content scripts register at `runAt: 'document_start'` with a **capture-phase** listener so they beat
  the page's own paste handlers. Programmatic pastes (our own `execCommand('insertText')` re-inserts)
  are skipped via `e.isTrusted`.
- Detection is regex-then-validator; overlapping matches resolve by `TYPE_RANK` (private-key >
  known-key > env-credential), then longer match wins. Broad regexes (cards) are confirmed by a
  post-match validator (Luhn / entropy) to avoid false positives.
- The guard reads the active bundle at content-script boot, then resolves the input selector as
  `bundle.sites[siteKey]?.inputSelector ?? siteSelectors[siteKey]` (remote overrides static fallback).
- Remote config is **Ed25519-signed** and verified before use; the embedded public key must match the
  Worker's signing key. Bundles are accepted only if strictly newer (`version >` current).

## Overlay actions (paste-guard)

The warning dialog offers three outcomes, mapped to telemetry actions in `createPasteGuard`:

- **paste** → `paste_clear` — insert the original text (for a large log, `sanitize()` scrubs it first).
- **redact** → `paste_anonymously` — `tokenizeSecrets` replaces each secret with a `⟦SI:…⟧` token,
  inserts the masked text, and stores the `token → secret` entries in the **vault** so the destination
  can be rehydrated later in the same session.
- **cancel** → `cancelled` — drop the paste entirely.

## Session lock

A separate, opt-in feature (`sessionlock.content` + `createSessionLock` + `lib/lock`). After
inactivity or tab-away it covers high-risk cloud consoles with a PIN gate. The PIN is hashed with the
same per-install salt + SHA-256 as the fingerprint module (never stored plaintext). A per-tab
`sessionStorage` flag survives a reload (a refresh can't bypass the lock) and clears on tab close.
Fails open on error.

## Free & paid tiers (single build)

There is **no open-core split**. One build ships both the free and the paid features; the extension is
a single product with free and paid tiers, not a public core plus a private pro repo. The repo is
still **source-available (view-only — see [LICENSE](LICENSE))**.

- Paid features (`rehydrate`, `ghost`, `session_lock`) ship in this build but are **gated at runtime**
  by a signed entitlement fetched from the Worker for the signed-in Clerk user — see `src/lib/entitlement/`
  and the Clerk/Paddle wiring in `src/services/entitlementBackground.ts`. The entitlement blob is
  Ed25519-signed (same verify path as the config bundle) and evaluated locally; it **fails safe to
  free** on any invalid/expired/missing state.
- Client-side gating is a UX gate, **not** the security boundary: the source is viewable and the checks
  are patchable. The valuable logic and license truth live server-side in `backend/` — treat the client
  gate as convenience, not enforcement.
- `src/lib/features/` — internal feature-hook registry (`registerFeature` + `notifyDetections`/
  `notifyAction`). Hooks get detection **metadata only** (counts/types/labels); raw clipboard text is
  never passed, same hard privacy boundary as everywhere.
- `src/core.ts` — internal API barrel that groups the reusable guard/overlay/detection exports. Retained
  as a convenience seam; it is **no longer an external publish target** (no `@secureintent/core` package,
  no `BUILD_TARGET=pro` build).

## WXT conventions

- **Entrypoints are discovered by filename** in `src/entrypoints/`: `{name}.{ext}` or
  `{name}/index.{ext}` only — deeply nested files (e.g. `content/chatgpt.ts`) are NOT entrypoints. A
  file is a *content script* when its name is `content` or ends in `.content` (so the folder is
  `<site>.content/`). Note `src/content/` is a plain logic dir, **not** an entrypoint folder.
- `@/` resolves to `src/` (the srcDir), e.g. `@/lib/...`, `@/content/...`, `@/assets/...`.
- Import WXT APIs from the **`#imports`** virtual module
  (`import { defineContentScript, createShadowRootUi, ContentScriptContext, storage } from '#imports'`).
  These also work as auto-imported globals, but `#imports` is explicit and used throughout this repo.
- `defineBackground` and `browser` are likewise available via `#imports` / auto-import.
- Files under `public/` are served from the web-accessible root, referenced with a leading slash.
- WXT config is `wxt.config.ts`; the React integration is enabled via the `@wxt-dev/module-react`
  module there. `tsconfig.json` extends the generated `.wxt/tsconfig.json` — don't edit the generated
  one.
- The `postinstall` script runs `wxt prepare`, which regenerates `.wxt/`. If types or auto-imports go
  missing, run `wxt prepare`.
