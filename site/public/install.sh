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
#   3. Verifies the signed release SHA256SUMS file, then verifies
#      the binary against it.
#   4. Installs to $CREW_INSTALL_PREFIX (default: ~/.local/bin).
#   5. Clears the macOS quarantine attribute so Gatekeeper doesn't
#      block the first run.
#   6. Tells you how to put the install dir on your PATH if it isn't.
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

[ "$(uname -s)" = "Darwin" ] || die "Homecrew is macOS-only for now. Linux and Windows are tracked but not yet shipping."

command -v curl >/dev/null 2>&1 || die "\`curl\` is required but not on PATH."
command -v shasum >/dev/null 2>&1 || die "\`shasum\` is required but not on PATH."
command -v openssl >/dev/null 2>&1 || die "\`openssl\` is required but not on PATH."

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

base_url="https://github.com/$repo/releases/download/$version"
url="$base_url/$asset"
checksums_url="$base_url/SHA256SUMS"
signature_url="$base_url/SHA256SUMS.sig"
log "Downloading $asset ($version)"

# ---------- Download and verify -----------------------------------------

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
tmpfile="$tmpdir/crew"
checksums="$tmpdir/SHA256SUMS"
signature="$tmpdir/SHA256SUMS.sig"
public_key="$tmpdir/release-signing-public.pem"

if ! curl -fsSL -o "$tmpfile" "$url"; then
  die "download failed — $url was not reachable. Check the release page at https://github.com/$repo/releases for available versions."
fi

log "Verifying checksum signature"
if ! curl -fsSL -o "$checksums" "$checksums_url"; then
  die "checksum download failed — $checksums_url was not reachable. Refusing to install an unverified binary."
fi
cat > "$public_key" <<'PEM'
-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEArgeaoEjGS/rIJ/VYsKaE
PnWIsOYzj6pKueJSceWK4/AM2ar06S9z3BKs5J8FBO86h3scJU10lTS1YHsoCIJB
XU1PmJXTyNOcx4OSKfz28Y4Ym8yX7kLni4WhHP2XzGOevy5v/6IkPOqq5xmcND+e
TF5a84UhHqtdwtn4rzHeHitk7h2f6QzBW/LfI3uGfZnBuc+BLI+RRxN8BEv/iGMN
3RJK2HkG7wZ2F18XtxRygCnHdNNfJ29PzoOKnbO94xDbQcgKLLbNS3/cJ4JPZpiK
40dEs0FHv0wnN4qxtJ2YZTcBkiR5Hc0TcrsK4kAKK84qdEu3QuukRHlxkQLMtJFZ
I3DjV6UXztb/rzNDJ7K1KrJd7w7wtYXFnYxTJr5PITgm1zR/eoWCBywP7Hlv8Hvh
+qyVkc7Sagekp+Oh9np0enjZElgv/aaOilDZ462+cq2AKz64diEXaXU3hw6nNItf
BtMQVHfviRiPH0EpGPNqq5lflTvBJUU8e0A91H7SdsGfAgMBAAE=
-----END PUBLIC KEY-----
PEM

requires_signature() {
  case "$1" in
    v0.7.0|0.7.0) return 1 ;;
    *) return 0 ;;
  esac
}

if curl -fsSL -o "$signature" "$signature_url"; then
  if ! openssl dgst -sha256 -verify "$public_key" -signature "$signature" "$checksums" >/dev/null 2>&1; then
    die "checksum signature verification failed. Refusing to install."
  fi
  ok "checksum signature verified"
elif requires_signature "$version"; then
  die "checksum signature download failed — $signature_url was not reachable. Refusing to install an unverified binary."
else
  warn "legacy release has no checksum signature; falling back to checksum-only verification."
fi

log "Verifying checksum"
expected="$(awk -v asset="$asset" '$2 == asset { print $1; found = 1 } END { if (!found) exit 1 }' "$checksums")" || {
  die "checksum file did not contain an entry for $asset. Refusing to install."
}
actual="$(shasum -a 256 "$tmpfile" | awk '{ print $1 }')"
if [ "$actual" != "$expected" ]; then
  die "checksum mismatch for $asset. Expected $expected but got $actual. Refusing to install."
fi
ok "checksum verified"

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

ok "installed Homecrew to $dest"

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
