/**
 * `crew search <query>` — search across configured taps (§16.4).
 *
 * For each tap, walk one level deep, load each candidate skill, and
 * match the query against `name` and `description` case-insensitively.
 * Invalid child directories are silently ignored during search.
 */

import { join } from "node:path";
import { readConfig } from "../config/load.ts";
import { CrewError } from "../core/errors.ts";
import { tapPath } from "../core/paths.ts";
import { ensureRepo } from "../git/repo.ts";
import { hasSkillMd, loadSkill } from "../skill/load.ts";
import { isDirectory, listDir } from "../util/fs.ts";
import type { CommandContext, CommandOutput } from "./types.ts";

export function searchCommand(ctx: CommandContext): CommandOutput {
  if (ctx.positional.length === 0) {
    throw new CrewError("usage_error", "usage: crew search <query>");
  }
  const query = ctx.positional.join(" ").toLowerCase();
  const config = readConfig(ctx.home);
  interface Hit {
    tap: string;
    name: string;
    description: string;
  }
  const hits: Hit[] = [];
  for (const tap of config.taps) {
    const tp = tapPath(tap.name, ctx.home);
    try {
      ensureRepo(tap.url, tp);
    } catch {
      continue; // silent skip on network issues
    }
    for (const entry of listDir(tp)) {
      const dir = join(tp, entry);
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
  const human = hits.map((h) => `${h.tap}/${h.name}  ${h.description}`);
  return { exitCode: 0, human, json: { hits } };
}
