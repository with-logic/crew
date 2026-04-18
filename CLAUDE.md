# crew — Contributor Guide

This file is the briefing for anyone (human or AI) working on `crew`.
Read it before making changes.

`crew` is a **package manager for Agent Skills** specified by `PRD.md`.
The PRD is the contract; this document is about how we implement it.

---

## Working agreement: specification changes

If you are asked to make a change that is **not specific to our
implementation** — that is, a change that any conformant implementation
of the spec would also need to make — **update `PRD.md` first**.

Examples of what triggers a PRD update:

- A new command, flag, or subcommand.
- A new error name or a change to an exit code.
- A change to the marker format, state schema, or config schema.
- A change to the reference grammar or resolution precedence.
- A change to a default (tap URL, autoupdate interval, lock timeout, …).
- A change to the hash algorithm or what it covers.
- Adding, removing, or renaming a target adapter (the set in §7.2).
- A change that shifts any of the §18 conformance criteria.

Examples of what does **not** need a PRD update:

- Internal refactors, file moves, renamed internal functions.
- Test additions or helper tweaks.
- Dependency bumps that don't change behavior.
- Bug fixes that make behavior match the existing spec.
- Performance improvements within existing guarantees.

When in doubt: if an external observer running the conformance suite
could notice the change, update the PRD. The PRD is what a second
implementation would read to build the same tool — keep it accurate.

After updating the PRD, update `src/` and `tests/` to match. Don't
leave a PRD change unimplemented across a commit.

---

## Architecture

### Runtime and shape

