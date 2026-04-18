# Crew — Specification

**A package manager for Agent Skills.**

Version: 0.3
Status: Specification, ready for implementation
Platform: macOS (Apple Silicon and Intel)

This document specifies the behavior of a command-line tool named `crew` in enough detail that two independent implementations should produce interchangeable executables. Anything an end user can observe — commands, outputs, exit codes, file layouts, algorithms, error conditions — is defined here. Internal implementation choices (language, argument parser, hash library, HTTP client, how files are copied) are deliberately left to the implementer; see §17 "Implementation latitude" for the full list.

---

## 1. Overview

Crew manages Agent Skills — the standardized, markdown-based skill format specified at [agentskills.io](https://agentskills.io/specification) — across every agent coder on a macOS machine that supports them (Claude Code, Codex CLI, Gemini CLI, and others).

The value proposition is one command: `crew install python-testing` installs a skill into every agent tool on the machine, keeps it up to date, and lets users discover new skills from a shared registry or directly from any git repo.

Crew installs skills by copying files into each agent tool's expected directory. It never symlinks, never executes user-supplied scripts, and never modifies files it did not itself create.

## 2. Goals and non-goals

**Goals**

- One command installs an Agent Skill into every agent coder on the machine.
- Native support for the Agent Skills specification, with no proprietary manifest format.
- Discovery via a default registry and user-added git-based registries ("taps").
- Direct install from any reachable git repository, with no registry setup required.
- Install every skill found under a directory or git repo in one command.
- Keep skills current manually (`crew update`) or via a background job (`crew autoupdate`).
- Ship as a single macOS executable invokable as `crew` on `PATH`.

**Non-goals**

- Cross-platform support. macOS only. Other platforms are future work.
- Symlinks. Crew always copies files.
- Skill authoring tooling (creating and linting new skills) beyond minimal validation.
- Executing skills. Crew installs files; agents run them.
- A hosted registry service. The default registry is a plain git repo.
- Code execution at install time. Crew only copies files.

## 3. Terminology

**Skill.** A directory conforming to the Agent Skills specification, containing at minimum a `SKILL.md` file with YAML frontmatter.

**Source.** The location a skill is fetched from. Three kinds: local path, git source, tap source (see §8).

**Tap.** A git repository that functions as a registry of skills. Crew clones each configured tap locally and searches within it. A tap may contain many skills organized as subdirectories.

**Target.** An agent coder that crew installs skills into (Claude Code, Codex CLI, Gemini CLI, etc.). Each target has an adapter (§7) that knows where that tool stores skills.

**Scope.** Either `user` (global to the user) or `project` (local to the current working directory). Affects which directory the adapter writes into.

**Skill reference.** A string identifying where to find a skill. Accepted forms are specified in §8.

**Store.** Crew's internal content-addressed cache of skill contents at `~/.crew/store/`. Targets are populated by copying from the store.

**State.** The ledger at `~/.crew/state.json` recording every installed skill.

**Marker.** A file named `.crew.json` written inside each installed skill directory (at the target location), recording what crew installed there.

## 4. Skill format

Crew installs any directory meeting the Agent Skills specification. The specification's `SKILL.md` frontmatter is the manifest; crew does not define a separate manifest file.

**Crew-specific frontmatter fields** live under `metadata.crew` so that skills remain fully spec-compliant. All fields are optional.

```yaml
---
name: python-testing
description: Conventions for pytest-based tests. Use when writing or reviewing Python tests.
license: MIT
metadata:
  crew:
    homepage: https://github.com/jane/python-testing
    dependencies:
      - general-python-style
      - gh:acme/skills//python-docs@v1.2.0
---
```

**`metadata.crew.homepage`** (string, optional). A URL shown in `crew info`.

**`metadata.crew.dependencies`** (list of strings, optional). Other skills to install before this one. Each entry is a skill reference in any of the forms `crew install` accepts (§8). Bare names (`general-python-style`) resolve in the precedence order defined in §9.

**Versions are git commit SHAs.** Crew does not define a version field. Every installed skill is identified by the SHA of the commit it was resolved from. Tags and branches resolve to SHAs at install time. Users pin with `@<sha>`, `@<tag>`, or `@<branch>`.

**Multi-skill directories.** A directory containing more than one skill has no special designation. When `crew install` is pointed at a source, crew looks for a `SKILL.md` at the root. If present, one skill is installed. If not, crew walks one level deep and installs every valid child skill (§9 step 5).

**Meta-skills** (a skill whose purpose is pulling in a set of others) are ordinary skills with `dependencies` and an optional descriptive body. They require no special frontmatter.

## 5. Command surface

### 5.1 Commands

Every command below is mandatory. Exit codes are defined in §15.

```
crew install <ref> [<ref>...]     Install one or more skills.
crew uninstall <name> [<name>...] Remove installed skills from all targets.
crew update [<name>...]           Update all installed skills, or only those named.
crew list                         List installed skills.
crew search <query>               Search across configured taps.
crew info <ref-or-name>           Show details for an installed or searchable skill.

crew tap add <git-url> [<name>]   Add a registry (name defaults to repo name).
crew tap remove <name>            Remove a registry.
crew tap list                     List configured registries.

crew targets                      List detected agent coders and their status.
crew targets enable <name>        Force-enable an otherwise-undetected target.
crew targets disable <name>       Skip this target on all install/update operations.

crew autoupdate enable [--interval <dur>]   Install the launchd agent (default 4h).
crew autoupdate disable                      Remove the launchd agent.
crew autoupdate status                       Show whether active, last run, next run.

crew doctor [--verify] [--repair]  Check integrity; optionally fix recoverable state issues.
crew cache clean                   Remove ephemeral caches and unreferenced store entries.

crew help [<command>]              Show help.
crew version                       Print version and exit.
```

### 5.2 Global flags

Accepted on any command where they apply:

- `--scope {user,project}` — default `user`.
- `--target <name>` (repeatable) — restrict the operation to the named targets.
- `--dry-run` — describe what would happen without changing anything.
- `--json` — emit machine-readable output. Required on `list`, `search`, `info`, `targets`, `autoupdate status`. Optional on all other commands; when provided, humans-readable output is suppressed and a structured result is emitted.
- `--quiet` — suppress non-error output. Error output still goes to stderr.
- `--verbose` — emit progress details to stderr.
- `--yes` — answer "yes" to any confirmation prompt.
- `--force` — override safety checks as defined in §7 and §10. Never overrides spec validation failures or two-skills-same-name conflicts.

### 5.3 Install-time flags

- `--from-git <url>[@<ref>]` — explicit git source, equivalent to passing the URL as the ref but disambiguates when the argument might look like a tap name.

### 5.4 Duplicate installs

`crew install <name>` on a skill already installed at the same scope:

- If the source and resolved SHA match, print "already installed" and exit 0.
- If the source matches but the ref differs, treat as an update (§10).
- If the source differs, fail with a name-conflict error (§13) unless `--force` is given, in which case the previous install is removed first.

### 5.5 Help output

Help is part of the product, not a footnote. Two independent
implementations of this spec should feel like the same tool when a
user runs `crew` or `crew help <command>`. This section defines the
shape of help output; wording is left to each implementation.

**Goals.**

- A new user who types `crew` (no arguments) should, within five
  seconds of reading, understand what crew is and know three commands
  they can try.
- Someone who remembers crew roughly but forgot a flag should be able
  to run `crew help <command>` and see a realistic example of the
  invocation they want.
- Help is shown on stdout with exit code 0. It is not an error.

**Invocation surface.**

- `crew` with no arguments MUST print the overview and exit 0.
- `crew help` MUST print the overview and exit 0.
- `crew help <command>` MUST print per-command help and exit 0.
- `crew help <unknown>` MUST fall back to the overview and exit 0.
- `crew --json help` and `crew help <command> --json` MUST emit
  machine-readable structured help.

**Overview MUST contain:**

1. A one-sentence description of what crew is.
2. A "getting started" section with at least three example invocations
   representative of common first tasks (e.g. search, install, list).
3. A grouped command list. Every command from §5.1 MUST appear in
   exactly one group with a one-line description. Groups are
   implementation choice, but a reasonable grouping is:
   "Managing skills" (install, uninstall, update, list, info),
   "Discovery" (search, tap), "Agents & automation" (targets,
   autoupdate), "Housekeeping" (doctor, cache), "Meta" (help,
   version).
4. A pointer to per-command help (e.g. "Run `crew help <command>`").

**Per-command help MUST contain:**

1. A `USAGE` line showing the synopsis (command + positional
   placeholders).
2. A one-to-three sentence description of what the command does and
   when to reach for it.
3. A `FLAGS` section listing every flag meaningful for this command,
   with a one-line description each, if the command accepts any.
4. An `EXAMPLES` section with at least one realistic invocation and a
   one-line gloss, unless the command is so trivial that examples add
   no information (e.g. `crew version`).

Sections beyond these (related commands, environment variables,
platform notes) are optional.

**Worked example — overview (§18.4 normative).**

```
crew 0.3.0 — a package manager for Agent Skills.

One command installs a skill into every agent coder on your machine
(Claude Code, Codex CLI, Gemini CLI) and keeps it up to date.

GETTING STARTED
  crew search <query>           Find a skill.
  crew install <skill>          Install it everywhere.
  crew list                     See what's installed.

COMMANDS
  Managing skills
    install      Install skills into every detected agent.
    uninstall    Remove installed skills.
    update       Update skills to their latest revision.
    list         Show installed skills.
    info         Show details for a skill (installed or not).
  ...

Run `crew help <command>` for details and examples.
```

**Worked example — per-command help:**

```
crew install — Install one or more skills into every detected agent coder.

USAGE
  crew install <ref> [<ref>...]

DESCRIPTION
  A <ref> is a local path, a git URL, or a skill name from a
  configured tap.

FLAGS
  --scope {user,project}   Install globally (default) or under cwd.
  --target <name>          Restrict to named target(s). Repeatable.
  --dry-run                Show what would be installed.
  --force                  Overwrite a customized destination.

EXAMPLES
  $ crew install python-testing
      Install a skill from a configured tap.
  $ crew install ./my-skill
      Install a skill from a local directory.
  $ crew install gh:acme/skills@v1.2.0//python/testing
      Install from a tagged GitHub repo at a subpath.
```

The exact labels (`USAGE` vs `Usage:`), the column alignment, and the
prose are all implementation choice; the sections and their contents
are what conformance requires.

**JSON help output.**

With `--json`, help MUST emit a structured payload:

- Overview: `{ "version": "<crew-version>", "commands": [ { "name",
  "synopsis", "summary" } ] }`.
- Per-command: `{ "name", "synopsis", "summary" (array of strings),
  "flags" (array of `{flag, description}` or omitted), "examples"
  (array of `{command, description}` or omitted), "seeAlso" (array of
  strings or omitted) }`.

## 6. On-disk layout

```
~/.crew/
├── config.yaml          # user configuration (see §6.1)
├── state.json           # installed-skills ledger (see §11.1)
├── state.json.lock      # file lock for state mutations (see §14)
├── taps/                # cloned tap repositories
│   └── <tap-name>/
├── cache/               # ephemeral git clones of ad-hoc git sources
│   └── git/<host>/<owner>/<repo>@<ref>/
├── store/               # content-addressed canonical skill copies
│   └── <skill-name>@<short-sha>/
├── logs/
│   └── autoupdate.log
└── Crew.app/            # attribution bundle used by autoupdate (see §10.2)
    └── Contents/
        └── Info.plist
```

All paths inside `~/.crew/` are owned by crew. External tools should not write here. Crew may delete anything under `cache/` at any time; `store/` is garbage-collected by `crew update` and `crew cache clean`; `taps/`, `state.json`, `config.yaml`, and `logs/` are durable.

### 6.1 `config.yaml` schema

```yaml
# Default tap is always present unless explicitly removed.
taps:
  - name: core
    url: https://github.com/crew-sh/core.git
  - name: acme
    url: https://github.com/acme/crew-skills.git

# Targets the user has force-disabled. Any target not listed here is auto-detected.
disabled_targets: []

# Targets the user has force-enabled even if auto-detection fails.
forced_targets: []

# Autoupdate configuration. Managed by `crew autoupdate` subcommands but user-editable.
autoupdate:
  enabled: false
  interval_seconds: 14400
```

Missing fields take their defaults. An unparseable `config.yaml` causes crew to fail with exit code 4 on any command that reads it.

## 7. Target adapters

Each supported agent coder is handled by a **target adapter**. An adapter is identified by a short stable name (lowercase, hyphen-separated) and exposes the operations in §7.1. Implementations ship one adapter per target; adding a new target means adding one adapter and registering it.

### 7.1 Adapter operations

Every adapter must provide:

- `detect() → bool` — returns true if the target is installed on this machine.
- `user_path() → absolute path` — directory where skills live at user scope.
- `project_path(cwd) → absolute path` — directory where skills live at project scope.
- `install(source_dir, skill_name, scope) → void` — copies the staged skill into the target and writes the marker.
- `uninstall(skill_name, scope) → void` — removes the skill directory from the target (leaves peer directories alone).
- `list_installed(scope) → list of marker records` — reads every `.crew.json` marker under the target's path and returns them.

### 7.2 Targets in v1

Three adapters ship in v1:

- `claude-code`
- `codex`
- `gemini-cli`

**Detection.** An adapter is considered detected if either the tool's user-scope base directory exists (as defined by the tool's own documentation) or the tool's CLI binary is found on `PATH`. Exact base-directory paths must be taken from each tool's current documented conventions at implementation time; do not hard-code paths without checking.

