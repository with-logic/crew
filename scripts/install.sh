#!/usr/bin/env bash
#
# Build the crew binary and install it to a directory on PATH.
#
# Installation prefix, in order of preference:
#   1. $CREW_INSTALL_PREFIX if set.
#   2. $HOME/.local/bin — the sudo-free XDG-ish convention.
#      Most tools that honor XDG use this; adding it to PATH is a one-time
#      shell-profile change and survives OS updates.
#
# If the target directory does not exist we create it. If it's not on
# $PATH we print a hint, but we don't modify the user's shell profile —
# that's a destination choice the user should make deliberately.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PREFIX="${CREW_INSTALL_PREFIX:-$HOME/.local/bin}"
DEST="$PREFIX/crew"

echo "==> Building dist/crew"
bun run build

mkdir -p "$PREFIX"

echo "==> Installing to $DEST"
# Copy then chmod, rather than mv, so the build artifact stays in dist/
# for local iteration.
cp -f dist/crew "$DEST"
chmod +x "$DEST"

echo "==> Installed crew $("$DEST" version | awk '{print $2}')"

case ":$PATH:" in
  *":$PREFIX:"*)
    # On PATH — nothing more to do.
    ;;
  *)
    cat <<EOF

Note: $PREFIX is not on your PATH.
Add this to your shell profile (e.g. ~/.zshrc):

    export PATH="$PREFIX:\$PATH"

EOF
    ;;
esac
