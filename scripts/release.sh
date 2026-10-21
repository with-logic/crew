#!/usr/bin/env bash
#
# Release helper. Bumps or selects an exact stable version in package.json, updates
# CHANGELOG.md and the PR body using a Claude-generated summary of
# the changes since the last tag, opens a release PR, and prints the
# URL.
#
# Usage:
#   bun run release             # patch bump (default)
#   bun run release patch
#   bun run release minor
#   bun run release major
#   bun run release 0.12.0      # exact version greater than the current version
#
# Flow:
#   1. Safety: clean working tree, on main, up-to-date with origin/main.
#   2. Compute next version from package.json + bump kind or exact version.
#   3. Call `claude -p` once with a JSON schema to get
#      { pr_body, changelog } for commits since the last tag.
#   4. Update package.json, CHANGELOG.md, and generated release
#      artifacts on a fresh release/vX.Y.Z branch.
#   5. `gh pr create` with the generated PR body.
#
# Merging the PR triggers the release-tag workflow, which tags the
# merge commit and fires release.yml to build + publish.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
source "$ROOT/scripts/next-version.sh"

source "$ROOT/scripts/release/arguments.sh"
source "$ROOT/scripts/release/notes.sh"
source "$ROOT/scripts/release/artifacts.sh"
parse_release_arguments "$@"

# ---------- 1. Safety checks ----------------------------------------------

if [ -n "$(git status --porcelain)" ]; then
  echo "error: working tree has uncommitted changes — commit or stash first" >&2
  git status --short >&2
  exit 1
fi

current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "$current_branch" != "main" ]; then
  echo "error: must be on 'main' to cut a release (currently on '$current_branch')" >&2
  exit 1
fi

echo "==> Fetching origin/main"
git fetch --quiet origin main
local_sha="$(git rev-parse main)"
remote_sha="$(git rev-parse origin/main)"
if [ "$local_sha" != "$remote_sha" ] && ! $DRY_RUN; then
  echo "error: local main is out of sync with origin/main" >&2
  echo "  local : $local_sha" >&2
  echo "  remote: $remote_sha" >&2
  echo "  run: git pull --ff-only origin main" >&2
  exit 1
fi

for cmd in claude gh jq bun; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "error: required tool '$cmd' is not on PATH" >&2
    exit 1
  fi
done

# `claude --bare` (used below for deterministic output) explicitly
# bypasses OAuth and the keychain — it only accepts ANTHROPIC_API_KEY
# or an apiKeyHelper via --settings. Catch this here so the failure
# isn't opaque at the summary step.
if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "error: ANTHROPIC_API_KEY is not set" >&2
  echo "  This script invokes 'claude --bare' to summarize changes," >&2
  echo "  which ignores OAuth/keychain auth and requires the env var." >&2
  echo "  export ANTHROPIC_API_KEY=sk-ant-... and re-run." >&2
  exit 1
fi

# ---------- 2. Compute next version ---------------------------------------

current_version="$(bun -e 'console.log(require("./package.json").version)')"
next_version="$(next_release_version "$current_version" "$RELEASE_TARGET")"
next_tag="v${next_version}"
branch="release/${next_tag}"

echo "==> Releasing ${current_version} -> ${next_version} (${RELEASE_TARGET})"

if git show-ref --verify --quiet "refs/heads/${branch}"; then
  echo "error: branch ${branch} already exists locally — delete it or pick a different release target" >&2
  exit 1
fi
if git ls-remote --exit-code --heads origin "${branch}" >/dev/null 2>&1; then
  echo "error: branch ${branch} already exists on origin — release may already be in flight" >&2
  exit 1
fi
if git rev-parse -q --verify "refs/tags/${next_tag}" >/dev/null 2>&1; then
  echo "error: tag ${next_tag} already exists locally" >&2
  exit 1
fi
if git ls-remote --exit-code --tags origin "${next_tag}" >/dev/null 2>&1; then
  echo "error: tag ${next_tag} already exists on origin" >&2
  exit 1
fi

generate_release_notes

# ---------- 5. Update files -----------------------------------------------

if $DRY_RUN; then
  echo "==> [dry-run] Would create branch ${branch}"
  echo
  echo "--- PR body ---"
  echo "$pr_body"
  echo
  echo "--- CHANGELOG section ---"
  echo "$changelog_section"
  echo
  echo "==> [dry-run] Done. No changes made."
  exit 0
fi

echo "==> Creating branch ${branch}"
git checkout -q -b "$branch"

write_release_artifacts

echo "==> Committing version bump + changelog"
git add package.json CHANGELOG.md
[ -f src/core/version.ts ] && git add src/core/version.ts
[ -f PRD.md ] && git add PRD.md
[ -f site/public/latest-version.json ] && git add site/public/latest-version.json
[ -d src/known-taps/generated ] && git add src/known-taps/generated
[ -f site/lib/generated/skillCatalog.ts ] && git add site/lib/generated/skillCatalog.ts
git commit -q -m "Release ${next_tag}"

echo "==> Pushing branch"
git push -q -u origin "$branch"

# ---------- 6. Open the PR ------------------------------------------------

echo "==> Opening PR"
pr_url="$(
  gh pr create \
    --base main \
    --head "$branch" \
    --title "Release ${next_tag}" \
    --body "$pr_body"
)"

echo
echo "Release PR opened:"
echo "  $pr_url"
echo
echo "After merging:"
echo "  - the release-tag workflow will tag ${next_tag} on the merge commit"
echo "  - release.yml will build + publish the GitHub Release"
echo
echo "If anything looks wrong, close the PR and delete the branch:"
echo "  gh pr close $pr_url --delete-branch"