**Install path shape.** Each target has a base directory for skills (user scope and project scope). A skill named `python-testing` is installed by writing its files under `<base>/python-testing/`. The directory name equals the skill's `name` (spec-guaranteed to match lowercase alphanumerics and hyphens).

### 7.3 Install algorithm

Given a staged skill directory in the store, a skill name, a target adapter, and a scope, the adapter installs as follows:

1. Let `base` = `user_path()` if scope is user, else `project_path(cwd)`.
2. Ensure `base` exists (create with `0755` if missing).
3. Let `dest` = `base/<skill-name>/`.
4. **Pre-flight safety checks on `dest`:**
   a. If `dest` does not exist, proceed.
   b. If `dest` exists and contains a `.crew.json` marker (§7.5) whose `name` matches the skill being installed: compute the on-disk content hash of `dest` excluding `.crew.json`, per §12.1. If it matches the marker's `content_hash`, proceed. If it differs, abort with error `customized` (§13) unless `--force` is given.
   c. If `dest` exists and contains a `.crew.json` marker whose `name` does not match the skill being installed: this should not happen in normal use; abort with error `inconsistent_marker` (§13) unless `--force` is given.
   d. If `dest` exists and contains no `.crew.json` marker: abort with error `untracked_directory` (§13) unless `--force` is given.
5. **Stage and copy:**
   a. Create a temporary staging directory as a sibling of `dest` with a name that cannot collide with a valid skill name (e.g. beginning with a `.` or containing a dot — the exact name is unspecified, but it MUST be atomically rename-able into `dest`).
   b. Copy every file from the source into the staging directory, preserving relative paths. Do not copy any `.crew.json` from the source (only crew writes markers).
   c. Compute the content hash of the staging directory per §12.1.
   d. Write a `.crew.json` marker into the staging directory per §7.5.
   e. If `dest` exists, remove it.
   f. Rename the staging directory to `dest`.
