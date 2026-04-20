<p>
  <img src="assets/logo.png" alt="" width="96" height="96" align="left" />
</p>

# crew

A package manager for [Agent Skills](https://agentskills.io/specification).

```
crew install python-testing
```

Installs a skill into every agent coder on the machine, keeps it up to date, and
discovers new skills from a shared registry or any git repo.

See [`PRD.md`](./PRD.md) for the full specification.

## Install

```
curl -fsSL https://crew.logic.inc/install.sh | sh
```

Downloads the latest release for your Mac and drops it at
`~/.local/bin/crew`. Safe to re-run — upgrades in place. Set
`CREW_INSTALL_PREFIX` to pick a different location.

## Requirements

- macOS (Apple Silicon or Intel)
- `git` on `PATH`

## Build from source

```
bun install
bun run build
```

The resulting single-file executable lands at `dist/crew`.

## Install globally

```
bun run install-bin
```

Builds and installs the executable to `~/.local/bin/crew` by default.
Override the destination by setting `CREW_INSTALL_PREFIX`:

```
CREW_INSTALL_PREFIX=/opt/homebrew/bin bun run install-bin
```

To remove it:

```
bun run uninstall-bin
```

## Upgrade

If you installed via the curl installer, later upgrades are one command:

```
crew self-update
```

This replaces the running binary in place. `--check` reports whether a
newer release exists without downloading anything.

## Test

```
bun test
```

The suite runs with coverage enabled and fails if either line or
function coverage drops below 100% — see `bunfig.toml`.
