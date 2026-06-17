# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The browser-extension half of **SecureIntent.AI** — a DLP (data-loss-prevention) tool that warns
developers *before* they paste secrets into untrusted destinations. See [PROJECT.MD](PROJECT.MD) for
the full Statement of Work, scope, and timeline.

The end-to-end design:

- Content script captures **paste events** and renders warnings in a **closed Shadow DOM overlay**
  (closed so host pages can't inspect or tamper with it).
- A **client-side pre-filter** does cheap detection on-device using a signed pattern bundle fetched
  from the Worker. The `killSwitch` field in the bundle can disable the guard remotely.
- Worker → **Cloudflare Queue → ClickHouse** for telemetry. Pattern bundles are Ed25519-signed and
  refreshed every 2 hours via a background alarm (and on popup demand).
- **Raw pasted text never leaves the device** — only a salted SHA-256 fingerprint is sent. Treat this
  privacy boundary as a hard constraint in any code that touches paste content.
- Cross-browser from one codebase: Chrome, Edge, Firefox, Opera.

The sibling `../backend` directory holds the Cloudflare Worker (Hono) that serves the signed config
bundle and ingests telemetry to ClickHouse. The bundle is served from code (no DB); the signing
private key is a Worker secret.

## Stack

[WXT](https://wxt.dev) (extension framework, wraps Vite) + React 19 + TypeScript. WXT handles the
manifest, MV3 entrypoint wiring, cross-browser builds, and HMR — there is no hand-written
`manifest.json`.

## Commands

**Use `pnpm` for everything** (the project is pinned to pnpm; do not use npm/yarn).

```bash
pnpm dev            # dev server, Chrome target, HMR
pnpm dev:firefox    # dev server, Firefox target
pnpm build          # production build → .output/chrome-mv3/
pnpm zip            # packaged zip for store submission (Chrome)
pnpm compile        # tsc --noEmit — type-check
pnpm test           # vitest run (unit tests in lib/)
pnpm test:watch     # vitest watch
pnpm coverage       # vitest run --coverage
```

Run a single test file: `pnpm test <name>` (e.g. `pnpm test detection`) — vitest filters by path
substring.

Tests use Vitest with the `WxtVitest` plugin (`vitest.config.ts`), jsdom environment, and
`wxt/testing/fake-browser` for `browser.*`/storage. Test files live next to the code as
`src/lib/**/*.test.ts(x)`. SOW target is ≥85% coverage on `src/lib/` (pure logic); the thin
`createShadowRootUi` wrapper `src/lib/overlay/mount.ts` is excluded and verified via build + manual
load.

## Code layout

All source lives under `src/` (WXT `srcDir: 'src'`). Per-site content scripts are **thin**; all real
logic lives in pure, testable `src/lib/` modules.

**Adding a new site** requires a new `src/entrypoints/<site>.content/index.ts` that passes
`{ name, siteKey, inputSelector }` to `createPasteGuard` — and a manifest change (store resubmit).
Changing an existing site's selector or patterns is done via a remote bundle update (no resubmit).
The popup's `SUPPORTED` host list must also be kept in sync.

```
src/
  entrypoints/
    chatgpt.content/index.ts    # chatgpt.com + chat.openai.com
    claude.content/index.ts     # claude.ai
    gemini.content/index.ts     # gemini.google.com  (div.ql-editor, not .ql-clipboard)
    perplexity.content/index.ts # perplexity.ai
    copilot.content/index.ts    # copilot.microsoft.com
    grok.content/index.ts       # grok.com
    mistral.content/index.ts    # chat.mistral.ai
    meta.content/index.ts       # meta.ai + www.meta.ai
    poe.content/index.ts        # poe.com
    v0.content/index.ts         # v0.app + v0.dev
    bolt.content/index.ts       # bolt.new
    lovable.content/index.ts    # lovable.dev
    replit.content/index.ts     # replit.com
    reddit.content/index.ts     # reddit.com  (comma-separated selector: title + body)
    background.ts               # MV3 service worker: config-sync alarm + refresh message handler
    popup/                      # React popup: enable/pause toggle, intercepted-count, pattern refresh
  components/Logo.tsx           # brand mark (inlined SVG, renders inside closed shadow DOM)
  lib/
    content/
      createPasteGuard.ts       # paste capture → detect → fingerprint → overlay → insert/redact/cancel
      types.ts                  # SiteConfig { name, siteKey, inputSelector }
    config/
      types.ts                  # ConfigBundle / BundlePattern / BundleSite shapes
      default.ts                # bundled offline fallback (mirrors Worker DEFAULT_BUNDLE)
      store.ts                  # storage items: configItem + lastSyncedItem; getActiveBundle()
      sync.ts                   # fetchConfigbundle → validate → verify → persist if newer
      verify.ts                 # Ed25519 signature check (embedded public key, one-shot import)
      validate.ts               # structural runtime type-guard for untrusted bundle data
      scheduler.ts              # SYNC_ALARM constant + handleRefreshMessage for popup-triggered sync
      endpoint.ts               # re-exports API_BASE from telemetry/endpoint
      index.ts                  # public API re-exports for the config subsystem
    detection/
      types.ts                  # SecretType + Detection
      patterns.ts               # static offline regex catalog (TYPE_RANK, PATTERNS)
      compile.ts                # compilePatterns: RawPattern[] → Pattern[] (invalid regex dropped)
      index.ts                  # detectSecrets: scan + overlap-resolve by TYPE_RANK then length
      redact.ts                 # redact() + maskFor() — fixed-width masking, right-to-left splice
      locate.ts                 # locateInText: line# + masked windowed snippet (no raw secret)
    fingerprint/
      salt.ts                   # getOrCreateSalt: per-install random 16-byte hex salt in storage
      index.ts                  # fingerprint(secret, salt): SHA-256 hex, raw secret never leaves device
    overlay/
      Overlay.tsx               # React warning dialog: detection list, masked snippets, 3-action buttons
      mount.ts                  # mountOverlay: closed shadow DOM via createShadowRootUi
    debug/
      index.ts                  # siDebug / siError / elapsedMs — consistent structured console output
    settings/
      index.ts                  # enabledItem (on/off toggle) + blockedCountItem (lifetime count)
    telemetry/
      types.ts                  # TelemetryEvent / TelemetryAction / TelemetryDetection
      build.ts                  # buildEvent: assemble event with fresh UUID
      send.ts                   # sendTelemetry: fire-and-forget POST, keepalive, never throws
      endpoint.ts               # API_BASE — single source for the Worker URL
      index.ts                  # public API re-exports
  public/                       # static assets copied as-is (publicDir: 'src/public')
  assets/                       # bundled assets (imported via @/assets/...)
```

## Key invariants

- **Raw pasted text never leaves the device** — only the salted SHA-256 fingerprint is computed and
  sent in telemetry. Never log or transmit paste text.
- The overlay uses a **closed** shadow root; the guard **fails open** (any error lets the paste
  through rather than trapping the user).
- The paste handler must call `preventDefault`/`stopImmediatePropagation` **synchronously**, before
  any `await`. The `enabled` flag is cached in a local var (refreshed via `enabledItem.watch`) and
  read synchronously — don't turn that check into an `await isEnabled()` inside the handler.
- The content script registers at `runAt: 'document_start'` with a **capture-phase** listener so it
  beats the page's own paste handlers. Programmatic pastes (e.g. our own re-inserts via
  `execCommand('insertText')`) are skipped via `e.isTrusted`.
- Detection is regex-only; overlapping matches resolve by `TYPE_RANK` (private-key > known-key >
  env-credential), then longer match wins.
- The guard reads the active bundle at content-script boot, then resolves `inputSelector` as
  `bundle.sites[siteKey]?.inputSelector ?? config.inputSelector` (remote overrides static fallback).
- Remote config is **Ed25519-signed** and verified before use; the embedded public key must match the
  Worker's signing key. Bundles are accepted only if strictly newer (`version >` current).

## Open-core seam

This repo is the **public, source-available (view-only — see [LICENSE](LICENSE))**
half. Premium lives in a separate private repo (`backend/` + `pro/`) and plugs in
— it never edits this code. See [docs/open-core.md](docs/open-core.md).

- `src/lib/features/` — feature registry. Pro calls `registerFeature`; the guard
  fires `notifyDetections`/`notifyAction`. No-op in this (free) build.
- Hooks get detection **metadata only** (counts/types/labels). Raw clipboard
  text is never passed to a feature — same hard privacy boundary as everywhere.
- `src/core.ts` — the semver'd public API the pro repo imports. Keep it stable;
  refactor internals freely behind it.
- Dependency points one way: **pro → core, never reverse.** Core must never
  import from or reference pro.
- `BUILD_TARGET=free|pro` in `wxt.config.ts` (free default). Package publishing
  stays off until the first premium feature ships.

## WXT conventions

- **Entrypoints are discovered by filename** in `src/entrypoints/`: `{name}.{ext}` or
  `{name}/index.{ext}` only — deeply nested files (e.g. `content/chatgpt.ts`) are NOT entrypoints. A
  file is a *content script* when its name is `content` or ends in `.content` (so the folder is
  `<site>.content/`).
- `@/` resolves to `src/` (the srcDir), e.g. `@/lib/...`, `@/assets/...`.
- Import WXT APIs from the **`#imports`** virtual module
  (`import { defineContentScript, createShadowRootUi, ContentScriptContext, storage } from '#imports'`).
  These also work as auto-imported globals, but `#imports` is explicit and used throughout this repo.
- `defineBackground` and `browser` are likewise available via `#imports` / auto-import.
- Path aliases: `@/` → project root (e.g. `@/assets/...`). Files under `public/` are served from the
  web-accessible root, referenced with a leading slash (e.g. `/wxt.svg`).
- WXT config is `wxt.config.ts`; the React integration is enabled via the `@wxt-dev/module-react`
  module there. `tsconfig.json` extends the generated `.wxt/tsconfig.json` — don't edit the generated
  one.
- The `postinstall` script runs `wxt prepare`, which regenerates `.wxt/`. If types or auto-imports go
  missing, run `wxt prepare`.
