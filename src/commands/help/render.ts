/**
 * Rendering of help pages (overview + per-command) to human and JSON
 * output. Pure presentation — all content lives under `./content/`.
 */

import { CREW_VERSION } from "../../core/version.ts";
import type { CommandOutput } from "../types.ts";
import { COMMANDS, type CommandHelp, GROUPS, ONELINERS } from "./content/index.ts";

export function overview(): CommandOutput {
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

export function renderCommand(help: CommandHelp): CommandOutput {
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
