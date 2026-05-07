#!/usr/bin/env bash
#
# Release helper. Bumps the version in package.json, updates
# CHANGELOG.md and the PR body using a Claude-generated summary of
# the changes since the last tag, opens a release PR, and prints the
# URL.
#
# Usage:
#   bun run release             # patch bump (default)
#   bun run release patch
#   bun run release minor
#   bun run release major
#
# Flow:
#   1. Safety: clean working tree, on main, up-to-date with origin/main.
#   2. Compute next version from package.json + bump kind.
#   3. Call `claude -p` once with a JSON schema to get
#      { pr_body, changelog } for commits since the last tag.
#   4. Update package.json and CHANGELOG.md on a fresh
#      release/vX.Y.Z branch.
#   5. `gh pr create` with the generated PR body.
#
# Merging the PR triggers the release-tag workflow, which tags the
# merge commit and fires release.yml to build + publish.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DRY_RUN=false
BUMP="patch"
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    patch|minor|major) BUMP="$arg" ;;
    *) echo "error: unknown argument '$arg' (expected patch|minor|major, --dry-run)" >&2; exit 1 ;;
  esac
done

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

# ---------- 2. Compute next version ---------------------------------------

current_version="$(bun -e 'console.log(require("./package.json").version)')"
IFS='.' read -r major minor patch <<<"$current_version"
case "$BUMP" in
  patch) patch=$((patch + 1)) ;;
  minor) minor=$((minor + 1)); patch=0 ;;
  major) major=$((major + 1)); minor=0; patch=0 ;;
esac
next_version="${major}.${minor}.${patch}"
next_tag="v${next_version}"
branch="release/${next_tag}"

echo "==> Releasing ${current_version} -> ${next_version} (${BUMP})"

if git show-ref --verify --quiet "refs/heads/${branch}"; then
  echo "error: branch ${branch} already exists locally — delete it or pick a different bump" >&2
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

# ---------- 3. Gather changes since last tag ------------------------------

last_tag="$(git describe --tags --abbrev=0 2>/dev/null || echo "")"
if [ -n "$last_tag" ]; then
  commit_range="${last_tag}..HEAD"
  range_label="since ${last_tag}"
else
  commit_range="HEAD"
  range_label="from the entire history"
fi

commit_log="$(git log --format='%H%n%s%n%b%n----' ${commit_range})"
diff_stat="$(git diff --stat ${commit_range} || true)"

if [ -z "$commit_log" ]; then
  echo "error: no commits ${range_label} — nothing to release" >&2
  exit 1
fi

# ---------- 4. Ask Claude for a structured summary ------------------------

echo "==> Asking Claude to summarize changes ${range_label}"

schema='{
  "type": "object",
  "properties": {
    "pr_body": {
      "type": "string",
      "description": "Markdown body for the release PR. Summarize user-facing changes grouped by category (Added / Changed / Fixed / Removed). Skip internal refactors unless they affect users. No heading levels above ## — the PR already has a title."
    },
    "changelog": {
      "type": "string",
      "description": "A new CHANGELOG.md section in Keep a Changelog format. Start with `## [VERSION] — YYYY-MM-DD` on its own line, then Added / Changed / Fixed / Removed subsections as appropriate. No surrounding prose, no trailing blank lines."
    }
  },
  "required": ["pr_body", "changelog"]
}'

today="$(date +%Y-%m-%d)"

prompt="You are drafting the release notes for version ${next_version} of \`crew\`, a package manager for Agent Skills (the SKILL.md-based standard from agentskills.io). You install skills into every agent coder on a user's Mac (Claude Code, Codex, Cursor, Gemini CLI, Goose, GitHub Copilot, and many more).

Below are the commits ${range_label}. Summarize them as release notes. Keep the voice crisp and user-focused: what changed from the user's perspective, not mechanical one-line-per-commit dumps. Group by Added / Changed / Fixed / Removed. Skip purely internal refactors, test tweaks, and tooling changes unless they affect what users see or how they install.

Version: ${next_version}
Date: ${today}

Commits (most recent first, separated by '----'):
${commit_log}

Diff stat:
${diff_stat}

Return a JSON object matching the provided schema. Do not wrap it in markdown fences."

# --bare disables hooks, CLAUDE.md auto-discovery, and other ambient
# context so the prompt is deterministic. `--json-schema` forces the
# response to match our schema.
response="$(
  printf '%s\n' "$prompt" | claude -p \
    --bare \
    --no-session-persistence \
    --output-format json \
    --json-schema "$schema" \
    --model sonnet \
    --max-budget-usd 1.00 \
    2>/dev/null
)"