6. **Never modify files outside `dest`.** Adapters must not edit shared configuration files the target tool may use (such as global `AGENTS.md`, settings JSON, etc.). If a target tool's documented convention requires modifying a shared file, that is out of scope for v1.

### 7.4 Uninstall algorithm

1. Read the marker at `dest/.crew.json`. If absent, abort with error `not_installed_here` unless `--force`.
2. If present, verify the marker's `name` matches the skill being uninstalled. Mismatch → `inconsistent_marker` error unless `--force`.
3. Remove `dest` and its contents.

### 7.5 Marker format (`.crew.json`)

Written into every crew-installed skill directory. JSON, UTF-8, trailing newline. The marker is crew's authoritative record at the install site; `state.json` is a convenience index but can be rebuilt from markers (§13, `crew doctor --repair`).

```json
{
  "schema_version": 1,
  "name": "python-testing",
  "source": {
    "type": "tap",
    "tap": "core",
    "path": "python-testing"
  },
  "ref": "main",
  "resolved_sha": "a1b2c3d4e5f6789abcdef0123456789abcdef012",
  "content_hash": "sha256:9f8e7d6c5b4a39281706f5e4d3c2b1a0f9e8d7c6b5a4938271605f4e3d2c1b0a",
  "scope": "user",
  "installed_at": "2026-04-18T12:00:00Z",
  "installed_by": "crew/<implementation-version>"
}
```

**Field contract:**

- `schema_version` — integer, currently `1`. Bumped when the marker schema changes incompatibly.
- `name` — the skill's `name` from `SKILL.md` frontmatter.
- `source` — one of:
  - `{"type": "tap", "tap": "<tap-name>", "path": "<relative-path-in-tap>"}`
  - `{"type": "git", "url": "<clone-url>", "subpath": "<subpath-or-empty>"}`
  - `{"type": "path", "path": "<absolute-path-at-install-time>"}`
- `ref` — the ref the user asked for (`main`, `v1.2.0`, a SHA, or `null` if the default branch was used and no ref was specified).
- `resolved_sha` — the full 40-char commit SHA the install came from, or `null` for path sources that were never in git.
- `content_hash` — the hash per §12.1, prefixed `sha256:`.
- `scope` — `user` or `project`.
- `installed_at` — RFC 3339 UTC timestamp.
- `installed_by` — free-form string identifying the implementation. Informational only.

Agents ignore unknown files in skill directories per the spec, so `.crew.json` is invisible to them.

## 8. Install sources

The argument to `crew install` (and every entry in `metadata.crew.dependencies`) is a **skill reference**. Three kinds are accepted.

### 8.1 Local path

A filesystem path to a directory on the local machine. Detected when the argument starts with `./`, `../`, `/`, or `~`.

```
crew install ./my-skill
crew install ~/code/team-skills/python-testing
```

Tilde is expanded. Relative paths are resolved against `cwd`.

### 8.2 Git source

Any reachable git URL. A tap is **not** required.

Accepted forms:

```
https://<host>/<owner>/<repo>[.git]
git@<host>:<owner>/<repo>[.git]
gh:<owner>/<repo>             # shorthand for https://github.com/<owner>/<repo>.git
gl:<owner>/<repo>             # shorthand for https://gitlab.com/<owner>/<repo>.git
bb:<owner>/<repo>             # shorthand for https://bitbucket.org/<owner>/<repo>.git
```

A ref may be appended with `@`:

```
gh:owner/repo@v1.2.0          # tag
gh:owner/repo@main            # branch
gh:owner/repo@a1b2c3d          # commit SHA (short or full)
```

A subpath may be appended with `//`:

```
gh:owner/repo//skills/python
gh:owner/repo@v1.2.0//skills/python
```

A ref and a subpath may combine. Ref appears before the subpath.

The resolved location inside the repo is either the repo root or the subpath. Behavior at the resolved location matches §9 step 5 (single skill if `SKILL.md` present, walk one level otherwise).

Git sources are ad-hoc. They are never promoted to taps and do not appear in `crew search` results.

### 8.3 Tap source

A skill known to a configured tap. Reference by bare name or `tap/name`.

```
python-testing                # bare name; searched across all taps
core/python-testing           # qualified to the `core` tap
acme/python-testing@v1.0.0    # qualified and pinned to a tag
```

Bare names that match skills in more than one tap produce an ambiguity error. Qualified references skip the ambiguity check and go directly to the named tap.

### 8.4 Reference grammar

Informally:

```
ref         := path | git-source | tap-source
path        := "./..." | "../..." | "/..." | "~..."
git-source  := git-url [ "@" git-ref ] [ "//" subpath ]
git-url     := "https://..." | "git@...:..." | shorthand-host ":" owner "/" repo
shorthand-host := "gh" | "gl" | "bb"
tap-source  := [ tap-name "/" ] skill-name [ "@" tap-ref ]
tap-name    := [a-z][a-z0-9-]*
skill-name  := [a-z][a-z0-9-]*     (matches the Agent Skills spec's name rules)
git-ref     := any non-empty string not containing "/" or whitespace; must not start with "//"
tap-ref     := any non-empty string not containing "/" or whitespace
subpath     := any POSIX relative path not starting with "/"
```

### 8.5 Disambiguation precedence

When the argument could match multiple forms, crew applies these rules in order:

1. If the argument starts with `./`, `../`, `/`, or `~` → path.
2. If the argument matches `https://`, `http://`, `git@`, or `<shorthand>:` → git source.
3. If the argument contains `//` → git source (subpath syntax is git-only).
4. Otherwise → tap source.

`@` can appear in both git and tap sources and does not shift which form applies.

## 9. Resolution and install flow

Given one or more skill references on the command line, `crew install` proceeds as follows. Every step is mandatory.

1. **Parse each reference** per §8 into a structured source.
2. **Acquire the source contents.**
   - Path source: read from disk at the given path.
   - Git source: shallow-clone into `~/.crew/cache/git/<host>/<owner>/<repo>@<ref>/` if absent, else `git fetch` and reset to the ref. Resolve the ref to a full commit SHA. Check out the subpath (or the repo root).
   - Tap source: the tap's clone is at `~/.crew/taps/<tap-name>/`. If absent, clone it (§16). Read the skill directory at the tap-relative path.
3. **Resolve refs to SHAs.** For git sources and tap sources, the ref (tag, branch, or `HEAD`) is resolved to a full commit SHA. This SHA is what's recorded in state and markers, even if the user specified a tag or branch.
4. **Validate each candidate skill** against the Agent Skills specification:
   - `SKILL.md` exists at the expected location.
   - Frontmatter parses as YAML.
   - `name` matches `[a-z0-9-]+`, length 1–64, no leading/trailing hyphen, no consecutive hyphens, and matches the parent directory name.
   - `description` is present, non-empty, length ≤ 1024 characters.
   - If `compatibility` is present, length ≤ 500 characters.
   - Every other spec rule from the Agent Skills specification.
   Invalid skills abort with `invalid_skill` (§13) before any files are written.
5. **Expand directories.** If the resolved source location has a `SKILL.md` at its root, it is one skill. If not, crew walks **exactly one directory level deep** under the resolved location and adds every subdirectory containing a `SKILL.md` to the install set. Deeper nesting is ignored. A directory with no valid children and no root `SKILL.md` aborts with `no_skills_found`.
6. **Resolve dependencies.** For each skill in the install set, read `metadata.crew.dependencies` and add each to the install set. Continue recursively until no new dependencies appear. Cycles are allowed and terminate naturally (a skill already in the set is not re-added).
   - **Bare-name resolution precedence:** (1) a sibling directory at the same source and ref (for sources where "sibling" is meaningful — git sources with a parent directory and path sources in a parent directory); (2) the tap the parent skill was installed from, if any; (3) search across all configured taps. An unqualified name matching multiple taps aborts with `ambiguous_dependency` naming the candidates.
   - **Conflict detection:** if two skills in the install set have the same `name` but resolve to different SHAs, abort with `conflicting_dependencies` listing the conflict.
