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

## Shared local review

Shared review skills and the PR-description helper come from `.crewrc` through
Crew. `bun install` does not run Crew. This repository has no `install` or
`postinstall` script that fetches skills. Prepare the skills with one Crew
command.

Use a published [Crew release](https://crew.logic.inc/) with project manifests
(0.13+; 0.14.0 verified), not a build from this checkout. Check `crew version`
and Git read access to `with-logic/skills`. Enable the agent if needed with
`crew agents enable codex` or `crew agents enable claude-code`, then run this
from the repository root:

```sh
crew install --latest --json
```

A failure exits nonzero; fix the reported cause and run it again. A zero exit
does not prove that your agent is ready. The preparation checks of each review
confirm it. To recover:

- After a timeout, run the command one more time.
- After a `no_agents` result, enable your agent with the command above, then run
  the install again.
- If Crew cannot reach `with-logic/skills`, check your Git access to that
  repository. Without access, the local review is skipped; see `CLAUDE.md`.
- If the failure stays, report the local review as not run.

Before **each required local review**, the coding agent refreshes again and
verifies the result. The "Required local review" section of `CLAUDE.md` holds
that procedure. Failed preparation stops review. The shared procedure runs the
full lens roster and proposes PR text through the separate helper.

Commit `.crewrc` and its Crew-generated `.crewrc.lock`. Plain `crew install`
retains the locked revision; `--latest` can advance it. As the agent, do not
discard a `.crewrc.lock` change. The author commits it in the pull request under
review or discards it after the review. `bun run release` requires a clean
working tree, so commit or restore a `.crewrc.lock` change before a release.
Downloaded project skills stay ignored; authored and personal skills remain
owned by their authors.

## Review Expectations

We optimize for behavior that is easy to explain, test, and maintain. Expect
review questions about user impact, docs coverage, PRD alignment, and test
coverage. If a change touches user-visible behavior, check whether the README
and site still describe it accurately.
