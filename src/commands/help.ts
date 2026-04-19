/**
 * `crew help [<command>]` and `crew version`.
 *
 * Help for a CLI that users type from memory has two jobs:
 *
 *   1. Orient someone who typed `crew` with no idea what it does.
 *   2. Answer "how do I do X" for someone who knows crew roughly but
 *      forgot the exact flag.
 *
 * The overview covers (1) with a one-line pitch, three "getting
 * started" commands, and a grouped command list. Per-command help
 * covers (2) with a synopsis, a short paragraph of what-and-why, the
 * flags that matter for that command, and two or three realistic
 * examples. Examples are the most valuable part — they show the
 * shape of a real invocation, not just the grammar.
 */

import { CREW_VERSION } from "../core/version.ts";
import type { CommandContext, CommandOutput } from "./types.ts";

/** A free-form extra section: heading plus a mix of prose lines and literal blocks. */
interface HelpSection {
  /** Section heading (rendered in uppercase, no trailing colon — matches USAGE/FLAGS/etc.). */
  readonly heading: string;
  /**
   * Body lines. Strings are word-wrapped prose. Objects with `literal: true`
   * are rendered verbatim (preserving indentation, line breaks) — use for
   * code snippets, YAML fragments, directory trees.
   */
  readonly body: readonly (
    | string
    | { readonly literal: true; readonly lines: readonly string[] }
  )[];
}

/** Structured help for one command. Rendered by `renderCommand`. */
interface CommandHelp {
  /** Command name as typed. */
  readonly name: string;
  /** Single-line usage synopsis. */
  readonly synopsis: string;
  /** One to three lines of prose — what the command does, why you'd reach for it. */
  readonly summary: readonly string[];
  /** Flags that are meaningful for this command (global flags omitted unless relevant). */
  readonly flags?: readonly { readonly flag: string; readonly description: string }[];
  /** Concrete example invocations with a one-line gloss. */
  readonly examples?: readonly { readonly command: string; readonly description: string }[];
  /** Related commands the user might want next. */
  readonly seeAlso?: readonly string[];
  /** Optional "NOTES" section — gotchas, spec pointers, platform caveats. */
  readonly notes?: readonly string[];
  /**
   * Optional extra sections rendered before NOTES. Use for guides that
   * don't fit a single NOTES bullet — tap authoring, skill structure, etc.
   */
  readonly sections?: readonly HelpSection[];
}

/** How commands are grouped in the overview. */
interface CommandGroup {
  readonly title: string;
  readonly commands: readonly string[];
}

const GROUPS: readonly CommandGroup[] = [
  { title: "Managing skills", commands: ["install", "uninstall", "update", "list", "info"] },
  { title: "Discovery", commands: ["search", "tap"] },
  { title: "Agents & automation", commands: ["targets", "autoupdate"] },
  { title: "Housekeeping", commands: ["doctor", "cache"] },
  { title: "Meta", commands: ["help", "version"] },
];

