# Phase One Extension Development — Shadow AI Discovery V1

**Status:** Local/staging implementation complete  
**Recorded:** 10 September 2026  
**Integration branch:** `demo/shadow-ai-v1`  
**Production status:** Not merged, pushed, deployed, or submitted to a browser store

## 1. Purpose

Phase One delivers a non-production implementation of Shadow AI Discovery using
the existing SecureIntent extension, secret-detection engine, worker-based paste
processing, team-policy concepts, backend pipeline, and Business dashboard
design language.

The implementation demonstrates the complete V1 flow locally without using
customer accounts, customer telemetry, production ClickHouse, the live Business
dashboard, or production extension configuration.

## 2. Confirmed V1 scope

Phase One contains these seven feature groups:

1. Versioned AI service catalog and hostname recognition.
2. Recognised AI-domain visit telemetry.
3. Text-paste attempt and UTF-8 byte-volume telemetry, including clean pastes.
4. Sensitive-event metadata with a detection reason and final outcome.
5. Organisation-scoped backend ingestion, storage, aggregation, and reporting.
6. Business dashboard cards, trends, discovered-tools table, and DLP ledger.
7. Organisation-specific sanctioned/review classifications and paste-prevention
   policy actions.

## 3. AI service catalog

The catalog contains 18 services and is designed to be expanded through its
versioned JSON source.

| Category | Service | Recognised hostname(s) | Recognition rule |
| --- | --- | --- | --- |
| General | ChatGPT | `chatgpt.com`, `chat.openai.com` | Exact hostname |
| General | Claude | `claude.ai` | Exact hostname |
| General | Gemini | `gemini.google.com` | Exact hostname |
| General | Microsoft Copilot | `copilot.microsoft.com` | Exact hostname |
| General | Perplexity | `perplexity.ai`, `www.perplexity.ai` | Exact hostname |
| General | Grok | `grok.com` | Exact hostname |
| General | Mistral Le Chat | `chat.mistral.ai` | Exact hostname |
| General | Meta AI | `meta.ai`, `www.meta.ai` | Exact hostname |
| General | Poe | `poe.com` | Exact hostname |
| General | Character.AI | `character.ai` | Exact hostname |
| General | DeepSeek | `chat.deepseek.com` | Exact hostname |
| Developer | Google AI Studio | `aistudio.google.com` | Exact hostname |
| Developer | GitHub Copilot | `github.com` | Only `/copilot` and `/copilot/*` |
| Developer | Cursor | `cursor.com`, `www.cursor.com` | Exact hostname |
| Developer | Replit | `replit.com` | Exact hostname |
| Developer | Lovable | `lovable.dev` | Exact hostname |
| Developer | Bolt | `bolt.new` | Exact hostname |
| Developer | v0 | `v0.dev`, `v0.app` | Exact hostname |

The catalog deliberately avoids wildcard subdomains and `<all_urls>`. Ordinary
GitHub activity is not counted as GitHub Copilot usage. The GitHub path is
inspected transiently on-device and is never stored or transmitted.

Source files:

- `src/lib/shadow/catalog.json`
- `src/lib/shadow/catalog.ts`
- `src/lib/shadow/catalog.test.ts`

## 4. Organisation-specific classification

Classification belongs to the organisation, not permanently to the provider:

- **Tier 1 — Sanctioned:** approved by the organisation.
- **Tier 2 — Recognised AI:** known AI service that has not been sanctioned.
- **Tier 3 — Review / Higher Risk:** requires additional organisational review.

Every catalog service defaults to Tier 2 until an organisation-specific policy
changes it. The dashboard can mark a tool as sanctioned, return it to recognised,
or flag it for review.

## 5. Visit telemetry

One `ai_page_visit` event is created for each recognised top-level document load
after explicit local consent.

Focus events, paste events, same-document history changes, unrecognised domains,
lookalikes, incognito tabs, and child frames do not create visits. Reloading a
recognised page creates a new visit.

