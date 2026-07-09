#!/usr/bin/env bash
#
# Publish the current source tree to the public repo's main branch.
#
# Model: the dev history lives on `master` (private, granular commits). The
# public GitHub repo gets clean *snapshots* on the `public-release` branch,
# whose history is unrelated to master (each release is one squashed commit).
# This script overlays master's exact tree onto public-release and pushes it to
# `public/main` — without leaking master's commit history.
#
# Usage:
#   ./scripts/publish-public.sh ["release message"]
#   DRY_RUN=1 ./scripts/publish-public.sh      # show what would happen, no push
#
set -euo pipefail

SRC_BRANCH="master"            # private dev branch (source of truth)
PUB_BRANCH="public-release"    # local snapshot branch tracking public/main
REMOTE="public"                # git@github.com:Secureintent-Admin/Secureintent-Extension.git
REMOTE_BRANCH="main"           # branch on the public repo

# Paths kept OUT of the public snapshot (internal tooling, secrets, etc.).
# The test fixtures below carry *synthetic* secret-shaped strings (the detector's
# own test corpus); GitHub push-protection blocks real key formats, so they stay
# private even though they contain no real secrets.
EXCLUDE=(
  "scripts/publish-public.sh"
  "docs/test-payloads.md"
  "e2e/live.spec.ts"
  "src/lib/detection/index.test.ts"
  # Internal planning/spec docs — never publish.
  "PROJECT.MD"
  "TODO.md"
  "docs/superpowers"
)

cd "$(git rev-parse --show-toplevel)"

# 1. Refuse to run on a dirty tree — we reset the worktree below, so uncommitted
#    work would be lost.
if [[ -n "$(git status --porcelain)" ]]; then
  echo "✗ Working tree not clean. Commit or stash first." >&2
  exit 1
fi

ORIG_BRANCH="$(git symbolic-ref --short HEAD)"
restore() { git checkout --quiet "$ORIG_BRANCH"; }
trap restore EXIT

MSG="${1:-release: sync public extension from $SRC_BRANCH}"

echo "→ Snapshotting '$SRC_BRANCH' onto '$PUB_BRANCH'"
git checkout --quiet "$PUB_BRANCH"

# 2. Make index + worktree EXACTLY match master's tree (adds, updates, and
#    deletes files), while keeping public-release's branch pointer/history.
git read-tree -u --reset "$SRC_BRANCH"

# 3. Drop excluded paths from the snapshot (index + worktree).
for path in "${EXCLUDE[@]}"; do
  git rm -r --cached --quiet --ignore-unmatch -- "$path"
  rm -rf -- "$path"
done

if git diff --cached --quiet; then
  echo "✓ Nothing to publish — public-release already matches $SRC_BRANCH."
  exit 0
fi

git status --short
git commit --quiet -m "$MSG"
echo "✓ Committed snapshot: $(git log -1 --oneline)"

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "DRY_RUN=1 → skipping push. Would run: git push $REMOTE HEAD:$REMOTE_BRANCH"
  exit 0
fi

echo "→ Pushing to $REMOTE/$REMOTE_BRANCH"
git push "$REMOTE" "HEAD:$REMOTE_BRANCH"
echo "✓ Published to $REMOTE/$REMOTE_BRANCH"