7. **Determine target set.** Start with every target whose `detect()` returns true or that appears in `forced_targets`. Remove any listed in `disabled_targets`. Apply `--target` restrictions if given. If this produces the empty set, abort with `no_targets`.
8. **Stage into the store.** For each skill in the install set, create `~/.crew/store/<name>@<short-sha>/` (where `<short-sha>` is the first 8 chars of `resolved_sha`) and copy the skill's files into it. If the store entry already exists and its content hash matches, reuse it.
9. **Install into each target.** For each skill × each target in the target set × the scope, run the install algorithm from §7.3. Record per-target results (success, skipped-customized, skipped-untracked, failed). A failure in one (skill, target) pair does not stop others.
10. **Update state.** For each successfully installed (skill, target) pair, add or replace the entry in `state.json` per §11.1. Do this under the state lock (§14).
11. **Print summary.** Human-readable: one line per skill reporting which targets it succeeded, was skipped, or failed in. `--json` mode emits the structured equivalent (§15).

Exit code: 0 if every skill succeeded in at least one target; 1 if any skill failed in every target; 2 if nothing was attempted (empty install set after expansion when the user explicitly asked for something). Other exit codes per §15.

## 10. Update and autoupdate

### 10.1 `crew update`

With no arguments, updates every installed skill. With arguments, updates only the named skills.

1. For each configured tap, run `git fetch` and fast-forward the local clone to the tracked ref. Taps that fail to update produce a warning but do not abort the run.
2. Build the list of skills to consider:
   - `crew update` with no args → every entry in `state.json`.
   - `crew update <name>...` → only those names; an unknown name is an error per argument.
3. For each skill:
   a. Skip if the skill is pinned to an exact SHA, unless `--force`.
   b. If pinned to a tag, re-resolve the tag: if the tag moved and `--force` is given, proceed; otherwise skip.
   c. Otherwise (tap source, branch, or default branch), re-resolve the ref to a SHA.
   d. If the new SHA equals the installed `resolved_sha`, the skill is up-to-date; record as such and continue.
   e. Otherwise, stage the new commit into the store and run the install algorithm (§7.3) for every (target, scope) pair this skill is recorded against. Pre-flight safety checks apply as always: a customized install is skipped (not overwritten) unless `--force`.
4. Garbage-collect the store: any `store/<name>@<short-sha>/` entry no longer referenced by any `state.json` entry or marker is deleted.
5. Print summary (human or JSON).

**Error isolation.** Every skill is processed independently. A failure — network error, fetch error, spec validation error on a newly pulled version, customized install detected, dependency resolution failure, target install failure — is recorded against that skill and does not stop processing of the rest. Exit code is 0 if all skills were either up-to-date, updated successfully, or cleanly skipped as customized. Exit code is 1 if any skill encountered a hard failure (network, fetch, validation).

### 10.2 `crew autoupdate`

`crew autoupdate enable [--interval <duration>]` installs a launchd user agent that runs `crew update --quiet` on the given interval. Default interval is 4 hours. Accepted duration units: `s`, `m`, `h`, `d`.

**The launchd plist MUST be written to `~/Library/LaunchAgents/sh.crew.autoupdate.plist`** with the following minimum shape:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>sh.crew.autoupdate</string>
  <key>AssociatedBundleIdentifiers</key>
  <array>
    <string>sh.crew.autoupdater</string>
  </array>
  <key>ProgramArguments</key>
  <array>
    <string><!-- absolute path to the crew executable --></string>
    <string>update</string>
    <string>--quiet</string>
  </array>
  <key>StartInterval</key><integer><!-- interval in seconds --></integer>
  <key>StandardOutPath</key><string><!-- absolute path to ~/.crew/logs/autoupdate.log --></string>
  <key>StandardErrorPath</key><string><!-- same --></string>
  <key>RunAtLoad</key><false/>