- **Language**: TypeScript, strict mode (`tsconfig.json`).
- **Runtime**: [Bun](https://bun.sh) only. We ship a single bundled
  macOS executable produced by `bun build --compile`.
- **Minimal host dependencies**: the `dist/crew` binary carries the Bun
  runtime. The only host-level requirements are `git` and `launchctl`
  (both mandated by PRD §17.1).
- **Libraries**: use well-established libraries for solved problems,
  hand-roll anything that's trivial or spec-prescribed. Current
  dependencies:
  - [`js-yaml`](https://github.com/nodeca/js-yaml) — YAML parse/write.
    Wrapped by `src/yaml/parse.ts` to keep exactly one import site.
  - [`proper-lockfile`](https://github.com/moxystudio/node-proper-lockfile)
    — cross-process advisory locking. Used by `src/state/lock.ts`.
  - [`yargs`](https://github.com/yargs/yargs) — argv parser. Used by
    `src/cli/args.ts`, configured as a pure parser (no auto-help, no
    auto-exit). The rest of the CLI machinery (dispatch, output
    formatting, error mapping) is still our own.

  Things we **don't** pull in as libraries and why:
  - **SHA-256 / content hash** — Node's `crypto.createHash` is in stdlib,
    and PRD §12.1 prescribes the exact algorithm; a third-party library
    would only re-wrap Node crypto.
  - **launchd plist** — it's ~15 lines of static XML template. A general
    plist library is overkill.
  - **git** — we shell out, per PRD §17.1. `isomorphic-git` would bundle
    git into the binary and duplicate what the user already has.

  When adding functionality, use the well-established library for the job
  unless the above reasons apply. "Well-established" means widely used,
  actively maintained, and not ad-hoc — if you'd be the first to try a
  library in production, write the code instead.

### Directory layout

```
src/
├── index.ts              # entry point — reads argv, calls runCli
├── cli/                  # argv parser, dispatcher, output formatter
├── commands/             # one file per subcommand
├── core/                 # types, errors, paths, version
├── config/               # config.yaml read/write + defaults
├── state/                # state.json + PID-file state lock
├── skill/                # SKILL.md frontmatter parse + validation
├── refs/                 # skill reference parser (§8)
├── sources/              # acquire path/git/tap, store staging, expand
├── install/              # install flow (resolve deps, perform installs)
├── targets/              # adapter interface + claude-code/codex/gemini
├── git/                  # git exec seam + high-level repo ops
├── hash/                 # content hashing (§12.1)
├── maintenance/          # store garbage collection
├── autoupdate/           # launchd plist + launchctl runner seam
├── util/                 # fs, copy, json, time helpers
├── yaml/                 # minimal YAML parser + writer
└── core/version.ts       # CREW_VERSION constant
```

Every file is **< 200 lines** and **has a top-of-file docstring** that
names the spec section(s) it implements. Keep this invariant when
adding new code.

### Key design decisions

**1. All state under `~/.crew/`, redirectable via `CREW_HOME`.**
`src/core/paths.ts` is the single source of truth for every path.
Tests pass `CREW_HOME=/tmp/...` via the `home` option to `runCli` — no
globals, no `process.chdir`.

**2. State lock via `proper-lockfile`.** `src/state/lock.ts`. Creates a
lock directory at `state.json.lock` (matching PRD §6). Stale-lock
reclamation is built into the library. Timeout 30 s, maps to exit
code 7 (`state_locked`). Read-only commands never take the lock.

**3. Content-addressed store.** `src/sources/store.ts`. Every resolved
skill lands at `~/.crew/store/<name>@<short-sha>/`. Target installs are
copies **from the store**, never from the source. This gives identical
bytes across targets and makes reinstalls cheap.

**4. Atomic install via rename.** `src/targets/install.ts`. Skills
are staged into a sibling directory whose name cannot collide with a
real skill (leading dot), then `renameSync` onto `dest` after removing
the old `dest`. A crash mid-install never leaves a half-copied target.

**5. Testable subprocess boundary.** `src/git/exec.ts` and
`src/autoupdate/launchd.ts` each expose a `setXRunner` seam. Real
runner is the default; tests install a stub via `setGitRunner` /
`setLaunchctlRunner` and call `resetXRunner` in `afterEach`. Prefer
this pattern over global mocking.

**6. Errors are `CrewError(code, message, details)`.** `src/core/errors.ts`.
Every error the user can see has a stable machine name (PRD §13) and a
fixed exit code (PRD §15). Any `CrewError` thrown anywhere bubbles to
the CLI top-level, which formats it as human text or JSON based on
`--json`. Never `throw new Error(...)` for a user-visible failure —
always a `CrewError`.

**7. Commands are pure functions** `(ctx: CommandContext) =>
CommandOutput`. No direct stdout/stderr writes. The CLI layer
(`src/cli/output.ts`) converts `CommandOutput` to the right stream in
the right format. This keeps every command trivially testable.

**8. Marker is authoritative at the install site.** Per PRD §11.1,
`state.json` is a convenience index; markers are the ground truth.
`crew doctor --repair` reconstructs state from markers. Do not invert
this hierarchy.

**9. Never follow symlinks out of a skill.** `src/util/fs.ts` walks
with `lstatSync`; `src/hash/content.ts` and `src/util/copy.ts` both
honor symlinks as-is. Violating this would hash or copy arbitrary
filesystem content.

**10. `.crew.json` at the root of a source is never copied.**
`src/util/copy.ts` has `stripRootMarker: true` by default. The marker
is crew-owned; a source-authored marker would poison the install.

---

## Testing philosophy

**Prefer real over mocked.** The tests use:

- real filesystems under `os.tmpdir()` (never the real `~/.crew`);
- real `git` subprocesses against local `file://` repos;
- the real YAML parser against real SKILL.md bytes.

Mocks are confined to exactly two boundaries:

- `src/git/exec.ts` — for corner cases like "what if `git` returns
  exit code 42 with throwOnError=false"; real `git` is used for 95%
  of tests.
- `src/autoupdate/launchd.ts` — because macOS CI environments don't
  have a user session launchd to talk to.

**Adapter redirection.** Tests redirect `claudeCodeAdapter.userPath` /
`.detect` / `.projectPath` at the top of the file via direct property
reassignment, and restore in `afterEach`. See
`tests/e2e/install.test.ts` for the template. This is ugly but
explicit; don't hide it inside a fixture helper.

**Coverage target.** 100% function coverage across every file in
`src/`. Line coverage ≥95% almost everywhere. Run `bun run
test:coverage` before committing.

**Test helpers live in `tests/helpers/`.**
- `fixtures.ts` — `makeTempDir`, `makeSkill`, `makeGitRepo`, `commitAll`,
  `tagRepo`, `skillFrontmatter`. Prefer these over hand-rolled fs
  manipulation.
- `env.ts` — `makeCrewHome`, `captureStreams`. `captureStreams` returns
  `{ streams, stdout(), stderr() }`; pass `streams` to `runCli` and
  assert against `.stdout()` / `.stderr()`.

**Test naming.** Each conformance test names its criterion ID in the
test title (e.g. `"C-INST-01 installs into every target"`). When you
add a criterion, add a matching `C-*` test.

---

## Style

- **Comments**: only where the *why* is non-obvious. Don't narrate
  what the code does — names and types do that. Every file has a
  top-of-file docstring explaining its role and the spec section(s)
  it implements. Non-obvious invariants get a one-line comment
  referencing the spec (e.g. `// §7.3 step 5b`).
- **Types**: strict mode is on, `noUnusedLocals`, `noUnusedParameters`,
  `noImplicitOverride`. Keep them on.
- **`readonly` aggressively** in public types (see `src/core/types.ts`).
  Mutable locals are fine; mutable public APIs are not.
- **No default exports.** Named exports only. Easier to grep, easier
  to rename.
- **Paths**: always absolute in-code. `posix` separators in hashes and
  markers (PRD §12.1). `toPosix()` from `src/util/fs.ts` when needed.
- **Time**: always through `nowIso()` (`src/util/time.ts`). Honors
  `CREW_NOW` for deterministic tests.

---

## Common changes and where they go

| Want to… | Touch… |
|---|---|
| Add a new command | `src/commands/<name>.ts`; register in `src/cli/dispatch.ts` and `src/commands/help.ts` |
| Add a new global flag | `src/cli/args.ts` (BOOLEAN_GLOBALS / VALUE_GLOBALS); thread through `CommandFlags` in `src/commands/types.ts` |
| Add a new target adapter | new file in `src/targets/`; register in `src/targets/registry.ts` |
| Add a new error type | `src/core/errors.ts` (both `CrewErrorName` and `EXIT_CODES`); update PRD §13/§15 |
| Change skill validation | `src/skill/validate.ts`; update PRD §9 step 4 and §18 C-SPEC |
| Change the hash algorithm | `src/hash/content.ts`; **bump marker `schema_version`** and update PRD §12.1 |
| Change the marker schema | `src/core/types.ts` (Marker); `src/targets/install.ts`; bump `schema_version`; update PRD §7.5 |
| Change the state schema | `src/core/types.ts` (StateFile); `src/state/load.ts`; update PRD §11.1 |

Every entry above whose "Touch…" includes "update PRD" means the
change is observable externally — PRD first, per the working agreement
at the top of this doc.

---

## Running locally

```sh
bun install
bun run src/index.ts version           # run from source
bun run build                           # produce dist/crew
bun test                                # run the full test suite
bun run test:coverage                   # with coverage report
bun run typecheck                       # tsc --noEmit
```

`CREW_HOME=/tmp/xyz dist/crew install …` to try the compiled binary
without disturbing your real `~/.crew`.

---

## Things to avoid

- **Don't mock the filesystem.** Use `os.tmpdir()` and real fs. Bun's
  test runner is fast enough that this isn't a bottleneck.
- **Don't mock `git`** at the `Bun.spawnSync` level. Use the
  `setGitRunner` seam or build a real local repo with
  `makeGitRepo` + `commitAll`.
- **Don't write to `~/.claude/skills/`, `~/.codex/skills/`, or
  `~/.gemini/skills/` from tests.** Redirect the adapter's `userPath`.
- **Don't introduce a new dependency without a strong reason.** We
  write YAML and parse CLI args ourselves to keep the binary small
  and the supply chain minimal. If you must add one, justify it in
  the commit message.
- **Don't skip hooks** or bypass `--force` semantics. PRD §13 is
  explicit about what `--force` does and does not override
  (e.g. NEVER `name_conflict` or `invalid_skill`).
- **Don't catch and swallow `CrewError`.** Let it bubble; the CLI
  top-level knows how to format it.
