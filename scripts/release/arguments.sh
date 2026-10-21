#!/usr/bin/env bash
# Pure release argument parsing; developer tooling outside the PRD CLI contract.
# Sourcing only defines the function; the caller supplies validate_release_target.

# Sets RELEASE_TARGET (default patch) and DRY_RUN; returns 1 with stderr on bad input.
parse_release_arguments() {
  local arg target_seen=false
  DRY_RUN=false
  RELEASE_TARGET="patch"
  for arg in "$@"; do
    case "$arg" in
      --dry-run) DRY_RUN=true ;;
      *)
        validate_release_target "$arg" || return 1
        if $target_seen; then
          echo "error: expected at most one release target" >&2
          return 1
        fi
        RELEASE_TARGET="$arg"
        target_seen=true
        ;;
    esac
  done
  return 0
}
