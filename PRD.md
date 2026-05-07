# Homecrew — Specification

**A package manager for Agent Skills.**

Version: 0.7.0
Status: Specification, ready for implementation
Platform: macOS (Apple Silicon and Intel)

This document specifies the behavior of Homecrew, a command-line tool whose executable is named `crew`, in enough detail that two independent implementations should produce interchangeable executables. Anything an end user can observe — commands, outputs, exit codes, file layouts, algorithms, error conditions — is defined here. Internal implementation choices (language, argument parser, hash library, HTTP client, how files are copied) are deliberately left to the implementer; see §17 "Implementation latitude" for the full list.

---

## 1. Overview

Homecrew manages Agent Skills — the standardized, markdown-based skill format specified at [agentskills.io](https://agentskills.io/specification) — across every agent coder on a macOS machine that supports them (Claude Code, Codex CLI, Gemini CLI, and others).

The value proposition is one command: `crew install python-testing` installs a skill into every agent tool on the machine, keeps it up to date, and lets users discover new skills from a shared registry or directly from any git repo.

Homecrew installs skills by copying files into each agent tool's expected directory. It never symlinks, never executes user-supplied scripts, and never modifies files it did not itself create.

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
- Symlinks. Homecrew always copies files.
- Skill authoring tooling (creating and linting new skills) beyond minimal validation.
- Executing skills. Homecrew installs files; agents run them.
- A hosted registry service. The default registry is a plain git repo.
- Code execution at install time. Homecrew only copies files.

## 3. Terminology

**Skill.** A directory conforming to the Agent Skills specification, containing at minimum a `SKILL.md` file with YAML frontmatter.

**Source.** The location a skill is fetched from. Three kinds: local path, git source, tap source (see §8).

**Tap.** A git repository that functions as a registry of skills. Homecrew clones each configured tap locally and searches within it. A tap may contain many skills organized as subdirectories.

**Agent.** An agent coder that Homecrew installs skills into (Claude Code, Codex CLI, Gemini CLI, etc.). Each agent has an adapter (§7) that knows where that tool stores skills.

**Scope.** Either `user` (global to the user) or `project` (local to the current working directory). Affects which directory the adapter writes into.

**Skill reference.** A string identifying where to find a skill. Accepted forms are specified in §8.

**Store.** Homecrew's internal content-addressed cache of skill contents at `~/.crew/store/`. Agents are populated by copying from the store.

**State.** The ledger at `~/.crew/state.json` recording every installed skill.

**Marker.** A file named `.crew.json` written inside each installed skill directory (at the agent location), recording what Homecrew installed there.

## 4. Skill format

Homecrew installs any directory meeting the Agent Skills specification. The specification's `SKILL.md` frontmatter is the manifest; Homecrew does not define a separate manifest file.

**Homecrew-specific frontmatter fields** live under `metadata.crew` so that skills remain fully spec-compliant. All fields are optional.

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

**Versions are git commit SHAs.** Homecrew does not define a version field. Every installed skill is identified by the SHA of the commit it was resolved from. Tags and branches resolve to SHAs at install time. Users pin with `@<sha>`, `@<tag>`, or `@<branch>`.

**Multi-skill directories.** A directory containing more than one skill has no special designation. When `crew install` is pointed at a source, Homecrew looks for a `SKILL.md` at the root. If present, one skill is installed. If not, Homecrew walks one level deep and installs every valid child skill (§9 step 5).

**Meta-skills** (a skill whose purpose is pulling in a set of others) are ordinary skills with `dependencies` and an optional descriptive body. They require no special frontmatter.

## 5. Command surface

### 5.1 Commands

Every command below is mandatory. Exit codes are defined in §15.

```
crew install <ref> [<ref>...]     Install one or more skills.
crew uninstall <name> [<name>...] Remove installed skills from every agent.
crew update [<name>...]           Update all installed skills, or only those named.
crew list                         List installed skills.
crew skills                       Alias for `crew list`.
crew search <query>               Search across configured taps.
crew info <ref-or-name>           Show details for an installed or searchable skill.

crew tap add <git-url> [<name>]   Add a registry (name defaults to repo name).
crew tap <git-url> [<name>]       Shorthand for `crew tap add`.
crew tap remove <name>            Remove a registry.
crew tap list                     List configured registries.
crew taps                         Alias for `crew tap list`.

crew agents                      List detected agents and their status.
crew agents enable <name>        Force-enable an otherwise-undetected agent.
crew agents disable <name>       Skip this agent on all install/update operations.

crew autoupdate enable [--interval <dur>]   Install the launchd agent (default 4h).
crew autoupdate disable                      Remove the launchd agent.
crew autoupdate status                       Show whether active, last run, next run.

crew self-update [--check] [--version <v>]  Upgrade the `crew` binary itself to the latest release.

crew doctor [--verify] [--repair]  Check integrity; optionally fix recoverable state issues.
crew cache clean                   Remove ephemeral caches and unreferenced store entries.

crew help [<command>]              Show help.
crew version                       Print version and exit.
```

### 5.2 Global flags

Accepted on any command where they apply:

- `--scope {user,project}` — default `user`.
- `--agent <name>` (repeatable) — restrict the operation to the named agents.
- `--dry-run` — describe what would happen without changing anything.
- `--json` — emit machine-readable output. Required on `list`, `search`, `info`, `agents`, `autoupdate status`. Optional on all other commands; when provided, humans-readable output is suppressed and a structured result is emitted.
- `--quiet` — suppress non-error output. Error output still goes to stderr.
- `--verbose` — emit progress details to stderr.
- `--yes` — answer "yes" to any confirmation prompt.
- `--force` — override safety checks as defined in §7 and §10. Never overrides spec validation failures or two-skills-same-name conflicts.

### 5.3 Install-time flags

- `--from-git <url>[@<ref>]` — explicit git source, equivalent to passing the URL as the ref but disambiguates when the argument might look like a tap name.

### 5.3.1 Uninstall-time flags

- `--prune` — after removing the named skills, recursively uninstall any
  remaining skill that was only installed as a transitive dependency
  (§7.4 step 5) and is no longer required by anything. Equivalent to
  running `crew uninstall` followed by an autoremove pass.

### 5.4 Duplicate installs

`crew install <name>` on a skill already installed at the same scope:

- If the source and resolved SHA match, report the skill as already installed and exit 0. In human mode, implementations SHOULD surface the installed ref and/or short SHA so the user sees which version is on their machine (e.g. `foo: already installed (v1.2.0 @ a1b2c3d4)`). The literal wording is implementation choice; the JSON payload is specified in §15.
- If the source matches but the ref differs, treat as an update (§10).
- If the source differs, fail with a name-conflict error (§13) unless `--force` is given, in which case the previous install is removed first.

### 5.5 Help output

Help is part of the product, not a footnote. Two independent
implementations of this spec should feel like the same tool when a
user runs `crew` or `crew help <command>`. This section defines the
shape of help output; wording is left to each implementation.

**Goals.**

- A new user who types `crew` (no arguments) should, within five
  seconds of reading, understand what Homecrew is and know three commands
  they can try.
- Someone who remembers Homecrew roughly but forgot a flag should be able
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

1. A one-sentence description of what Homecrew is.
2. A "getting started" section with at least three example invocations
   representative of common first tasks (e.g. search, install, list).
3. A grouped command list. Every command from §5.1 MUST appear in
   exactly one group with a one-line description. Groups are
   implementation choice, but a reasonable grouping is:
   "Managing skills" (install, uninstall, update, list, info),
   "Discovery" (search, tap), "Agents & automation" (agents,
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
Homecrew 0.3.0 — a package manager for Agent Skills.

One command installs a skill into every agent coder on your machine
(Claude Code, Codex CLI, Gemini CLI) and keeps it up to date.

GETTING STARTED
  crew search <query>           Find a skill.
  crew install <skill>          Install it everywhere.
  crew list                     See what's installed.
  crew help <command>           See flags and examples for any command.

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
  --agent <name>          Restrict to named agent(s). Repeatable.
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

**Tone and usefulness.** Help should read like a peer showing another
peer how to use the tool — direct, specific, and example-first, not
reference-manual dry. Examples are the most valuable part of per-command
help: they show the shape of a real invocation, not just the grammar.
An implementation that lists every flag with a one-word description
and no examples technically satisfies the schema above but fails the
spirit of this section — `crew help` should actually help. Optional
sections like `NOTES` (gotchas, platform caveats, pointers to the spec)
or `SEE ALSO` are encouraged when they save the user a second lookup.

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
└── Homecrew.app/        # attribution bundle used by autoupdate (see §10.2)
    └── Contents/
        └── Info.plist
```

All paths inside `~/.crew/` are owned by Homecrew. External tools should not write here. Homecrew may delete anything under `cache/` at any time; `store/` is garbage-collected by `crew update` and `crew cache clean`; `taps/`, `state.json`, `config.yaml`, and `logs/` are durable.

### 6.1 `config.yaml` schema

```yaml
# Default tap is always present unless explicitly removed.
taps:
  - name: core
    kind: git
    registered: true
    url: https://github.com/with-logic/crew-skills.git
  - name: acme
    kind: git
    registered: true
    url: https://github.com/acme/crew-skills.git
  # `subpath` is optional on git-kind taps. When present, the tap
  # points at that directory inside the repo instead of the repo root
  # — useful for monorepos where skills live in e.g. `skills/`.
  - name: backend-skills
    kind: git
    registered: true
    url: https://github.com/with-logic/backend.git
    subpath: skills
  # Auto-taps are created implicitly when the user runs `crew install`
  # against a source crew hasn't seen before. They behave like
  # registered taps for update/search purposes, but are garbage-
  # collected when their last skill is uninstalled. Marked by
  # `registered: false`.
  - name: some-team-skills
    kind: git
    registered: false
    url: https://github.com/some-team/skills.git
  # Path-kind taps are local directories. No fetching; `tap update`
  # skips them. Usually auto; can be registered via `crew tap add`
  # pointing at a local path.
  - name: my-local-skills
    kind: path
    registered: false
    path: /Users/alice/code/my-skills

# Agents the user has force-disabled. Any agent not listed here is auto-detected.
disabled_agents: []

# Agents the user has force-enabled even if auto-detection fails.
forced_agents: []

# Autoupdate configuration. Managed by `crew autoupdate` subcommands but user-editable.
autoupdate:
  enabled: false
  interval_seconds: 14400
```

Missing fields take their defaults. An unparseable `config.yaml` causes Homecrew to fail with exit code 4 on any command that reads it.

## 7. Agent adapters

Each supported agent is handled by a **agent adapter**. An adapter is identified by a short stable name (lowercase, hyphen-separated) and exposes the operations in §7.1. Implementations ship one adapter per agent; adding a new agent means adding one adapter and registering it.

### 7.1 Adapter operations

Every adapter must provide:

- `detect() → bool` — returns true if the agent is installed on this machine.
- `user_path() → absolute path` — directory where skills live at user scope.
- `project_path(cwd) → absolute path` — directory where skills live at project scope.
- `install(source_dir, skill_name, scope) → void` — copies the staged skill into the agent and writes the marker.
- `uninstall(skill_name, scope) → void` — removes the skill directory from the agent (leaves peer directories alone).
- `list_installed(scope) → list of marker records` — reads every `.crew.json` marker under the agent's path and returns them.

### 7.2 Agents in v1

Every adapter listed at [agentskills.io/clients](https://agentskills.io/clients) that (a) is installable on macOS as a local app or CLI and (b) reads skills from a filesystem location ships as a crew adapter. The full set:

| Adapter | User-scope skills dir | Project-scope skills dir | Detection |
|---|---|---|---|
| `agent-skills` | `~/.agents/skills/` | `<project>/.agents/skills/` | `~/.agents/` exists |
| `amp` | `~/.config/amp/skills/` | `<project>/.agents/skills/` | `amp` on PATH or `~/.config/amp/` exists |
| `autohand` | `~/.autohand/skills/` | `<project>/.autohand/skills/` | `autohand` on PATH or `~/.autohand/` exists |
| `claude-code` | `~/.claude/skills/` | `<project>/.claude/skills/` | `claude` on PATH or `~/.claude/` exists |
| `codex` | `~/.agents/skills/` | `<project>/.agents/skills/` | `codex` on PATH or `~/.codex/` exists |
| `command-code` | `~/.agents/skills/` | `<project>/.agents/skills/` | `command-code` or `cmd` on PATH or `~/.commandcode/` exists |
| `cursor` | `~/.agents/skills/` | `<project>/.agents/skills/` | `cursor-agent` on PATH or `~/.cursor/` exists or `/Applications/Cursor.app` exists |
| `factory` | `~/.factory/skills/` | `<project>/.factory/skills/` | `droid` on PATH or `~/.factory/` exists |
| `gemini-cli` | `~/.agents/skills/` | `<project>/.agents/skills/` | `gemini` on PATH or `~/.gemini/` exists |
| `github-copilot` | `~/.agents/skills/` | `<project>/.agents/skills/` | `copilot` on PATH or `~/.copilot/` exists |
| `goose` | `~/.agents/skills/` | `<project>/.agents/skills/` | `goose` on PATH or `~/.config/goose/` exists |
| `junie` | `~/.junie/skills/` | `<project>/.junie/skills/` | `~/.junie/` exists (JetBrains IDE plugin, no PATH bin) |
| `kiro` | `~/.kiro/skills/` | `<project>/.kiro/skills/` | `kiro` on PATH or `~/.kiro/` exists |
| `mistral-vibe` | `~/.vibe/skills/` | `<project>/.vibe/skills/` | `vibe` on PATH or `~/.vibe/` exists |
| `nanobot` | `~/.nanobot/workspace/skills/` | — (project scope not supported) | `nanobot` on PATH or `~/.nanobot/` exists |
| `opencode` | `~/.agents/skills/` | `<project>/.agents/skills/` | `opencode` on PATH or `~/.config/opencode/` exists |
| `pi` | `~/.agents/skills/` | `<project>/.agents/skills/` | `pi` on PATH or `~/.pi/` exists |
| `roo-code` | `~/.roo/skills/` | `<project>/.roo/skills/` | `~/.roo/` exists (VS Code extension, no PATH bin) |

Clients that exist on [agentskills.io/clients](https://agentskills.io/clients) but are intentionally excluded from v1:

- **Cloud-only products** (no local filesystem to install into): Claude (claude.ai web), Mux, Qodo, OpenHands, Letta, Ona, Databricks Genie Code, Snowflake Cortex Code, Agentman, Google AI Edge Gallery, Spring AI, TRAE, Workshop (cloud).
- **Platform-specific**: Firebender (Android IDE).
- **Reused-path clients**: Piebald reads `~/.claude/skills/`, so the `claude-code` adapter already covers it. VT Code reads only `~/.agents/skills/`, so the `codex` adapter (same path) already covers it.
- **Re-fanout tools that would create a write-loop**: Laravel Boost installs INTO other agents' skill dirs; adding it as a Homecrew agent would mean Homecrew writes into the Boost output dir and Boost then fans it out again.
- **Docs-unverified at implementation time**: Emdash (docs JS-rendered, paths unconfirmed).

Adding a new adapter later requires updating this table, adding a file under `src/agents/`, registering it in `src/agents/registry.ts`, and adding tests.

**`agent-skills` adapter.** The `agent-skills` row covers any spec-compliant agent Homecrew doesn't ship a dedicated adapter for. It detects as soon as `~/.agents/` is present on the filesystem — any spec-compliant tool's install creates that directory, which is enough signal to know a tool that reads `~/.agents/skills/` is on the machine. When `agent-skills` is active alongside known adapters that share the same path (Codex, Cursor, Gemini CLI, etc.), path-sharing (below) deduplicates the write — only one physical copy exists, and the marker lists every active adapter that owns it.

**Detection.** Each adapter uses a best-effort signal: the tool's CLI binary on `PATH`, or the tool's user-scope configuration directory (`~/.<tool>/` or `~/.config/<tool>/`). Either signal makes the adapter "detected." A user may force-enable or force-disable any adapter through `forced_agents` / `disabled_agents` in `config.yaml`.

**Install path shape.** Each agent has a base directory for skills (user scope and project scope). A skill named `python-testing` is installed by writing its files under `<base>/python-testing/`. The directory name equals the skill's `name` (spec-guaranteed to match lowercase alphanumerics and hyphens).

**Path sharing.** Most adapters resolve to the same filesystem path: `~/.agents/skills/` (user) and `<project>/.agents/skills/` (project) is the emerging cross-tool convention, read by Codex, Cursor, Command Code, Gemini CLI, GitHub Copilot, Goose, OpenCode, pi, and `agent-skills`. Homecrew writes bytes there once and reports the install to the user under each detected adapter's name, even though only one physical copy exists. The rule: **when a tool reads `~/.agents/skills/`, Homecrew's adapter points there** — one install serves every such tool at once. Adapters whose tools don't support the cross-tool path (Amp user-scope, Autohand, Claude Code, Factory, Junie, Kiro, Mistral Vibe, Nanobot, Roo Code) keep their tool-specific paths.

The install algorithm (§7.3) dedupes writes by resolved path; the marker (§7.5) records which adapters own the install.

If a user runs `crew uninstall --agent <name>` against an adapter that shares its path with another active adapter, only the adapter name is removed from the marker and state — the bytes stay until the last adapter leaves.

A project-scope install for an adapter whose table entry is `—` (currently only `nanobot`) is a silent per-agent no-op.

### 7.3 Install algorithm

Install takes a staged skill directory in the store, a skill name, a scope, and the full set of active adapters for the operation. Because two or more adapters may resolve to the same filesystem path (§7.2, path sharing), the algorithm is path-centric: it runs once per **distinct** `dest`, and the marker it writes records every adapter that owns that path.

1. For each active adapter `a`, let `a.base` = `a.user_path()` if scope is user, else `a.project_path(cwd)`. Adapters whose project-scope path is unsupported are dropped at this step with a per-agent "not applicable" outcome.
2. Group adapters by `dest = a.base/<skill-name>/`. Each group is one physical install.
3. For each group `(dest, adapters)`:
   a. Ensure `dirname(dest)` exists (create with `0755` if missing).
   b. **Pre-flight safety checks on `dest`:**
      i. If `dest` does not exist, proceed.
      ii. If `dest` exists and contains a `.crew.json` marker (§7.5) whose `name` matches the skill being installed: compute the on-disk content hash of `dest` excluding `.crew.json`, per §12.1. If it matches the marker's `content_hash`, proceed. If it differs, abort with error `customized` (§13) unless `--force` is given.
      iii. If `dest` exists and contains a `.crew.json` marker whose `name` does not match the skill being installed: this should not happen in normal use; abort with error `inconsistent_marker` (§13) unless `--force` is given.
      iv. If `dest` exists and contains no `.crew.json` marker: abort with error `untracked_directory` (§13) unless `--force` is given.
   c. **Stage and copy:**
      i. Create a temporary staging directory as a sibling of `dest` with a name that cannot collide with a valid skill name (e.g. beginning with a `.` or containing a dot — the exact name is unspecified, but it MUST be atomically rename-able into `dest`).
      ii. Copy every file from the source into the staging directory, preserving relative paths. Do not copy any `.crew.json` from the source (only Homecrew writes markers).
      iii. Compute the content hash of the staging directory per §12.1.
      iv. Write a `.crew.json` marker into the staging directory per §7.5. The marker's `agents` field is the **union** of (a) any `agents` list present in a prior marker at `dest`, and (b) the agent names in this group. This preserves ownership by agents that installed into the same path on an earlier run and aren't part of the current operation.
      v. If `dest` exists, remove it.
      vi. Rename the staging directory to `dest`.
4. **Never modify files outside `dest`.** Adapters must not edit shared configuration files the agent tool may use (such as global `AGENTS.md`, settings JSON, etc.). If a agent tool's documented convention requires modifying a shared file, that is out of scope for v1.

**Per-agent reporting.** Even when N adapters share one `dest`, the user-facing summary lists all N adapter names as installed (or up-to-date, or failed). The install summary returned to callers is keyed by adapter name, not by `dest`.

### 7.4 Uninstall algorithm

**Agent set.** The default is to remove the skill from every agent
it's recorded against in state. `--agent <name>` (repeatable,
§5.2) restricts removal to the named agents only — other agents
keep the install. A `--agent` that names an agent the skill isn't in
at the current scope is a silent per-agent no-op; it never aborts the
run.

Like install, uninstall is path-centric: group the agent set by `dest` (§7.3 step 2), then run the loop once per distinct path.

For each `(dest, agents_in_group)`:

1. Read the marker at `dest/.crew.json`. If absent, abort with error `not_installed_here` unless `--force`.
2. If present, verify the marker's `name` matches the skill being uninstalled. Mismatch → `inconsistent_marker` error unless `--force`.
3. Remove `agents_in_group` from the marker's `agents` field. If the resulting set is empty, remove `dest` and its contents. Otherwise, rewrite the marker with the reduced `agents` list — the bytes stay because another agent still owns them.

**Then update `state.json` (§11.1):**

4. Remove the just-removed agent names from the entry's `agents`
   array. If the array is now empty, remove the entry entirely, AND
   for every other entry whose `required_by` listed this skill, remove
   the name from that list. If the array still has agents, the entry
   survives with a reduced agent list and its `required_by` is left
   alone (the skill isn't truly gone — it's still installed elsewhere).
5. **If `--prune` was passed AND the entry was fully removed in step 4**,
   walk the remaining state entries at the same scope. Any entry with
   `explicit: false` AND an empty `required_by` is an orphan;
   recursively uninstall it (steps 1–4), which may produce further
   orphans. Continue until a full pass finds none. Orphans that abort
   on a safety check (`customized`, `untracked_directory`) are skipped
   and reported, not forced; the user can rerun with `--force --prune`
   to override. A partial `--agent` removal that leaves the entry
   alive does NOT trigger pruning — the skill is still installed, so
   its dependencies are still required.

Without `--prune`, transitive dependencies are never auto-removed — a
skill pulled in only as a dependency stays on disk until the user
names it directly or asks for a prune. This matches `apt-get remove` /
`brew uninstall` defaults, not `apt-get autoremove`.

### 7.5 Marker format (`.crew.json`)

Written into every Homecrew-installed skill directory. JSON, UTF-8, trailing newline. The marker is Homecrew's authoritative record at the install site; `state.json` is a convenience index but can be rebuilt from markers (§13, `crew doctor --repair`).

```json
{
  "schema_version": 1,
  "name": "python-testing",
  "agents": ["codex", "gemini-cli"],
  "tap_name": "core",
  "tap_kind": "git",
  "tap_url": "https://github.com/with-logic/crew-skills.git",
  "tap_subpath": "",
  "path": "python-testing",
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
- `agents` — the list of agent names (§7.2) that own this install. Most installs are owned by a single agent, but when N agents resolve to the same `dest` (path-sharing, §7.2) all N are recorded here. Always non-empty; alphabetically sorted.
- `tap_name` — the configured tap that owns this skill at install time. May not exist in `config.yaml` later (user removed it manually); doctor uses the rest of the marker to rebuild a tap entry.
- `tap_kind` — `git` or `path`. Determines how `doctor --repair` reconstructs the tap.
- `tap_url` — for `tap_kind: git`, the clone URL. Empty string for `tap_kind: path`.
- `tap_subpath` — for `tap_kind: git`, an optional directory inside the repo (empty string when none). Empty string for `tap_kind: path`.
- `tap_path` — for `tap_kind: path`, the absolute filesystem path to the tap. Empty string for `tap_kind: git`.
- `path` — the skill's location relative to the tap's root (after subpath is applied for git taps). Empty string when the tap itself is one skill (root SKILL.md).
- `ref` — the ref the user asked for (`main`, `v1.2.0`, a SHA, or `null` if the default branch was used and no ref was specified).
- `resolved_sha` — the full 40-char commit SHA the install came from, or `null` for path-kind taps.
- `content_hash` — the hash per §12.1, prefixed `sha256:`.
- `scope` — `user` or `project`.
- `installed_at` — RFC 3339 UTC timestamp.
- `installed_by` — free-form string identifying the implementation. Informational only.

The marker is intentionally self-describing: `state.json` references taps by name only, but the marker carries the full source description so `doctor --repair` can rebuild a missing tap from scratch.

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
@<owner>/<repo>               # shorthand for https://github.com/<owner>/<repo>.git (GitHub)
```

The leading-`@` form is an ergonomic alias for `gh:` — GitHub is the
overwhelming common case, and the `@` prefix matches how users already
speak and type GitHub org names (`@with-logic/skills`). `gh:` remains
available and is preferred when a tool needs to be explicit. Leading
`@` always means GitHub; users on other forges use `gl:` / `bb:` or a
full URL.

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

A skill, namespace, or tap known to a configured tap. Reference forms:

```
python-testing                    # bare name; searched across taps and namespaces
core/python-testing               # 2-segment: tap/skill OR namespace/skill
acme/python-testing@v1.0.0        # qualified and pinned to a tag
core/marketing/copy-review        # 3-segment: tap/namespace/skill (always unambiguous)
```

A **namespace** is a directory directly under a tap's `skills/` root that contains no `SKILL.md` of its own but contains child directories that do. Namespaces group related skills (`skills/marketing/email-outreach`, `skills/marketing/social-posts`, …). A skill's `name` in its frontmatter remains the leaf directory name; the namespace is NOT part of the skill name.

A bare name `foo` may match any of:
- a **tap** named `foo` (install the entire tap),
- a **skill** named `foo` (install that skill),
- a **namespace** named `foo` in exactly one configured tap (install every skill in the namespace).

If more than one interpretation is possible, crew prompts the user interactively (TTY) or aborts with `ambiguous_reference` (non-TTY). The error names every possible resolution and gives a copy-pasteable command for each.

A 2-segment reference `foo/bar` is resolved with tap-first precedence: if `foo` is a configured tap, it means the skill `bar` inside tap `foo` (searching at the tap root and across namespaces). If `foo` is not a tap name but is a namespace in exactly one configured tap, it means the skill `bar` inside that namespace. If neither holds, `invalid_ref`. If both hold, `ambiguous_reference` with suggestions.

A 3-segment reference `tap/namespace/skill` is always unambiguous.

**Disambiguation flags.** The user may force an interpretation on `crew install`. These are presence flags; the name comes from the positional argument.
- `--tap` — force every bare-name positional to be resolved as a tap name (install the whole tap). Errors if the positional is not a configured tap.
- `--bundle` — force every bare-name positional to be resolved as a namespace name (install every skill in the namespace). Errors if the positional is not a namespace in exactly one configured tap.
- `--skill` — force every bare-name positional to be resolved as a single-skill name. Errors if the positional is only a namespace.

These flags are mutually exclusive and, when given, short-circuit the ambiguity prompt.

### 8.4 Reference grammar

Informally:

```
ref         := path | git-source | tap-source
path        := "./..." | "../..." | "/..." | "~..."
git-source  := git-url [ "@" git-ref ] [ "//" subpath ]
git-url     := "https://..." | "git@...:..." | shorthand-host ":" owner "/" repo
             | "@" owner "/" repo
shorthand-host := "gh" | "gl" | "bb"
tap-source  := [ tap-name "/" ] [ namespace-name "/" ] skill-name [ "@" tap-ref ]
             | tap-name [ "@" tap-ref ]                   (whole-tap install)
tap-name    := [a-z][a-z0-9-]*
namespace-name := [a-z][a-z0-9-]*
skill-name  := [a-z][a-z0-9-]*     (matches the Agent Skills spec's name rules)
git-ref     := any non-empty string not containing "/" or whitespace; must not start with "//"
tap-ref     := any non-empty string not containing "/" or whitespace
subpath     := any POSIX relative path not starting with "/"
```

### 8.5 Disambiguation precedence

When the argument could match multiple forms, crew applies these rules in order:

1. If the argument starts with `./`, `../`, `/`, or `~` → path.
2. If the argument matches `https://`, `http://`, `git@`, or `<shorthand>:` → git source.
3. If the argument starts with `@` followed by `<owner>/<repo>` → git source (GitHub shorthand).
4. If the argument contains `//` → git source (subpath syntax is git-only).
5. Otherwise → tap source.

Between `@` forms, rule 2's `git@host:...` takes precedence over rule 3
because rule 2 runs first. A bare `@` with nothing after it, or `@name`
with no `/`, is not a valid git source — rule 3 does not match, and
rule 5 sends it to tap-source parsing, which rejects it as `invalid_ref`
because tap names cannot start with `@`.

Infix `@` inside git and tap sources (`gh:owner/repo@v1.0`,
`core/python-testing@v1.0`) continues to denote a ref and does not
shift which form applies.

## 9. Resolution and install flow

Given one or more skill references on the command line, `crew install` proceeds as follows. Every step is mandatory.

1. **Parse each reference** per §8 into a structured source.
2. **Acquire the source contents** by attributing the install to a tap (§16):
   - Bare-name reference (`foo`) or qualified reference (`<tap>/foo`): use the named (or matching) registered/auto tap. Clone its repo if absent; never fetches per the network policy in §16.6.
   - Tap-name reference (`<tap-name>` with no slash) where `<tap-name>` matches a configured tap: install the entire tap (every skill it currently exposes).
   - Git URL or shorthand (`@org/repo`, `gh:org/repo`, etc.): if any configured tap already points at the same URL+subpath, use it; otherwise create an auto tap (§16.5) and use it. The new tap is cloned and refreshed.
   - Path reference (`./foo`, `/abs/foo`): if any configured tap already points at the same path, use it; otherwise create a path-kind auto tap and use it.
   In all cases, the resolved `state.installations[i].source` is `{ tap: <tap-name>, path: <skill-relative-path-inside-tap> }`. The URL/path of the tap itself lives in `config.yaml`.
3. **Resolve refs to SHAs.** For git sources and tap sources, the ref (tag, branch, or `HEAD`) is resolved to a full commit SHA. This SHA is what's recorded in state and markers, even if the user specified a tag or branch.
4. **Validate each candidate skill** against the Agent Skills specification:
   - `SKILL.md` exists at the expected location.
   - Frontmatter parses as YAML.
   - `name` matches `[a-z0-9-]+`, length 1–64, no leading/trailing hyphen, no consecutive hyphens, and matches the parent directory name.
   - `description` is present, non-empty, length ≤ 1024 characters.
   - If `compatibility` is present, length ≤ 500 characters.
   - Every other spec rule from the Agent Skills specification.

   A skill that fails validation is recorded as a failed skill with its message and path; the run continues. No validation failure aborts the whole command. See the exit-code rules in step 9.
5. **Expand directories.** Three cases, checked in order:
   1. If the resolved source location has a `SKILL.md` at its root, it is one skill.
   2. Else, if the resolved source location has a `skills/` subdirectory, crew walks under `skills/` and collects skills:
      - Every immediate child of `skills/` that contains a `SKILL.md` is a skill (as before).
      - Every immediate child of `skills/` that contains no `SKILL.md` but contains child directories that do is a **namespace**. Each namespace child containing a `SKILL.md` is a skill; that skill's `source.path` includes the namespace directory (e.g. `skills/marketing/email-outreach`).
      - Exactly one level of namespace nesting is recognized. Deeper nesting is ignored.
      - The source root itself is NOT walked in this case — `skills/` is the authoritative index.
   3. Else, crew walks **exactly one directory level deep** under the resolved location and adds every subdirectory containing a `SKILL.md` to the install set. Deeper nesting is ignored.

   A location that produces zero valid skills through the applicable case aborts with `no_skills_found`.
   - Multi-skill expansions are how the user gets every skill in a tap installed at once. Each child becomes an independent state entry attributed to the same tap (`source.tap`); upstream additions to that tap are picked up automatically by `crew update` (§10.1.1).
6. **Resolve dependencies.** For each skill in the install set, read `metadata.crew.dependencies` and add each to the install set. Continue recursively until no new dependencies appear. Cycles are allowed and terminate naturally (a skill already in the set is not re-added).
   - **Bare-name resolution precedence:** (1) a sibling directory at the same source and ref (for sources where "sibling" is meaningful — git sources with a parent directory and path sources in a parent directory); (2) the tap the parent skill was installed from, if any; (3) search across all configured taps. An unqualified name matching multiple taps aborts with `ambiguous_dependency` naming the candidates.
   - **Conflict detection:** if two skills in the install set have the same `name` but resolve to different SHAs, abort with `conflicting_dependencies` listing the conflict.
7. **Determine agent set.** Start with every agent whose `detect()` returns true or that appears in `forced_agents`. Remove any listed in `disabled_agents`. Apply `--agent` restrictions if given. If this produces the empty set, abort with `no_agents`.
8. **Stage into the store.** For each skill in the install set, create `~/.crew/store/<name>@<short-sha>/` (where `<short-sha>` is the first 8 chars of `resolved_sha`) and copy the skill's files into it. If the store entry already exists and its content hash matches, reuse it.
9. **Install into each agent.** For each skill × each agent in the agent set × the scope, run the install algorithm from §7.3. Record per-agent results (success, skipped-customized, skipped-untracked, failed). A failure in one (skill, agent) pair does not stop others.

   **Skill outcome.** After per-agent installs complete, each attempted skill has one of two outcomes:
   - **succeeded** — the skill validated AND at least one agent install succeeded (`anySuccess` in the per-skill record).
   - **failed** — the skill failed validation, OR every agent install failed, OR the skill was otherwise prevented from landing anywhere.

   **Exit code.** `crew install` computes its exit code from the set of attempted skills:
   - `0` — every attempted skill succeeded (or no work was needed because everything was already installed).
   - `1` — at least one skill succeeded AND at least one skill failed (partial success).
   - `4` — zero skills succeeded AND at least one skill failed validation. The error name is `invalid_skill` (§13).
   - `1` — zero skills succeeded AND no validation failures occurred (purely operational failures — agent errors, source unreachable, etc.).

   The human output always renders a per-skill line noting whether each attempted skill succeeded or failed, with the failure reason for each failed skill. `--json` emits a `results` array with the same per-skill outcomes.
10. **Update state.** For each successfully installed (skill, agent) pair, add or replace the entry in `state.json` per §11.1. Do this under the state lock (§14).
    - Skills named directly on the command line (the "roots") are
      recorded with `explicit: true`. Skills pulled in only via
      `metadata.crew.dependencies` are recorded with `explicit: false`.
      If a dependency is also a root on the same command, the root
      wins and the entry is `explicit: true`.
    - A skill whose existing state entry had `explicit: false` is
      promoted to `explicit: true` if the user names it directly on
      this install; the reverse demotion does not happen (once a user
      explicitly wants a skill, we keep remembering).
    - `required_by` for each skill is recomputed from the direct
      dependency graph built during steps 1–6: entry `X.required_by`
      contains every installed `Y` at the same scope whose
      `metadata.crew.dependencies` directly names `X`. Transitive
      relationships are not stored — they are derivable by walking the
      graph. `required_by` is symmetric to `dependencies` at one hop.
11. **Print summary.** Human-readable: one line per skill reporting which agents it succeeded, was skipped, or failed in. `--json` mode emits the structured equivalent (§15).

Exit code: 0 if every skill succeeded in at least one agent; 1 if any skill failed in every agent; 2 if nothing was attempted (empty install set after expansion when the user explicitly asked for something). Other exit codes per §15.

## 10. Update and autoupdate

### 10.1 `crew update`

With no arguments, updates every installed skill. With arguments, updates only the named skills.

1. Fetch upstream for the git-kind taps this run will actually touch. With no args, that is every configured git-kind tap. With `<name>...`, it is the subset of taps that host the named entries — plus any taps hosting entries pulled in by step 2's dependency closure. Path-kind taps are skipped silently. Per-tap failures produce a warning but do not abort the run.
2. Build the list of skills to consider:
   - `crew update` with no args → every entry in `state.json`.
   - `crew update <name>...` → the named entries, **plus their transitive dependency closure**. Concretely: for each name, take its state entry's direct deps (from its SKILL.md `metadata.crew.dependencies`, resolved against `required_by` in state), then their deps, and so on. A dep that isn't in state — one that was never installed — is not added; Homecrew does not install new skills during update. Entries pulled in this way appear in the results alongside the named ones, marked `transitively_required_by: [<name>...]` in JSON output so callers can tell them apart. An unknown top-level name (`<name>` not in state) is an error per argument.
2b. **Re-expand taps** per §10.1.1. For every git-kind tap with at
   least one state entry attributed to it (filtered by the same name-
   filter rule as step 2 — `crew update <name>` only touches taps that
   host a named entry or one of its transitive deps), walk the tap one
   level deep. Any newly-added child skill is added to the list of
   skills to consider as a fresh install; any child skill that has
   disappeared from the tap upstream is reported with `source_gone`
   (per the upstream-deletion rule above) and left in place.
3. For each skill:
   a. Skip if the skill is pinned to an exact SHA, unless `--force`.
   b. If pinned to a tag, re-resolve the tag: if the tag moved and `--force` is given, proceed; otherwise skip.
   c. Otherwise (tap source, branch, or default branch), re-resolve the ref to a SHA.
   d. If the new SHA equals the installed `resolved_sha`, the skill is up-to-date; record as such and continue.
   e. Otherwise, stage the new commit into the store and run the install algorithm (§7.3) for every (agent, scope) pair this skill is recorded against. Pre-flight safety checks apply as always: a customized install is skipped (not overwritten) unless `--force`.
4. Garbage-collect the store: any `store/<name>@<short-sha>/` entry no longer referenced by any `state.json` entry or marker is deleted.
5. Print summary (human or JSON).

**Error isolation.** Every skill is processed independently. A failure — network error, fetch error, spec validation error on a newly pulled version, customized install detected, dependency resolution failure, target install failure — is recorded against that skill and does not stop processing of the rest. Exit code is 0 if all skills were either up-to-date, updated successfully, or cleanly skipped as customized. Exit code is 1 if any skill encountered a hard failure (network, fetch, validation).

**Upstream deletion does not remove local installs.** If an installed
skill's source still resolves (the repo or tap is reachable) but the
specific skill is no longer present — the directory was deleted
upstream, or the tap dropped it — crew records a per-skill `source_gone`
outcome and leaves the local install, its marker, and its state entry
untouched. The skill keeps working at its last-resolved SHA. This is a
soft outcome: exit code stays 0 for an update run whose only
abnormalities are `source_gone`. Removal of an unwanted local skill is
always explicit (`crew uninstall <name>`).

This rule also applies when a whole source becomes unresolvable: a
tap's clone URL 404s, or a git repo is gone. Those produce
`source_unreachable` (hard failure, exit 1) per-skill as before —
`source_gone` is reserved for "source resolved, skill inside it did
not." The distinction matters because a transient network failure
should not be confused with a deliberate upstream deletion.

### 10.1.1 Tap re-expansion

Homecrew picks up new skills added to a tap automatically — but only for
**whole-tap** installs. If the user asked for the whole tap (`crew
install <tap-url>` or `crew install <tap-name>`), their state entries
are flagged `tracks_tap: true` and new siblings appear on the next
`crew update`. If the user installed an individual skill (`crew install
<tap>/<skill>` or a bare name that matched one skill), new siblings are
**not** pulled in — the user asked for one thing, not the whole tap.

On every `crew update` run, for each group of state entries sharing
(tap, scope, project_root) where **at least one member** has
`tracks_tap: true`, crew:

1. Walks one level deep under the tap's resolved root (§9 step 5) and
   builds the current child set.
2. For each child that is **not** already in state (a skill the
   maintainer added upstream since the user's last update): runs the
   install algorithm (§7.3) for every agent in the current agent
   set, at the scope of the originating install, with `explicit: true`,
   `tracks_tap: true`, and `source.tap` pointing at this tap. This is
   how `crew install @with-logic/skills` + autoupdate picks up new
   skills as the team adds them, with no follow-up `crew install`.
3. For each skill in state attributed to this tap whose directory is
   **no longer present** under the resolved root: reports `source_gone`
   and leaves the local install untouched (per the upstream-deletion
   rule in §10.1). Removal is always explicit.
4. For each skill in state attributed to this tap whose directory is
   still present: proceeds with the normal per-skill update logic
   (step 3 of §10.1) — stage, re-resolve, reinstall if SHA moved.

Groups whose members are all individual-skill installs (no
`tracks_tap`) skip re-expansion entirely. Their per-skill updates
still run in step 4 — the skill itself updates, just not its siblings.

The behavior is the same regardless of whether the tap was registered
manually (`crew tap add`) or created automatically by a multi-skill
install — they're stored identically in `config.yaml` and re-expanded
identically here.

**Autoupdate.** The background agent (§10.2) runs `crew update`, so
tap re-expansion is automatic. The expected flow: a user runs
`crew install @with-logic/skills` once (creating an auto-tap) and
enables autoupdate; as the team adds skills, they appear in the
user's agents on the next autoupdate tick without further action.

**`--dry-run` on update** reports tap additions and deletions
separately from per-skill updates so users can preview what
autoupdate would do.

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
  <key>EnvironmentVariables</key>
  <dict>
    <key>CREW_HOME</key><string><!-- effective crew home at enable time --></string>
    <key>CREW_AUTOUPDATE_LOG</key><string>1</string>
  </dict>
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

`CREW_HOME` MUST be set in the plist to the effective crew home used
when `crew autoupdate enable` was run. This keeps scheduled updates
pointing at the same state/config directory even when the user enabled
autoupdate with a non-default `CREW_HOME`. `CREW_AUTOUPDATE_LOG=1` is
an internal flag consumed by `crew update --quiet`: when present,
`crew update` MUST append one line to the autoupdate log before exiting:

```text
crew-autoupdate <ISO-8601 timestamp> exit=<integer exit code>
```

This line is in addition to any command output or errors redirected by
launchd. It is the authoritative source for `crew autoupdate status`'s
last-run timestamp and exit status.

**Attribution bundle.** On macOS Ventura and later, Login Items labels a
launchd agent by the code-signing team of the executable unless the
plist carries `AssociatedBundleIdentifiers` pointing at a resolvable
bundle. To avoid Login Items showing the `crew` binary's signer, Homecrew
writes a minimal attribution bundle at `~/.crew/Homecrew.app/` containing
`Contents/Info.plist` with `CFBundleIdentifier = sh.crew.autoupdater`
and `CFBundleDisplayName = "Homecrew Skill Autoupdate"`. The bundle has no
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

### 10.3 `crew self-update`

`crew self-update` upgrades the `crew` binary itself to the latest published release. It is distinct from `crew update`, which updates installed skills.

**Release channel.** Two endpoints:

- **Latest release** — `https://crew.logic.inc/latest-version.json`, a
  static file served from the project's website (edge-cached, fast).
  Updated by the release script on every publish. This is the endpoint
  the update-available notice (§10.4) hits every 24h.
- **Specific tag** — GitHub's `https://api.github.com/repos/with-logic/crew/releases/tags/<tag>`.
  Only used when the user passes `--version <tag>`.

Both endpoints emit the same JSON shape:

```json
{
  "tag_name": "v0.4.0",
  "assets": [
    { "name": "crew-macos-arm64", "browser_download_url": "https://github.com/with-logic/crew/releases/download/v0.4.0/crew-macos-arm64" },
    { "name": "crew-macos-x64",   "browser_download_url": "https://github.com/with-logic/crew/releases/download/v0.4.0/crew-macos-x64" },
    { "name": "SHA256SUMS",       "browser_download_url": "https://github.com/with-logic/crew/releases/download/v0.4.0/SHA256SUMS" }
  ]
}
```

The shape matches GitHub's native release response so implementations
don't need to branch on which endpoint returned the data. The static
file's asset URLs point at GitHub release downloads (GitHub hosts the
binaries, the site just advertises the pointer).

Every release MUST publish a `SHA256SUMS` asset containing SHA-256 hashes
for `crew-macos-arm64` and `crew-macos-x64`. The hosted installer
(`https://crew.logic.inc/install.sh`) and `crew self-update` MUST download
this file from the same release as the selected binary and verify the chosen
asset before installing it. A checksum mismatch or missing checksum is a
failed install/update.

Implementations MAY accept `CREW_SELF_UPDATE_RELEASES_URL` to override
the latest-release URL (used by tests and private forks).

**Flow.** `crew self-update` runs the following algorithm:

1. Resolve the target release:
   - If `--version <tag>` was given, fetch that tag from GitHub.
   - Otherwise fetch the latest-release URL.
2. If the resolved tag matches the running `CREW_VERSION` and `--force`
   is not set, print "already on the latest version" and exit 0.
3. Resolve the asset matching the current CPU architecture
   (`arm64` → `crew-macos-arm64`, `x86_64` → `crew-macos-x64`).
4. Download both the `SHA256SUMS` asset and the selected binary asset from
   the resolved release.
5. Verify that the downloaded binary's SHA-256 digest matches the entry for
   its asset name in `SHA256SUMS`. If the checksum file is missing,
   unreachable, malformed for the selected asset, lacks the selected asset,
   or the digest does not match, fail with `self_update_unavailable`.
6. Mark the downloaded file executable. On macOS, clear the
   `com.apple.quarantine` extended attribute.
7. Atomically rename the downloaded file over `process.execPath`. The
   running process keeps executing on the old inode; subsequent
   invocations run the new binary.
8. Record the new version in the version-check file (§10.4) so the
   update notice doesn't nag the user about a version they already
   installed.

**Flags.**

- `--check` — query the release feed and print whether an update is
  available; perform no download or replacement. Exit 0 either way.
- `--version <tag>` — install the named release (e.g. `v0.4.0`) instead
  of the latest. Useful for pinning or downgrading.
- `--force` — reinstall even when the resolved version matches the
  running version. Does NOT override `self_update_unavailable` (the
  release couldn't be fetched) or `self_update_failed` (the replacement
  failed mid-flight).

**Errors.**

- `self_update_unavailable` (exit 5) — the release feed, checksum asset,
  or binary asset couldn't be reached; the release doesn't have an asset
  for the current arch; the release doesn't have a `SHA256SUMS` asset; the
  checksum file doesn't contain a valid entry for the selected asset; the
  downloaded binary doesn't match its checksum; or the named `--version`
  doesn't exist.
- `self_update_failed` (exit 8) — the replacement step failed (e.g. the
  binary path isn't writable). The old binary is left in place.

**Non-macOS.** `crew self-update` on a non-macOS host produces
`self_update_unavailable` with a message indicating Homecrew ships only for
macOS. No release feed request is made.

### 10.4 Update-available notice

Every human invocation of `crew` SHOULD emit a short informational
notice on stderr when a newer release of `crew` itself is available,
so users don't have to remember to check. The notice is advisory and
never affects the exit code, stdout, or the operation in progress.

**Check cadence.** The implementation tracks the last time it queried
the release feed in `~/.crew/version-check.json`:

```json
{
  "checked_at": "2026-04-20T12:00:00Z",
  "latest_tag": "v0.4.0"
}
```

At most once every 24 hours, when the cadence has elapsed, the
implementation performs a synchronous HTTP GET against the
latest-release URL (§10.3), with a tight 2-second timeout, and writes
the result back to `version-check.json`. On timeout or any other
fetch failure, the existing record is left unchanged — the user's
command is never blocked for more than 2 seconds and the next
invocation won't retry until another 24 hours have passed.

**Notice rendering.** If `version-check.json` shows `latest_tag !=
CREW_VERSION`, the implementation emits a single stderr line like:

```text
A new version of Homecrew is available (v0.3.1 → v0.4.0). Run `crew self-update` to upgrade.
```

**Suppression.** The notice MUST be suppressed — and the 24h fetch
skipped entirely — when any of the following hold:

- `stderr` is not a TTY.
- `--json` was passed.
- `--quiet` was passed.
- `CREW_NO_UPDATE_CHECK=1` is set.
- `CI` is set (standard GitHub Actions / generic CI convention).
- `CREW_AUTOUPDATE_LOG=1` is set (the command is running under the
  launchd autoupdater).
- The command itself is `self-update` or `version`.

## 11. State

### 11.1 `state.json` schema

UTF-8 JSON with a trailing newline. Single top-level object.

```json
{
  "schema_version": 1,
  "installations": [
    {
      "name": "python-testing",
      "source": { "tap": "core", "path": "python-testing" },
      "ref": "main",
      "resolved_sha": "a1b2c3d4e5f6789abcdef0123456789abcdef012",
      "content_hash": "sha256:9f8e7d...",
      "scope": "user",
      "installed_at": "2026-04-18T12:00:00Z",
      "agents": ["claude-code", "codex", "gemini-cli"],
      "pinned": false,
      "explicit": true,
      "required_by": []
    },
    {
      "name": "team-conventions",
      "source": { "tap": "acme-team", "path": "team-conventions" },
      "ref": null,
      "resolved_sha": "b2c3d4e5f6789abcdef0123456789abcdef01234",
      "content_hash": "sha256:...",
      "scope": "project",
      "project_root": "/Users/alice/work/product-x",
      "installed_at": "2026-04-19T10:15:00Z",
      "agents": ["claude-code"],
      "pinned": false,
      "explicit": true,
      "required_by": []
    }
  ]
}
```

Every entry's `source` is `{ tap, path }`: the name of a configured tap (registered or auto, see §16) and the skill's directory path inside that tap. The URL or filesystem location is held in `config.yaml` on the tap row, not duplicated here, so renaming a tap or changing its URL doesn't require rewriting state.

One entry per (skill, scope, project_root) triple: the same skill can be installed at user scope, at project scope under `~/work/product-x`, and at project scope under `~/work/product-y` — that's three independent entries. `agents` is the list of agent names this skill is currently installed into.

**`project_root`** (string). Present iff `scope === "project"`. The
absolute path to the directory the skill was installed from (the
user's working directory at install time). Every subsequent command —
`crew update`, `crew uninstall`, `crew doctor` — uses this path when
resolving the adapter's project-scope base directory, NOT the user's
current working directory. That way, `crew update` run from any
directory (or by the autoupdate background agent from its
launchd-assigned cwd) still updates each project-scope install at its
original location.

A stale `project_root` (directory no longer exists, was moved,
permissions changed) is reported by `crew doctor` as a
`missing_project_root` finding and is a clean skip on `crew update` —
the local install is preserved and the user is informed they can
`crew uninstall` to drop the entry if the project directory is truly
gone.

**`explicit`** (boolean). True if the user asked for this skill by name
on a `crew install` command, either directly (`crew install foo`) or
as a member of a multi-skill source the user named — including
`crew install <tap-name>` (which installs every skill in the tap;
each is `explicit: true`) and `crew install <git-url>` against a
multi-skill repo (same outcome via an auto-tap, see §16). False only
when the skill was pulled in solely as a transitive dependency of
another install. A skill first installed as a dependency and later
named directly is promoted to `explicit: true` on that later install.

**`required_by`** (array of strings). Names of other installed skills
at the same scope whose `dependencies` include this skill. Maintained
by crew on every install and uninstall. A skill with `explicit: false`
and empty `required_by` is an autoremovable orphan —
`crew uninstall --prune` removes it.

**`tracks_tap`** (boolean, optional; absent means false). True when
this entry came from a whole-tap install (`crew install <tap-url>` or
`crew install <tap-name>`). Drives tap re-expansion (§10.1.1): on
`crew update`, the group of entries sharing `(source.tap, scope,
project_root)` is re-walked and new siblings are installed iff any
member has `tracks_tap: true`. A user who installed just one skill
from a tap (`crew install <tap>/<skill>` or a bare skill name)
doesn't opt into this; `tracks_tap` is absent on those entries, and
the tap's later additions don't pull into their setup. Like
`explicit`, `tracks_tap` never demotes: once a user installed the
whole tap, a later `crew install <tap>/<one-skill>` doesn't flip it
off.

**Invariants:**

- Every entry in `state.json` should correspond to a `.crew.json` marker in every listed agent. `crew doctor` detects and reports drift.
- Every entry's `source.tap` MUST name a tap currently configured in `config.yaml`. `crew doctor --repair` recovers a missing tap by recreating it as an auto-tap from marker contents.
- `pinned` is true if the ref was an exact SHA or a tag. Otherwise false.
- Every name appearing in any entry's `required_by` is itself an installed skill at the same scope. `crew doctor` detects and reports dangling `required_by` names.
- `project_root` is present iff `scope === "project"`. User-scope entries MUST NOT carry a `project_root`; project-scope entries MUST.

### 11.2 `crew doctor`

`crew doctor` performs these checks and reports each finding:

1. Every `state.json` entry has a matching `.crew.json` marker in every listed agent.
2. Every `.crew.json` marker on disk corresponds to a `state.json` entry.
3. For each marker, the on-disk content hash matches the marker's `content_hash`. A mismatch means the user customized a crew-managed skill.
4. Every agent listed in state still passes `detect()` (or is in `forced_agents`).
5. No `store/` entry is orphaned (not referenced by any state entry).
6. `config.yaml` parses.
7. If autoupdate is enabled in config, the launchd agent is actually loaded.
8. For every project-scope entry, `project_root` exists on disk and a `.crew.json` marker lives under `<project_root>/<adapter-base>/<name>/`. A `project_root` that no longer exists produces a `missing_project_root` finding (warn, not error — the user may have simply moved the project, and the right fix is a `crew uninstall` from their new location).

`--verify` includes check 3 (hash recomputation); without it, check 3 is skipped for speed.

`--repair` attempts to fix:

- Orphaned state entries (no corresponding marker and agent missing): remove from state.
- Orphaned markers (marker present, no state entry): re-add to state.
- Orphan store entries: delete them.
- Autoupdate drift (config says enabled but agent not loaded, or vice versa): reconcile to the config's value.

`--repair` never overwrites user-customized skills or touches anything outside `~/.crew/` and the agent skill directories it already manages.

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
| `source_gone` | 0 | On update, the source resolved but the installed skill no longer exists upstream. Soft outcome; local install is preserved. Never causes a non-zero exit. |
| `ambiguous_reference` | 4 | A reference has more than one valid resolution across taps, skills, and namespaces, and the user is non-interactive or the prompt was aborted. |
| `ambiguous_dependency` | 4 | A dependency's bare name is ambiguous across taps. |
| `conflicting_dependencies` | 4 | Two skills with the same name resolve to different SHAs. |
| `name_conflict` | 4 | Trying to install a skill whose name is already held by a different source, without `--force`. |
| `untracked_directory` | 6 | Destination exists without a crew marker. |
| `customized` | 6 | Destination has a marker but content hash differs. |
| `inconsistent_marker` | 6 | Marker exists with an unexpected `name`. |
| `not_installed_here` | 6 | Uninstall agent has no marker. |
| `no_agents` | 4 | No agent tools detected or all disabled. |
| `config_invalid` | 4 | `config.yaml` did not parse. |
| `state_locked` | 7 | Could not acquire `state.json.lock` within timeout. |
| `launchd_failure` | 8 | Autoupdate enable/disable couldn't load/unload the agent. |
| `self_update_unavailable` | 5 | `crew self-update` couldn't reach the release feed, the asset is missing for the current arch, or the named `--version` doesn't exist. |
| `self_update_failed` | 8 | `crew self-update` fetched a new binary but couldn't replace the running one (e.g. the install prefix isn't writable). |

The `--force` flag overrides `customized`, `untracked_directory`, `inconsistent_marker`, and `not_installed_here`. It does **not** override `invalid_skill`, `name_conflict`, `conflicting_dependencies`, or any other error.

**Human-mode error quality.** In human mode, an error message should
name the offending thing (path, skill, ref, URL) and — whenever a
reasonable next step exists — point the user at what to try. The stable
error name and exit code are the only machine contract (they're what
`--json` and conformance tests consume), but the human-readable output
is part of the product. Implementations SHOULD follow these guidelines:

- **Name the thing.** "`python-testing` isn't in any configured tap"
  beats "skill not found."
- **Point at a remedy.** Errors with an obvious next step should carry
  a one-line hint — the command to run, the flag that overrides, the
  file to edit. A remedy separate from the primary message (e.g. a
  trailing `→ <hint>` line) is easy for users to skim past when they
  don't need it.
- **Speak as a peer.** "run `crew list` to see what's installed" lands
  better than "the requested skill is not present in the state file."
- **Respect `--force` semantics.** If the error is one `--force`
  overrides (§13 list), say so. If it's one `--force` won't override,
  also say so — it saves a second attempt.

These are SHOULD-level recommendations, not MUST. Conformance tests
assert the machine contract (name + exit code), not the wording. But
two conformant implementations should feel like the same tool; the
bar here is craft, not compliance.

## 14. Concurrency

Homecrew mutates state from multiple entry points (interactive commands, autoupdate). To prevent races:

1. Every command that writes `state.json` or installs into an agent acquires an advisory lock on `~/.crew/state.json.lock` (using `flock(2)` or an equivalent macOS file-lock primitive) before making changes. Read-only commands do not take the lock.
2. Lock timeout: 30 seconds. If not acquired, exit with `state_locked` (§13).
3. The lock is held for the full duration of file-modifying operations and released on exit, including crashes (OS-level file locks release on fd close).
4. Git clone/fetch against a single repo is serialized under the state lock. This is not the most parallel design but is simple and adequate for a desktop tool.

## 15. Exit codes

| Code | Meaning |
|---|---|
| 0 | Success, or partial success where every requested skill succeeded in at least one agent. |
| 1 | General failure; used when `crew update` has any skill hard-fail. |
| 2 | Nothing was attempted (e.g. install command with only already-installed skills, or empty directory expansion where user asked for a specific thing). |
| 4 | User error: invalid arguments, invalid skill, unresolvable references, no agents available, config invalid. |
| 5 | Network / source failure: could not reach git, ref does not exist, release feed unreachable. |
| 6 | Safety-check abort: untracked directory, customized skill, bad marker. |
| 7 | Could not acquire state lock. |
| 8 | macOS integration failure: launchd agent could not be loaded/unloaded, or self-update couldn't replace the binary. |

## 16. Taps

### 16.1 What a tap is

A **tap** is any directory whose immediate children are skills (each containing a `SKILL.md`). It can be a git-managed directory (a clone of a git repo, optionally rooted at a subdirectory via `subpath`) or a local filesystem directory. Every tap has a unique short name in `config.yaml`. Every installed skill belongs to exactly one tap, recorded as `state.installations[i].source.tap`.

Taps come in two flavors that differ only in lifecycle, not in structure or behavior:

- **Registered taps** are added by the user (`crew tap add`) and persist until explicitly removed. They appear in `crew tap list` with `kind: registered`. The default `core` tap is registered.
- **Auto taps** are created implicitly when `crew install` resolves a source crew hasn't seen before (e.g. `crew install @with-logic/skills`). They behave identically to registered taps for `crew update`, `crew search`, and `crew install` — but they are garbage-collected when their last skill is uninstalled. They appear in `crew tap list` with `kind: auto`.

A user can promote an auto tap to registered by running `crew tap add` against the same URL: it idempotently re-points the existing entry, flips `registered: true`, and applies any `<name>` the user supplies.

Both kinds can be either git-backed or path-backed. Path-backed taps don't fetch (there's no upstream); `crew tap update` skips them.

A tap directory may contain non-skill files and subdirectories — only immediate children with a valid `SKILL.md` are recognized. Example tap:

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

### 16.2 Default tap

Homecrew ships with a registered default tap named `core` at a URL specified by the implementation's build. The default tap is always listed first in `crew tap list` and cannot be removed via `crew tap remove core` unless `--force` is used.

### 16.3 Tap management

- `crew tap add <url-or-path> [<name>]` registers a tap.
  - `<url-or-path>` is either a git URL (with optional `//<subpath>` tail using the same syntax as §8.2 git refs — e.g. `crew tap add @with-logic/backend//skills`) or a filesystem path.
  - If `<name>` is omitted, it is derived: for root git taps, the final URL path component (minus `.git`); for subpath git taps, `<last-repo-segment>-<last-subpath-segment>` (so `@with-logic/backend//skills` → `backend-skills`); for path taps, the basename of the directory.
  - For git taps, the initial clone runs **before** the tap is written to config. If the clone fails (bad URL, typo, network failure, no access), the tap is not added — neither `crew tap list` nor `config.yaml` shows it, and any partially-materialized clone directory is removed.
  - If the named tap already exists with a matching URL/path/subpath, the call is an idempotent no-op (exit 0). If an existing tap of the same name has a different URL/path/subpath, the call is a `usage_error` — the user must pick a different name.
  - If the URL/path matches an existing **auto** tap, `crew tap add` promotes it: `registered` flips to `true`, and the `<name>` argument (if supplied) renames the tap. No re-clone.
- `crew tap <url-or-path> [<name>]` is a shorthand for `crew tap add <url-or-path> [<name>]` when the first positional parses as a git source per §8.2 or as a path. Bare `crew tap` (no positional at all) prints the command's help page (same as `crew help tap`) with exit 0. Any other input — an unknown subcommand, or a word that doesn't parse as a source — is a `usage_error` whose message names the offending input and points at `crew help tap`. Other commands that take subcommands (`crew cache`, `crew autoupdate`) behave the same way; `crew agents` lists agents when bare and errors on an unknown subcommand.
- Once a tap is configured, users reference skills inside it by bare name (`python-testing`) or qualified name (`<tap-name>/python-testing`). The subpath, URL, or path is entirely internal — it never appears in skill references.
- `crew tap remove <name>` deletes the local clone and removes the tap from config. Auto taps are also removed automatically when their last associated state entry is uninstalled (see §16.5).
- `crew tap list` prints each tap's name, kind (`registered` / `auto`), source (URL`//subpath` or path), and last-fetched timestamp (for git-kind taps only). `--json` emits the structured shape.
- `crew tap update [<name>...]` fetches upstream for every git-kind tap (or only the named ones) and fast-forwards each tap's working tree. Path-kind taps are skipped silently. Per-tap failures are reported per-row and do not abort the run; exit code is 1 if any tap failed, 0 otherwise. It does **not** touch installed skills — contrast with `crew update`, which refreshes taps and updates installed skills.

### 16.4 `crew install <tap-name>`

When the positional argument to `crew install` matches a configured tap name (registered or auto), Homecrew installs every skill the tap currently exposes — the same outcome as if the user had typed the tap's underlying URL/path. State entries are recorded with `source.tap = <tap-name>` and `explicit = true`.

When a positional matches **both** a configured tap name AND an installable skill in one or more other taps, crew prompts the user interactively. Two prompt shapes, depending on how many other taps hold the same-named skill:

**Exactly one other tap** — binary prompt. Tap wins on enter (`Y`).

```
`python-testing` matches both a tap and a skill (from other-tap).
  [Y] install tap `python-testing` (3 skills)
  [n] install skill `other-tap/python-testing`
Choice [Y/n]:
```

**Two or more other taps** — numbered menu. Choice 1 (the tap) is the default; empty input selects it.

```
`python-testing` matches a tap and skills in 2 other taps.
  [1] install tap `python-testing` (3 skills)
  [2] install skill `other-a/python-testing`
  [3] install skill `other-b/python-testing`
Choice [1-3, default 1]:
```

The user can pass `--yes` to skip the prompt (always installs the tap). When stdin is not a TTY (scripts, CI), the prompt is suppressed and crew aborts with a `usage_error` instructing the user to pass `--yes` or to qualify the skill as `<tap>/<name>` — and in the multi-tap case lists every qualified candidate. This avoids silently installing a whole tap when a script just wanted a skill, while still letting the interactive case stay one-keystroke fast.

When a positional matches a tap name but no other tap holds a same-named skill, no prompt — the tap installs silently.

### 16.5 Auto-tap creation and lifecycle

When `crew install` is given a reference that resolves to a source not currently backed by any configured tap (e.g. a brand-new git URL like `crew install @with-logic/skills`), crew:

1. Derives a name with the same algorithm as `crew tap add`.
2. If the derived name is already in use by a tap with a different URL/path/subpath, suffixes the name with `-2`, `-3`, etc. until unique. (Registered-tap-add never silently suffixes — only auto-tap creation does.)
3. Writes a new tap row with `registered: false` and the appropriate `kind`/`url`/`path`/`subpath` fields.
4. Acquires the source under the new tap name and proceeds with the install.

Auto taps are functionally indistinguishable from registered taps for `crew update`, `crew tap update`, `crew search`, and `crew install <tap-name>` purposes. The only differences are:

- They appear with `kind: auto` in `crew tap list`.
- They are garbage-collected by `crew uninstall` when their last associated state entry is removed: the tap row is dropped from `config.yaml` and the local clone is deleted. (Registered taps are not garbage-collected.)
- A user can convert an auto tap to registered by running `crew tap add <url-or-path>` against the same source — this idempotent promotion preserves the existing clone and installed skills.

### 16.6 Search and network policy

`crew search <query>` matches `query` (case-insensitive substring) against the `name` and `description` of every skill in every configured git-kind tap (registered or auto). Path-kind taps are searched too if their root is reachable. Output is grouped by tap: a count header, then one section per tap with its matching skills listed below, name column left-aligned, description truncated to fit the terminal width. Namespaced skills render as `<namespace>/<name>` in the name column. Each row is prefixed by `✓` if the skill name is present in local state (installed at user or project scope) and a space otherwise, so the user can see at a glance what they already have. `--json` emits a structured `{ hits, warnings }` object; each hit has fields `{ tap, name, namespace, description, installed }` where `namespace` is `string | null` and `installed` is `boolean`.

`crew search` (no query) lists every skill in every configured tap — the exhaustive catalog. Output and JSON shape are identical to the query form; the installed marker appears the same way.

**Network policy.** Read-only commands (`crew search`, `crew info`, `crew list`, `crew install <bare-name>` and `<tap>/<skill>` forms, tap re-expansion during `crew update` for unrelated taps) MUST NOT contact the network. They read from local tap clones as-of the last `crew update` / `crew tap update`. A tap that has never been cloned is materialized on demand on first use; if that initial clone fails (offline, bad URL), the command warns on stderr and skips that tap — it does not fail the whole run.

The only commands that actively fetch from upstream are:

- `crew update` (§10.1 step 1). Without args: every configured git-kind tap. With `<name>...`: only the taps that back the named entries (after the dependency closure of §10.1 step 2 expands them). Taps hosting only unrelated skills are not touched.
- `crew tap update` — every git-kind tap, or the named subset.
- `crew tap add` — initial clone of the freshly-added git tap.
- `crew install <git-url>` and `crew install <tap-name>` against an out-of-date tap — fetches that tap's URL.

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
| C-REF-18 | §8.2 | `@owner/repo` is parsed as a git source and expanded to `https://github.com/owner/repo.git` (identical handling to `gh:owner/repo`). |
| C-REF-19 | §8.2 | `@owner/repo@v1.0.0` is parsed as a git source with ref `v1.0.0` (leading `@` is the shorthand, infix `@` is the ref separator). |
| C-REF-20 | §8.2 | `@owner/repo//sub/path` is parsed as a git source with subpath `sub/path`. |

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
| C-SPEC-13 | §9 | No file is written to any agent when validation fails. |

#### C-INST: Install (§9)

| ID | Reference | Assertion |
|---|---|---|
| C-INST-01 | §9 | `crew install ./local-skill` installs from a local path into every detected agent. |
| C-INST-02 | §9 | `crew install gh:owner/repo` installs from a GitHub URL with no prior `crew tap add`. |
| C-INST-03 | §9, §7.3 | After install, `SKILL.md` and every other file in the source appear under `{base}/<name>/`, preserving relative paths. |
| C-INST-04 | §7.5 | A `.crew.json` marker is written into the installed skill directory with the fields listed in §7.5. |
| C-INST-05 | §9 | `crew install gh:owner/repo//sub/path` installs only the skill at that subpath. |
| C-INST-06 | §9 | `crew install gh:owner/repo` pointed at a repo with a root `SKILL.md` installs one skill. |
| C-INST-07 | §9 step 5 | `crew install gh:owner/repo` pointed at a repo with no root `SKILL.md` but skill subdirectories installs every valid child one level deep. |
| C-INST-08 | §9 step 5 | Nested skills more than one level deep are NOT installed by directory expansion. |
| C-INST-08b | §9 step 5 | `crew install gh:owner/repo` pointed at a repo with no root `SKILL.md` but a `skills/` directory containing skill subdirectories installs every valid child of `skills/`. The source root itself is not walked. |
| C-INST-09 | §9 | A directory source that expands to zero valid skills produces error `no_skills_found`, exit 4. |
| C-INST-10 | §9 | `resolved_sha` in state and in the marker is always a 40-character hex commit SHA for git and tap sources. |
| C-INST-11 | §9 | Installing an already-installed skill at the same SHA prints "already installed" and exits 0. |
| C-INST-12 | §5.4 | Installing an already-installed skill from the same source at a different ref performs an update. |
| C-INST-13 | §5.4 | Installing a skill with the same `name` from a different source produces `name_conflict`, exit 4, without `--force`. |
| C-INST-14 | §5.4 | `--force` on a `name_conflict` is NOT honored (the spec forbids `--force` overriding name conflicts). |
| C-INST-15 | §9 | `--dry-run` on install produces a summary of what would happen and writes no files. |
| C-INST-16 | §9 | `--agent <skill>` restricts the operation to the named agent(s). |
| C-INST-17 | §9 | `--scope project` writes to the agent's project-scope path instead of the user-scope path. |
| C-INST-18 | §11.1 | A project-scope install records `project_root` in the state entry equal to the user's working directory at install time. User-scope installs do NOT have a `project_root`. |
| C-INST-19 | §9 | `state.json` may contain multiple project-scope entries for the same skill name, each with a different `project_root` — they're independent installs, not duplicates. |
| C-INST-20 | §9 step 9 | A validation failure on any skill is recorded as a failed skill; the run continues through the remaining skills. It does not abort the command. |
| C-INST-21 | §9 step 9 | Exit codes: `0` if every attempted skill succeeded; `1` if some succeeded and some failed; `4` with error `invalid_skill` if zero succeeded and ≥1 failed validation; `1` if zero succeeded and all failures were operational (non-validation). |
| C-INST-22 | §9 step 9 | Every attempted skill appears in the human output with a per-skill success/failure line. `--json` includes a `results` array with the same per-skill outcomes. |

#### C-NS: Namespaces (§8.3, §9 step 5)

| ID | Reference | Assertion |
|---|---|---|
| C-NS-01 | §9 step 5 | A directory under `skills/` containing child directories with `SKILL.md` (and no root `SKILL.md` of its own) is treated as a namespace; each child is installed as a skill. |
| C-NS-02 | §9 step 5 | `crew install <namespace>` installs every skill in the namespace when that namespace name exists in exactly one configured tap. |
| C-NS-03 | §8.3 | `crew install <tap>/<namespace>/<skill>` installs that specific skill unambiguously. |
| C-NS-04 | §8.3 | `crew install <namespace>/<skill>` installs the skill when the namespace exists in exactly one configured tap; 2-segment refs are tap-first. |
| C-NS-05 | §8.3 | A bare name matching both a skill and a namespace (or a tap, or multiple namespaces) triggers an interactive menu on a TTY; otherwise aborts with `ambiguous_reference`. |
| C-NS-06 | §8.3 | `--tap` forces tap-install interpretation of every bare-name positional; errors if the name is not a configured tap. |
| C-NS-07 | §8.3 | `--bundle` forces namespace-install interpretation of every bare-name positional; errors if the name is not a namespace in exactly one tap. |
| C-NS-08 | §8.3 | `--skill` forces single-skill interpretation of every bare-name positional; errors if the name is only a namespace. |
| C-NS-09 | §13 | `ambiguous_reference` output names every candidate and includes a copy-pasteable install command for each. |
| C-NS-10 | §9 step 5 | Namespace nesting deeper than one level is ignored. |

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
| C-UPD-11 | §10.1 | When an installed skill's upstream source resolves but the skill's directory or tap entry no longer exists, `crew update` reports `source_gone` for that skill and leaves the local install, marker, and state entry untouched. |
| C-UPD-12 | §10.1 | An update run whose only abnormalities are `source_gone` exits 0. |
| C-UPD-13 | §10.1 | `crew update` never deletes a agent's installed skill directory, its marker, or its state entry as a consequence of upstream changes. Removal is only ever performed by `crew uninstall`. |
| C-UPD-14 | §16.5 | `crew install <git-url>` against a source with no matching configured tap creates an auto tap (`registered: false`) in `config.yaml`. Every resulting state entry's `source.tap` names that tap. |
| C-UPD-15 | §10.1.1 | `crew update` re-walks every tap group where any member has `tracks_tap: true` and installs any child skill added to the tap upstream since the last update. Groups with no whole-tap members are NOT re-expanded (`crew install <tap>/<skill>` or `crew install <bare-name>` doesn't subscribe the user to the tap's siblings). |
| C-UPD-16 | §10.1.1 | A child skill removed from a tap upstream produces `source_gone` for that skill and leaves the local install, marker, and state entry untouched. |
| C-UPD-17 | §16.5 | An auto tap whose last associated state entry is uninstalled is garbage-collected: removed from `config.yaml`, its clone deleted. Registered taps are NOT garbage-collected by uninstall. |
| C-UPD-18 | §10.1.1 | `crew update --dry-run` on a tap with pending additions lists those additions without installing anything. |
| C-UPD-19 | §10.1 | `crew update` with no args fetches every configured tap (`git fetch` + fast-forward) before walking per-skill updates, so `crew search` reflects upstream changes without requiring the user to reinstall from the tap first. |
| C-UPD-23 | §10.1 / §16.6 | `crew update <name>...` restricts fetching to taps that back the named entries (and any taps reached via the dependency closure of step 2). Taps hosting only unrelated skills are NOT fetched. |
| C-UPD-24 | §10.1 | `crew update <name>...` includes each named entry's transitive dependency closure (as determined by `required_by` in state) in the update set. Entries pulled in that way are reported alongside the named ones, marked as transitively required in `--json` output. |
| C-UPD-20 | §10.1 | A tap whose fetch fails (network error, URL 404, etc.) produces a per-tap warning in the update summary but does NOT abort the run; other taps and per-skill updates continue to be processed. |
| C-UPD-21 | §11.1 | `crew update` for a project-scope entry reinstalls at the entry's recorded `project_root`, NOT the user's current working directory. This holds whether update is run by the user from any shell, or by the autoupdate background agent from its launchd-assigned cwd. |
| C-UPD-22 | §11.1 | A project-scope entry whose `project_root` no longer exists on disk is reported as `missing_project_root` and SKIPPED on update — the local install is preserved and no files are written. |

#### C-UNINST: Uninstall (§7.4)

| ID | Reference | Assertion |
|---|---|---|
| C-UNINST-01 | §7.4 | `crew uninstall <name>` removes the skill directory from every agent the skill was installed in. |
| C-UNINST-02 | §7.4 | Uninstall updates `state.json` to no longer list the skill. |
| C-UNINST-03 | §7.4 | Uninstall does not touch sibling skill directories in the same agent. |
| C-UNINST-04 | §7.4 | `crew uninstall` on a skill that is not installed produces `not_installed_here`, exit 6, without `--force`. |
| C-UNINST-05 | §7.4 | `crew uninstall <name>` without `--prune` does NOT remove that skill's transitive dependencies, even if they are no longer required by anything else. |
| C-UNINST-06 | §7.4 | `crew uninstall <name> --prune` removes the named skill, then recursively removes any remaining skill with `explicit: false` and an empty `required_by` at the same scope. |
| C-UNINST-07 | §7.4 | `--prune` never removes a skill with `explicit: true`, even if no other skill depends on it. |
| C-UNINST-08 | §11.1 | After `crew uninstall`, every remaining state entry's `required_by` no longer names the uninstalled skill. |
| C-UNINST-09 | §11.1 | A skill first installed as a dependency (`explicit: false`) and then later installed directly (`crew install <name>`) has `explicit: true` after the second install. |
| C-UNINST-10 | §7.4 | `crew uninstall --agent <name> <skill>` removes the skill only from the named agent(s); other agents keep their installs. |
| C-UNINST-11 | §7.4 | After a partial `--agent` uninstall, the state entry survives with a reduced `agents` list; `required_by` on other entries is unchanged. |
| C-UNINST-12 | §7.4 | When `--agent` removal empties the `agents` list, the entry is removed entirely and `required_by` on other entries is scrubbed — as with a full uninstall. |
| C-UNINST-13 | §7.4 | `--prune` does not cascade through a partial (`--agent`) uninstall that leaves the entry alive. Pruning only triggers when the entry was fully removed. |
| C-UNINST-14 | §7.4 | `--agent <name>` naming an agent the skill isn't installed in is a silent per-agent no-op; it never causes `not_installed_here` on its own. |
| C-UNINST-15 | §11.1 | `crew uninstall --scope project <name>` removes the install at the entry's recorded `project_root`, NOT the user's current working directory. Run from any cwd, it finds and removes the correct files. |
| C-UNINST-16 | §7.4 | When two agents share a `dest` (e.g. `codex` + `gemini-cli` both at `~/.agents/skills/<name>/`), `crew uninstall --agent codex <name>` removes `codex` from the marker's `agents` list but leaves the bytes on disk; `gemini-cli` continues to work. |
| C-UNINST-17 | §7.4 | After `crew uninstall --agent codex <name>` in a path-shared install, the marker at `dest` contains every remaining owning adapter and no others. |
| C-SHARE-01 | §7.2, §7.3 | When `codex` and `gemini-cli` are both active, `crew install <name>` writes bytes to `~/.agents/skills/<name>/` exactly once, and the per-agent summary reports both adapter names as installed. |
| C-SHARE-02 | §7.5 | The `agents` field in `.crew.json` is non-empty, alphabetically sorted, and lists every agent currently owning the install. |
| C-SHARE-03 | §7.3 | Installing into a path already owned by agent X with agent Y active (and not X) results in a marker whose `agents` contains both X and Y, preserving X's ownership. |

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
| C-TAP-08 | §16.4 | `crew search --json` emits a structured array of matches. Each hit includes `installed: boolean` and `namespace: string \| null` fields. |
| C-TAP-08b | §16.4 | `crew search` (no query) lists every skill in every configured tap. Installed skills are marked `✓` in human output and `installed: true` in JSON. |
| C-TAP-10 | §16.3 | `crew tap <git-url> [<name>]` behaves identically to `crew tap add <git-url> [<name>]` when the first positional is a recognized git source (URL, `gh:`, `@owner/repo`, etc.). |
| C-TAP-11 | §16.3 | `crew tap <unknown-word>` where `<unknown-word>` is neither a subcommand nor a git source is a `usage_error` whose message names the word and directs the user to `crew help tap`. Bare `crew tap` (no arguments) shows the help page with exit 0. |
| C-TAP-12 | §16.3 | `crew tap add <url>//<subpath>` configures a tap rooted at `<subpath>` inside the repo. Skills at the top level of `<subpath>` are installable by bare name, just like a root tap. |
| C-TAP-13 | §16.3 | Default name derivation for a subpath tap is `<last-repo-segment>-<last-subpath-segment>` (e.g. `@with-logic/backend//skills` → `backend-skills`); for a root tap it remains the final repo segment. |
| C-TAP-14 | §16.3 | Adding a tap whose `(name, url, subpath)` already exists is a no-op (exit 0). Adding the same name with a different URL or subpath is `usage_error`. |
| C-TAP-15 | §16.3 | `crew tap add` is transactional: if the clone fails, the tap is NOT recorded in `config.yaml` and does NOT appear in `crew tap list`. Any partially-materialized clone directory is removed. |
| C-TAP-16 | §16.3 | `crew tap update` fetches + fast-forwards every configured tap. `crew tap update <name>...` restricts to the named taps. Unknown names produce `usage_error`. It does not touch installed skills. |
| C-TAP-17 | §16.6 | `crew search`, `crew info`, `crew list`, and `crew install` for bare-name or `<tap>/<skill>` references do not issue a `git fetch`. They read from local tap clones only. A missing clone is materialized on first read; an unreachable tap at that moment warns and is skipped. |
| C-TAP-18 | §16.4 | `crew install <tap-name>` (where `<tap-name>` matches a configured tap, registered or auto) installs every skill the tap currently exposes. Each resulting state entry has `source.tap = <tap-name>` and `explicit = true`. |
| C-TAP-19 | §16.4 | When `<positional>` matches both a tap name and a skill name in exactly one other tap, `crew install <positional>` prompts with `[Y/n]` (tap wins on enter). `--yes` skips the prompt and installs the tap. In a non-TTY environment, the command aborts with `usage_error` instructing the user to pass `--yes` or qualify the skill as `<other-tap>/<name>`. |
| C-TAP-19b | §16.4 | When `<positional>` matches both a tap name and a skill name in two or more other taps, `crew install <positional>` prompts with a numbered menu listing the tap (as choice 1, the default) and each qualified skill. Empty input or `1` picks the tap; `2..N` pick the corresponding qualified skill. `--yes` skips the prompt and installs the tap. Non-TTY aborts with `usage_error` listing every qualified candidate. |
| C-TAP-20 | §16.5 | `crew install <git-url>` against a URL not matching any configured tap creates a new auto tap (kind: git, registered: false), choosing a unique derived name (suffixing `-2`, `-3`, ... if a name collision exists with a different URL). |
| C-TAP-21 | §16.5 | `crew install <local-path>` creates an auto tap with `kind: path`, `registered: false`, `path: <abs-path>`. `crew tap update` skips path-kind taps; `crew search` walks them when reachable. |
| C-TAP-22 | §16.5 | Running `crew tap add <url>` against a URL that already backs an auto tap promotes it (`registered` flips to `true`) without re-cloning, and applies any user-supplied `<name>` argument. |

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
| C-STATE-10 | §11.1 | After any install, every name appearing in any `required_by` array is itself an installed skill at the same scope. |
| C-STATE-11 | §11.2 | `crew doctor` reports `missing_project_root` for any project-scope entry whose `project_root` directory no longer exists. |

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
| C-AUTO-09 | §10.2 | `crew autoupdate enable` writes an attribution bundle at `~/.crew/Homecrew.app/Contents/Info.plist` with `CFBundleIdentifier = sh.crew.autoupdater` and `CFBundleDisplayName = "Homecrew Skill Autoupdate"`. |
| C-AUTO-10 | §10.2 | The plist carries an `AssociatedBundleIdentifiers` array containing `sh.crew.autoupdater`. |

#### C-SELF: Self-update (§10.3, §10.4)

| ID | Reference | Assertion |
|---|---|---|
| C-SELF-01 | §10.3 | `crew self-update --check` queries the release feed, prints the latest tag, and makes no filesystem changes. |
| C-SELF-02 | §10.3 | `crew self-update` on a version equal to `latest_tag` prints "already on the latest version" and exits 0. |
| C-SELF-03 | §10.3 | `crew self-update` downloads `SHA256SUMS` and the asset for the current arch, verifies the asset digest, `chmod +x`s it, and atomically renames over the running binary. |
| C-SELF-04 | §10.3 | A release-feed, asset-download, or checksum-verification failure produces `self_update_unavailable`, exit 5. |
| C-SELF-05 | §10.3 | A failure to replace the binary produces `self_update_failed`, exit 8. The old binary is left in place. |
| C-SELF-06 | §10.3 | `crew self-update --version v0.1.0` targets the named tag instead of the latest, and errors `self_update_unavailable` if the tag does not exist. |
| C-SELF-07 | §10.4 | A human `crew` invocation whose stderr is a TTY and whose cached `latest_tag` differs from `CREW_VERSION` emits exactly one stderr notice naming both versions. |
| C-SELF-08 | §10.4 | The update notice is suppressed when `--json`, `--quiet`, `CREW_NO_UPDATE_CHECK=1`, `CI`, or `CREW_AUTOUPDATE_LOG=1` is set, or when stderr is not a TTY. |
| C-SELF-09 | §10.4 | The update notice is never emitted during `crew self-update` or `crew version`. |

#### C-AGENT: Agents (§7)

| ID | Reference | Assertion |
|---|---|---|
| C-AGENT-01 | §7.2 | Every adapter listed in the §7.2 table is registered and listed by `crew agents`. |
| C-AGENT-02 | §7.2 | `crew agents` lists every adapter with its detection status. |
| C-AGENT-03 | §7.1 | `crew agents disable <name>` causes subsequent installs to skip that agent. |
| C-AGENT-04 | §7.1 | `crew agents enable <name>` forces a agent active even if `detect()` returns false. |
| C-AGENT-05 | §9 step 7 | When no agent is active (none detected and none forced), install fails with `no_agents`, exit 4. |
| C-AGENT-06 | §7.3 | An adapter never modifies files outside `{base}/<name>/`. |
| C-AGENT-07 | §7.2 | The `agent-skills` adapter's `detect()` returns true iff `~/.agents/` exists on the filesystem. |
| C-AGENT-08 | §7.2 | When `agent-skills` is the only active adapter, `crew install` writes to `~/.agents/skills/<name>/` (user scope) or `<project>/.agents/skills/<name>/` (project scope) and the install summary reports the adapter as `agent-skills`. |

#### C-CONC: Concurrency (§14)

| ID | Reference | Assertion |
|---|---|---|
| C-CONC-01 | §14 | A second `crew` process attempting a state-mutating command while another holds the lock waits up to 30 seconds. |
| C-CONC-02 | §14 | If the lock is not acquired within the timeout, the second process exits with `state_locked`, exit 7. |
| C-CONC-03 | §14 | Read-only commands (`list`, `info`, `search`, `agents`, `tap list`, `help`, `version`) do NOT take the state lock. |
| C-CONC-04 | §14 | The lock is released when the holding process exits for any reason (including crash). |

#### C-CLI: CLI contract (§5)

| ID | Reference | Assertion |
|---|---|---|
| C-CLI-01 | §5.1 | Every command listed in §5.1 is present and reachable. |
| C-CLI-02 | §5.5 | `crew help` (and `crew` with no arguments) prints the overview on stdout and exits 0. |
| C-CLI-03 | §5.5 | `crew help <command>` prints per-command help on stdout and exits 0. |
| C-CLI-04 | §5.1 | `crew version` prints a version string and exits 0. |
| C-CLI-05 | §5.2 | `--json` on `list`, `search`, `info`, `agents`, `autoupdate status` produces valid JSON on stdout and no human-readable noise. |
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
- `~/.crew/state.json` contains an entry with `name: "my-skill"` listing `claude-code` in `agents`.

#### Example 2: Install from GitHub pinned to a tag, with subpath

**Setup.** A public GitHub repo `github.com/acme/skills` has a tag `v1.0.0` pointing at a commit where a directory `python/testing/` contains a valid `SKILL.md` with `name: testing`.

**Command.**
```
crew install gh:acme/skills@v1.0.0//python/testing
```

**Expected observable outcome.**
- Exit 0.
- The skill `testing` is installed into every detected agent.
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

#### Example 6: Tap re-expansion on update

**Setup.** A GitHub repo `github.com/with-logic/skills` has no root
`SKILL.md`. Its top level contains two skill directories, `alpha/` and
`beta/`, each with a valid `SKILL.md`.

**Command.**
```
crew install @with-logic/skills
```

**Expected observable outcome.**
- Exit 0.
- An auto tap named `skills` is created (or `skills-2`, etc., if name is taken) with `kind: git`, `registered: false`, `url: https://github.com/with-logic/skills.git`.
- Two skills installed: `alpha` and `beta`. Each state entry has `source.tap = "skills"` (the new auto tap), `explicit: true`, and `path` set to its directory inside the tap.

**Setup continues.** The `with-logic/skills` repo maintainers add a
third directory `gamma/` with a valid `SKILL.md` and push to the
default branch.

**Command.**
```
crew update
```

**Expected observable outcome.**
- Exit 0.
- `gamma` is installed into every agent `alpha` and `beta` were installed into, at the same scope.
- `gamma`'s state entry has `source.tap = "skills"` (the same auto tap as `alpha` and `beta`).
- `alpha` and `beta` are reported as updated or up-to-date per normal §10.1 logic.

**Setup continues.** The maintainers later delete `beta/` from the repo.

**Command.**
```
crew update
```

**Expected observable outcome.**
- Exit 0 (upstream deletion is a soft outcome).
- `beta` is reported as `source_gone`.
- `{agent-base}/beta/` is still present on disk, unchanged.
- `state.json` still contains the `beta` entry.
- The user removes it explicitly with `crew uninstall beta` when they decide to.

### 18.5 Test suite

A conformance test suite, packaged separately from this specification, is the authoritative executable form of these criteria. Until published, each criterion above is sufficient to drive ad-hoc tests by any implementation. The suite when it exists will live at a URL added to this section; it will provide fixtures, a runner, and machine-readable pass/fail output keyed by criterion ID.

### 18.6 Known ambiguities flagged during drafting

Writing out the criteria surfaced a few small holes in the spec. Resolving them:

1. **Exit code for `crew install` with a mix of successes and failures.** §9 says "exit 0 if every skill succeeded in at least one agent; 1 if any skill failed in every agent." This leaves ambiguous the case where some root-listed skills succeeded in ≥1 agent and others failed in every agent. Resolution: exit 1 if any root-listed skill has zero successful agents; exit 0 otherwise. Criteria C-INST-* should be read accordingly.
2. **Content hash of the empty directory.** Sensible per §12.1: with no tuples, the accumulator sees no input and the hash is `sha256:` followed by the SHA-256 of the empty byte string (`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`). Criterion C-HASH-01 fixes this.
3. **Order of dependencies in install.** §9 step 6 says dependencies are resolved, but not installed order. Resolution: dependencies are installed before dependents (topological order). Cycles are permitted by C-DEP-08 — when breaking a cycle, pick any valid order; the outcome is the same.

These resolutions are normative and should be folded into the main spec in the next revision.

## 19. FAQ

1. **Default tap URL and name.** The `core` tap name is fixed in this spec; the URL is implementation-set, though configured in `config.yaml` which is bundled with the app. Once the default tap repo exists, the URL should be added to this document and to the shipped `config.yaml` default.
3. **Project-scope lockfile.** A `crew.lock` at a project's root that `crew install` in that directory restores exactly (npm/bundler style) is an obvious follow-on but out of scope for v1.
4. **Per-agent content overlays.** Some skills might want slightly different instructions per agent. This spec keeps skills agent-agnostic; overlays can be revisited if demand appears.
5. **Renaming on name conflict.** Currently a hard error. An opt-in `--rename-on-conflict` mode could be added later without breaking anything here.