</dict>
</plist>
```

**Attribution bundle.** On macOS Ventura and later, Login Items labels a
launchd agent by the code-signing team of the executable unless the
plist carries `AssociatedBundleIdentifiers` pointing at a resolvable
bundle. To avoid Login Items showing the crew binary's signer, crew
writes a minimal attribution bundle at `~/.crew/Crew.app/` containing
`Contents/Info.plist` with `CFBundleIdentifier = sh.crew.autoupdater`
and `CFBundleDisplayName = "Crew Skill Autoupdate"`. The bundle has no
executable; it exists solely as metadata for Login Items. The plist's
`AssociatedBundleIdentifiers` references `sh.crew.autoupdater` so macOS
attributes the agent to this bundle.

After writing the bundle and the plist, crew loads the agent via
`launchctl bootstrap gui/<uid> <plist-path>` (or `launchctl load` on
older macOS versions where `bootstrap` is unavailable). `config.yaml`'s
`autoupdate.enabled` is set to `true` and `autoupdate.interval_seconds`
to the chosen interval.

`crew autoupdate disable` unloads the agent (`launchctl bootout gui/<uid>/sh.crew.autoupdate` or `launchctl unload`), removes the plist, and sets `autoupdate.enabled` to `false`.

`crew autoupdate status` reports: whether the agent is loaded, the configured interval, the timestamp of the last run (from the log), and the exit status of the last run.

## 11. State

### 11.1 `state.json` schema

UTF-8 JSON with a trailing newline. Single top-level object.

```json
{
  "schema_version": 1,
  "installations": [
    {
      "name": "python-testing",
      "source": {
        "type": "tap",
        "tap": "core",
        "path": "python-testing"
      },
      "ref": "main",
      "resolved_sha": "a1b2c3d4e5f6789abcdef0123456789abcdef012",
      "content_hash": "sha256:9f8e7d...",
      "scope": "user",
      "installed_at": "2026-04-18T12:00:00Z",
      "targets": ["claude-code", "codex", "gemini-cli"],
      "pinned": false
    }
  ]
}
```

One entry per (skill, scope) pair. If the same skill is installed at both user and project scope, there are two entries. `targets` is the list of target adapter names this skill is currently installed into.

**Invariants:**

- Every entry in `state.json` should correspond to a `.crew.json` marker in every listed target. `crew doctor` detects and reports drift.
- `pinned` is true if the ref was an exact SHA or a tag. Otherwise false.

### 11.2 `crew doctor`

`crew doctor` performs these checks and reports each finding:

1. Every `state.json` entry has a matching `.crew.json` marker in every listed target.
2. Every `.crew.json` marker on disk corresponds to a `state.json` entry.
3. For each marker, the on-disk content hash matches the marker's `content_hash`. A mismatch means the user customized a crew-managed skill.
4. Every target listed in state still passes `detect()` (or is in `forced_targets`).
5. No `store/` entry is orphaned (not referenced by any state entry).
6. `config.yaml` parses.
7. If autoupdate is enabled in config, the launchd agent is actually loaded.

`--verify` includes check 3 (hash recomputation); without it, check 3 is skipped for speed.

`--repair` attempts to fix:

- Orphaned state entries (no corresponding marker and target missing): remove from state.
- Orphaned markers (marker present, no state entry): re-add to state.
- Orphan store entries: delete them.
- Autoupdate drift (config says enabled but agent not loaded, or vice versa): reconcile to the config's value.

`--repair` never overwrites user-customized skills or touches anything outside `~/.crew/` and the target skill directories it already manages.

## 12. Hashing

### 12.1 Content hash

Deterministic SHA-256 over file contents and relative paths. Used for detecting user customization.

Algorithm:

1. Walk the directory. Exclude `.crew.json` at the root of the walk. Do not follow symlinks out of the directory.
2. Collect every regular file as a tuple `(relative_path, sha256(file_bytes))`. Relative paths use POSIX separators (`/`) regardless of platform.
3. Sort the tuples by `relative_path` using byte-wise comparison.
4. Initialize a SHA-256 accumulator. For each tuple in sorted order, feed it: `relative_path` as UTF-8 bytes, then `0x00`, then the lowercase hex of the file SHA, then `0x0A`.
5. The final digest in lowercase hex, prefixed with `sha256:`, is the content hash.

**Explicitly excluded:** file mode bits, mtime/ctime/atime, ownership, xattrs, empty directories. A `chmod +x` on a script file changes no hash. A file rename changes the hash (the path is part of the input).

**Symlinks inside the directory:** hashed as `sha256(link_target_bytes)` with the link's path recorded. The target is not followed.

### 12.2 Skill SHA

The 40-char hex commit SHA the skill was resolved from. Short SHA is the first 8 chars.

## 13. Error conditions

Every error below has a stable machine-readable name (for `--json` output) and a human-readable message. Implementations may phrase the human messages however they like but must use these identifiers in `--json`.

| Name | Exit | When |
|---|---|---|
| `invalid_ref` | 4 | The skill reference failed to parse (§8.4). |
| `invalid_skill` | 4 | A skill directory failed spec validation. Message names the failing field. |
| `no_skills_found` | 4 | A directory source expanded to zero valid skills. |
| `source_unreachable` | 5 | Network or git failure acquiring a source. |
| `ref_not_found` | 5 | Ref doesn't exist in the repo. |
| `ambiguous_reference` | 4 | A bare name matches skills in more than one tap. |
| `ambiguous_dependency` | 4 | A dependency's bare name is ambiguous across taps. |
| `conflicting_dependencies` | 4 | Two skills with the same name resolve to different SHAs. |
| `name_conflict` | 4 | Trying to install a skill whose name is already held by a different source, without `--force`. |
| `untracked_directory` | 6 | Destination exists without a crew marker. |
| `customized` | 6 | Destination has a marker but content hash differs. |
| `inconsistent_marker` | 6 | Marker exists with an unexpected `name`. |
| `not_installed_here` | 6 | Uninstall target has no marker. |
| `no_targets` | 4 | No agent tools detected or all disabled. |
| `config_invalid` | 4 | `config.yaml` did not parse. |
| `state_locked` | 7 | Could not acquire `state.json.lock` within timeout. |
| `launchd_failure` | 8 | Autoupdate enable/disable couldn't load/unload the agent. |

The `--force` flag overrides `customized`, `untracked_directory`, `inconsistent_marker`, and `not_installed_here`. It does **not** override `invalid_skill`, `name_conflict`, `conflicting_dependencies`, or any other error.

## 14. Concurrency

Crew mutates state from multiple entry points (interactive commands, autoupdate). To prevent races:

1. Every command that writes `state.json` or installs into a target acquires an advisory lock on `~/.crew/state.json.lock` (using `flock(2)` or an equivalent macOS file-lock primitive) before making changes. Read-only commands do not take the lock.
2. Lock timeout: 30 seconds. If not acquired, exit with `state_locked` (§13).
3. The lock is held for the full duration of file-modifying operations and released on exit, including crashes (OS-level file locks release on fd close).
4. Git clone/fetch against a single repo is serialized under the state lock. This is not the most parallel design but is simple and adequate for a desktop tool.

## 15. Exit codes

| Code | Meaning |
|---|---|
| 0 | Success, or partial success where every requested skill succeeded in at least one target. |
| 1 | General failure; used when `crew update` has any skill hard-fail. |
| 2 | Nothing was attempted (e.g. install command with only already-installed skills, or empty directory expansion where user asked for a specific thing). |
| 4 | User error: invalid arguments, invalid skill, unresolvable references, no targets available, config invalid. |
| 5 | Network / source failure: could not reach git, ref does not exist. |
| 6 | Safety-check abort: untracked directory, customized skill, bad marker. |
| 7 | Could not acquire state lock. |
| 8 | macOS integration failure: launchd agent could not be loaded or unloaded. |

## 16. Taps

### 16.1 Tap repository structure

A tap is any git repository whose top-level directories are skills (each containing a `SKILL.md`). Nested organization is permitted but only top-level directories are indexed by `crew search`. Example:

```
acme-skills/
├── README.md            # optional, informational
├── python-testing/
│   └── SKILL.md
├── python-linting/
│   └── SKILL.md
└── docs/
    └── contributing.md  # not a skill, ignored
```

A directory is considered a skill if it contains a `SKILL.md` whose frontmatter passes spec validation. All others are ignored by `crew search` but can still be installed if the user names them directly by path.

### 16.2 Default tap

Crew ships with a default tap named `core` at a URL specified by the implementation's build. The default tap is always listed first in `crew tap list` and cannot be removed via `crew tap remove core` unless `--force` is used.

### 16.3 Tap management

- `crew tap add <url> [name]` clones the repo into `~/.crew/taps/<name>/`. If `name` is omitted, it is derived from the final path component of the URL (minus `.git`). A confirmation prompt shows the URL unless `--yes` is given.
- `crew tap remove <name>` deletes the local clone and removes the tap from config.
- `crew tap list` prints each tap's name, URL, and last-fetched timestamp.

### 16.4 Search

`crew search <query>` matches `query` (case-insensitive substring) against the `name` and `description` of every skill in every tap. Output is one skill per line: `<tap>/<name>  <description-truncated-to-terminal-width>`. `--json` emits a structured array.

## 17. Implementation latitude

The following are deliberately **not** specified. Implementations may choose freely:

- **Language and runtime.** Any language that can produce a single-file macOS executable.
- **Argument parser.** Any library or hand-rolled.
- **YAML parser.** Any that handles the subset the Agent Skills spec uses.
- **JSON serialization style.** Indented or compact, as long as output is valid JSON.
- **Git invocation.** Shell out to `git` or use a library; either is fine. The `git` CLI MUST be available on `PATH` at runtime (document this as a requirement).
- **HTTP client.** If any is needed (e.g. for shorthand-URL expansion).
- **File copy implementation.** Direct byte copy, `cp -R`, `fcopyfile`, clonefile — any correct mechanism. Atomicity within a single `crew` invocation is what matters.
- **Content-hash library.** Any SHA-256 implementation.
- **Internal data structures, module layout, test strategy, release tooling, installer (Homebrew tap, curl-pipe-sh, pkg), and binary distribution mechanism.**

### 17.1 Required external dependencies

- `git` on `PATH` at runtime.
- `launchctl` (present on all macOS).

### 17.2 Performance expectations

Not strict requirements, but reasonable targets:

- `crew install <single-skill>` from a cached tap: under 500ms on a warm cache.
- `crew list`: under 100ms with a typical state of ~50 skills.
- `crew update` with 50 skills against warm taps: under 30 seconds.

## 18. Conformance

This section defines what it means for an implementation of this specification to be conformant. Conformance is observable from the outside — every criterion below can be checked without reading an implementation's source code.

### 18.1 Conformance

An implementation is either conformant or it is not. Every criterion in §18.3 is mandatory. An implementation that fails any criterion is non-conformant and MUST NOT describe itself as an implementation of this specification.

### 18.2 Criteria structure

Each criterion has:

- **ID.** Stable identifier of the form `C-{AREA}-{NN}`. IDs never change once assigned; deprecated criteria are marked `(obsolete)` but keep their IDs.
- **Assertion.** One or two sentences describing the observable behavior that must hold.
- **Reference.** Section(s) of this spec that the criterion derives from.

Implementations and test suites refer to criteria by ID.

### 18.3 Criteria

#### C-REF: Reference parsing (§8)

| ID | Reference | Assertion |
|---|---|---|
| C-REF-01 | §8.5 | `./skill-dir` is parsed as a path source. |
| C-REF-02 | §8.5 | `/abs/path` is parsed as a path source. |
| C-REF-03 | §8.5 | `~/x` expands `~` to the user home directory and parses as a path source. |
| C-REF-04 | §8.2 | `https://host/owner/repo` is parsed as a git source with no ref and no subpath. |
| C-REF-05 | §8.2 | `https://host/owner/repo.git` is accepted and treated identically to the `.git`-less form. |
| C-REF-06 | §8.2 | `git@host:owner/repo.git` is parsed as a git source. |
| C-REF-07 | §8.2 | `gh:owner/repo` is parsed as a git source and expanded to `https://github.com/owner/repo.git`. |
| C-REF-08 | §8.2 | `gl:owner/repo` expands to `https://gitlab.com/owner/repo.git`. |
| C-REF-09 | §8.2 | `bb:owner/repo` expands to `https://bitbucket.org/owner/repo.git`. |
| C-REF-10 | §8.2 | `gh:owner/repo@v1.2.0` is parsed as a git source with ref `v1.2.0`. |
| C-REF-11 | §8.2 | `gh:owner/repo@a1b2c3d` is parsed as a git source with ref `a1b2c3d`. |
| C-REF-12 | §8.2 | `gh:owner/repo//skills/python` is parsed as a git source with subpath `skills/python`. |
| C-REF-13 | §8.2 | `gh:owner/repo@main//skills/python` is parsed with ref `main` and subpath `skills/python`. |
| C-REF-14 | §8.3 | `python-testing` with no `/` and no `@` is parsed as a tap source with bare name. |
| C-REF-15 | §8.3 | `core/python-testing` is parsed as a tap source qualified to tap `core`. |
| C-REF-16 | §8.3 | `core/python-testing@v1.0` is parsed as a qualified tap source with ref `v1.0`. |
| C-REF-17 | §8.4 | Invalid references (empty string, whitespace-only, unparseable grammar) produce exit code 4 with error name `invalid_ref`. |

