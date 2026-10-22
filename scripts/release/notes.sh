#!/usr/bin/env bash
# Release-note generation; developer tooling outside the PRD CLI contract.
# Sourcing only defines the function. Run from ROOT with next_version set;
# pr_body and changelog_section are outputs in the caller shell.

gather_release_changes() {
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

}

request_release_summary() {
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
# response to match our schema. We deliberately do NOT redirect stderr
# here — if claude writes a diagnostic, the user should see it.
response="$(
  printf '%s\n' "$prompt" | claude -p \
    --bare \
    --no-session-persistence \
    --output-format json \
    --json-schema "$schema" \
    --model sonnet \
    --max-budget-usd 1.00
)"

if [ -z "$response" ]; then
  echo "error: claude returned no output" >&2
  exit 1
fi

}

parse_release_summary() {
# Claude reports logical failures (auth, budget, refusal) as a
# top-level `{ "is_error": true, "result": "..." }` envelope and still
# exits 0. Some Claude CLI versions wrap the result envelope in an
# event array, so normalize to the final envelope before inspecting it.
envelope="$(echo "$response" | jq -c 'if type == "array" then .[-1] else . end')"
if [ "$(echo "$envelope" | jq -r 'if type == "object" then (.is_error // false) else false end')" = "true" ]; then
  echo "error: claude reported an error:" >&2
  echo "  $(echo "$envelope" | jq -r '.result // "(no result field)"')" >&2
  exit 1
fi

# With `--json-schema` and `--output-format json`, claude returns a
# result envelope and parks the schema-conforming object at top-level
# `.structured_output`. (Earlier versions of this script walked a
# stream-json event log — that shape never matched under --output-format
# json and produced a cryptic jq error.)
inner="$(echo "$envelope" | jq -c '.structured_output')"
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
}

generate_release_notes() {
  gather_release_changes
  request_release_summary
  parse_release_summary
}
