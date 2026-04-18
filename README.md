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

## Test

```
bun test --coverage
```
