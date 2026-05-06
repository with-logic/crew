# Contributing

Thanks for helping improve Homecrew.

This file is the short public contributor guide. If you are changing code, also
read [CLAUDE.md](./CLAUDE.md); it is the implementation briefing for humans and
AI agents working in this repository.

## Before You Open a PR

- Search existing issues and pull requests first.
- Keep PRs small and focused. One behavior change per PR is easiest to review.
- For security issues, do not open a public issue. Email security@logic.inc.
- Do not include secrets, private tap contents, access tokens, or credentials in
  issues, tests, logs, screenshots, or fixtures.

## Spec-Visible Changes

`PRD.md` is the contract for observable CLI behavior. Update `PRD.md` first if
your change affects anything a user or second implementation could observe, such
as:

- A command, alias, flag, or output shape.
- Reference parsing or resolution behavior.
- Config, state, marker, or tap schema.
- Error names, exit codes, or conformance criteria.
- Supported agent adapters.

After the PRD update, make the matching code and test changes in the same PR.

## Development Setup

```sh
bun install
bun run src/index.ts version
bun run build
```

Run the full gate before asking for review:

```sh
bun run check
```

That runs typecheck, Biome, and the full test suite with 100% line and function
coverage. For a docs-only PR, `bun run lint` is usually enough.

## Local Testing

Use a temporary `CREW_HOME` when trying a local build:

```sh
CREW_HOME=/tmp/crew-test dist/crew install <ref>
```

Tests must not write to real agent skill directories such as `~/.claude/skills`
or `~/.agents/skills`.

## Review Expectations

We optimize for behavior that is easy to explain, test, and maintain. Expect
review questions about user impact, docs coverage, PRD alignment, and test
coverage. If a change touches user-visible behavior, check whether the README
and site still describe it accurately.