const COMMANDS: Record<string, CommandHelp> = {
  install: {
    name: "install",
    synopsis: "crew install <ref> [<ref>...]",
    summary: [
      "Install one or more skills into every detected agent coder.",
      "A <ref> is a skill name, a local path, a git URL, or a host shorthand. See REFERENCE FORMS below for every shape crew accepts.",
      "Install from a directory with no root SKILL.md and crew walks one level deep, installing every skill it finds — that's a 'bundle', and `crew update` will pick up new siblings added later.",
    ],
    flags: [
      {
        flag: "--scope {user,project}",
        description: "Install globally (default) or under the current directory.",
      },
      {
        flag: "--target <name>",
        description: "Restrict to named target(s). Repeatable. See `crew targets`.",
      },
      { flag: "--dry-run", description: "Show what would be installed without writing files." },
      {
        flag: "--force",
        description:
          "Overwrite a customized or untracked destination. NEVER overrides a name conflict, invalid skill, or dependency conflict.",
      },
      { flag: "--json", description: "Emit a structured install summary." },
    ],
    examples: [
      {
        command: "crew install python-testing",
        description: "Install a skill from your configured taps.",
      },
      {
        command: "crew install @with-logic/skills",
        description:
          "Install every skill in a GitHub repo (bundle). New siblings are picked up on next update.",
      },
      {
        command: "crew install gh:acme/skills@v1.2.0//python/testing",
        description: "Install one skill from a tagged GitHub repo at a subpath.",
      },
      {
        command: "crew install ./my-skill",
        description: "Install a skill from a local directory.",
      },
      {
        command: "crew install --scope project team/conventions",
        description: "Install only into the current project directory.",
      },
      {
        command: "crew install --dry-run --target claude-code python-testing",
        description: "Preview what would happen in Claude Code, write nothing.",
      },
    ],
    sections: [
      {
        heading: "Reference forms",
        body: [
          "Everywhere crew accepts a skill reference (the argument to `install`, an entry in `metadata.crew.dependencies`, a dep in a SKILL.md), the same set of shapes is understood:",
          {
            literal: true,
            lines: [
              "Tap (skill name in a configured registry)",
              "  python-testing                     Bare name; searched across every tap.",
              "  core/python-testing                Qualified to the `core` tap.",
              "  core/python-testing@v1.0.0         Qualified and pinned to a tag.",
              "",
              "Local path (expanded at parse time)",
              "  ./my-skill                         Relative to cwd.",
              "  ../sibling/my-skill",
              "  /abs/path/my-skill",
              "  ~/code/team-skills/python-testing  Tilde expands to $HOME.",
              "",
              "Git URL (any reachable git remote)",
              "  https://github.com/acme/skills.git",
              "  https://gitlab.com/acme/skills",
              "  git@github.com:acme/skills.git     SSH style.",
              "  ssh://git@host/owner/repo.git",
              "  file:///abs/path/to/local.git      Local repo; handy for testing.",
              "",
              "Host shorthand (expands to an https URL)",
              "  gh:acme/skills                     → https://github.com/acme/skills.git",
              "  gl:acme/skills                     → https://gitlab.com/acme/skills.git",
              "  bb:acme/skills                     → https://bitbucket.org/acme/skills.git",
              "  @acme/skills                       → same as gh:acme/skills (GitHub alias).",
            ],
          },
          "Any git-shaped reference can carry a `@<ref>` tail to pin a tag, branch, or commit SHA, plus a `//<subpath>` to point at a directory inside the repo. The two combine — ref comes first:",
          {
            literal: true,
            lines: [
              "gh:acme/skills@v1.2.0                    Tag.",
              "gh:acme/skills@main                      Branch (follows the tip).",
              "gh:acme/skills@a1b2c3d                   Commit SHA (full or short).",
              "gh:acme/skills//python/testing           Subpath at HEAD.",
              "gh:acme/skills@v1.2.0//python/testing    Tag + subpath.",
              "@acme/skills@v1.0.0                      Works with leading-@ too.",
            ],
          },
          "A git source pointing at a directory with no root SKILL.md is a bundle — crew walks one level deep and installs every skill it finds, and `crew update` picks up new siblings added upstream. Path sources never auto-expand on update; rerun `crew install` to catch new local siblings.",
        ],
      },
    ],
    notes: [
      "Pinning: a `@<sha>` or `@<tag>` ref marks the install as pinned — `crew update` leaves it alone unless you pass `--force`.",
      "Disambiguation: bare names go to taps. Anything starting with `./`, `../`, `/`, `~`, `https://`, `git@`, `ssh://`, `file://`, `gh:`/`gl:`/`bb:`, or `@<owner>/<repo>` is a git-or-path source. A ref that contains `//` is always git (subpath syntax is git-only).",
    ],
    seeAlso: ["uninstall", "update", "info", "search"],
  },

  uninstall: {
    name: "uninstall",
    synopsis: "crew uninstall <name> [<name>...]",
    summary: [
      "Remove installed skills from every agent coder crew put them in.",
      "Sibling skills and anything crew didn't install are left untouched. Transitively-installed dependencies are kept unless you pass `--prune`.",
      "`--target <name>` restricts removal to the named targets — other targets keep their installs, and the state entry survives with a reduced target list.",
    ],
    flags: [
      {
        flag: "--scope {user,project}",
        description: "Which scope to remove from (default user).",
      },
      {
        flag: "--target <name>",
        description:
          "Remove only from the named target(s). Repeatable. Other targets keep their copy. If this empties the state entry's targets, the entry is removed as with a full uninstall.",
      },
      {
        flag: "--prune",
        description:
          "After removing the named skills, also remove any dependency that's no longer required by anything and wasn't installed directly. Like `apt autoremove`.",
      },
      {
        flag: "--force",
        description:
          "Treat a not-installed skill as a no-op. Also allows removing a destination whose marker was tampered with.",
      },
    ],
    examples: [
      {
        command: "crew uninstall python-testing",
        description: "Remove a skill from every target it was installed in.",
      },
      {
        command: "crew uninstall --target codex python-testing",
        description: "Remove from Codex only; keep it in Claude Code and Gemini CLI.",
      },
      {
        command: "crew uninstall --prune python-testing",
        description: "Remove it and any dependency orphans it leaves behind.",
      },
      {
        command: "crew uninstall --scope project python-testing",
        description: "Only remove the project-scope copy.",
      },
    ],
    notes: [
      "`--prune` never removes a skill you installed directly (`explicit: true` in state.json) — only transitive deps. It also doesn't cascade through a partial `--target` removal: if the skill is still installed somewhere after the run, its deps are still required.",
      "`--force` doesn't let you remove things outside `{agent-base}/<skill-name>/` — those aren't crew's to touch.",
      "`--target <name>` naming a target the skill isn't installed in is a silent no-op; it doesn't trigger `not_installed_here`.",
    ],
    seeAlso: ["list", "install", "targets"],
  },

  update: {
    name: "update",
    synopsis: "crew update [<name>...]",
    summary: [
      "Re-resolve each installed skill's ref and reinstall if the upstream SHA has moved.",
      "Pinned installs (exact SHA or tag) are skipped unless `--force`. Customized installs are skipped silently — your edits are preserved.",
      "Bundles are re-expanded: new siblings upstream get installed; siblings that disappeared upstream are reported as `source_gone` and left in place locally.",
    ],
    flags: [
      {
        flag: "--force",
        description: "Update pinned skills, overwrite customized installs, and ignore user edits.",
      },
      { flag: "--json", description: "Emit a structured per-skill result table." },
    ],
    examples: [
      { command: "crew update", description: "Update every unpinned skill in state." },
      {
        command: "crew update python-testing",
        description: "Update a single skill by name; bundles containing it are also re-expanded.",
      },
      {
        command: "crew update --force python-testing",
        description: "Force-update even if the skill is pinned or has local edits.",
      },
    ],
    notes: [
      "Upstream deletion is soft: if a skill is removed upstream but its source still resolves, `crew update` reports `source_gone` and leaves your local install untouched. Run `crew uninstall <name>` when you want it gone.",
      "Network failures are isolated per-skill — one broken source doesn't stop the rest.",
    ],
    seeAlso: ["autoupdate", "install", "list"],
  },

  list: {
    name: "list",
    synopsis: "crew list",
    summary: [
      "Print every skill crew currently manages, with its source, resolved SHA, which targets it's installed in, and whether it was pinned or pulled in as a dependency.",
    ],
    flags: [
      { flag: "--json", description: "Emit a structured array for scripting." },
      { flag: "--scope {user,project}", description: "Filter to one scope (default: all)." },
    ],
    examples: [
      { command: "crew list", description: "Show everything crew is tracking." },
      {
        command: "crew list --json | jq '.installations[].name'",
        description: "Pipe names into a script.",
      },
      {
        command: "crew list --json | jq '.installations[] | select(.pinned)'",
        description: "Find all pinned installs.",
      },
    ],
    seeAlso: ["info", "search", "doctor"],
  },

  info: {
    name: "info",
    synopsis: "crew info <ref-or-name>",
    summary: [
      "Show metadata for a skill. If the argument matches an installed skill name, details come from local state; otherwise the ref is resolved and the skill is inspected fresh without installing it.",
      "Accepts the same reference shapes as `crew install` — see `crew help install` for the full list (tap names, paths, git URLs, `gh:`/`gl:`/`bb:` and `@owner/repo` shorthands).",
    ],
    flags: [{ flag: "--json", description: "Emit a structured payload." }],
    examples: [
      { command: "crew info python-testing", description: "Show details for an installed skill." },
      {
        command: "crew info gh:acme/skills//python/testing",
        description: "Inspect a skill without installing.",
      },
      {
        command: "crew info @with-logic/skills",
        description: "Preview every skill in a bundle.",
      },
    ],
    seeAlso: ["list", "search", "install"],
  },

  search: {
    name: "search",
    synopsis: "crew search <query>",
    summary: [
      "Match <query> case-insensitively against the name and description of every skill in every configured tap.",
      "Searches only taps (git-based registries). Ad-hoc git URLs and local paths don't appear in search.",
    ],
    flags: [{ flag: "--json", description: "Emit a structured array of matches." }],
    examples: [
      { command: "crew search python", description: "Find skills mentioning `python`." },
      { command: "crew search 'code review'", description: "Multi-word query (quoted)." },
    ],
    seeAlso: ["tap", "info", "install"],
  },

  tap: {
    name: "tap",
    synopsis: "crew tap [add|remove|list] [args...]",
    summary: [
      "Taps are git repositories that act as skill registries. The default tap `core` is always present unless you explicitly remove it.",
      "After adding a tap you can install any skill in it by bare name (e.g. `crew install python-testing`) without naming the tap.",
      "`crew tap <git-url> [<name>]` is a shorthand for `crew tap add <git-url> [<name>]` — when the first argument looks like a git source, the `add` keyword is optional.",
    ],
    flags: [
      { flag: "--force", description: "Allow removing the default `core` tap." },
      { flag: "--json", description: "Structured output for `tap list`." },
    ],
    examples: [
      {
        command: "crew tap list",
        description: "Show every configured tap and its last fetch time.",
      },
      {
        command: "crew tap @acme/skills",
        description: "Shorthand — add the GitHub repo as a tap named `skills`.",
      },
      {
        command: "crew tap add https://github.com/acme/skills.git acme",
        description: "Long form; same effect, with an explicit tap name.",
      },
      { command: "crew tap remove acme", description: "Remove a tap and delete its local clone." },
    ],
    sections: [
      {
        heading: "What a tap looks like",
        body: [
          "A tap is any git repository whose top-level directories are skills. That's it. No manifest, no registration, no index file — crew just clones the repo and walks one level deep.",
          "A minimal tap:",
          {
            literal: true,
            lines: [
              "my-skills/",
              "├── README.md            # optional, informational",
              "├── python-testing/",
              "│   └── SKILL.md",
              "├── python-linting/",
              "│   └── SKILL.md",
              "└── docs/",
              "    └── contributing.md  # no SKILL.md → ignored",
            ],
          },
          "`crew search` indexes every top-level directory that contains a valid `SKILL.md`. Nested directories and non-skill files are ignored by search but don't hurt anything — keep README, LICENSE, CI config, whatever.",
        ],
      },
      {
        heading: "Authoring your own tap",
        body: [
          "1. `git init my-skills && cd my-skills`",
          "2. For each skill: make a directory whose name matches the skill's frontmatter `name`, and put a `SKILL.md` inside it. See `crew help install` for the SKILL.md format (it's the Agent Skills spec — https://agentskills.io/specification).",
          "3. Commit and push to any git host (GitHub, GitLab, Bitbucket, a self-hosted remote, even a local `file://` path).",
          "4. Anyone can add it with `crew tap <git-url>`, or you as the author can install directly via `crew install @your-org/my-skills` to pick up every skill in one go.",
          "A tap is just a regular git repo — tags and branches are honored. `crew install my-skill@v1.0.0` pulls the version at that tag; `crew install my-skill` follows the default branch. Use tags to ship stable versions; users who want to float on `main` can.",
        ],
      },
    ],
    notes: [
      "Adding a tap is non-destructive — it just clones into `~/.crew/taps/<name>/` and indexes the skills inside. No confirmation is needed.",
      "Ambiguous bare names (a skill in two different taps) produce `ambiguous_reference` — qualify with `<tap>/<skill>` to pick one.",
    ],
    seeAlso: ["search", "install"],
  },

  targets: {
    name: "targets",
    synopsis: "crew targets [enable|disable <name>]",
    summary: [
      "List every agent coder crew knows about and whether it's currently detected, force-enabled, or disabled.",
      "`enable` forces a target active even if auto-detection fails; `disable` skips a target on future install/update.",
    ],
    flags: [{ flag: "--json", description: "Emit structured target info." }],
    examples: [
      { command: "crew targets", description: "Show detection status for each adapter." },
      {
        command: "crew targets disable codex",
        description: "Skip Codex CLI on future install/update.",
      },
      {
        command: "crew targets enable claude-code",
        description: "Force Claude Code on even if auto-detection missed it.",
      },
    ],
    notes: [
      "v1 ships with three adapters: `claude-code`, `codex`, `gemini-cli`. Detection checks for each tool's user-scope skills directory or its CLI on PATH.",
    ],
    seeAlso: ["install", "doctor"],
  },

  autoupdate: {
    name: "autoupdate",
    synopsis: "crew autoupdate {enable|disable|status}",
    summary: [
      "Manage a background launchd agent that runs `crew update --quiet` on a schedule.",
      "Once enabled, any bundle you've installed (e.g. `@your-org/skills`) automatically picks up new sibling skills as the team adds them upstream.",
      "The agent shows up in System Settings → General → Login Items as `Crew Skill Autoupdate`.",
    ],
    flags: [
      {
        flag: "--interval <dur>",
        description: "Interval for `enable`. Units: `s`, `m`, `h`, `d`. Default `4h`.",
      },
      { flag: "--json", description: "Structured status output." },
    ],
    examples: [
      {
        command: "crew autoupdate enable",
        description: "Turn on the default 4-hour schedule.",
      },
      {
        command: "crew autoupdate enable --interval 30m",
        description: "Run every 30 minutes.",
      },
      {
        command: "crew autoupdate status",
        description: "Check whether the agent is loaded and when it last ran.",
      },
      { command: "crew autoupdate disable", description: "Stop the background updates." },
    ],
    notes: [
      "Logs go to `~/.crew/logs/autoupdate.log`.",
      "If status says `agent_loaded: false` but config says enabled, run `crew autoupdate disable` then `enable` to reconcile — or `crew doctor --repair`.",
      "Advanced: set the `CREW_LAUNCH_AGENTS_DIR` env var to override where the plist is written (defaults to `~/Library/LaunchAgents`). Mostly a test seam; you shouldn't need it in normal use.",
    ],
    seeAlso: ["update", "doctor"],
  },

  doctor: {
    name: "doctor",
    synopsis: "crew doctor [--verify] [--repair]",
    summary: [
      "Audit crew's state for drift between `state.json`, the markers at each install site, and the expected store entries.",
      "Safe to run any time. `--repair` reconciles recoverable drift — it never touches user-customized skills or anything outside `~/.crew/` and each skill's install directory.",
    ],
    flags: [
      { flag: "--verify", description: "Recompute every install's content hash (slower)." },
      {
        flag: "--repair",
        description:
          "Fix recoverable drift: rebuild state from markers, delete orphan store entries, reconcile autoupdate state.",
      },
      { flag: "--json", description: "Emit a structured list of findings." },
    ],
    examples: [
      { command: "crew doctor", description: "Quick integrity check." },
      {
        command: "crew doctor --verify",
        description: "Thorough check that flags user customizations (slower, hashes every file).",
      },
      {
        command: "crew doctor --repair",
        description: "Reconcile drift. Inspect findings without --repair first if unsure.",
      },
    ],
    notes: [
      "`state.json` is a convenience index; markers (`.crew.json` inside each install dir) are ground truth. `--repair` rebuilds state from markers when they disagree.",
    ],
    seeAlso: ["cache", "list"],
  },

  cache: {
    name: "cache",
    synopsis: "crew cache clean",
    summary: [
      "Delete the ephemeral git clone cache (`~/.crew/cache/`) and any store entries no longer referenced by state.",
      "Safe to run — crew re-fetches what it needs on the next install/update. Doesn't touch installed skills or tap clones.",
    ],
    examples: [{ command: "crew cache clean", description: "Reclaim disk space." }],
    seeAlso: ["doctor", "update"],
  },

  help: {
    name: "help",
    synopsis: "crew help [<command>]",
    summary: [
      "Show overall usage, or detailed help for a specific command.",
      "Running `crew` with no arguments is the same as `crew help`.",
    ],
    examples: [
      { command: "crew help", description: "Overview and command list." },
      { command: "crew help install", description: "Detailed help for `install`." },
      { command: "crew help --json", description: "Machine-readable help for scripting." },
    ],
  },

  version: {
    name: "version",
    synopsis: "crew version",
    summary: ["Print the crew version and exit."],
  },
};

