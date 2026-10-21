#!/usr/bin/env bash
# Pure release-target validation and version calculation; developer tooling
# outside the PRD CLI contract. Sourcing this file has no side effects.

validate_release_target() {
  case "$1" in
    patch|minor|major) return 0 ;;
  esac
  if [[ "$1" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
    return 0
  fi
  echo "error: unknown argument '$1' (expected patch|minor|major or a canonical stable version, --dry-run)" >&2
  return 1
}

next_release_version() {
  local current_version="$1" target="${2:-patch}"
  local major minor patch target_major target_minor target_patch
  validate_release_target "$target" || return 1
  IFS='.' read -r major minor patch <<<"$current_version"
  case "$target" in
    patch) patch=$((patch + 1)) ;;
    minor) minor=$((minor + 1)); patch=0 ;;
    major) major=$((major + 1)); minor=0; patch=0 ;;
    *)
      IFS='.' read -r target_major target_minor target_patch <<<"$target"
      if (( target_major > major ||
            (target_major == major && target_minor > minor) ||
            (target_major == major && target_minor == minor && target_patch > patch) )); then
        printf '%s\n' "$target"
        return 0
      fi
      echo "error: target version $target must be greater than current version $current_version" >&2
      return 1
      ;;
  esac
  printf '%s.%s.%s\n' "$major" "$minor" "$patch"
}
