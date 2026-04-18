# crew

A package manager for [Agent Skills](https://agentskills.io/specification).

```
crew install python-testing
```

Installs a skill into every agent coder on the machine, keeps it up to date, and
discovers new skills from a shared registry or any git repo.

See [`PRD.md`](./PRD.md) for the full specification.

## Requirements

- macOS (Apple Silicon or Intel)
- `git` on `PATH`

## Build

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

## Test

```
bun test --coverage
```
