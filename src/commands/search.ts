/**
 * `crew search [<query>]` — search across configured taps (§16.4).
 *
 * With a query: match case-insensitively against `name` and
 * `description`.  Without a query: list every skill in every
 * configured tap (the exhaustive catalog).
 *
 * Each result is marked with a leading `✓` if the skill name is
 * already present in local state (installed at user or project
 * scope) — at-a-glance signal for the user.
 *
 * Output is grouped by tap: a bold count header at the top, one bold
 * tap label per group with its skills indented underneath. Warnings
 * about unreachable taps go to stderr as a separate channel.
 */

import { readConfig } from "../config/load.ts";
import type { TapConfig } from "../core/types.ts";
import { indexTap } from "../install/tap-index.ts";
import { loadSkill } from "../skill/load.ts";
import { readState } from "../state/load.ts";
import { columns, truncate } from "../util/format.ts";
import type { Styler } from "../util/term.ts";
import type { CommandContext, CommandOutput } from "./types.ts";

interface Hit {
  readonly tap: string;
  readonly name: string;
  readonly namespace: string | null;
  readonly description: string;
  readonly installed: boolean;
}

export function searchCommand(ctx: CommandContext): CommandOutput {
  const query = ctx.positional.join(" ").toLowerCase();
  const config = readConfig(ctx.home);
  const state = readState(ctx.home);
  const installedNames = new Set(state.installations.map((i) => i.name));

  const hits: Hit[] = [];
  const warnings: string[] = [];
  for (const tap of config.taps) {
    collectHitsFromTap(tap, query, installedNames, ctx.home, hits, warnings);
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

function collectHitsFromTap(
  tap: TapConfig,
  query: string,
  installedNames: Set<string>,
  home: string,
  hits: Hit[],
  warnings: string[],
): void {
  let index: ReturnType<typeof indexTap>;
  try {
    index = indexTap(tap, home);
  } catch {
    warnings.push(
      `warning: tap \`${tap.name}\` isn't cloned yet and couldn't be reached — skipping. run \`crew tap update ${tap.name}\` when you're back online.`,
    );
    return;
  }
  for (const locs of index.skills.values()) {
    for (const loc of locs) {
      try {
        const skill = loadSkill(loc.path);
        const { name, description } = skill.frontmatter;
        if (
          query === "" ||
          name.toLowerCase().includes(query) ||
          description.toLowerCase().includes(query)
        ) {
          hits.push({
            tap: tap.name,
            name,
            namespace: loc.namespace,
            description,
            installed: installedNames.has(name),
          });
        }
      } catch {
        // Invalid skill directories in a tap are silently ignored —
        // an unparseable SKILL.md isn't a search-time error.
      }
    }
  }
}

/**
 * Render hits as a grouped, styled table with a friendly hint.
 */
function formatHits(hits: readonly Hit[], query: string, style: Styler, width: number): string[] {
  if (hits.length === 0) {
    if (query === "") {
      return [
        style.dim("No skills in any configured tap."),
        "",
        style.dim("Add one with `crew tap add <url>`."),
      ];
    }
    return [
      style.dim(`No skills match "${query}".`),
      "",
      style.dim("Try a broader query, or add a collection with `crew tap add <url>`."),
    ];
  }

  const header =
    query === ""
      ? `${style.bold(`${hits.length} skill${hits.length === 1 ? "" : "s"}`)} available`
      : `${style.bold(`${hits.length} ${hits.length === 1 ? "match" : "matches"}`)} for "${style.bold(query)}"`;
  const lines: string[] = [header, ""];

  // Group hits by tap; within each tap render a marker/name/description
  // table with widths derived from that tap's hits (so long names in
  // one tap don't push every other tap's description right).
  const grouped = groupByTap(hits);
  let first = true;
  for (const [tap, tapHits] of grouped) {
    if (!first) lines.push("");
    first = false;
    lines.push(`  ${style.bold(tap)}`);
    const displayName = (h: Hit): string =>
      h.namespace === null ? h.name : `${h.namespace}/${h.name}`;
    const nameWidth = Math.max(...tapHits.map((h) => displayName(h).length));
    // Columns: 2-space indent + 1-char mark + 1 space + name + 2 spaces + desc
    const descStart = 2 + 1 + 1 + nameWidth + 2;
    const descBudget = Math.max(20, width - descStart);
    // ✓ on every terminal — Unicode is fine here. Color only when TTY.
    const rows: string[][] = tapHits.map((h) => {
      const mark = h.installed ? style.green("✓") : " ";
      const desc = style.dim(truncate(h.description, descBudget));
      return [`  ${mark} ${displayName(h)}`, desc];
    });
    for (const line of columns(rows, 2)) lines.push(line);
  }

  lines.push("");
  lines.push(style.dim("Install any of these with `crew install <name>`."));
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
