# SecureIntent

A browser extension that warns you **before** you paste API keys, tokens, or other
secrets into AI tools and other untrusted destinations. Detection runs entirely
**on-device** — your pasted text never leaves the browser.

> Cross-browser (Chrome, Edge, Firefox, Opera) from a single codebase, built on
> [WXT](https://wxt.dev) + React + TypeScript.

## What it does

- **Pre-paste secret detection.** A capture-phase paste listener inspects clipboard
  content on supported sites and blocks the paste if it contains a secret, showing a
  warning overlay rendered in a **closed Shadow DOM** (the host page can't read or
  tamper with it).
- **Three ways to resolve a warning:** paste anyway, cancel, or **paste anonymously**.
- **Dehydrate ⇄ Rehydrate round-trip.** "Paste anonymously" replaces each secret with
  a reversible placeholder token (e.g. `⟦SI:a1b2c3d4⟧`) before it reaches the AI. When
  you copy the model's reply back, the extension silently restores the real secret in
  your clipboard — so the round-trip is invisible and your pasted-back code just works.
  The token→secret map lives only in RAM (`storage.session`) and is cleared when the
  browser closes.
- **Ghost Sanitizer.** For large log/terminal pastes, an aggressive ruleset (keys plus
  internal IPs and email addresses) strips every finding to a typed placeholder
  (`‹secret_1›`, `‹ip_1›`, `‹email_1›`) in one click, with a compact summary instead of
  a per-finding list.
- **Remote-tunable, signed policy.** Detection patterns and per-site selectors are
  fetched as an **Ed25519-signed** config bundle and verified before use, with a remote
  kill-switch. The extension ships with an offline fallback bundle and works without
  network access.

## Privacy model

Raw pasted text is a hard privacy boundary: it never leaves the device. Telemetry, when
sent, contains only a **salted SHA-256 fingerprint** of a detected secret (never the
secret itself), plus its type and label. The salt is a per-install random value stored
locally and never transmitted. The warning overlay fails **open** — any internal error
lets the paste through rather than trapping you.

## Supported sites

ChatGPT, Claude, Gemini, Perplexity, Microsoft Copilot, GitHub Copilot, Grok, Mistral,
Meta AI, Poe, v0, Bolt, Lovable, Replit, DeepSeek, DuckDuckGo AI, Kimi, Qwen, and Reddit.
A catch-all guard also protects common inputs on any other site.

## Tech stack

[WXT](https://wxt.dev) (wraps Vite; handles the MV3 manifest, cross-browser builds, and
entrypoint wiring) + React 19 + TypeScript. There is no hand-written `manifest.json`.

## Development

This project uses **pnpm**.

```bash
pnpm install        # install dependencies
pnpm dev            # dev server, Chrome target, with HMR
pnpm dev:firefox    # dev server, Firefox target
pnpm build          # production build → dist/chrome-mv3/
pnpm zip            # packaged zip for store submission
pnpm compile        # type-check (tsc --noEmit)
pnpm test           # unit tests (Vitest)
pnpm coverage       # unit tests with coverage
```

## Project layout

```
src/
  entrypoints/      # per-site content scripts, background service worker, popup
  content/          # createPasteGuard — paste capture, detect, overlay, rehydrate
  overlay/          # closed Shadow DOM warning overlay (React)
  lib/
    detection/      # regex catalog, overlap resolution, tokenize, sanitize (Ghost)
    config/         # signed bundle: fetch, verify, validate, store
    fingerprint/    # per-install salt + salted SHA-256 fingerprint
    vault/          # RAM-only token→secret store for rehydration
    telemetry/      # fingerprint-only event reporting
```

Per-site content scripts are thin; all testable logic lives in `src/lib/`.

## License

Copyright (c) 2026 SECUREINTENT.AI LTD. All Rights Reserved. This repository is provided
for **view-only, security-auditing** purposes. See [LICENSE](LICENSE).
