# Changelog

## [0.10.0] — 2026-06-15

### Added
- Linux is now a supported platform. Homecrew ships Linux x64 and ARM64 release assets, installs through the hosted installer, performs signed self-updates, and runs background autoupdates through systemd user timers.

### Changed
- The website now presents Homecrew as a macOS and Linux tool and uses the refreshed visual system from the public site update.

## [0.9.0] — 2026-05-26

### Added
- Antigravity CLI is now a supported agent. `crew` detects it automatically and resolves user-level skills to `~/.gemini/antigravity-cli/skills/`; project-level installs continue to use `<project>/.agents/skills/`.

### Fixed
- `crew update` no longer reports local path-sourced skills as updated on every run. The new content hash is persisted after each real change, so the next run compares against current bytes instead of stale state.
- The install snippet on the crew website now dynamically renders the latest release version instead of a hardcoded string.

## [0.8.1] — 2026-05-11

### Added
- **Compound Engineering known tap.** EveryInc's Compound Engineering Plugin (`compound-engineering`) is now in the curated registry, contributing 37 skills for spec writing, implementation, code review, debugging, and product workflows. The tap uses a non-standard subpath (`plugins/compound-engineering/skills`) and is pinned to a reviewed commit. It surfaces in `crew search` suggestions, `crew install` hints, and the skill catalog on the crew website.

## [0.8.0] — 2026-05-11

### Added
- Bundled known-tap registry with 255 curated skills across 26 first-party taps (Anthropic, Apollo GraphQL, Azure, Cloudflare, ElevenLabs, Figma, Google Gemini, Hugging Face, OpenAI, PostHog, Stripe, Supabase, and more); no network access required on first run.
- `crew install` now suggests known-tap `crew tap add` commands when a skill name is not found in any configured tap.
- `crew search` appends known-but-untapped registry results (with tap-add commands) after configured-tap results for non-empty queries.
- `crew untap <name>` top-level alias for `crew tap remove <name>`.
- `crew skills` alias for `crew list`; `crew taps` alias for `crew tap list`.
- `--recursive` flag for `crew tap add` and `crew install` to discover skills in non-standard, deeply nested tap layouts; discovery mode is persisted across search, update, and doctor repair.
- Qualified skill selectors (`tap/skill`) now accepted by `crew uninstall`, `crew update`, and `crew info`.
- Signed release checksums: every release ships `SHA256SUMS` + `SHA256SUMS.sig`; both the hosted installer and `crew self-update` verify the RSA/SHA-256 signature before trusting checksums.
- Browsable skill catalog at `/skills` on the crew website, auto-generated from the curated registry.
- CONTRIBUTING.md and SECURITY.md added to the repository.

### Changed
- CLI errors render as readable blocks with an explicit "Next step" instead of single-line messages; common tap, command, install-miss, and empty-search copy reworded for clarity.
- `crew search` installed markers are now source-aware (tap + path), preventing false positives when taps share skill names.
- Install refs are canonicalized to lowercase, making bare, qualified, and namespaced refs case-insensitive.
- `SKILL.md` frontmatter `name` is now the authoritative skill name; source directory name no longer needs to match, and names may begin with a digit.
- Hosted installer and `crew self-update` verify `SHA256SUMS` before replacing the binary on disk.

### Fixed
- Removing or replacing a tap no longer causes skills from the old tap to show as installed in `crew search` results.

## [0.7.0] — 2026-05-06

### Changed

- Rebranded the product from Crew to **Homecrew** across the website, README, CLI help text, installer script, and macOS autoupdate service label (`Homecrew Skill Autoupdate`). The `crew` executable, `~/.crew` directory, `.crew.json`, and `metadata.crew` file names are unchanged.
- Added Logic App, Inc. copyright attribution to the MIT license and package metadata.

## [0.6.0] — 2026-04-23

### Added

- **Namespace grouping.** Tap authors can organize skills under a `skills/<namespace>/` directory. Install a whole namespace (`crew install marketing`), a skill within one (`crew install marketing/email-outreach`), or use the fully-qualified 3-segment form (`crew install acme/marketing/email-outreach`).
- **`--tap`, `--bundle`, `--skill` flags on `crew install`.** Explicitly force how a bare name is interpreted when it could match more than one thing.
- **Interactive ambiguity prompt.** When a name is ambiguous, crew shows a numbered menu on TTY and returns a structured `ambiguous_reference` error with copy-pasteable commands in non-interactive contexts.
- **`skills/` subdirectory support.** Taps whose skills live under a `skills/` subdirectory (rather than the repo root) are now recognized automatically; the `skills/` tree is used exclusively when present.

