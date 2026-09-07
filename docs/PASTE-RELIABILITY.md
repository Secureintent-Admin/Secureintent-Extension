# Paste responsiveness and protection fixes

Branch: `fix/large-paste-freeze`, based on v1.0.14 (`f6a81fa`).

## Problems addressed

A second keyboard paste could insert raw text while the first warning stayed open. The guard also became busy only after a quota request finished, leaving a race for overlapping warnings. Each intercepted paste now owns a cancellable operation before the first asynchronous step. Repeated pastes are blocked, actions run once, and cancelled or superseded callbacks cannot insert text later. Programmatic editor reinsertion remains supported.

Restoring secrets previously rescanned and copied the entire text for each token. The new single-pass replacement preserves unknown tokens, repeated-token counts and literal replacement characters. It never interprets tokens embedded inside a restored secret, and limits expanded output to 2 million characters.

Text mixing existing tokens with new raw secrets now receives the ordinary secret warning. Restoration is unavailable when team policy forbids raw-secret pastes; inert tokens can still be pasted on permitted destinations.

Detection now forces global iteration even when a configured rule only specifies flags such as `i`. Such rules previously could loop forever. Empty Unicode matches advance a complete code point so they cannot repeat inside a surrogate pair.

The worker follow-up (2026-09-08) closes a limitation in the first fix (`6115a74`): cooperative yielding cannot interrupt a single slow regex. Every guarded text paste now runs detection, overlap resolution, preview-location preparation, bridge hashing, sanitization, tokenization and restoration in a dedicated Web Worker. None of these operations falls back to the page thread if the worker is unavailable.

Chrome uses a private offscreen document to host workers (new `offscreen` permission; Chrome 109+). Firefox MV2 uses its existing background document. Clipboard data travels only over private extension runtime ports, never page/window messaging; no worker assets are web-accessible. Worker code has no network or storage calls. The paste and its full match set are retained in worker RAM only until completion, cancellation, disconnect or idle expiry. This remains standalone browser protection, without a Rust daemon. See [Chrome offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen) for the hosting mechanism.

Concurrent account refresh callers now share the token request, entitlement fetch and identity check. Session-storage changes invalidate the previous request immediately; late responses cannot overwrite a newer session. Entitlement and usage requests have 10-second deadlines. Anonymization prepares the masked text before consuming allowance (so worker failure does not charge it), then checks the actual quota-consumption result before insertion.

## User-visible behavior

- All guarded text pastes are intercepted before awaiting anything. Pastes of 64,000 characters or more show checking immediately; smaller pastes show it if worker setup/scanning takes over 120 ms.
- A watchdog outside each worker terminates a processing command after 5 seconds. A separate 10-second client deadline covers failed setup or lost messaging. No partial or unchecked text is inserted on failure. Cancellation disconnects the port and terminates the worker rather than merely hiding the warning.
- At most four worker sessions are retained at once; unused sessions expire after two minutes. Capacity or timeout errors leave the paste blocked and dismissible. Limits of 256 rules, 8,192 characters per regex source and 100,000 raw findings bound processing resources; exceeding them is an error, not a partial scan.
- Pastes longer than 2 million JavaScript string characters are blocked with a message asking for a smaller section. They are never silently truncated or inserted unchecked.
- Cancellation, composer edits, page hiding and extension invalidation discard pending work. Removed composers cannot receive old actions.
- Errors after interception leave the paste blocked and show a dismissible message where the UI is available. This intentionally replaces automatic raw-text reinsertion on a warning failure.
- Team destination blocks and raw-paste restrictions continue to apply. Clean text inserts once after scanning and replaces the selection captured before the asynchronous work. Guarded text is inserted as plain text: rich clipboard HTML formatting is not replayed. Image-only clipboard events with no plain text retain their previous native behavior.
- Previews show at most 100 findings with an explicit full-count notice; large logs send a compact category summary. Transformations still use the entire match set, not just the preview. Per-finding telemetry is suppressed when the preview is capped, as it already was for Ghost pastes, to avoid submitting a misleading partial event. Feature hooks receive full counts and distinct types/labels.

## Validation

- 548 unit tests across 54 files passed. The worker follow-up adds processing, IPC, host lifecycle, preview, fail-closed, quota-ordering and offscreen-creation regressions to the initial 525-test suite.
- TypeScript checks passed.
- Twelve Chromium end-to-end tests passed, including a deliberately catastrophic `(a+)+$` regex on a short paste under restrictive page CSP. The page heartbeat and popup remained responsive while the worker ran; the watchdog blocked the failed paste and a subsequent secret paste was still protected. Escape cancellation and replacement of a selected text range are covered too.
- Historical measurement on the initial cooperative fix (`6115a74`): a separate fresh-profile check passed with 15 lightweight test tabs. The 1.78-million-character warning appeared in about 295 ms and cancellation completed in about 227 ms. No long task was recorded during that paste in this run, compared with an 82 ms long task in the baseline. These timings do not describe worker IPC overhead in the follow-up.
- A follow-up fresh-profile check also passed normal anonymization and the 1.78-million-character warning/cancel case with 15 lightweight tabs, with no page long task recorded during that paste. It used synthetic text and disabled production endpoints, not a real signed-in account.
- Historical pure-algorithm benchmark: 20,000-token restoration improved from approximately 29,896 ms to 8.8 ms with correct output, before adding worker IPC. Measurements are single diagnostic runs, not performance guarantees.
- Chrome and Firefox production builds were checked. Runtime browser checks used Chromium, not Firefox.
- Lint has no errors; three pre-existing popup CSS `!important` warnings remain. Existing Clerk build warnings concern `import.meta` in an IIFE and large chunks.

## Reproduction commands

Run from the extension repository:

```sh
pnpm compile
pnpm test
pnpm lint
WXT_E2E=1 WXT_API_BASE=http://localhost:18888 WXT_WEB_APP_URL=http://localhost:18888 WXT_CLERK_PUBLISHABLE_KEY= pnpm build
HEADLESS=1 pnpm exec playwright test e2e/canary.spec.ts e2e/fallback.spec.ts e2e/paste-safety.spec.ts --retries=0
```

The localhost endpoints and empty Clerk key keep those browser checks isolated from production. They do not require a running backend for the tested signed-out flows. `WXT_E2E=1` opens the normally closed overlay shadow roots solely for automation.

Before making a release artifact, rebuild with the intended production configuration and without `WXT_E2E` or the localhost overrides. Assign a version higher than the published release, review the final manifest/configuration, and use the existing store item. This branch does not publish anything or change the package version.

## Verification limits

The screenshot user's exact whole-browser incident has not been reproduced. The authenticated Clerk toolbar panel and full Pro restoration UI were not exercised with a real account; refresh races were tested using controlled session/network fixtures. Fifteen lightweight test pages do not represent fifteen heavy development applications.

The page no longer executes scanning or transformation regexes. The browser/editor's final DOM insertion still runs on the page thread, as do bounded IPC serialization and rendering. An expensive host-editor paste handler, memory pressure or unrelated application code can still cause a stall; this is not a guarantee that arbitrary websites never freeze. Custom rules should still be reviewed: pathological rules now time out and block that paste instead of locking the page. Background timer throttling or OS suspension can delay wall-clock deadlines.
