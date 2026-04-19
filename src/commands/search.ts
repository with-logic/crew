/**
 * `crew search <query>` — search across configured taps (§16.4).
 *
 * For each tap, walk one level deep, load each candidate skill, and
 * match the query against `name` and `description` case-insensitively.
 * Invalid child directories are silently ignored during search.
 *
 * Output is grouped by tap: a count header at the top, then one
 * section per tap (dim tap name) with the matching skills indented
 * underneath — skill name in bold, description truncated to the
 * terminal width. In non-TTY / `NO_COLOR` environments the same shape
 * is emitted without any ANSI codes.
 */

import { join } from "node:path";
import { readConfig } from "../config/load.ts";
import { CrewError } from "../core/errors.ts";
import { tapPath } from "../core/paths.ts";
import { ensureClone } from "../git/repo.ts";
import { hasSkillMd, loadSkill } from "../skill/load.ts";
import { tapRootDir } from "../sources/acquire/tap.ts";
import { isDirectory, listDir } from "../util/fs.ts";
import type { Styler } from "../util/term.ts";
import type { CommandContext, CommandOutput } from "./types.ts";

interface Hit {
  tap: string;
  name: string;
  description: string;
}

export function searchCommand(ctx: CommandContext): CommandOutput {
  if (ctx.positional.length === 0) {
    throw new CrewError("usage_error", "`crew search` needs a query — e.g. `crew search python`");
  }
  const query = ctx.positional.join(" ").toLowerCase();
  const config = readConfig(ctx.home);

  const hits: Hit[] = [];
  const warnings: string[] = [];
  for (const tap of config.taps) {
    const tp = tapPath(tap.name, ctx.home);
    try {
      // Read-only path: clone once (first search after `crew tap add`
      // elsewhere that didn't pre-clone); never fetch. Up-to-dateness is
      // the responsibility of `crew update` / `crew tap update`.
      ensureClone(tap.url, tp);
    } catch (err) {
      const ce = err as CrewError;
      warnings.push(
        `warning: tap \`${tap.name}\` isn't cloned yet and couldn't be reached (${ce.code ?? "source_unreachable"}) — skipping. run \`crew tap update ${tap.name}\` when you're back online.`,
      );
      continue;
    }
    const root = tapRootDir(tp, tap);
    if (!isDirectory(root)) continue;
    for (const entry of listDir(root)) {
      const dir = join(root, entry);
      if (!(isDirectory(dir) && hasSkillMd(dir))) {
        continue;
      }
      try {
        const skill = loadSkill(dir);
        const { name, description } = skill.frontmatter;
        if (name.toLowerCase().includes(query) || description.toLowerCase().includes(query)) {
          hits.push({ tap: tap.name, name, description });
        }
      } catch {
        // Invalid skill directories in a tap are silently ignored during
        // search — an unparseable SKILL.md isn't a search-time error.
      }
    }
  }
  hits.sort((a, b) =>
    a.tap === b.tap ? a.name.localeCompare(b.name) : a.tap.localeCompare(b.tap),
  );
  const human = formatHits(hits, query, ctx.style, ctx.width);
  return {
    exitCode: 0,
    human,
    stderr: warnings,
    json: { hits, warnings },
  };
}

/**
 * Render hits as a grouped, styled table.
 *
 *   Found N skills matching "query".
 *
 *   tap-name
 *     skill-name          description (truncated to terminal width)
 *     skill-name          ...
 *
 *   other-tap
 *     ...
 *
 * No results prints a single "no matches" line so scripts and humans
 * both know the run completed cleanly.
 */
function formatHits(hits: readonly Hit[], query: string, style: Styler, width: number): string[] {
  if (hits.length === 0) {
    return [`no skills matched "${query}".`];
  }
  const nameColumnWidth = Math.max(...hits.map((h) => h.name.length));
  // Reserve 2 spaces for the "  " indent + nameColumnWidth + 2 spaces
  // of gutter before the description. Everything after is the desc.
  const descStart = 2 + nameColumnWidth + 2;
  const descBudget = Math.max(20, width - descStart);

  const lines: string[] = [];
  const noun = hits.length === 1 ? "skill" : "skills";
  lines.push(`Found ${hits.length} ${noun} matching "${query}".`);
  lines.push("");

  let currentTap: string | null = null;
  for (const h of hits) {
    if (h.tap !== currentTap) {
      if (currentTap !== null) lines.push(""); // blank line between groups
      lines.push(style.dim(h.tap));
      currentTap = h.tap;
    }
    const paddedName = h.name.padEnd(nameColumnWidth);
    const truncatedDesc = truncate(h.description, descBudget);
    lines.push(`  ${style.bold(paddedName)}  ${truncatedDesc}`);
  }
  return lines;
}

/** Cut `s` to at most `max` characters, appending `…` if truncated. */
function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}