if [ -z "$response" ]; then
  echo "error: claude returned no output" >&2
  exit 1
fi

# With `--json-schema`, Claude's structured response comes back as a
# tool call named `StructuredOutput` whose `input` is the schema-
# conforming object. The top-level `result` field is empty text.
# Walk the event stream and pick out the last tool_use input.
inner="$(
  echo "$response" | jq -c '
    map(select(.type == "assistant")
      | .message.content[]
      | select(.name == "StructuredOutput")
      | .input
    ) | last
  '
)"
if [ -z "$inner" ] || [ "$inner" = "null" ]; then
  echo "error: claude response missing structured output" >&2
  echo "--- raw response ---" >&2
  echo "$response" >&2
  exit 1
fi

pr_body="$(echo "$inner" | jq -r '.pr_body')"
changelog_section="$(echo "$inner" | jq -r '.changelog')"

if [ -z "$pr_body" ] || [ "$pr_body" = "null" ]; then
  echo "error: claude response missing pr_body" >&2
  exit 1
fi
if [ -z "$changelog_section" ] || [ "$changelog_section" = "null" ]; then
  echo "error: claude response missing changelog" >&2
  exit 1
fi

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

# Bump package.json version without reformatting the rest of the file.
node -e "
const fs = require('node:fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = '${next_version}';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# Update the CREW_VERSION constant used by --version and markers.
if [ -f src/core/version.ts ]; then
  # Replace the string literal after CREW_VERSION = "..."
  perl -i -pe 's/(CREW_VERSION\s*=\s*")[^"]*(")/${1}'"${next_version}"'${2}/' src/core/version.ts
fi

# Update the PRD's `Version:` line so the spec stays in sync with the
# implementation. The PRD ships alongside the CLI — one version number
# for both.
if [ -f PRD.md ]; then
  perl -i -pe 's/^Version:.*$/Version: '"${next_version}"'/' PRD.md
fi

# Regenerate the site's latest-version.json. This file is served at
# https://crew.logic.inc/latest-version.json and is the fast-path
# endpoint that the 24h update-available notice pings (§10.4). Points
# the asset URLs at the new release's GitHub downloads.
if [ -d site/public ]; then
  cat > site/public/latest-version.json <<JSON
{
  "tag_name": "${next_tag}",
  "assets": [
    {
      "name": "crew-macos-arm64",
      "browser_download_url": "https://github.com/with-logic/crew/releases/download/${next_tag}/crew-macos-arm64"
    },
    {
      "name": "crew-macos-x64",
      "browser_download_url": "https://github.com/with-logic/crew/releases/download/${next_tag}/crew-macos-x64"
    },
    {
      "name": "SHA256SUMS",
      "browser_download_url": "https://github.com/with-logic/crew/releases/download/${next_tag}/SHA256SUMS"
    },
    {
      "name": "SHA256SUMS.sig",
      "browser_download_url": "https://github.com/with-logic/crew/releases/download/${next_tag}/SHA256SUMS.sig"
    }
  ]
}
JSON
fi

# Write/update CHANGELOG.md. If it doesn't exist, create a header
# first; then prepend the new section below the header.
if [ ! -f CHANGELOG.md ]; then
  cat > CHANGELOG.md <<'HEADER'
# Changelog

All notable changes to crew are documented in this file. The format
is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and crew adheres to [Semantic Versioning](https://semver.org/).

HEADER
fi

# Insert the new section after the header block (the first blank line
# following the `# Changelog` heading). We keep the rest of the file
# verbatim so older entries stay put.
python3 - <<PY
import re

path = "CHANGELOG.md"
with open(path, "r", encoding="utf-8") as f:
    body = f.read()

section = """${changelog_section}""".rstrip() + "\n\n"

# Find the first blank line after the `# Changelog` heading and
# splice the new section in there.
m = re.search(r"^# Changelog.*?\n\n", body, flags=re.S | re.M)
if not m:
    # Fallback: prepend the section (shouldn't happen — the header
    # template above always contains a blank line after the title).
    new_body = section + body
else:
    idx = m.end()
    new_body = body[:idx] + section + body[idx:]

with open(path, "w", encoding="utf-8") as f:
    f.write(new_body)
PY

echo "==> Committing version bump + changelog"
git add package.json CHANGELOG.md
[ -f src/core/version.ts ] && git add src/core/version.ts
[ -f PRD.md ] && git add PRD.md
[ -f site/public/latest-version.json ] && git add site/public/latest-version.json
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