#### C-SPEC: Skill spec validation (§9 step 4)

| ID | Reference | Assertion |
|---|---|---|
| C-SPEC-01 | §9 | A skill directory without `SKILL.md` fails validation with `invalid_skill`. |
| C-SPEC-02 | §9 | `SKILL.md` with unparseable YAML frontmatter fails validation with `invalid_skill`. |
| C-SPEC-03 | §9 | Missing `name` field in frontmatter fails validation. |
| C-SPEC-04 | §9 | Missing or empty `description` field fails validation. |
| C-SPEC-05 | §9 | `name` containing uppercase letters fails validation. |
| C-SPEC-06 | §9 | `name` starting or ending with `-` fails validation. |
| C-SPEC-07 | §9 | `name` containing `--` (consecutive hyphens) fails validation. |
| C-SPEC-08 | §9 | `name` longer than 64 characters fails validation. |
| C-SPEC-09 | §9 | `description` longer than 1024 characters fails validation. |
| C-SPEC-10 | §9 | `name` that does not match the parent directory name fails validation. |
| C-SPEC-11 | §9 | `compatibility`, if present and longer than 500 characters, fails validation. |
| C-SPEC-12 | §9 | Validation errors name the offending field in the human-readable message. |
| C-SPEC-13 | §9 | No file is written to any target when validation fails. |

#### C-INST: Install (§9)

| ID | Reference | Assertion |
|---|---|---|
| C-INST-01 | §9 | `crew install ./local-skill` installs from a local path into every detected target. |
| C-INST-02 | §9 | `crew install gh:owner/repo` installs from a GitHub URL with no prior `crew tap add`. |
| C-INST-03 | §9, §7.3 | After install, `SKILL.md` and every other file in the source appear under `{base}/<name>/`, preserving relative paths. |
| C-INST-04 | §7.5 | A `.crew.json` marker is written into the installed skill directory with the fields listed in §7.5. |
| C-INST-05 | §9 | `crew install gh:owner/repo//sub/path` installs only the skill at that subpath. |
| C-INST-06 | §9 | `crew install gh:owner/repo` pointed at a repo with a root `SKILL.md` installs one skill. |
| C-INST-07 | §9 step 5 | `crew install gh:owner/repo` pointed at a repo with no root `SKILL.md` but skill subdirectories installs every valid child one level deep. |
| C-INST-08 | §9 step 5 | Nested skills more than one level deep are NOT installed by directory expansion. |
| C-INST-09 | §9 | A directory source that expands to zero valid skills produces error `no_skills_found`, exit 4. |
| C-INST-10 | §9 | `resolved_sha` in state and in the marker is always a 40-character hex commit SHA for git and tap sources. |
| C-INST-11 | §9 | Installing an already-installed skill at the same SHA prints "already installed" and exits 0. |
| C-INST-12 | §5.4 | Installing an already-installed skill from the same source at a different ref performs an update. |
| C-INST-13 | §5.4 | Installing a skill with the same `name` from a different source produces `name_conflict`, exit 4, without `--force`. |
| C-INST-14 | §5.4 | `--force` on a `name_conflict` is NOT honored (the spec forbids `--force` overriding name conflicts). |
| C-INST-15 | §9 | `--dry-run` on install produces a summary of what would happen and writes no files. |
| C-INST-16 | §9 | `--target <skill>` restricts the operation to the named target(s). |
| C-INST-17 | §9 | `--scope project` writes to the target's project-scope path instead of the user-scope path. |

#### C-DEP: Dependencies (§9 step 6)

| ID | Reference | Assertion |
|---|---|---|
| C-DEP-01 | §9 step 6 | A skill with `dependencies` has each dependency installed before itself. |
| C-DEP-02 | §9 step 6 | A bare-name dependency resolves first to a sibling at the same source and ref when present. |
| C-DEP-03 | §9 step 6 | A bare-name dependency whose parent came from a tap falls back to that tap before searching other taps. |
| C-DEP-04 | §9 step 6 | A bare-name dependency unambiguously present in only one configured tap resolves to that tap. |
| C-DEP-05 | §9 step 6 | A bare-name dependency present in multiple taps, with no closer match, produces `ambiguous_dependency`. |
| C-DEP-06 | §9 step 6 | A fully qualified dependency (`tap/name`, `gh:...`, URL) bypasses bare-name precedence. |
| C-DEP-07 | §9 step 6 | Two skills in a transitive install set with the same `name` but different resolved SHAs produce `conflicting_dependencies`. |
| C-DEP-08 | §9 step 6 | A dependency cycle terminates normally (each skill appears in the install set at most once). |
| C-DEP-09 | §9 step 6 | A dependency that cannot be resolved causes the root install to fail; other root skills in the same command are not blocked. |

#### C-SAFE: Safety checks (§7.3, §13)

| ID | Reference | Assertion |
|---|---|---|
| C-SAFE-01 | §7.3 4d | A destination directory with no `.crew.json` marker produces `untracked_directory`, exit 6, and no files are modified. |
| C-SAFE-02 | §7.3 4b | A destination with a valid marker whose recomputed content hash differs produces `customized`, exit 6, and no files are modified. |
| C-SAFE-03 | §7.3 4b | A destination with a valid marker whose recomputed content hash matches is silently overwritten. |
| C-SAFE-04 | §7.3 4c | A destination with a marker whose `name` does not match the skill being installed produces `inconsistent_marker`, exit 6. |
| C-SAFE-05 | §13 | `--force` on `customized` succeeds and overwrites the customized directory. |
| C-SAFE-06 | §13 | `--force` on `untracked_directory` succeeds and overwrites. |
| C-SAFE-07 | §13 | `--force` does NOT override `invalid_skill`, `conflicting_dependencies`, or `name_conflict`. |

#### C-HASH: Content hashing (§12.1)