/** Summary one-liners used in the overview, keyed by command name. */
const ONELINERS: Record<string, string> = {
  install: "Install skills into every detected agent.",
  uninstall: "Remove installed skills (with --prune for orphans).",
  update: "Update skills to their latest revision.",
  list: "Show installed skills.",
  info: "Show details for a skill (installed or not).",
  search: "Search across configured taps.",
  tap: "Manage registries (default: core).",
  targets: "List or toggle agent coders crew installs into.",
  autoupdate: "Schedule `crew update` in the background.",
  doctor: "Audit and optionally repair state.",
  cache: "Clean ephemeral caches and orphaned store entries.",
  help: "Show help for crew or a specific command.",
  version: "Print the version.",
};

/** Entry point for the `help` command. */
export function helpCommand(ctx: CommandContext): CommandOutput {
  const sub = ctx.positional[0];
  if (!sub) {
    return overview();
  }
  const help = COMMANDS[sub];
  if (!help) {
    return overview();
  }
  return renderCommand(help);
}

/** Entry point for the `version` command. */
export function versionCommand(_ctx: CommandContext): CommandOutput {
  return { exitCode: 0, human: [`crew ${CREW_VERSION}`], json: { version: CREW_VERSION } };
}

function overview(): CommandOutput {
  const lines: string[] = [
    `crew ${CREW_VERSION} — a package manager for Agent Skills.`,
    "",
    "One command installs a skill into every agent coder on your machine",
    "(Claude Code, Codex CLI, Gemini CLI) and keeps it up to date.",
    "",
    "GETTING STARTED",
    "  crew search <query>           Find a skill.",
    "  crew install <skill>          Install it everywhere.",
    "  crew list                     See what's installed.",
    "  crew help <command>           See flags and examples for any command.",
    "",
    "A FEW FLOWS",
    "  # Install one skill from the default tap",
    "  crew install python-testing",
    "",
    "  # Install every skill in a GitHub repo; pick up new ones automatically",
    "  crew install @your-org/skills && crew autoupdate enable",
    "",
    "  # Install only into the current project",
    "  crew install --scope project team/conventions",
    "",
    "COMMANDS",
  ];
  for (const group of GROUPS) {
    lines.push(`  ${group.title}`);
    for (const name of group.commands) {
      const blurb = ONELINERS[name] ?? "";
      lines.push(`    ${name.padEnd(12)} ${blurb}`);
    }
    lines.push("");
  }
  lines.push("ENVIRONMENT");
  lines.push("  CREW_HOME        Override ~/.crew (state, caches, tap clones).");
  lines.push("");
  lines.push("Run `crew help <command>` for details and examples.");
  lines.push("Spec: https://agentskills.io/specification");
  return {
    exitCode: 0,
    human: lines,
    json: {
      version: CREW_VERSION,
      commands: Object.values(COMMANDS).map((c) => ({
        name: c.name,
        synopsis: c.synopsis,
        summary: c.summary.join(" "),
      })),
    },
  };
}

