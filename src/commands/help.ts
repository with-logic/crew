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
      "A <ref> is a local path, a git URL, or a skill name from a configured tap (see `crew help install` → EXAMPLES).",
    ],
    flags: [
      { flag: "--scope {user,project}", description: "Install globally (default) or under the current directory." },
      { flag: "--target <name>", description: "Restrict to named target(s). Repeatable." },
      { flag: "--dry-run", description: "Show what would be installed without writing files." },
      { flag: "--force", description: "Overwrite a customized or untracked destination. Never overrides a name conflict." },
      { flag: "--yes", description: "Answer `yes` to any confirmation prompt (e.g. taps being auto-added)." },
    ],
    examples: [
      { command: "crew install python-testing", description: "Install a skill discovered in the configured taps." },
      { command: "crew install ./my-skill", description: "Install a skill from a local directory." },
      { command: "crew install gh:acme/skills@v1.2.0//python/testing", description: "Install from a tagged GitHub repo at a subpath." },
      { command: "crew install --scope project python-testing", description: "Install only into the current project." },
    ],
    seeAlso: ["uninstall", "update", "info"],
  },

  uninstall: {
    name: "uninstall",
    synopsis: "crew uninstall <name> [<name>...]",
    summary: [
      "Remove installed skills from every agent coder crew put them in.",
      "Sibling skills and anything crew didn't install are left untouched.",
    ],
    flags: [
      { flag: "--scope {user,project}", description: "Which scope to remove from (default user)." },
      { flag: "--force", description: "Proceed even if the skill isn't tracked here." },
    ],
    examples: [
      { command: "crew uninstall python-testing", description: "Remove a skill from every target it was installed in." },
      { command: "crew uninstall --scope project python-testing", description: "Only remove the project-scope copy." },
    ],
    seeAlso: ["list", "install"],
  },

  update: {
    name: "update",
    synopsis: "crew update [<name>...]",
    summary: [
      "Re-resolve each installed skill's ref and reinstall if the upstream SHA has moved.",
      "Pinned installs (exact SHA or tag) are skipped unless `--force`. Customized installs are skipped silently — your edits are preserved.",
    ],
    flags: [
      { flag: "--force", description: "Update pinned skills too, overwriting customized installs." },
    ],
    examples: [
      { command: "crew update", description: "Update every unpinned skill." },
      { command: "crew update python-testing", description: "Update a single skill by name." },
      { command: "crew update --force python-testing", description: "Force-update even if pinned or customized." },
    ],
    seeAlso: ["autoupdate", "list"],
  },

  list: {
    name: "list",
    synopsis: "crew list",
    summary: [
      "Print every skill crew currently manages, with its source, resolved SHA, and which targets it's installed in.",
    ],
    flags: [
      { flag: "--json", description: "Emit a structured array for scripting." },
    ],
    examples: [
      { command: "crew list", description: "Show installed skills." },
      { command: "crew list --json | jq '.installations[].name'", description: "Pipe the names into a script." },
    ],
    seeAlso: ["info", "search"],
  },

  info: {
    name: "info",
    synopsis: "crew info <ref-or-name>",
    summary: [
      "Show metadata for a skill. If the argument matches an installed skill name, details come from local state; otherwise the ref is resolved and the skill is inspected fresh.",
    ],
    flags: [
      { flag: "--json", description: "Emit a structured payload." },
    ],
    examples: [
      { command: "crew info python-testing", description: "Show details for an installed skill." },
      { command: "crew info gh:acme/skills//python/testing", description: "Inspect a skill without installing it." },
    ],
    seeAlso: ["list", "search"],
  },

  search: {
    name: "search",
    synopsis: "crew search <query>",
    summary: [
      "Match <query> case-insensitively against the name and description of every skill in every configured tap.",
    ],
    flags: [
      { flag: "--json", description: "Emit a structured array of matches." },
    ],
    examples: [
      { command: "crew search python", description: "Find skills mentioning `python`." },
      { command: "crew search 'code review'", description: "Multi-word query (quoted)." },
    ],
    seeAlso: ["tap", "info"],
  },

  tap: {
    name: "tap",
    synopsis: "crew tap {add|remove|list} [args...]",
    summary: [
      "Taps are git repositories that act as skill registries. The default tap `core` is always present unless you explicitly remove it.",
    ],
    flags: [
      { flag: "--yes", description: "Skip confirmation on `tap add`." },
      { flag: "--force", description: "Allow `tap remove core`." },
    ],
    examples: [
      { command: "crew tap list", description: "Show every configured tap." },
      { command: "crew tap add --yes https://github.com/acme/skills.git acme", description: "Add a tap named `acme`." },
      { command: "crew tap remove acme", description: "Remove a tap and delete its local clone." },
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
    flags: [
      { flag: "--json", description: "Emit structured target info." },
    ],
    examples: [
      { command: "crew targets", description: "Show detection status for each adapter." },
      { command: "crew targets disable codex", description: "Skip Codex CLI on future installs." },
      { command: "crew targets enable claude-code", description: "Install into Claude Code even if auto-detection missed it." },
    ],
  },

  autoupdate: {
    name: "autoupdate",
    synopsis: "crew autoupdate {enable|disable|status}",
    summary: [
      "Manage a background launchd agent that runs `crew update --quiet` on a schedule.",
      "The agent shows up in System Settings → General → Login Items as `Crew Skill Autoupdate`.",
    ],
    flags: [
      { flag: "--interval <dur>", description: "Interval for `enable`. Units: `s`, `m`, `h`, `d`. Default `4h`." },
    ],
    examples: [
      { command: "crew autoupdate enable", description: "Turn on the default 4-hour schedule." },
      { command: "crew autoupdate enable --interval 30m", description: "Run every 30 minutes." },
      { command: "crew autoupdate status", description: "Check whether the agent is loaded and when it last ran." },
      { command: "crew autoupdate disable", description: "Stop the background updates." },
    ],
    seeAlso: ["update"],
  },

  doctor: {
    name: "doctor",
    synopsis: "crew doctor [--verify] [--repair]",
    summary: [
      "Audit crew's state for drift between `state.json`, the markers at each install site, and the expected store entries.",
      "Safe to run any time. `--repair` reconciles recoverable drift — it never touches user-customized skills.",
    ],
    flags: [
      { flag: "--verify", description: "Recompute every install's content hash (slower)." },
      { flag: "--repair", description: "Fix recoverable drift: orphan state, orphan markers, orphan store entries." },
      { flag: "--json", description: "Emit a structured list of findings." },
    ],
    examples: [
      { command: "crew doctor", description: "Quick check." },
      { command: "crew doctor --verify", description: "Thorough check that also flags customizations." },
      { command: "crew doctor --repair", description: "Reconcile drift." },
    ],
  },

  cache: {
    name: "cache",
    synopsis: "crew cache clean",
    summary: [
      "Delete the ephemeral git clone cache (`~/.crew/cache/`) and any store entries no longer referenced by state.",
      "Safe to run — crew re-fetches what it needs on the next install/update.",
    ],
    examples: [
      { command: "crew cache clean", description: "Reclaim disk space." },
    ],
    seeAlso: ["doctor"],
  },

  help: {
    name: "help",
    synopsis: "crew help [<command>]",
    summary: [
      "Show overall usage, or detailed help for a specific command.",
    ],
    examples: [
      { command: "crew help", description: "Overview and command list." },
      { command: "crew help install", description: "Detailed help for `install`." },
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
  uninstall: "Remove installed skills.",
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
  if (!sub) return overview();
  const help = COMMANDS[sub];
  if (!help) return overview();
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
  lines.push("Run `crew help <command>` for details and examples.");
  lines.push("Docs: https://agentskills.io/specification");
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
      for (const wrapped of wrap(para, 74)) lines.push(`  ${wrapped}`);
    }
    lines.push("");
  }
  if (help.flags && help.flags.length > 0) {
    lines.push("FLAGS");
    const longest = Math.max(...help.flags.map((f) => f.flag.length));
    for (const f of help.flags) {
      lines.push(`  ${f.flag.padEnd(longest)}   ${f.description}`);
    }
    lines.push("");
  }
  if (help.examples && help.examples.length > 0) {
    lines.push("EXAMPLES");
    for (const e of help.examples) {
      lines.push(`  $ ${e.command}`);
      lines.push(`      ${e.description}`);
    }
    lines.push("");
  }
  if (help.seeAlso && help.seeAlso.length > 0) {
    lines.push(`SEE ALSO`);
    lines.push(`  ${help.seeAlso.map((n) => `crew ${n}`).join(", ")}`);
    lines.push("");
  }
  // Drop the trailing blank line for a clean final output.
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
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
      current += " " + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}
