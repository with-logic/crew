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
- Adding, removing, or renaming an agent adapter (the set in §7.2).
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

## Working agreement: user-facing surfaces

If a change affects user-visible behavior — a new command, a new
flag, a change to install/update/tap semantics, a new way for a
tap to be structured, a renamed default, anything a user of the
CLI would notice — also check whether these user-facing surfaces
describe the thing you just changed, and keep them in sync:

- `site/` — the landing page at `crew.logic.inc`. Sections most
  likely to go stale: `Commands.tsx` (command reference),
  `HowItWorks.tsx` (what the flow looks like), `Taps.tsx` (how
  taps are structured), `Faq.tsx` (common questions), and the
  hero terminal demo in `Hero.tsx`.
- `README.md` — the GitHub front page. It mirrors the site's
  content journey; the "What is Crew?", "How does it work?", and
  FAQ sections are the usual suspects for drift.

You don't need to update every mention of a thing — only update
what's now *wrong* or *misleadingly incomplete*. If the site's
ASCII diagram shows a flat layout and you just added a nested
layout option, the diagram isn't wrong (flat still works) but the
surrounding prose might now overclaim that "only the top level is
indexed." Fix the prose; leave the diagram.

When reviewing a PR, flag changes that touch `src/` behavior but
don't update `site/` or `README.md` — ask whether those surfaces
still describe the thing accurately.

---

## Architecture

### Runtime and shape