| ID | Reference | Assertion |
|---|---|---|
| C-HASH-01 | §12.1 | The hash of an empty directory is the SHA-256 of the empty byte string, prefixed `sha256:`. |
| C-HASH-02 | §12.1 | The hash is invariant across directory iteration order (same files, same relative paths → same hash). |
| C-HASH-03 | §12.1 | The hash ignores `.crew.json` at the directory root. |
| C-HASH-04 | §12.1 | `chmod +x` on a file inside the skill does NOT change the hash. |
| C-HASH-05 | §12.1 | Touching a file (changing mtime without changing contents) does NOT change the hash. |
| C-HASH-06 | §12.1 | Renaming a file within the skill DOES change the hash. |
| C-HASH-07 | §12.1 | A file containing bytes `0x00` hashes correctly (no null-termination bug). |
| C-HASH-08 | §12.1 | Relative paths in the hash use `/` as separator regardless of platform. |
| C-HASH-09 | §12.1 | Two implementations produce the same hash on the same directory, byte-for-byte. |

#### C-UPD: Update (§10.1)

| ID | Reference | Assertion |
|---|---|---|
| C-UPD-01 | §10.1 | `crew update` with no args re-resolves every unpinned skill's ref and reinstalls if the SHA moved. |
| C-UPD-02 | §10.1 | A skill whose `resolved_sha` equals the newly resolved SHA is reported as up-to-date and NOT re-copied. |
| C-UPD-03 | §10.1 | A skill pinned to an exact SHA is skipped by `crew update` without `--force`. |
| C-UPD-04 | §10.1 | A skill pinned to a tag: if the tag has not moved, reports up-to-date; if moved, skipped without `--force`. |
| C-UPD-05 | §10.1 | `crew update <skill>` restricts processing to the named skill(s). |
| C-UPD-06 | §10.1 | A network failure on one skill does NOT stop processing of others. |
| C-UPD-07 | §10.1 | A customized install on one skill does NOT stop processing of others. |
| C-UPD-08 | §10.1 | The summary at end of `crew update` lists successes, skips (with reason), and failures. |
| C-UPD-09 | §10.1 | `crew update` exits 0 when every skill was either up-to-date, updated, or cleanly skipped (customized / pinned). |
| C-UPD-10 | §10.1 | `crew update` exits 1 when any skill had a hard failure (network, fetch, validation). |

#### C-UNINST: Uninstall (§7.4)

| ID | Reference | Assertion |
|---|---|---|
| C-UNINST-01 | §7.4 | `crew uninstall <name>` removes the skill directory from every target the skill was installed in. |
| C-UNINST-02 | §7.4 | Uninstall updates `state.json` to no longer list the skill. |
| C-UNINST-03 | §7.4 | Uninstall does not touch sibling skill directories in the same target. |
| C-UNINST-04 | §7.4 | `crew uninstall` on a skill that is not installed produces `not_installed_here`, exit 6, without `--force`. |

#### C-TAP: Taps (§16)

| ID | Reference | Assertion |
|---|---|---|
| C-TAP-01 | §16.3 | `crew tap add <url>` clones the repo into `~/.crew/taps/<name>/`. |
| C-TAP-02 | §16.3 | `crew tap add <url> <name>` uses the given name instead of the derived one. |
| C-TAP-03 | §16.3 | `crew tap remove <name>` deletes the local clone and updates config. |
| C-TAP-04 | §16.3 | `crew tap list` reports every configured tap with name, URL, and last-fetched timestamp. |
| C-TAP-05 | §16.2 | The default tap named `core` is present on first run. |
| C-TAP-06 | §16.2 | `crew tap remove core` is refused without `--force`. |
| C-TAP-07 | §16.4 | `crew search <skill>` matches case-insensitively against `name` and `description` across every tap. |
| C-TAP-08 | §16.4 | `crew search --json` emits a structured array of matches. |
| C-TAP-09 | §16.3 | `crew tap add` without `--yes` prompts for confirmation showing the URL. |

#### C-STATE: State and markers (§11)

| ID | Reference | Assertion |
|---|---|---|
| C-STATE-01 | §11.1 | `state.json` is valid JSON after every successful command. |
| C-STATE-02 | §11.1 | Every installed skill has exactly one entry per (skill, scope) pair. |
| C-STATE-03 | §7.5 | Every crew-installed skill directory contains a `.crew.json` marker with matching `name` and `resolved_sha`. |
| C-STATE-04 | §11.1 | `pinned: true` in state iff the ref was a SHA or a tag at install time. |
| C-STATE-05 | §11.2 | `crew doctor` detects state-vs-marker drift and reports every inconsistency. |
| C-STATE-06 | §11.2 | `crew doctor --repair` reconstructs `state.json` from markers if `state.json` is deleted. |
| C-STATE-07 | §11.2 | `crew doctor --verify` recomputes content hashes and reports mismatches. |
| C-STATE-08 | §11.2 | `crew doctor --repair` never modifies files outside `~/.crew/` and the managed skill directories. |

#### C-AUTO: Autoupdate (§10.2)

| ID | Reference | Assertion |
|---|---|---|
| C-AUTO-01 | §10.2 | `crew autoupdate enable` writes a plist to `~/Library/LaunchAgents/sh.crew.autoupdate.plist`. |
| C-AUTO-02 | §10.2 | The plist's `Label` is `sh.crew.autoupdate`, `ProgramArguments` invokes `crew update --quiet`, and `StartInterval` matches the configured interval. |
| C-AUTO-03 | §10.2 | `crew autoupdate enable` loads the agent via `launchctl`. |
| C-AUTO-04 | §10.2 | `crew autoupdate disable` unloads the agent and removes the plist. |
| C-AUTO-05 | §10.2 | `crew autoupdate status` reports enabled/disabled state, configured interval, and last-run info. |
| C-AUTO-06 | §10.2 | A failure to load the agent produces `launchd_failure`, exit 8, with a clear message. |
| C-AUTO-07 | §10.2 | Default interval when none is specified is 14400 seconds (4 hours). |
| C-AUTO-08 | §10.2 | Interval strings `30s`, `5m`, `2h`, `1d` are accepted. |
| C-AUTO-09 | §10.2 | `crew autoupdate enable` writes an attribution bundle at `~/.crew/Crew.app/Contents/Info.plist` with `CFBundleIdentifier = sh.crew.autoupdater` and `CFBundleDisplayName = "Crew Skill Autoupdate"`. |
| C-AUTO-10 | §10.2 | The plist carries an `AssociatedBundleIdentifiers` array containing `sh.crew.autoupdater`. |

#### C-TARGET: Targets (§7)

| ID | Reference | Assertion |
|---|---|---|
| C-TARGET-01 | §7.2 | `claude-code`, `codex`, and `gemini-cli` adapters are present. |
| C-TARGET-02 | §7.2 | `crew targets` lists every adapter with its detection status. |
| C-TARGET-03 | §7.1 | `crew targets disable <name>` causes subsequent installs to skip that target. |
| C-TARGET-04 | §7.1 | `crew targets enable <name>` forces a target active even if `detect()` returns false. |
| C-TARGET-05 | §9 step 7 | When no target is active (none detected and none forced), install fails with `no_targets`, exit 4. |
| C-TARGET-06 | §7.3 | An adapter never modifies files outside `{base}/<name>/`. |

#### C-CONC: Concurrency (§14)

| ID | Reference | Assertion |
|---|---|---|
| C-CONC-01 | §14 | A second `crew` process attempting a state-mutating command while another holds the lock waits up to 30 seconds. |
| C-CONC-02 | §14 | If the lock is not acquired within the timeout, the second process exits with `state_locked`, exit 7. |
| C-CONC-03 | §14 | Read-only commands (`list`, `info`, `search`, `targets`, `tap list`, `help`, `version`) do NOT take the state lock. |
| C-CONC-04 | §14 | The lock is released when the holding process exits for any reason (including crash). |

#### C-CLI: CLI contract (§5)