function renderCommand(help: CommandHelp): CommandOutput {
  const heading = `crew ${help.name} — ${help.summary[0]}`;
  const lines: string[] = [...wrap(heading, 78), "", "USAGE", `  ${help.synopsis}`, ""];
  if (help.summary.length > 1) {
    lines.push("DESCRIPTION");
    for (const para of help.summary.slice(1)) {
      for (const wrapped of wrap(para, 74)) {
        lines.push(`  ${wrapped}`);
      }
      lines.push("");
    }
    // Drop the final trailing blank we just added between paragraphs.
    if (lines[lines.length - 1] === "") lines.pop();
    lines.push("");
  }
  if (help.flags && help.flags.length > 0) {
    lines.push("FLAGS");
    const longest = Math.max(...help.flags.map((f) => f.flag.length));
    for (const f of help.flags) {
      const prefix = `  ${f.flag.padEnd(longest)}   `;
      const descWrapped = wrap(f.description, 78 - prefix.length);
      lines.push(`${prefix}${descWrapped[0] ?? ""}`);
      for (const cont of descWrapped.slice(1)) {
        lines.push(`${" ".repeat(prefix.length)}${cont}`);
      }
    }
    lines.push("");
  }
  if (help.examples && help.examples.length > 0) {
    lines.push("EXAMPLES");
    for (const e of help.examples) {
      lines.push(`  $ ${e.command}`);
      for (const wrapped of wrap(e.description, 72)) {
        lines.push(`      ${wrapped}`);
      }
    }
    lines.push("");
  }
  if (help.sections && help.sections.length > 0) {
    for (const section of help.sections) {
      lines.push(section.heading.toUpperCase());
      for (const entry of section.body) {
        if (typeof entry === "string") {
          for (const wrapped of wrap(entry, 74)) {
            lines.push(`  ${wrapped}`);
          }
        } else {
          // Literal block: render lines as-is, preserving indentation.
          for (const raw of entry.lines) {
            lines.push(raw.length > 0 ? `  ${raw}` : "");
          }
        }
        lines.push("");
      }
      // Drop the trailing blank that the last body entry left.
      if (lines[lines.length - 1] === "") lines.pop();
      lines.push("");
    }
  }
  if (help.notes && help.notes.length > 0) {
    lines.push("NOTES");
    for (const note of help.notes) {
      for (const wrapped of wrap(note, 74)) {
        lines.push(`  ${wrapped}`);
      }
    }
    lines.push("");
  }
  if (help.seeAlso && help.seeAlso.length > 0) {
    lines.push(`SEE ALSO`);
    lines.push(`  ${help.seeAlso.map((n) => `crew ${n}`).join(", ")}`);
    lines.push("");
  }
  // Drop the trailing blank line for a clean final output.
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return { exitCode: 0, human: lines, json: help };
}

/** Simple word-wrap for prose paragraphs. Never breaks mid-word. */
function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) {
    lines.push(current);
  }
  return lines;
}
