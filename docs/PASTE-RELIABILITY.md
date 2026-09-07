# Paste responsiveness and protection fixes

Branch: `fix/large-paste-freeze`, based on v1.0.14 (`f6a81fa`).

## Problems addressed

A second keyboard paste could insert raw text while the first warning stayed open. The guard also became busy only after a quota request finished, leaving a race for overlapping warnings. Each intercepted paste now owns a cancellable operation before the first asynchronous step. Repeated pastes are blocked, actions run once, and cancelled or superseded callbacks cannot insert text later. Programmatic editor reinsertion remains supported.

Restoring secrets previously rescanned and copied the entire text for each token. The new single-pass replacement preserves unknown tokens, repeated-token counts and literal replacement characters. It never interprets tokens embedded inside a restored secret, and limits expanded output to 2 million characters.

Text mixing existing tokens with new raw secrets now receives the ordinary secret warning. Restoration is unavailable when team policy forbids raw-secret pastes; inert tokens can still be pasted on permitted destinations.

Detection now forces global iteration even when a configured rule only specifies flags such as `i`. Such rules previously could loop forever. Empty Unicode matches advance a complete code point so they cannot repeat inside a surrogate pair.

Concurrent account refresh callers now share the token request, entitlement fetch and identity check. Session-storage changes invalidate the previous request immediately; late responses cannot overwrite a newer session. Entitlement and usage requests have 10-second deadlines. Anonymization checks the actual quota-consumption result before insertion.

## User-visible behavior

- Pastes of 64,000 characters or more are intercepted before awaiting anything and show a cancellable checking state. The scanner shares its rules and ordering with the synchronous engine and yields between batches when a processing slice reaches approximately 8 ms.
- Pastes longer than 2 million JavaScript string characters are blocked with a message asking for a smaller section. They are never silently truncated or inserted unchecked.
- Cancellation, composer edits, page hiding and extension invalidation discard pending work. Removed composers cannot receive old actions.
- Errors after interception leave the paste blocked and show a dismissible message where the UI is available. This intentionally replaces automatic raw-text reinsertion on a warning failure.
- Team destination blocks and raw-paste restrictions continue to apply. Ordinary small, clean pastes retain native browser insertion.

## Validation

- 525 unit tests across 50 files passed, including output-equivalence, performance, repeated-paste, cancellation, quota, policy and session-refresh cases.
- TypeScript checks passed.
- Nine Chromium end-to-end tests passed: popup rendering, supported fallback inputs, existing detection categories, repeated-paste protection, oversized-paste recovery, large clean insertion and non-global rule handling.
- A separate fresh-profile check passed with 15 lightweight test tabs. The 1.78-million-character warning appeared in about 295 ms and cancellation completed in about 227 ms. No long task was recorded during that paste in this run, compared with an 82 ms long task in the baseline.
- The same isolated 20,000-token restoration benchmark improved from approximately 29,896 ms to 8.8 ms, with correct output. Existing detection, sanitization and tokenization performance remained comparable to v1.0.14. Measurements are single diagnostic runs, not performance guarantees.
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

Scanning remains local and cooperatively scheduled on the page thread; this change does not introduce a Web Worker or a Rust dependency. A single regular-expression execution and the browser/editor's final DOM insertion cannot be preempted by cooperative yielding. Custom rules still require review for pathological backtracking; this is not a hard execution-time guarantee for arbitrary regexes.