- **Language**: TypeScript, strict mode (`tsconfig.json`).
- **Runtime**: [Bun](https://bun.sh) only. We ship bundled native
  macOS and Linux executables produced by `bun build --compile`.
- **Minimal host dependencies**: the `dist/crew` binary carries the Bun
  runtime. The host-level requirements are `git`, plus `launchctl` on
  macOS or `systemctl --user` on Linux for autoupdate (mandated by
  PRD §17.1).
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
├── commands/             # one file per subcommand; complex commands are directories
├── core/                 # types, errors, paths, version
├── config/               # config.yaml read/write + defaults
├── state/                # state.json + PID-file state lock
├── skill/                # SKILL.md frontmatter parse + validation
├── refs/                 # skill reference parser (§8)
├── sources/              # acquire path/git/tap, store staging, expand
├── install/              # install flow (resolve deps, perform installs)
├── agents/               # adapter interface + per-agent adapters (claude-code/codex/…)
├── git/                  # git exec seam + high-level repo ops
├── hash/                 # content hashing (§12.1)
├── maintenance/          # store garbage collection
├── autoupdate/           # platform scheduler backends (launchd/systemd) + shared types/log
├── util/                 # fs, copy, json, time helpers
├── yaml/                 # minimal YAML parser + writer
└── core/version.ts       # CREW_VERSION constant
```

### Organization conventions

These are load-bearing. Please keep them.

**1. Hard file-size cap: < 200 lines per file.** Counted by `wc -l`. A
file at 205 lines is a file to split, not an exception. This is a
navigability rule, not a stylistic preference — big files hide
structure, and every grep hit becomes a scroll. Split before the file
grows, not after.

If splitting makes a single logical unit awkward (e.g. a state
machine), that's a signal the unit is doing too much — extract a
helper, collapse a dead branch, or introduce a data table. The 200-line
cap has not once forced genuinely worse code in this codebase.

**2. Group related files into directories, not with filename prefixes.**
If you have `foo.ts` + `foo-checks.ts` + `foo-render.ts`, that's a
`foo/` directory with `index.ts`, `checks.ts`, `render.ts`. The
filename-prefix pattern (e.g. `help-content.ts`, `doctor-repair.ts`) is
**not** how we organize. It:

- Makes grep noisier (`grep foo-` misses the entry `foo.ts`).
- Pretends directories don't exist.
- Implicitly encodes a group in filenames, which rots when names
  change.

When a concept needs multiple files, it gets a directory. The entry
point is `index.ts`. Callers import `foo/index.ts` explicitly — we
don't rely on implicit `index.ts` resolution because our tsconfig
requires explicit `.ts` extensions.

Conversely, a file whose name is a single multi-word concept
(`tap-reexpand.ts`, `dep-resolution.ts`, `agent-set.ts`) is fine —
it's one name, not a group prefix.

**3. Data and logic split into different files.** When a file is large
because of a static table of help text, error messages, or other
hardcoded content, extract the data into its own file(s) — not because
pure data is special, but because it evolves independently and
shouldn't share a file with logic. For large data registries (every
help page, every error-code remedy), split one entry per file and
aggregate in an `index.ts`.

**4. Every file opens with a docstring** that says what the file does
and which PRD section(s) it implements. Non-obvious invariants get a
one-line comment referencing the spec (e.g. `// §7.3 step 5b`).

**5. Named exports only.** No default exports. Easier to grep, easier
to rename, less ambiguous at import sites.

**6. Re-exports are OK when they preserve a stable import path for
callers during a refactor**, but don't use them as a pattern for
architectural layering — that just hides the real dependency graph.
Prefer fixing the callers.

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
skill lands at `~/.crew/store/<name>@<short-sha>/`. Agent installs are
copies **from the store**, never from the source. This gives identical
bytes across agents and makes reinstalls cheap.

**4. Atomic install via rename.** `src/agents/install.ts`. Skills
are staged into a sibling directory whose name cannot collide with a
real skill (leading dot), then `renameSync` onto `dest` after removing
the old `dest`. A crash mid-install never leaves a half-copied install.

**5. Testable subprocess boundary.** `src/git/exec.ts`,
`src/autoupdate/launchd.ts`, and `src/autoupdate/systemd.ts` each expose a
`setXRunner` seam. Real runner is the default; tests install a stub via
`setGitRunner` / `setLaunchctlRunner` / `setSystemctlRunner` and call
`resetXRunner` in `afterEach`. Prefer this pattern over global mocking.

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

Mocks are confined to exactly three boundaries:

- `src/git/exec.ts` — for corner cases like "what if `git` returns
  exit code 42 with throwOnError=false"; real `git` is used for 95%
  of tests.
- `src/autoupdate/launchd.ts` — because macOS CI environments don't
  have a user session launchd to talk to.
- `src/autoupdate/systemd.ts` — because Linux CI environments don't
  have a systemd `--user` session to talk to.

**Adapter redirection.** Tests redirect `claudeCodeAdapter.userPath` /
`.detect` / `.projectPath` at the top of the file via direct property
reassignment, and restore in `afterEach`. See
`tests/e2e/install.test.ts` for the template. This is ugly but
explicit; don't hide it inside a fixture helper.

**Coverage is a hard requirement.** `bunfig.toml` sets
`coverageThreshold = 1.0`, which makes `bun test` exit non-zero if
**either** line coverage OR function coverage falls below 100%. This
is enforced locally and in CI — there is no "coverage is nice to
have" mode.

Rationale: at 100%, every uncovered line is always a line you wrote
in the current branch. You never have to triage whether a gap is
legacy or new. The incremental cost of keeping a change at 100% is
tiny; the incremental value of a known-clean baseline is large.

How to write to the rule:

- Write the test alongside the code. If the code has a branch, write
  a test that takes that branch.
- If you add a defensive `throw` or fallback that genuinely can't
  fire, delete it — don't test dead code. A `catch (err) { throw err
  }` with no translation adds no value and only costs coverage.
- Prefer narrowing over totalization. `if (source.type === "tap") {
  ... } if (source.type === "git") { ... } return lastCase;` has
  fewer uncovered branches than an exhaustive `switch` with a
  `default` case that can't fire.
- Chained `.filter(...).map(...)` creates two arrow callbacks; if
  one is only conditionally exercised, a `for` loop that bundles the
  work together avoids the issue.
- If you genuinely can't reach a branch, it's dead code. Remove it.

**Debugging a coverage drop.** The text reporter only tells you the
file. For exact line numbers, use the lcov output (already enabled
via `coverageReporter = ["text", "lcov"]`):

```sh
bun test
# coverage/lcov.info is written alongside the text table.
genhtml coverage/lcov.info -o coverage/html && open coverage/html/index.html
```

HTML view highlights uncovered lines in red — much faster than
eyeballing the text table.

### Coverage quirks in bun (known footguns)

These are things we hit while getting to 100% and don't want to
rediscover. If coverage is mysteriously off by a single line or
function, check these first.

**Only-loaded files are counted.** An unimported source file contributes
zero to the coverage denominators — the gate doesn't fire on
orphaned-but-exported code. Don't rely on the threshold to catch
dead files; a type-level or code-review pass is the right tool.

**`coverageThreshold` applies to BOTH line and function coverage.**
Bun doesn't support a per-metric threshold. The nested-table form
(`coverageThreshold = { line = 1.0 }`) is silently ignored — it
doesn't fail-fast, it just behaves as no threshold. If you need to
split thresholds, convert the key to a plain number and live with
both metrics at the same bar, or switch to external tooling.

**Setting `coverageThreshold = 1.0` can look like it's not enforcing.**
If you edit `bunfig.toml` and tests still pass when you expected a
fail, re-read the file — stale content from a previous edit is the
usual cause (the TOML is small and `>>`/`cat <<` race conditions
bite). Verify by temporarily setting the threshold below the actual
coverage (`0.5`) and confirming tests still pass at exit 0; then
back to `1.0`.

**`coverageSkipTestFiles = true` silently disables the threshold.**
We don't know why. Don't use it. Our test helpers are compact enough
to hit 100% on their own.

**Closing braces count as lines.** A pattern like:

```ts
if (entry) {
  // ...
  return { ... };
}
```

can leave the closing `}` of the `if` block marked uncovered when
every test takes the `return` branch. Restructure to avoid nesting
when it's easy (hoist the condition, use early return at the outer
scope). If the nesting is load-bearing, make sure at least one test
falls through the block without returning so the closing `}` is
"reached."

**Chained `.filter(cb1).map(cb2)` = two function objects.**
Each arrow callback counts separately. If one fires in every real
path but the other only fires conditionally, you can end up at 99.9%
function coverage with no clear way to hit the gap. Fold both into a
single `for` loop:

```ts
// Avoids the two-callback problem
const referenced = new Set<string>();
for (const e of stateEntries) {
  if (e.resolved_sha) referenced.add(key(e));
}
```

**Exhaustive `switch` with a `default` returns an uncovered line.**
TypeScript narrows `case` branches but a `default:` with no way to
reach it still counts. Prefer discriminated `if` chains for
discriminated unions; drop the `default` when the compiler proves
exhaustiveness:

```ts
// Every source.type value is handled; no default needed.
if (source.type === "tap") return { ... };
if (source.type === "git") return { ... };
return { type: "path", path: ... };  // `source.type === "path"` here
```

**`catch (err) { throw err }` without translation is dead.** If the
only caller of a function that throws already catches the same error
type, a rethrow-only catch adds no value and costs a line. Delete
it; any real unexpected error still bubbles to the CLI top-level,
which formats it as `usage_error`.

**Type-casting `err` vs `instanceof` narrowing.** When the caller
path guarantees a specific error type (e.g. `runGit` only throws
`GitProcessError`), `const ge = err as GitProcessError;` is one line
and 100% coverable. `if (err instanceof X) { ... } throw err;` is
two paths, one of which is dead. Prefer the cast when the invariant
holds, and document the invariant in a comment.

**Identifying the last uncovered arrow.** If the text reporter says
`92.86 | 100.00` on a file (function coverage but not line), one
arrow is defined and never invoked. lcov's `FNF`/`FNH` confirms the
count but doesn't tell you which one. Work top-down:

1. Open the HTML report.
2. Grep the file for `=>` and `function ` to enumerate callables.
3. For each, ask "when does this run?" — the one with the narrowest
   precondition is the likely culprit.
4. Either write a test that meets the precondition, or restructure
   to remove the callback (see the `for` loop pattern above).

**`bun test --coverage-reporter=lcov` with no prior clean state.**
If you delete `coverage/` and rerun, sometimes the `.info` file
doesn't regenerate cleanly. Prefer `rm -rf coverage/ && bun test` to
get a truly fresh report.

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

## Lint and type rigor

**Biome 2 is the source of truth for lint and format.** `biome.json`
enables every non-stylistic category at `error`: a11y, complexity,
correctness, performance, security, style, suspicious. The formatter
is enforced too — `bun run lint` checks both.

Philosophy: if a rule catches real bugs, we want it on; if it just
expresses a style preference that conflicts with our other invariants
(e.g. 100% coverage), it's off with a comment explaining why.

Rules we've deliberately disabled and the reason:

- **`useBlockStatements`** — always-braces around `if` bodies. Turned
  off because Biome's formatter expands one-line bodies onto their own
  line, which splits coverage instrumentation and drops line coverage.
  100% coverage is the higher-priority invariant.
- **`useLiteralKeys`** — prefers `obj.foo` over `obj["foo"]`. Turned
  off because TypeScript's `noPropertyAccessFromIndexSignature` wants
  the opposite for index-signature types, and that rule is load-bearing
  for our strictness.
- **`useTopLevelRegex`** — hoist regexes out of function bodies for
  perf. Turned off because crew runs and exits; regex-compile overhead
  is negligible and inline regexes read better next to the check.

Per-directory overrides:

- `tests/**` relaxes `noNonNullAssertion`, `noExplicitAny`,
  `noConsole`, `noEmptyBlockStatements`, `noExcessiveCognitiveComplexity`,
  `noDelete`, and `noUndeclaredDependencies`. Tests can be noisier than
  production code; they exercise edges that sometimes require awkward
  constructs.
- `scripts/**/*.sh` is excluded entirely (not TypeScript).

**TypeScript strict-plus.** `tsconfig.json` goes beyond `"strict": true`
with every flag that catches a class of real bugs:

- `exactOptionalPropertyTypes` — distinguishes `x?: T` from
  `x: T | undefined`. Forces you to spread-merge optional fields
  rather than passing `undefined`.
- `noUncheckedIndexedAccess` — `arr[i]` is `T | undefined`, not `T`.
  Forces `arr[i]!` or proper narrowing.
- `noPropertyAccessFromIndexSignature` — must use `obj["foo"]` for
  properties that only come from an index signature.
- `noImplicitReturns` — every branch of a function that declares a
  return type must return.
- `useUnknownInCatchVariables` — `catch (err)` is `unknown`, not
  `any`. Narrow before using.
- `noUnusedLocals` / `noUnusedParameters` — dead-code deterrent.

When adding code, type signatures first. If a new call-site's types
don't line up, fix the types, not the call.

### Biome quirks

These are the specific Biome 2.x gotchas we've hit; save the next
contributor from rediscovering them.

**`coverageThreshold` collides with `useBlockStatements`.** Biome's
block-wrap auto-fix splits `if (x) return 1;` into four lines; bun
then instruments the inner `return` as a separate line, and untested
branches drop coverage. We disable `useBlockStatements` to keep the
100% coverage invariant intact.

**`useLiteralKeys` vs `noPropertyAccessFromIndexSignature`.** These
two rules want opposite things — the former insists on `obj.foo`,
the latter (TypeScript) insists on `obj["foo"]` for index signatures.
We turn off `useLiteralKeys` and let TS win.

**Nursery rule names change between versions.** `noCommonJs` and
similar rules graduated out of `nursery` between Biome 1 and 2.4;
naming one that has moved is a config error (not a warning). We
keep `nursery` at `"recommended": false` with no opt-ins to avoid
churn on upgrade.

**Config errors fail silently sometimes.** An invalid rule name
produces an exit-code-1 config error AND prints the rule catalog.
A malformed `overrides.includes` pattern, by contrast, may be
accepted silently. When a rule seems not to fire, test with a
deliberately-violating file to confirm it's wired up.

**`biome check --write` vs `--write --unsafe`.** Safe fixes are
automatic (e.g. add missing semicolons). "Unsafe" fixes change
behavior or API (e.g. remove `continue` at end of loop,
useLiteralKeys auto-convert, delete unused catch bindings). Use
`--unsafe` deliberately; review the diff.

**Overriding a rule on tests-only.** Per-file overrides go in
`overrides[].includes`. Globs with `**/*.test.ts` work, but
`tests/**` is shorter and matches our layout.

### TypeScript quirks

**`exactOptionalPropertyTypes` + spreading.** An object with `foo:
string | undefined` can't be assigned to `{ foo?: string }` under
this flag. Pattern: spread the property only if defined:

```ts
// Assembles an { foo?: string } from a maybe-undefined value.
return {
  ...(foo === undefined ? {} : { foo }),
  ...rest,
};
```

**`noUncheckedIndexedAccess` with known-safe indices.** `arr[0]` is
`T | undefined` even when you've already checked `arr.length > 0`.
Use `arr[0]!` with a comment, or `if (arr[0])` to narrow explicitly.

**TS4111 fixes + test env.** Every `process.env.FOO` in the codebase
becomes `process.env["FOO"]` under `noPropertyAccessFromIndexSignature`.
When adding new env-var reads, reach for bracket syntax from the
start.

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
- **Paths**: always absolute in-code. `posix` separators in hashes and
  markers (PRD §12.1). `toPosix()` from `src/util/fs.ts` when needed.
- **Time**: always through `nowIso()` (`src/util/time.ts`). Honors
  `CREW_NOW` for deterministic tests.

---

## Common changes and where they go

| Want to… | Touch… |
|---|---|
| Add a new command | `src/commands/<name>.ts` (or `src/commands/<name>/` for multi-file commands); register in `src/cli/dispatch.ts`; add help entry at `src/commands/help/content/<name>.ts` and register in `src/commands/help/content/index.ts` |
| Add a new global flag | `src/cli/args.ts` (BOOLEAN_GLOBALS / VALUE_GLOBALS); thread through `CommandFlags` in `src/commands/types.ts` |
| Add a new agent adapter | new file in `src/agents/`; register in `src/agents/registry.ts` |
| Add a new error type | `src/core/errors.ts` (both `CrewErrorName` and `EXIT_CODES`); update PRD §13/§15 |
| Change skill validation | `src/skill/validate.ts`; update PRD §9 step 4 and §18 C-SPEC |
| Change the hash algorithm | `src/hash/content.ts`; **bump marker `schema_version`** and update PRD §12.1 |
| Change the marker schema | `src/core/types.ts` (Marker); `src/agents/install.ts`; bump `schema_version`; update PRD §7.5 |
| Change the state schema | `src/core/types.ts` (StateFile); `src/state/load.ts`; update PRD §11.1 |

Every entry above whose "Touch…" includes "update PRD" means the
change is observable externally — PRD first, per the working agreement
at the top of this doc.

---

## Running locally

```sh
bun install
bun run src/index.ts version           # run from source
bun run build                          # produce dist/crew
bun test                               # run the full test suite (with coverage)
bun run typecheck                      # tsc --noEmit
bun run lint                           # biome check (lint + format check)
bun run lint:fix                       # biome check --write (auto-fix)
bun run format                         # biome format --write
bun run check                          # typecheck + lint + test (the full gate)
bun run install-bin                    # build + copy to ~/.local/bin/crew
bun run uninstall-bin                  # remove the installed binary
```

`bun test` always runs with coverage (see `bunfig.toml`). The suite
exits non-zero if coverage drops below 100%.

`bun run check` is the full CI-style gate — run it before pushing. If
it's clean, CI is clean.

`CREW_HOME=/tmp/xyz dist/crew install …` to try the compiled binary
without disturbing your real `~/.crew`.

`CREW_INSTALL_PREFIX=/opt/homebrew/bin bun run install-bin` to install
into a non-default location. The script in `scripts/install.sh` creates
the prefix if missing and prints a PATH-setup hint if the prefix isn't
on `$PATH`.

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