The event contains only:

- schema version;
- random event ID;
- event timestamp;
- normalised hostname;
- catalog service ID;
- catalog version.

It does not contain the URL, path, query, fragment, page title, page content,
prompt, user identity, Seat ID, or organisation ID.

## 6. Paste-volume telemetry

Every recognised text-paste attempt with text is measured before the local DLP
decision. This includes clean pastes where no sensitive information is detected.

An `ai_paste_volume` event contains:

- the standard hostname-only destination metadata;
- a random paste event ID;
- the number of UTF-8 bytes attempted.

The actual pasted text is never placed in the event, extension telemetry queue,
backend request, backend database, dashboard response, or log.

The dashboard wording consistently describes these figures as **paste attempts**
and **attempted volume**, not confirmed submission.

## 7. Sensitive-event reporting

When the local scanner identifies sensitive material, the extension can record
an `ai_sensitive_paste` metadata event containing:

- hostname and catalog service ID;
- pseudonymous paste/event correlation IDs;
- detection type;
- approved detection reason/label;
- finding count;
- final outcome.

Supported outcomes are:

- `blocked` — organisation policy prevented insertion;
- `cancelled` — the user cancelled the paste;
- `sanitised` — sensitive values were replaced before insertion;
- `warning_bypassed` — the user chose to paste the original text.

The warning supports Cancel, Sanitise & paste, and Paste anyway. Pressing Escape
cancels the paste. The secret values and pasted text remain on-device.

## 8. Paste processing and reliability

Phase One reuses the dedicated worker architecture from the large-paste
reliability work:

- Chrome uses an offscreen extension document to host workers.
- Firefox uses the background context.
- Scanning and sanitisation execute outside the page's main thread.
- Paste processing is cancellable and bounded.
- A scan failure after interception stops the paste safely.
- Oversized pastes are stopped rather than processed without limits.

Shadow-specific worker entry points:

- `src/testing/entrypoints/paste-worker.ts`
- `src/testing/entrypoints/paste-offscreen/index.html`
- `src/testing/entrypoints/paste-offscreen/main.ts`

## 9. Policy behavior

The dashboard actions are intentionally worded as:

- **Mark as sanctioned**;
- **Needs review**;
- **Prevent pasting**;
- **Allow pasting**.

“Prevent pasting” stops paste insertion through the extension policy mechanism.
It does not block navigation to or use of the entire website.

The policy API advertises `refreshAfterSeconds: 300`. The local background checks
the backend on a one-minute alarm, and active content scripts check the refreshed
extension cache every five seconds. Online, active local extensions therefore
normally receive updates sooner than the five-minute V1 target, without claiming
guaranteed real-time delivery.

## 10. Extension state, retry, and retention

The extension stores the local test state in `browser.storage.local` under
`si_shadow_test_state_v1`.

Behavior:

- maximum queue size: 500 metadata events;
- queue lifetime: 24 hours;
- backend upload batch size: 25 events;
- acknowledged uploads are removed by event ID;
- repeated events are idempotent;
- expired events are discarded and counted;
- temporary backend failures retain events for retry;
- disabling collection clears the pending extension state;
- an expired or unauthorised synthetic session disables collection.

No pasted content is stored in this queue.

Core files:

- `src/lib/shadow/visits.ts`
- `src/lib/shadow/test-api.ts`
- `src/testing/entrypoints/background.ts`
- `src/testing/entrypoints/shadow.content.ts`
- `src/testing/ShadowTestPopup.tsx`
- `wxt.shadow.config.ts`

## 11. Local backend implementation

Repository: `secureintent-backend`

The functional local backend is fixed to `http://127.0.0.1:8791` and uses an
isolated D1 database. It provides:

