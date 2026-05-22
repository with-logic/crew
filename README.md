<div align="center">
  <img src="assets/logo.png" alt="" width="96" height="96" />
  <h1>Homecrew</h1>
</div>

**A package manager for [agent skills](https://agentskills.io/specification).**

Install a skill once and `crew` copies it into every supported coding agent.
Share team skills through git, keep them reviewed in PRs, and roll updates out
without hand-copying folders between tools.

Homecrew is an open-source project by [Logic, Inc](https://logic.inc).

```
crew tap add @acme/skills
crew install acme/team-baseline
crew autoupdate enable
```

Three commands. A new hire goes from empty laptop to "they know how we ship
code" in about two minutes — across Claude Code, Codex, Cursor, Gemini CLI,
GitHub Copilot, Goose, and [every other supported agent](#agents).

---

## Why Homecrew

> **Your team has great skills. You should have all of them.**

Right now, the best prompts and agent playbooks either sit on one person's
machine or get copy-pasted through gists and Slack messages that nobody keeps
current. Homecrew gives them install commands, source tracking, and a reliable
update path.
Anyone can publish. Anyone can install.

- **Publish a skill.** Any git repo with a `SKILL.md` at the root is
  installable. Push to GitHub, send the link — `crew install @you/skill` and
  your friend has it.
- **Your skills repo is your registry.** Point Homecrew at a shared repo — a
  _tap_ — and everyone on the team pulls the same skills, reviewed in PRs,
  versioned in git. Onboarding is one command.
- **Discover what actually works.** Browse the default `core` tap and trusted
  known taps for useful starting points. Nothing installs until you ask.

## What is Homecrew?

Homecrew turns **any git repo** into a registry of agent skills. Push a `SKILL.md`.
Share a link. That's the package index. No servers, no accounts, no hosted
registry.

- **no hosted registry** · git is the backend
- **no account** · nothing to sign up for
- **no telemetry** · Homecrew never phones home

Homecrew is an open-source project by [Logic, Inc](https://logic.inc). Logic is
a platform for building and operating fleets of production agents reliably at
scale.

## Install

```
curl -fsSL https://crew.logic.inc/install.sh | sh
```

A single binary. Drops itself at `~/.local/bin/crew`, plus whatever skills you
install go under `~/.crew/` and into your agents' skills directories. Nothing
else. The installer verifies the signed release checksum file, then verifies
the downloaded binary against it before installing. Safe to re-run — upgrades
in place. Set `CREW_INSTALL_PREFIX` to pick a different location.

Uninstall with `rm -rf ~/.crew && rm ~/.local/bin/crew`.

**Requires:** macOS 13+ (Apple Silicon or Intel), `git` on `PATH`. The
installer also uses macOS-standard `curl`, `shasum`, and `openssl`.

## How it works

Five everyday motions. No manifest to learn, no plugins to configure —
commands that do what they say, across every agent you use.

1. **Find great skills.** `crew search` across the default `core` collection
   and anything else you've added. It can also point you to known taps you
   haven't added yet.
2. **Tap into more sources.** A _tap_ is any git repo full of skills. Add
   your team's repo, a community collection, your own private one —
   `crew tap add` once, and every skill inside is searchable and installable.
3. **Install into every agent.** One `crew install` copies the skill into
   Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot, Goose, and every
   other supported agent on your machine. If the name is only in a known tap,
   Homecrew shows the tap to add first.
4. **Dependencies, handled.** Skills can depend on other skills. Homecrew walks
   the graph and installs everything they need. A single "team baseline"
   meta-skill can pull in a dozen others in one command.
5. **Stay current automatically.** `crew update` pulls the latest versions
   of everything. Flip on autoupdate and a background job keeps every agent
   fresh.

## Skill references

A reference is anything you can hand to `crew install` — and anything another
skill can list as a dependency. Three shapes:

| Kind | Example | What it is |
|---|---|---|
| **Tap source** | `crew install founding-engineer` | A skill, namespace, or tap known to a configured tap. Bare names search every tap, including the default `core` tap. Qualify with `tap/skill`, `tap/namespace/skill`, or `namespace/skill`. Pin with `@v1.0`. If a miss exactly matches a known-but-untapped source, Homecrew suggests the `crew tap add` command. |
| **Git source** | `crew install @acme/skills@v1.2.0//engineers/founding` | Any reachable git URL. `@owner/repo` is GitHub shorthand; full `https://` and `git@` URLs work too. Append `@ref` to pin, `//subpath` to scope. |
| **Local path** | `crew install ./my-skill` | A directory on your machine. Detected by a leading `./`, `../`, `/`, or `~`. |

Run `crew help install` for the full grammar.

## A day with Homecrew

Six commands that cover 90% of needs.

```
# Find a skill across every tap you've added.
$ crew search engineer
3 matches for "engineer"

  core
    founding-engineer  Ship like a founding engineer: bias to action, small PRs.
    staff-engineer     Design docs, RFC etiquette, cross-team technical leadership.

  acme
    platform-engineer  Team conventions for infra work and on-call handoffs.

# Install one — it lands in every agent on your machine.
$ crew install founding-engineer
✓ founding-engineer@a1b2c3d installed in 5 agents

# Install straight from a repo, pinned to a tag, at a subpath.
$ crew install @acme/skills@v1.2.0//engineers/founding

# See what's installed.
$ crew list
Installed skills (3)
  founding-engineer   core         a1b2c3d   5 agents
  code-review         core         d4e5f6a   5 agents
  platform-engineer   acme@v1.2.0  9c8b7a6   5 agents

# Pull the latest versions of everything.
$ crew update
✓ founding-engineer a1b2c3d → e8f9a01 (5 agents)
✓ code-review up to date
✓ platform-engineer pinned @ v1.2.0, skipped

# Run crew update in the background every 4 hours.
$ crew autoupdate enable
✓ Autoupdate enabled
  checking every 4 hours
```

## Command reference

Every command accepts `--scope`, `--agent`, `--dry-run`, `--json`, `--quiet`,
`--verbose`, `--yes`, and `--force` where they apply. Run `crew help <command>`
for examples.

When a command asks for an installed skill name, you can use the bare name
(`pdf`) or a tap-qualified name (`anthropic/pdf`).

**Managing skills**

| Command | What it does |
|---|---|
| `crew install <ref>…` | Install one or more skills into every detected agent; on misses, may suggest skills from trusted taps you haven't added yet. |
| `crew uninstall <name>…` | Remove installed skills from every agent they were installed into. |
| `crew update [<name>…]` | Update all installed skills, or only those named. Pinned SHAs are skipped unless `--force`. |
| `crew list` | List installed skills, grouped by scope, with sources and resolved SHAs. |
| `crew skills` | Alias for `crew list`. |
| `crew info <ref-or-name>` | Show details for an installed skill or one available in a tap. |

**Discovery**

| Command | What it does |
|---|---|
| `crew search [<query>]` | Case-insensitive substring match across every configured tap. With no query, lists every installable skill; exact installed matches are marked `✓`. With a query, also suggests matching known taps to add. |
| `crew tap add <url-or-path> [name]` | Add a registry from a git source or local path. Name defaults to the repo/path name. Add `--recursive` for trusted repos with non-standard nested layouts. |
| `crew tap remove <name>` | Delete a local tap clone and drop it from config. |
| `crew tap list` | Print each tap's name, kind/status, source target, recursive discovery marker when set, and last-fetched timestamp for git taps. |
| `crew taps` | Alias for `crew tap list`. |
| `crew untap <name>` | Alias for `crew tap remove <name>`. |

**Agents & automation**

| Command | What it does |
|---|---|
| `crew agents` | List detected agents and whether they're enabled, disabled, or forced. |
| `crew agents enable <name>` | Force-enable an agent even if auto-detection misses it. |
| `crew agents disable <name>` | Skip this agent on all install and update operations. |
| `crew autoupdate enable [--interval]` | Install a launchd user agent that runs `crew update --quiet` on an interval (default 4h). |
| `crew autoupdate status` | Whether active, last run, next run, configured interval. |

**Housekeeping**

| Command | What it does |
|---|---|
| `crew doctor [--verify] [--repair]` | Check integrity between state, markers, and agent directories. `--repair` fixes recoverable drift without ever touching customized files. |
| `crew cache clean` | Remove ephemeral caches and unreferenced store entries. |
| `crew self-update [--check]` | Replace the running binary with the latest verified release. `--check` reports without downloading. |

**Meta**

| Command | What it does |
|---|---|
| `crew help [<command>]` | Overview or per-command help, with realistic examples. |
| `crew version` | Print the version string and exit. |

## Taps: a tap is just a git repo full of skills

No hosted registry, no server, no account. Your team's skills repo _is_ the
package index. Fork it, branch it, review it in pull requests, and
`crew update` pulls it like any other.

```
acme-skills/
├── README.md              # optional, informational
├── founding-engineer/
│   └── SKILL.md
├── code-review/
│   └── SKILL.md
├── platform-engineer/
│   ├── SKILL.md
│   └── playbook.md
└── docs/
    └── contributing.md    # ignored by crew search
```

Any top-level directory with a valid `SKILL.md` is a skill; the install name
comes from the `name` field inside `SKILL.md`. Everything else is ignored.
Prefer to keep skills under a `skills/` directory? That works too — if
`skills/` exists at the root, Homecrew indexes its children instead of the root.
For trusted repos that don't follow either layout, `crew tap add --recursive`
keeps the standard layouts first and falls back to bounded recursive discovery.

### Namespaces

Group related skills into a **namespace** by putting them under one directory
inside `skills/`:

```
acme-skills/
└── skills/
    ├── marketing/
    │   ├── email-outreach/SKILL.md
    │   └── social-posts/SKILL.md
    └── engineering/
        ├── code-review/SKILL.md
        └── pr-descriptions/SKILL.md
```

Then:

- `crew install marketing` — installs every skill in the namespace
- `crew install acme/marketing/email-outreach` — picks one skill unambiguously
- `crew install marketing/email-outreach` — also picks one skill (when `marketing`
  is a namespace in exactly one configured tap)

When a name could mean more than one thing (a tap, a skill, a namespace),
Homecrew asks — or takes `--tap`, `--bundle`, or `--skill` to force one
interpretation.

## For teams

- **One repo, every laptop.** Point Homecrew at a private GitHub repo once. Every
  new skill that lands on `main` shows up in everyone's `crew search`. No
  internal tool to build. No package server to run.
- **Onboarding, one command.** Publish a `team-baseline` meta-skill that
  depends on everything you consider standard — review checklists, on-call
  playbooks, style guides. A single `crew install` catches new hires up.
- **Review in PRs.** Propose a change to the team's prompt library the same
  way you propose a change to anything else — a branch, a PR, comments,
  squash-merge.
- **Private by default.** Homecrew clones taps with whatever git credentials you
  already have. Your private repo stays private — Homecrew never phones home.

## Safety model

Homecrew is a file copier. It doesn't execute your skills, your taps, or anything
they pull in. It leaves a paper trail you can audit, and it refuses to
overwrite anything it didn't install itself.

- **No symlinks, ever.** Every install is a file copy. Upgrades atomically
  rename into place. You can `rm -rf` a skill with no side effects.
- **Never executes anything.** No post-install hooks, no build steps, no
  user-supplied scripts run by Homecrew. It copies files. Agents are what run
  them.
- **Tracks what it wrote.** Every installed skill gets a `.crew.json` marker
  with its source, ref, SHA, and content hash. Removing a skill removes only
  what Homecrew created.
- **Detects your edits.** On re-install, Homecrew re-hashes the destination. If
  you've customized a managed skill, the install is refused — unless you pass
  `--force`.
- **Concurrency-safe.** Every write takes an advisory lock on
  `state.json.lock`. The background autoupdater and your interactive shell
  can't stomp on each other.
- **Reproducible versions.** Tags and branches resolve to full 40-char commit
  SHAs at install time. The SHA — not the tag — is what's recorded.
- **Owns only `~/.crew/`.** Homecrew writes to its own directory and to each
  agent's skills directory. It won't touch your global `AGENTS.md`, settings
  JSON, or anything else.
- **Auditable.** `crew doctor` reconciles state, markers, and agent
  directories. `--repair` fixes drift without ever touching files you edited.

## Anatomy of a skill

No proprietary manifest. Just `SKILL.md`. Homecrew reads the [Agent Skills
specification](https://agentskills.io/specification) directly. Homecrew-specific
metadata lives under `metadata.crew` so the skill stays fully spec-compliant —
readable by any agent, not just the ones Homecrew installs into.

```yaml
---
name: founding-engineer
description: Ship like a founding engineer. Use when scoping, writing,
  or reviewing code at an early-stage company.
license: MIT
metadata:
  crew:
    homepage: https://github.com/jane/founding-engineer
    dependencies:
      - code-review
      - @acme/skills//code-review@v1.0
---

# Founding engineer mode

Bias to action. The second-best solution shipped this week beats the
perfect one shipped next month. Prefer small, obvious PRs over clever
ones. Delete code aggressively. Write the boring version first.

# ...the rest of the skill body is whatever the agent needs to read.
```

- **`homepage`** — shown by `crew info` so people can find your docs.
- **`dependencies`** — other skills to pull in (by name, git URL, or path).
  Walked transitively.
- **versions** — every install pins to a git commit SHA. Pin to a tag with
  `@v1.0`.

## Agents

Works with every Mac agent that speaks the spec. Any agent coder that reads
the [Agent Skills spec](https://agentskills.io/specification) is a valid
target. Homecrew auto-detects the ones you already have and quietly skips the rest.

Amp · Antigravity CLI · Autohand · Claude Code · Codex · Command Code ·
Cursor · Factory ·
Gemini CLI · GitHub Copilot · Goose · Junie · Kiro · Mistral Vibe · Nanobot ·
OpenCode · pi · Roo Code

Don't see yours? If it reads the spec path (`~/.agents/skills/`), the
`agent-skills` adapter already covers it — Homecrew detects it whenever
`~/.agents/` exists and writes there alongside any tool-specific adapters.
If it reads a tool-specific path, writing the adapter usually takes a minute —
see [§7.1](./PRD.md#71-adapter-operations) in the PRD.

## FAQ

**How is this different from `skills.sh` or `gh skill`?** They're great
projects too — different takes on the same problem. Homecrew leans hard into team
workflows. A few things that are particular to Homecrew:

- **Taps.** Point Homecrew at a git repo once; every skill in it is searchable
  and installable. You can even just install the entire tap, and as skills
  are added to that tap, they'll get added to your machine when you run
  `crew update`.
- **Skill dependencies.** Skills can depend on other skills. Homecrew walks the
  graph and installs everything they need. A single `team-baseline` meta-skill
  can pull in a dozen others.
- **Background autoupdate.** `crew autoupdate enable` sets up a launchd agent
  that keeps every skill current.
- **Local-edit protection.** Homecrew hashes what it installs and refuses to
  clobber your edits on re-install — so you can tweak a skill in place and
  not lose your work the next time something updates.
- **Private-first.** Homecrew clones taps with whatever git credentials are on
  the machine — SSH, GitHub tokens, Enterprise hosts. No hosted middleman.

**How does Homecrew work with a private team skills repo?** Same as any private
git repo you clone. Add it as a tap: `crew tap add git@github.com:acme/skills.git`.
Homecrew uses whatever credentials your git already has — SSH keys, personal
access tokens, GitHub Enterprise hosts. Nothing gets uploaded anywhere;
there's no intermediary registry. Every `main`-merge automatically becomes
installable team-wide. Pair it with `crew autoupdate enable` and everyone
stays in sync without thinking about it.

**Skills can depend on other skills?** Yes. A `SKILL.md`'s frontmatter can
list `metadata.crew.dependencies` — an array of skill references in any form
the CLI accepts. Homecrew walks the graph transitively and installs every dep
before the parent. The most useful pattern is a "meta-skill" — a single skill
whose body describes a team's conventions and whose `dependencies` list pulls
in the real working skills. Onboarding a new engineer becomes one command.

**Does one install really cover every coding agent?** Yes. `crew install
founding-engineer` copies the skill into Claude Code, Codex, Cursor, Gemini
CLI, GitHub Copilot, Goose, and every other supported agent that's detected
on the machine. Agents that share a convention (most read `~/.agents/skills/`)
get one physical copy; the install summary reports each adapter by name.
Don't have one of them? It's skipped silently. Add the agent later, run
`crew update`, and it catches up.

**Why copies instead of symlinks?** Symlinks break the moment two agents
resolve a skill differently, or a user pins one agent to an older ref. Copies
are dumb, predictable, and safe: each agent's directory is self-sufficient.
The marginal disk cost is negligible — skills are markdown.

**What happens if I edit an installed skill?** Homecrew records a content hash in
the `.crew.json` marker at install time. On the next `crew install` or
`crew update`, it recomputes the hash. If it differs, Homecrew refuses to
overwrite your changes and reports `customized`. Pass `--force` to override,
or copy your edits into a new skill and install that instead.

**How do I add support for a new agent?** Write an adapter — six methods:
`detect`, `user_path`, `project_path`, `install`, `uninstall`,
`list_installed`. Register it. The install pipeline is tool-agnostic; adapters
just know where the files go.

**Is there a hosted registry?** No. The default tap `core` is a plain git
repo. Anyone can host a tap — your team, your company, yourself. Homecrew never
phones home.

**How does `crew update` know when to skip a skill?** Skills pinned to an
exact SHA are skipped unless `--force`. Skills pinned to a tag are
re-resolved: if the tag moved and `--force` is given, the new commit is
installed. Everything else updates to whatever the ref resolves to now.

**What about Linux? Windows?** Future work. The v1 spec is macOS-only because
launchd is the autoupdate mechanism and each agent adapter encodes
platform-specific paths. Nothing in the core design is Mac-specific; it's a
scope decision, not a technical one.

**Can a skill depend on another skill in a different tap?** Yes. Dependency
references are full skill references — any form the CLI accepts.

**Does `project` scope interact with git?** Not automatically. `--scope
project` writes into the agent's project-local skills directory relative to
your current working directory. Whether you commit that directory is up to
you.

---

## Development

The rest of this document is for people working on `crew` itself. If you just
want to use it, stop here.

### Requirements

- [Bun](https://bun.sh) — the only runtime. Homecrew ships as a single bundled
  Mach-O executable produced by `bun build --compile`.
- `git` on `PATH`.

### Setup

```
bun install
bun run src/index.ts version          # run from source
bun run build                         # produce dist/crew
```

### The check gate

`bun run check` is the CI-style gate — run it before pushing. If it's clean,
CI is clean.

```
bun run check                         # typecheck + lint + test
bun run typecheck                     # tsc --noEmit
bun run lint                          # biome check (lint + format)
bun run lint:fix                      # biome check --write (auto-fix)
bun run format                        # biome format --write
bun test                              # run the full suite with coverage
```

`bun test` always runs with coverage. The suite exits non-zero if coverage
drops below 100% on either lines or functions — see `bunfig.toml`. This is
enforced in CI.

### Installing your local build

```
bun run install-bin                   # build + copy to ~/.local/bin/crew
bun run uninstall-bin                 # remove it
```

Override the destination with `CREW_INSTALL_PREFIX`:

```
CREW_INSTALL_PREFIX=/opt/homebrew/bin bun run install-bin
```

Use `CREW_HOME=/tmp/xyz dist/crew install …` to try the compiled binary
without disturbing your real `~/.crew`.

### Contributing

Please read [`CONTRIBUTING.md`](./CONTRIBUTING.md) first. If you're changing
code, also read [`CLAUDE.md`](./CLAUDE.md) — it's the implementation briefing
for anyone (human or AI) working in this repository. Highlights:

- [`PRD.md`](./PRD.md) is the spec and the contract. If a change is
  observable by an external observer (new command, new flag, new error
  name, schema bump, …), **update the PRD first**, then match `src/` and
  `tests/` to it in the same commit.
- Every file stays under 200 lines. Group related files into directories,
  not with filename prefixes.
- Every file opens with a docstring describing what it does and the PRD
  section(s) it implements.
- Named exports only. No default exports.
- Tests use real filesystems under `os.tmpdir()` and real `git` subprocesses
  against local `file://` repos. Mocks are confined to two boundaries:
  `src/git/exec.ts` and `src/autoupdate/launchd.ts`.
- Errors are `CrewError(code, message, details)` with a stable machine name
  (PRD §13) and a fixed exit code (PRD §15). Never `throw new Error(...)`
  for a user-visible failure.

### Security

Please report security issues privately to security@logic.inc. See
[`SECURITY.md`](./SECURITY.md) for scope and reporting details.

### License

MIT. See [`LICENSE`](./LICENSE).
