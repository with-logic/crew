/**
 * Human output rendering for `crew search` (§16.6).
 */

import { columns, truncate } from "../../util/format.ts";
import type { Styler } from "../../util/term.ts";
import { knownInstallRef, knownSkillRef, knownTapSource } from "./known.ts";
import type { KnownSearchHit, SearchHit } from "./types.ts";

export function formatSearchResults(
  hits: readonly SearchHit[],
  knownHits: readonly KnownSearchHit[],
  query: string,
  style: Styler,
  width: number,
): string[] {
  if (hits.length > 0) {
    const lines = formatConfiguredHits(hits, query, style, width);
    if (knownHits.length > 0) lines.push("", ...formatKnownSection(knownHits, style, width));
    return lines;
  }
  if (knownHits.length > 0) {
    return [
      style.dim(`No skills match "${query}" in configured taps.`),
      "",
      ...formatKnownSection(knownHits, style, width),
    ];
  }
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

function formatConfiguredHits(
  hits: readonly SearchHit[],
  query: string,
  style: Styler,
  width: number,
): string[] {
  const header =
    query === ""
      ? `${style.bold(`${hits.length} skill${hits.length === 1 ? "" : "s"}`)} available`
      : `${style.bold(`${hits.length} ${hits.length === 1 ? "match" : "matches"}`)} for "${style.bold(query)}"`;
  const lines: string[] = [header, ""];
  const grouped = groupBy(hits, (hit) => hit.tap);
  let first = true;
  for (const [tap, tapHits] of grouped) {
    if (!first) lines.push("");
    first = false;
    lines.push(`  ${style.bold(tap)}`);
    lines.push(...formatConfiguredRows(tapHits, style, width));
  }
  lines.push("", style.dim("Install any of these with `crew install <name>`."));
  return lines;
}

function formatKnownSection(
  knownHits: readonly KnownSearchHit[],
  style: Styler,
  width: number,
): string[] {
  const lines: string[] = [
    `${style.bold("Known taps not added yet")} (${knownHits.length} ${knownHits.length === 1 ? "match" : "matches"})`,
    "",
  ];
  for (const [tap, tapHits] of groupBy(knownHits, (hit) => hit.tap)) {
    // `groupBy` only creates groups after seeing the first item.
    const firstHit = tapHits[0]!;
    lines.push(`  ${style.bold(tap)} ${style.dim(`(${firstHit.trust})`)}`);
    lines.push(...formatKnownRows(tapHits, style, width));
    lines.push(`    ${style.dim(`tap with: crew tap add ${knownTapSource(firstHit)} ${tap}`)}`);
    lines.push("");
  }
  lines.push(style.dim("Add a tap first, then install a suggested skill by qualified name."));
  return lines;
}

function formatConfiguredRows(hits: readonly SearchHit[], style: Styler, width: number): string[] {
  const displayName = (h: SearchHit): string =>
    h.namespace === null ? h.name : `${h.namespace}/${h.name}`;
  const nameWidth = Math.max(...hits.map((h) => displayName(h).length));
  const descStart = 2 + 1 + 1 + nameWidth + 2;
  const descBudget = Math.max(20, width - descStart);
  const rows = hits.map((h) => {
    const mark = h.installed ? style.green("✓") : " ";
    const desc = style.dim(truncate(h.description, descBudget));
    return [`  ${mark} ${displayName(h)}`, desc];
  });
  return columns(rows, 2);
}

function formatKnownRows(hits: readonly KnownSearchHit[], style: Styler, width: number): string[] {
  const nameWidth = Math.max(...hits.map((h) => knownSkillRef(h).length));
  const descStart = 4 + nameWidth + 2;
  const descBudget = Math.max(20, width - descStart);
  const rows = hits.map((h) => [
    `    ${knownSkillRef(h)}`,
    style.dim(`${truncate(h.description, descBudget)} (crew install ${knownInstallRef(h)})`),
  ]);
  return columns(rows, 2);
}

function groupBy<T>(items: readonly T[], keyFor: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    if (!out.has(key)) out.set(key, []);
    out.get(key)!.push(item);
  }
  return out;
}