- expiring synthetic Business member and admin sessions;
- pseudonymous `Seat N` labels;
- strict event validation;
- visit, paste-volume, and sensitive-event ingestion;
- idempotent event storage;
- organisation-scoped aggregation;
- summary, trend, discovered-tool, and ledger responses;
- admin-only classification and paste-policy updates;
- tenant isolation;
- bounded synthetic-session storage for repeatable tests.

Important backend files:

- `testing/shadow/worker.ts`
- `testing/shadow/validation.ts`
- `testing/shadow/migrations/0001_visits.sql`
- `testing/shadow/migrations/0002_discovery_v1.sql`
- `scripts/check-shadow-reporting.mjs`

## 12. ClickHouse reporting contract

The required production ClickHouse contract is prepared and versioned, but it has
not been applied.

It includes:

- a tenant-first, deduplicating `shadow_ai_events` table;
- page-visit, paste-volume, and sensitive-event rows;
- opaque pseudonymous seat identifiers;
- fixed summary aggregation;
- daily trend aggregation;
- discovered-tool aggregation;
- paginated DLP ledger query;
- typed ClickHouse query parameters.

The schema contains no columns for pasted text, prompts, secret values, email
addresses, complete URLs, paths, or query strings. A production retention TTL is
deliberately omitted until the retention period is approved.

Files:

- `secureintent-backend/testing/shadow/clickhouse/0001_shadow_ai_v1.sql`
- `secureintent-backend/testing/shadow/clickhouse/dashboard_queries.sql`
- `secureintent-backend/testing/shadow/clickhouse/README.md`
- `secureintent-backend/scripts/check-shadow-clickhouse.mjs`

## 13. Business dashboard

Repository: `secureintent.ai`

The local dashboard is `shadow.html` on the `demo/shadow-ai-v1` branch. It reuses
the established Business console colors, cards, panels, typography, tables,
controls, responsive layout, and status language.

Implemented UI:

- discovered-tools card;
- recognised-visits card;
- unsanctioned-usage percentage based on recognised visits;
- paste-attempt count;
- attempted paste-volume card;
- sensitive-event and higher-risk count;
- daily visit/paste/sensitive-event trend;
- discovered-tools table;
- organisation-specific policy actions;
- paginated DLP event ledger;
- pseudonymous Seat IDs by default;
- explicit V1 metric and blocklist definitions;
- responsive mobile layout.

Dashboard files:

- `secureintent.ai/shadow.html`
- `secureintent.ai/test/shadow-dashboard.check.js`

## 14. Privacy guardrails

Phase One enforces the following rules:

- hostname-only destination reporting;
- no pasted text or prompt content transmitted;
- no secret values transmitted or stored;
- no URL paths, queries, or fragments transmitted;
- no email addresses in Shadow telemetry or dashboard responses;
- pseudonymous Seat IDs displayed by default;
- the backend derives organisation and seat context from the authenticated
  session rather than accepting it from event bodies;
- unsupported fields cause event rejection;
- dashboard and extension endpoints are restricted to the local test origin;
- incognito/private browsing telemetry is excluded.

Future email integration remains outside Phase One.

## 15. Branch record

### Extension repository

| Branch | Head | Responsibility |
| --- | --- | --- |
| `feat/shadow-catalog` | `6f3f205` | Catalog and recognition |
| `feat/shadow-visits` | `3097ee7` | Visit telemetry |
| `feat/shadow-paste-volume` | `7059634` | Paste volume and telemetry foundation |
| `feat/shadow-sensitive-events` | `730b4b5` | Sensitive outcomes and privacy E2E |
| `feat/shadow-policy-actions` | `9e6acfd` | Refresh and paste-policy enforcement |
| `demo/shadow-ai-v1` | `23f99b7` | Integrated extension demo and handoff |

### Backend repository