| ID | Reference | Assertion |
|---|---|---|
| C-CLI-01 | §5.1 | Every command listed in §5.1 is present and reachable. |
| C-CLI-02 | §5.5 | `crew help` (and `crew` with no arguments) prints the overview on stdout and exits 0. |
| C-CLI-03 | §5.5 | `crew help <command>` prints per-command help on stdout and exits 0. |
| C-CLI-04 | §5.1 | `crew version` prints a version string and exits 0. |
| C-CLI-05 | §5.2 | `--json` on `list`, `search`, `info`, `targets`, `autoupdate status` produces valid JSON on stdout and no human-readable noise. |
| C-CLI-06 | §5.2 | `--quiet` suppresses non-error stdout. Error output still reaches stderr. |
| C-CLI-07 | §13 | `--json` outputs use the stable error `name` values listed in §13 for any non-zero result. |
| C-CLI-08 | §5.2 | Unknown flags produce a usage error, exit 4. |
| C-CLI-09 | §5.5 | Bare `crew` is equivalent to `crew help` — same output, exit 0 (no "usage error"). |
| C-CLI-10 | §5.5 | `crew help <unknown>` falls back to the overview and exits 0. |
| C-CLI-11 | §5.5 | The overview contains a one-sentence description of crew, a getting-started section with at least three example invocations, and a command list covering every command from §5.1. |
| C-CLI-12 | §5.5 | Per-command help for every command in §5.1 contains a USAGE synopsis and a description. Every command except `version` also contains at least one example. |
| C-CLI-13 | §5.5 | `crew help --json` emits `{version, commands: [{name, synopsis, summary}]}` covering every command in §5.1. |
| C-CLI-14 | §5.5 | `crew help <command> --json` emits `{name, synopsis, summary, ...}` with the per-command fields defined in §5.5. |

### 18.4 Worked examples

These examples are normative — an implementation MUST reproduce the observable behavior described. Fixtures can be synthesized from the descriptions.

#### Example 1: Install a single skill from a local path

**Setup.** A directory `./my-skill/` exists containing:

```
my-skill/
└── SKILL.md
```

Where `SKILL.md` has frontmatter `name: my-skill`, a valid description, and an empty body. The machine has Claude Code detected (its user-scope base directory exists).

**Command.**
```
crew install ./my-skill
```

**Expected observable outcome.**
- Exit code: 0.
- Stdout contains a line indicating `my-skill` was installed into `claude-code`.
- The file `{claude-code-base}/my-skill/SKILL.md` exists and is byte-for-byte identical to the source.
- The file `{claude-code-base}/my-skill/.crew.json` exists, is valid JSON, and has `name: "my-skill"`, `source.type: "path"`, `resolved_sha: null`, and a non-empty `content_hash` prefixed `sha256:`.
- `~/.crew/state.json` contains an entry with `name: "my-skill"` listing `claude-code` in `targets`.

#### Example 2: Install from GitHub pinned to a tag, with subpath

**Setup.** A public GitHub repo `github.com/acme/skills` has a tag `v1.0.0` pointing at a commit where a directory `python/testing/` contains a valid `SKILL.md` with `name: testing`.

**Command.**
```
crew install gh:acme/skills@v1.0.0//python/testing
```

**Expected observable outcome.**
- Exit 0.
- The skill `testing` is installed into every detected target.
- The marker's `source.type` is `"git"`, `source.url` is `"https://github.com/acme/skills.git"`, `source.subpath` is `"python/testing"`.
- The marker's `ref` is `"v1.0.0"`, `resolved_sha` is the 40-character SHA the tag points at.
- `state.json` entry has `pinned: true` (tag counts as pinned).

#### Example 3: Directory expansion

**Setup.** A repo `gh:acme/skills` has no `SKILL.md` at its root. Its top-level contains three subdirectories — `python-testing/`, `python-linting/`, `python-docs/` — each containing a valid `SKILL.md`. It also contains a `README.md` and a `docs/` directory with no `SKILL.md`.

**Command.**
```
crew install gh:acme/skills
```

**Expected observable outcome.**
- Exit 0.
- Exactly three skills installed: `python-testing`, `python-linting`, `python-docs`.
- `README.md` and `docs/` are ignored.
- `state.json` contains three entries, each with the same `source.url` but distinct `name`.

#### Example 4: Customized skill detected on update

**Setup.** `my-skill` is installed from `gh:me/my-skill` at SHA `aaa111`. After install, the user edits `{claude-code-base}/my-skill/SKILL.md` by hand (the content hash no longer matches the marker). Upstream publishes a new commit at SHA `bbb222`.

**Command.**
```
crew update
```

**Expected observable outcome.**
- Exit code: 0 (customized-skip is a clean outcome, not a hard failure).
- Stdout summary lists `my-skill` as skipped with reason "customized" (or equivalent).
- `{claude-code-base}/my-skill/SKILL.md` is unchanged (user's edits preserved).
- The marker's `resolved_sha` is still `aaa111`.
- `state.json` is unchanged for `my-skill`.

**Command.**
```
crew update --force my-skill
```

**Expected observable outcome after forced update.**
- Exit 0.
- The skill directory contents match the new SHA `bbb222`.
- The marker's `resolved_sha` is now `bbb222` and `content_hash` matches the new contents.

#### Example 5: Error isolation on update

**Setup.** Three skills installed: `a`, `b`, `c`. Skill `b`'s source is at an unreachable URL (simulate with a bad host).

**Command.**
```
crew update
```

**Expected observable outcome.**
- Stdout summary lists outcomes for all three skills: `a` updated or up-to-date, `b` failed with `source_unreachable`, `c` updated or up-to-date.
- Exit code: 1 (at least one hard failure).
- `a` and `c` reflect their latest SHAs. `b` is unchanged on disk and in state.

### 18.5 Test suite

A conformance test suite, packaged separately from this specification, is the authoritative executable form of these criteria. Until published, each criterion above is sufficient to drive ad-hoc tests by any implementation. The suite when it exists will live at a URL added to this section; it will provide fixtures, a runner, and machine-readable pass/fail output keyed by criterion ID.

### 18.6 Known ambiguities flagged during drafting

Writing out the criteria surfaced a few small holes in the spec. Resolving them:

1. **Exit code for `crew install` with a mix of successes and failures.** §9 says "exit 0 if every skill succeeded in at least one target; 1 if any skill failed in every target." This leaves ambiguous the case where some root-listed skills succeeded in ≥1 target and others failed in every target. Resolution: exit 1 if any root-listed skill has zero successful targets; exit 0 otherwise. Criteria C-INST-* should be read accordingly.
2. **Content hash of the empty directory.** Sensible per §12.1: with no tuples, the accumulator sees no input and the hash is `sha256:` followed by the SHA-256 of the empty byte string (`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`). Criterion C-HASH-01 fixes this.
3. **Order of dependencies in install.** §9 step 6 says dependencies are resolved, but not installed order. Resolution: dependencies are installed before dependents (topological order). Cycles are permitted by C-DEP-08 — when breaking a cycle, pick any valid order; the outcome is the same.

These resolutions are normative and should be folded into the main spec in the next revision.

## 19. FAQ

1. **Default tap URL and name.** The `core` tap name is fixed in this spec; the URL is implementation-set, though configured in `config.yaml` which is bundled with the app. Once the default tap repo exists, the URL should be added to this document and to the shipped `config.yaml` default.
3. **Project-scope lockfile.** A `crew.lock` at a project's root that `crew install` in that directory restores exactly (npm/bundler style) is an obvious follow-on but out of scope for v1.
4. **Per-target content overlays.** Some skills might want slightly different instructions per target. This spec keeps skills target-agnostic; overlays can be revisited if demand appears.
5. **Renaming on name conflict.** Currently a hard error. An opt-in `--rename-on-conflict` mode could be added later without breaking anything here.
