/**
 * `crew search <query>` — search across configured taps (§16.4).
 *
 * For each tap, walk one level deep, load each candidate skill, and
 * match the query against `name` and `description` case-insensitively.
 * Invalid child directories are silently ignored during search.
 *
 * Output is grouped by tap: a bold count header at the top, one bold
 * tap label per group with its matching skills indented underneath
 * (skill name bold, description dim and truncated to the terminal
 * width), then a friendly install hint at the bottom. Warnings about
 * unreachable taps go to stderr as a separate channel.
 */

import { join } from "node:path";
import { readConfig } from "../config/load.ts";
import { CrewError } from "../core/errors.ts";
import { tapPath } from "../core/paths.ts";
import { ensureClone } from "../git/repo.ts";
import { hasSkillMd, loadSkill } from "../skill/load.ts";
import { tapRootDir } from "../sources/acquire/index.ts";
import { columns, truncate } from "../util/format.ts";
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
    let root: string;
    if (tap.kind === "git") {
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
      root = tapRootDir(tp, tap);
    } else {
      root = tap.path;
    }
    if (!isDirectory(root)) continue;
    for (const entry of listDir(root)) {
      const dir = join(root, entry);
      if (!(isDirectory(dir) && hasSkillMd(dir))) continue;
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
  const human = formatHits(hits, ctx.positional.join(" "), ctx.style, ctx.width);
  return {
    exitCode: 0,
    human,
    stderr: warnings,
    json: { hits, warnings },
  };
}

/**
 * Render hits as a grouped, styled table with a friendly hint.
 */
function formatHits(hits: readonly Hit[], query: string, style: Styler, width: number): string[] {
  if (hits.length === 0) {
    return [
      style.dim(`No skills match "${query}".`),
      "",
      style.dim("Try a broader query, or add a collection with `crew tap add <url>`."),
    ];
  }

  const noun = hits.length === 1 ? "match" : "matches";
  const header = `${style.bold(`${hits.length} ${noun}`)} for "${style.bold(query)}"`;
  const lines: string[] = [header, ""];

  // Group hits by tap; within each tap render a name/description table
  // with widths derived from that tap's hits (so long names in one tap
  // don't push every other tap's description right).
  const grouped = groupByTap(hits);
  let first = true;
  for (const [tap, tapHits] of grouped) {
    if (!first) lines.push("");
    first = false;
    lines.push(`  ${style.bold(tap)}`);
    const nameWidth = Math.max(...tapHits.map((h) => h.name.length));
    const descStart = 4 + nameWidth + 2;
    const descBudget = Math.max(20, width - descStart);
    const rows: string[][] = tapHits.map((h) => {
      const desc = style.dim(truncate(h.description, descBudget));
      return [`    ${h.name}`, desc];
    });
    for (const line of columns(rows, 2)) lines.push(line);
  }

  lines.push("");
  lines.push(style.dim(`Install any of these with \`crew install <name>\`.`));
  return lines;
}

function groupByTap(hits: readonly Hit[]): Map<string, Hit[]> {
  const out = new Map<string, Hit[]>();
  for (const h of hits) {
    if (!out.has(h.tap)) out.set(h.tap, []);
    out.get(h.tap)!.push(h);
  }
  return out;
}
