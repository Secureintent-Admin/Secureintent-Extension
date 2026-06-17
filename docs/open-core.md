# Open-core architecture

How the free (public) extension and the premium (private) build relate.

## Repos

| Repo | Visibility | Holds | License |
|------|-----------|-------|---------|
| `secureintent-ext` (this) | **public** | free extension; published as `@secureintent/core` | proprietary (view-only — see [LICENSE](../LICENSE)) |
| `secureintent-private`    | **private** | `backend/` (Worker) + `pro/` (premium build) | proprietary |

Dependency points **one way**: `pro → core`. Core never imports pro and never
knows it exists. Hold this line and free updates never conflict with premium.

## The seam (in this repo)

- `src/lib/features/` — the feature registry. Pro registers `Feature` objects;
  the guard calls `notifyDetections` / `notifyAction`. No-op in the free build.
- `src/content/createPasteGuard.ts` — fires those hooks (fire-and-forget,
  metadata only; raw clipboard text is never passed, even to pro code).
- `src/core.ts` — the public, semver'd API surface pro imports. Refactor
  internals freely; keep this barrel stable.
- `wxt.config.ts` — `BUILD_TARGET=free|pro` (free default; sets manifest name).
- `package.json` — `exports: { ".": "./src/core.ts" }`. Publishing stays off
  (`private: true`) until the first premium feature ships.

## Update flow (how pro leverages free changes without mess)

1. Improve free ext here → push → CI publishes `@secureintent/core@x.y.z`.
2. Renovate opens a version-bump PR in the private repo.
3. Private CI tests pro against the new core → merge. No hand-copying.

## Adding a premium feature (later)

1. In the private `pro/` repo: `registerFeature({ name, onDetections?, onAction? })`.
2. Reuse `createPasteGuard` / `mountOverlay` from `@secureintent/core`.
3. Put the valuable logic + license enforcement in `backend/` — the signed
   config bundle already supports serving premium-only patterns/policies to
   licensed users. The client never holds the license truth.

See `../../pro-example/` for a concrete skeleton.

## When to actually publish the package

Don't build the publish pipeline until the first premium feature is real. Until
then this repo is just the free extension that happens to expose a clean seam.
To publish: bump version, `private: false`, rename to `@secureintent/core`, add
an alias-resolving build step (unbuild/tsup so `@/` → relative), `pnpm publish`.
