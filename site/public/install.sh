#!/usr/bin/env bash
#
# crew installer.
#
# Usage:
#   curl -fsSL https://crew.logic.inc/install.sh | sh
#
# What it does:
#   1. Detects your macOS CPU architecture (arm64 or x86_64).
#   2. Downloads the latest crew release from GitHub.
#   3. Installs to $CREW_INSTALL_PREFIX (default: ~/.local/bin).
#   4. Clears the macOS quarantine attribute so Gatekeeper doesn't
#      block the first run.
#   5. Tells you how to put the install dir on your PATH if it isn't.
#
# Safe to re-run — upgrades in place.
#
# Environment variables:
#   CREW_INSTALL_PREFIX   Install dir. Default: $HOME/.local/bin.
#   CREW_VERSION          Specific version to install (e.g. "v0.3.1").
#                         Default: latest release.

set -euo pipefail

# ---------- Pretty output ------------------------------------------------

BOLD=$(printf '\033[1m'); RESET=$(printf '\033[0m')
DIM=$(printf '\033[2m');  RED=$(printf '\033[31m'); GREEN=$(printf '\033[32m')

log()  { printf '%s==>%s %s\n' "$BOLD" "$RESET" "$*"; }
ok()   { printf '%s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
warn() { printf '%s!%s %s\n' "$RED" "$RESET" "$*" >&2; }
die()  { warn "$*"; exit 1; }

# ---------- Prerequisites ------------------------------------------------

[ "$(uname -s)" = "Darwin" ] || die "crew is macOS-only for now. Linux and Windows are tracked but not yet shipping."

command -v curl >/dev/null 2>&1 || die "\`curl\` is required but not on PATH."

arch="$(uname -m)"
case "$arch" in
  arm64)  asset="crew-macos-arm64" ;;
  x86_64) asset="crew-macos-x64"   ;;
  *) die "unsupported architecture: $arch" ;;
esac

# ---------- Resolve version and download URL ----------------------------

repo="with-logic/crew"
version="${CREW_VERSION:-}"

if [ -z "$version" ]; then
  log "Fetching latest release from github.com/$repo"
  # The /releases/latest endpoint 302-redirects to /releases/tag/vX.Y.Z.
  # Follow with -I so we get just headers, then parse the Location tail.
  latest_url="$(curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/$repo/releases/latest")"
  version="${latest_url##*/}"
  [ -n "$version" ] || die "could not determine the latest release"
fi

url="https://github.com/$repo/releases/download/$version/$asset"
log "Downloading $asset ($version)"

# ---------- Download to a tmp file --------------------------------------

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
tmpfile="$tmpdir/crew"

if ! curl -fsSL -o "$tmpfile" "$url"; then
  die "download failed — $url was not reachable. Check the release page at https://github.com/$repo/releases for available versions."
fi

chmod +x "$tmpfile"

# Clear macOS quarantine so Gatekeeper doesn't block the first run.
# `xattr -dr com.apple.quarantine` is a no-op if the attribute isn't
# set, so we don't need to check first.
xattr -dr com.apple.quarantine "$tmpfile" 2>/dev/null || true

# ---------- Install to prefix -------------------------------------------

prefix="${CREW_INSTALL_PREFIX:-$HOME/.local/bin}"
dest="$prefix/crew"

mkdir -p "$prefix"
mv "$tmpfile" "$dest"

ok "installed crew to $dest"

# Run it once to verify and print the version string.
if "$dest" version >/dev/null 2>&1; then
  ok "$("$dest" version)"
else
  warn "binary installed but \`$dest version\` failed. Try running it manually."
fi

# ---------- Prime the default taps --------------------------------------

# Fetch the default tap(s) so `crew search` works immediately. Non-fatal
# on network failure — a later `crew install` / `crew update` will retry.
log "Fetching default skill taps"
if "$dest" update >/dev/null 2>&1; then
  ok "skill taps ready"
else
  warn "couldn't fetch taps right now — run \`crew update\` once you're online."
fi

# ---------- PATH hint ---------------------------------------------------

case ":${PATH:-}:" in
  *":$prefix:"*)
    # Already on PATH — nothing to do.
    :
    ;;
  *)
    cat <<EOF

${DIM}$prefix is not on your PATH.
Add this to your shell profile (e.g. ~/.zshrc):

    export PATH="$prefix:\$PATH"

Then open a new terminal, or run:

    export PATH="$prefix:\$PATH"
${RESET}
EOF
    ;;
esac

log "Done. Try ${BOLD}crew help${RESET} to see what you can do."
