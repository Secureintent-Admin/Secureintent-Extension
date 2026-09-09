# Shadow AI Discovery — local test handoff

This harness demonstrates only the first two V1 features: the versioned AI domain
catalog and `ai_page_visit`. It reuses the existing extension styling but is a
separate build from the protection extension. It cannot be configured to use the
live SecureIntent API.

The build scripts use WXT's `shadow-test` mode and restore the normal extension's
generated TypeScript declarations afterward. The artifacts are test packages even
though WXT internally uses its optimised build pipeline.

## Boundaries

- API is fixed in source to `http://127.0.0.1:8791`.
- Backend refuses any other host, port, protocol, query string, unrecognised origin,
  or request without the local-test header.
- Authentication uses an expiring synthetic Business session and pseudonymous
  `Seat N` label. It does not use Clerk, production accounts, or customer teams.
- Storage is local D1 under `secureintent-backend/testing/shadow/.state`, ignored by Git.
- Only exact catalog destinations appear in the manifest; there is no `<all_urls>`
  or wildcard-subdomain discovery permission.
- Private/incognito frames and non-top-level frames are excluded.
- This phase does not include paste volume, rich DLP telemetry, ClickHouse,
  aggregation, the Business admin dashboard, policy actions, staging, or deployment.

## Start the backend

From `secureintent-backend`:

```sh
pnpm db:shadow
pnpm dev:shadow
```

The health endpoint is `http://127.0.0.1:8791/health`, but it requires the
`X-SI-Shadow-Test: 1` request header. Leave this terminal running.

## Chrome test build

From `Secureintent-Extension`:

```sh
pnpm build:shadow
```

Use a dedicated test profile. Open `chrome://extensions`, enable Developer mode,
choose **Load unpacked**, and select `dist-shadow/chrome-mv3`.

Open **SecureIntent — LOCAL Discovery Test**, tick the explicit-consent checkbox,
and enable collection. Visit or reload a catalogued AI destination, then choose
**Sync & refresh**. The popup displays hostname-only local readback.

## Firefox test build

```sh
pnpm build:shadow:firefox
```

In a dedicated Firefox profile, open `about:debugging#/runtime/this-firefox`, choose
**Load Temporary Add-on**, and select `dist-shadow/firefox-mv2/manifest.json`.
Use the popup in the same way as Chrome. The temporary add-on is removed when that
Firefox profile closes.

## Automated validation

With the local backend running:

```sh
pnpm test:shadow:e2e
```

The suite intercepts provider page requests and serves synthetic local HTML; it
does not contact the 18 AI services. It checks consent, all explicit hostnames,
lookalikes, normal GitHub exclusion, top-frame semantics, URL-data removal,
offline retry, backend deduplication, disable/clear, plan gating, tenant isolation,
and rejection of forbidden fields.

Run the normal checks too:

```sh
pnpm test
pnpm compile
pnpm check
```

From `secureintent-backend`:

```sh
pnpm test
pnpm compile
pnpm compile:shadow
pnpm check
pnpm check:shadow-catalog
```

## Expected visit semantics and limits

One event is created per recognised top-level document load after consent. Focus,
paste, and same-document history changes do not create visits. Reloading creates a
new visit. GitHub is recognised only at `/copilot` and `/copilot/*`; its path is
used transiently on-device and is never stored or sent.

The local queue keeps at most 500 events for 24 hours. Successful backend writes
are acknowledged by event ID; retrying an event is idempotent. Test readback retains
events for seven days. Disabling collection clears pending extension metadata; it
does not erase already accepted local database rows.

The popup correctly says that these are recognised-domain page loads, not proof
that AI was used or that data was submitted. Cursor/Replit website visits do not
show activity in their desktop applications. SPA transitions into GitHub Copilot
without a document load require a reload in this conservative V1 observer.

## Production promotion checklist (future phase)

Do not ship `dist-shadow`. Production integration still requires approved Clerk
Business-team attribution, ClickHouse schemas/retention, tenant-scoped reporting,
an approved consent/disclosure decision, staging credentials, dashboard work,
and release review. Those changes must be implemented on later feature branches
and validated before anything is merged to `main` or submitted to a store.