### Changed

- Install refs now support a 3-segment form: `<tap>/<namespace>/<skill>`. Existing 1- and 2-segment refs are unchanged.
- README updated with a Namespaces section documenting the new directory layout and install forms.

## [0.5.0] — 2026-04-20

### Changed

- Hero terminal on the marketing site now displays explicit per-agent install rows (e.g. `claude-code`, `codex`, `gemini-cli`) plus a summary line, making crew's multi-agent install visible at a glance.
- Site copy and README reframed around team sharing and user value: new tagline, reworked hero lede and terminal demo, value-first headlines, and four new FAQ entries covering comparisons with skills.sh / `gh skill`, private team repos, skill dependencies, and multi-agent install.

## [0.4.0] — 2026-04-20

### Added

- `crew self-update` command: upgrade the `crew` binary from GitHub releases. `--check` reports available updates without downloading; `--version <tag>` pins a release; `--force` reinstalls. Atomic swap — the running process is unaffected.
- Background new-version notice: each invocation spawns a detached subprocess (at most once per 24 h) to check for newer releases and prints a one-line stderr nudge when one exists. Suppressed in CI, non-TTY stderr, `--json`, `--quiet`, and via `CREW_NO_UPDATE_CHECK=1`.
- `agent-skills` fallback adapter: installs skills to `~/.agents/skills/` for any SKILL.md-compliant agent not in crew's known adapter list. Activates only when no other adapter is detected; shows up in `crew agents`.
- Installer (`install.sh`) now runs `crew update` after placing the binary to pre-fetch the default `core` tap, so `crew search` and `crew list-skills` work immediately on a fresh install. Network failure is non-fatal.
- Site command reference now includes `crew tap update`, `crew autoupdate disable`, and `crew self-update`.

### Changed

- Config-validation and `--agent` resolver error messages changed from "target" / "unknown target" / "known targets" to "agent" to match the rest of the CLI.
- `crew install` help summary broadened to reflect 15+ supported agents.
- README: added curl installer snippet at the top and a `crew self-update` upgrade section.
- Site `crew autoupdate enable` demo output corrected to match real CLI output.

### Fixed

- PRD / `state.json` marker field name corrected from `adapters` to `agents` (wire format was already `agents`; the spec and conformance criteria were wrong).

## [0.3.1] — 2026-04-20

### Added
- **17 agent adapters** — crew now installs skills into every major agent coder on agentskills.io: Amp, AutoHand, Claude Code, Codex, Command Code, Cursor, Factory, Gemini CLI, GitHub Copilot, Goose, Junie, Kiro, Mistral Vibe, Nanobot, OpenCode, Pi, and Roo Code.
- **`crew agents` command** (replaces `crew targets`) — lists detected agent coders with human-readable status; `crew agents enable <name>` / `crew agents disable <name>` force or suppress individual agents.
- **`--agent <name>` flag** on `crew install` / `crew uninstall` — scope an operation to one specific agent.
- **Subpath taps** — point a tap at a subdirectory of a monorepo: `crew tap add @org/repo//skills`. Skills are referenced the same way regardless.
- **`crew tap update [<name>]`** — refresh tap clones without touching installed skills.
- **`crew tap add` is now idempotent** — re-adding the same URL exits 0. Duplicate-name conflicts show a copy-pasteable remedy.
- **`crew tap add` is now transactional** — a failed clone leaves no config entry; retry from a clean slate.
- **Whole-tap installs** — `crew install <tap-name>` installs every skill in the tap and opts you into tracking future additions on `crew update`.
- **Dependency closure on targeted update** — `crew update <name>` now pulls in every skill that `<name>` transitively requires, so dep-tree roots stay coherent.
- **Scoped fetches on targeted update** — `crew update <name>` only refreshes the taps backing named entries; unrelated taps are left untouched.
- **Autoupdate logging** — when autoupdate is running on a schedule, each run appends a timestamped exit-status line to `~/.crew/logs/autoupdate.log`. `crew autoupdate status` surfaces last-run time and exit code.
- **Autoupdate pinned to `CREW_HOME`** — scheduled runs now always use the same crew home directory that `crew autoupdate enable` was called from.
- **`crew cache clean` freed-space summary** — reports bytes reclaimed and orphan count; prints a friendly "nothing to clean" when the cache was already empty.
- **Login Items attribution** — the background autoupdate agent now appears as "Crew Skill Autoupdate" in macOS System Settings → Login Items instead of Bun's code-signing identity.
- **Machine-readable `--json` help** — `crew help --json` and `crew help <command> --json` emit structured JSON for tooling.
- **`@owner/repo` shorthand** — an alias for `gh:owner/repo` in install references.
- **`crew tap <ref>` shorthand** for `crew tap add`.
- **`source_gone` soft outcome** — when a skill is deleted upstream, `crew update` records it and exits 0 rather than failing; the local install is preserved until you explicitly remove it.

