# Shadow AI catalog — local V1

`src/lib/shadow/catalog.json` is the canonical catalog. Keep the backend's
`src/lib/shadow/catalog.json` snapshot byte-for-byte identical; run
`node scripts/check-shadow-catalog.mjs` from the backend to verify.

The 18 services come from Julian's approved scope. All start as Tier 2
(recognised, unsanctioned). Sanction and review decisions are per organisation;
no provider or country is assigned a higher-risk label without a team decision.
An explicit sanction takes precedence over a review flag.

Hostnames are exact matches, case-insensitive, with one trailing DNS dot normalised.
Unlisted subdomains and lookalike suffixes do not match. Local route checks never
return or retain paths, query strings, fragments, page titles or content.

## Host review (2026-09-09)

The catalog retains approved hostnames and relevant existing extension aliases:
`chat.openai.com`, `www.perplexity.ai`, `www.meta.ai`, and `v0.app`.
Cursor additionally includes its explicit `www.cursor.com` alias; this is website
activity, not evidence of Cursor IDE usage. Replit and other mixed-use destinations
also represent recognised-domain visits, not confirmed AI interactions.

- [GitHub's instructions](https://docs.github.com/en/copilot/how-tos/copilot-on-github/chat-with-copilot/chat-in-github)
  identify `github.com/copilot` as the standalone chat surface. V1 observes only
  `/copilot` and `/copilot/*`, consistent with the existing paste guard. Ordinary
  repositories, `/features/copilot`, and embedded side panels are excluded.
- [v0 documentation](https://v0.app/docs) uses `v0.app`; retain both `v0.dev` and
  `v0.app`, matching the existing extension.
- [AI Studio](https://aistudio.google.com/) resolves to the same hostname's welcome page.
- [Perplexity](https://www.perplexity.ai/) and [Cursor](https://cursor.com/) confirm
  the explicit website destinations.

No account-authenticated manual checks have yet been performed across all 18
providers. Redirects between catalog hosts count separate document loads. SPA
navigation from an ordinary GitHub page into Copilot without a document load is
not covered by the path-scoped observer; reload the Copilot page to capture it.
These are intentional conservative coverage limits, not evidence of zero usage.

To expand: add a service/explicit alias, update the backend snapshot and tests,
rebuild both browser test artifacts, and review permission differences. This
catalog does not broaden permissions or automatically update deployed extensions.
