#!/usr/bin/env bash
# Release artifact updates; developer tooling outside the PRD CLI contract.
# Sourcing only defines the function. Run from ROOT with next_version,
# next_tag and changelog_section set; writes the existing release files.

write_release_artifacts() {
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
      "name": "crew-linux-arm64",
      "browser_download_url": "https://github.com/with-logic/crew/releases/download/${next_tag}/crew-linux-arm64"
    },
    {
      "name": "crew-linux-x64",
      "browser_download_url": "https://github.com/with-logic/crew/releases/download/${next_tag}/crew-linux-x64"
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

# Refresh the bundled known-tap registry snapshot from the reviewed,
# commit-pinned manifest. This deliberately does not advance pins from
# trackingRef; pin refreshes must happen in ordinary reviewed PRs.
if [ -f known-taps/manifest.json ]; then
  echo "==> Regenerating known-tap registry"
  bun run known-taps build
  bun run known-taps check
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
}
