# Shadow AI Discovery V1 — local integration handoff

This is a complete local/staging implementation of the agreed Shadow AI Discovery
V1 flow. It is deliberately isolated from the store extension, customer accounts,
production ClickHouse, and the live Business dashboard.

The local flow includes:

- the approved 18-service, versioned AI catalog;
- hostname-only recognised-service visits;
- text-paste attempt counts and UTF-8 byte volume, including clean pastes;
- sensitive-event reason, type, outcome, finding count, and pseudonymous Seat ID;
- organisation-scoped storage, aggregation, reporting, and ledger endpoints;
- summary cards, daily trends, discovered tools, and the DLP event ledger;
- organisation-specific sanctioned/review classifications and paste prevention;
- Chrome MV3 and Firefox MV2 builds.

## Privacy and environment boundaries

- The API destination is fixed in source to `http://127.0.0.1:8791`.
- The backend refuses every other host, port, protocol, query string, unrecognised
  origin, or request without the local-test header.
- Authentication uses expiring synthetic Business sessions and pseudonymous
  `Seat N` labels. It does not use Clerk, production accounts, emails, or customer
  teams.
- Local D1 data lives under
  `secureintent-backend/testing/shadow/.state` and is ignored by Git.
- Only exact catalog destinations appear in the manifest. There is no
  `<all_urls>` or wildcard-subdomain discovery permission.
- Private/incognito frames and non-top-level frames are excluded.
- No URL, path, query, page content, prompt, pasted text, or secret value is
  accepted by the telemetry contract.
- Paste volume means attempted text-paste bytes. It does not prove that data was
  submitted to an AI service.

## Start the local backend

From `secureintent-backend`:

```sh
pnpm db:shadow
pnpm dev:shadow
```

The health endpoint is `http://127.0.0.1:8791/health` and requires the
`X-SI-Shadow-Test: 1` header.

## Build and load the extension

From `Secureintent-Extension`:

```sh
pnpm build:shadow
pnpm build:shadow:firefox
```

For Chrome, load `dist-shadow/chrome-mv3` as an unpacked extension in a dedicated
test profile. For Firefox, load
`dist-shadow/firefox-mv2/manifest.json` as a temporary add-on.

Open the extension popup, accept the local collection disclosure, and enable the
test. The popup shows local visit and paste totals. Visiting any catalogued AI
destination creates one page-visit event per top-level document load.

On a recognised AI page, clean text pastes are inserted normally and counted.
Sensitive text opens the local warning with Cancel, Sanitise & paste, and Paste
anyway outcomes. A destination with `pasteBlocked` set prevents insertion and
shows a policy notice; it does not block access to the website.

## Open the Business dashboard

From `secureintent.ai`, serve the static site specifically on loopback port 4173:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173/shadow.html`. The page creates a synthetic Business
admin session for the same local organisation used by the extension. It contains:

- discovered-tools, recognised-visits, unsanctioned-usage, paste-attempt,
  attempted-volume, and sensitive-event summary cards;
- daily visit/paste/sensitive-event trends;
- a discovered-tools table with Mark as sanctioned, Needs review, and Prevent
  pasting actions;
- a paginated DLP event ledger showing only pseudonymous Seat IDs and approved
  metadata.

Policy responses advertise a five-minute refresh contract. The active local
extension checks for a refreshed cached policy every five seconds, while the
background fetches the backend on its one-minute alarm. Online, active test
extensions therefore normally update sooner than the five-minute V1 target; no
real-time-delivery guarantee is implied.

## Automated validation

With the local backend running:

```sh
# Extension
pnpm test
pnpm compile
pnpm build:shadow
pnpm build:shadow:firefox
pnpm test:shadow:e2e

# Backend
pnpm test
pnpm compile
pnpm compile:shadow
pnpm check:shadow-catalog
pnpm test:shadow:api

# Dashboard, from secureintent.ai
PW=../Secureintent-Extension/node_modules/@playwright/test node test/shadow-dashboard.check.js
```

The provider pages in the browser suite are fulfilled with synthetic HTML and are
never contacted over the network. Tests cover consent, every explicit hostname,
lookalikes, ordinary GitHub exclusion, top-frame semantics, URL-data removal,
clean and sensitive paste paths, UTF-8 byte volume, offline retry, idempotency,
plan and admin gates, tenant isolation, policy actions, dashboard wording, and
rejection of pasted content or tenant spoofing.

## Visit and retention semantics

One visit is recorded per recognised top-level document load after consent.
Focus, paste, and same-document history changes do not create visits; reload does.
GitHub is recognised only at `/copilot` and `/copilot/*`. That path is inspected
transiently on-device and never stored or sent.

The extension queue keeps at most 500 events for 24 hours. Successful backend
writes are acknowledged by event ID and retries are idempotent. Local readback
retains events for seven days. Disabling collection clears pending extension
metadata but does not erase rows already accepted by the local backend.

## Production promotion remains separate

Do not ship `dist-shadow` or publish `shadow.html`. Production promotion still
requires approved Clerk Business-team attribution, applying the final ClickHouse
schema and retention policy, staging credentials, final Figma/product approval,
and a release review. No production service, customer data, database, `main`
branch, or browser-store package is changed by this local V1.