### Changed
- **`crew targets` → `crew agents`** everywhere: command name, flag names (`--target` → `--agent`), config keys (`forced_targets` / `disabled_targets` → `forced_agents` / `disabled_agents`), and error codes (`no_targets` → `no_agents`).
- **Taps replace bundles** — every installed skill now belongs to exactly one tap. Multi-skill installs create an auto-tap implicitly; auto-taps are garbage-collected when their last skill is uninstalled. Registered taps (added via `crew tap add`) stick around even when empty. `crew tap add <same-url>` promotes an auto-tap to registered without re-cloning.
- **Shared install path for compatible tools** — Cursor, Command Code, Gemini CLI, Goose, OpenCode, Pi, and GitHub Copilot all read `~/.agents/skills/`; crew writes one physical copy there and reports per-agent outcomes. Codex moved from `~/.codex/skills/` (which Codex never actually read) to `~/.agents/skills/`.
- **`crew update` tracks tap vs. individual installs** — only whole-tap installs opt into auto-expansion of new upstream skills on update. Installing a single skill (`crew install <tap>/<skill>`) no longer silently grows into the entire tap on the next update.
- **Read-only commands no longer hit the network** — `crew search`, bare-name `crew install`, and qualified `<tap>/<skill>` install use cached clones; fetches happen only in `crew update`, `crew tap update`, `crew tap add`, and `crew install <git-url>`.
- **Polished output across every command** — structured headers, checkmarks, aligned columns, human time-ago timestamps, and plain-English status words replace raw code tokens throughout `crew install`, `crew uninstall`, `crew update`, `crew list`, `crew info`, `crew search`, `crew tap`, `crew agents`, `crew autoupdate`, `crew cache`, and `crew doctor`.
- **`crew doctor` output grouped by area** — findings are bucketed into Agents / State / Autoupdate / Config / Storage with translated human phrases; repeated findings collapse into a count with a short sample and "…and N more".
- **`crew list` project-scope annotations** — skills installed in specific projects show `└ in <path>` sub-rows; "all agents" collapses the common case.
- **`crew info` multi-location block** — shows every location a skill is installed in, distinguishing user scope from project paths.
- **`crew update` project-scope tags** — per-skill rows for project installs include a dim `(in <path>)` tag so repeated names across projects stay distinguishable.
- **Invalid subcommand args are errors** — `crew tap knasdjnadkj` now exits with a clear error message; bare `crew tap` still shows the help page.
- **Humanized help docs** — every help page rewritten to lead with outcomes and user-facing vocabulary ("your collections", "agent coders") rather than internal implementation terms.
- **`crew autoupdate status` interval rendering** — "every 4 hours", "every 30 minutes", "every day" instead of raw seconds.
- **Default `core` tap URL** updated to `https://github.com/with-logic/crew-skills.git` (only affects first-run config creation; existing installs are unaffected).

### Fixed
- **`crew tap add` collision prompt uses `<tap-name>` placeholder** instead of `<your-name>`, matching CLI vocabulary.
- **Autoupdate launchd agent labeled correctly** in macOS Login Items (was showing Bun's signer identity).
- **`crew update` no longer spuriously expands single-skill installs** into the whole tap on the next run.
- **Transitive dependency edges preserved across shared-dep installs** — installing a skill that shares a dep with an already-installed skill no longer drops the existing `required_by` edge, preventing incorrect prune behavior on later uninstalls.

All notable changes to crew are documented in this file. The format
is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and crew adheres to [Semantic Versioning](https://semver.org/).