| Branch | Head | Responsibility |
| --- | --- | --- |
| `feat/shadow-catalog` | `4550a40` | Backend catalog snapshot |
| `feat/shadow-visits` | `59f0737` | Local visit ingestion |
| `feat/shadow-paste-volume` | `413b920` | Paste/DLP ingestion foundation |
| `feat/shadow-sensitive-events` | `9c8fffa` | Sensitive-event outcome validation |
| `feat/shadow-backend-reporting` | `278f303` | Reporting API and ClickHouse contract |
| `feat/shadow-policy-actions` | `b3975a1` | Organisation policy validation/integration |
| `demo/shadow-ai-v1` | `1141d77` | Integrated backend demo at completion time |

### Dashboard repository

| Branch | Head | Responsibility |
| --- | --- | --- |
| `feat/shadow-dashboard` | `7120a05` | Dashboard and browser checks |
| `feat/shadow-policy-actions` | `7db06fe` | Explicit policy actions |
| `demo/shadow-ai-v1` | `7db06fe` | Integrated dashboard demo |

No branch was pushed to a remote, and no `main` branch was modified.

## 16. Validation results

Validation completed during Phase One:

- Extension Vitest: **56 files, 599 tests passed**.
- Backend Vitest: **36 files, 433 tests passed**.
- Extension TypeScript compilation: passed.
- Backend production TypeScript compilation: passed.
- Backend local Shadow TypeScript compilation: passed.
- Chrome MV3 Shadow build: passed.
- Firefox MV2 Shadow build: passed.
- Shadow Chromium E2E: **6 of 6 scenarios passed**.
- Backend live local reporting/API check: passed.
- Catalog parity check: passed.
- ClickHouse contract check: passed.
- Dashboard browser interaction and responsive-layout check: passed.

The six extension E2E scenarios cover:

1. consent, catalog, hostname-only visits, and navigation deduplication;
2. all catalog hostnames and lookalike rejection;
3. clean and sensitive paste attempts without pasted-text transmission;
4. organisation paste policy without website-access blocking;
5. offline retry, backend replay deduplication, and pending-state clearing;
6. privacy-field rejection, Business-plan gating, and tenant isolation.

Known validation notes:

- The extension lint check has three pre-existing `!important` warnings in the
  production popup stylesheet and no new Shadow formatting errors.
- The backend full lint command still reports one unrelated pre-existing
  implicit-`any` error in `test/usage.test.ts` and existing warnings.
- Chrome has automated runtime E2E coverage. Firefox compiles successfully, but
  final manual Firefox runtime acceptance is still required.

## 17. Running the Phase One demo

### Backend

```sh
cd secureintent-backend
pnpm db:shadow
pnpm dev:shadow
```

### Extension

```sh
cd Secureintent-Extension
pnpm build:shadow
```

Load `dist-shadow/chrome-mv3` as an unpacked Chrome extension in a dedicated test
profile.

For Firefox:

```sh
pnpm build:shadow:firefox
```

Load `dist-shadow/firefox-mv2/manifest.json` as a temporary Firefox add-on.

### Dashboard

```sh
cd secureintent.ai
python3 -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173/shadow.html`.

See `docs/shadow-local-testing.md` for the detailed test and troubleshooting
instructions.

## 18. Not included in Phase One

- Full website blocking.
- Email-address display or email integration.
- Monitoring of Cursor or Replit desktop applications.
- Guaranteed real-time policy delivery.
- Browser-store review or publication.
- Production deployment.
- Production database changes.
- Automatic merging into `main`.
- Additional screens or integrations outside the approved V1 scope.

## 19. Work remaining before production promotion

The implementation work is complete for the isolated Phase One demo. Production
promotion still requires:

1. final Figma and product approval with Aleena;
2. staging and test-team credentials;
3. confirmation of the production ClickHouse database name and retention period;
4. application and review of the ClickHouse schema;
5. replacement of synthetic sessions with approved Clerk Business-team
   attribution;
6. integration into the production extension and Business dashboard entry
   points;
7. manual Firefox runtime acceptance;
8. security, privacy, permissions, and release review;
9. explicit approval before any merge, deployment, or browser-store submission.

