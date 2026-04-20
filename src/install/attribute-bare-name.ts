/**
 * Find the tap that owns a bare-name skill reference.
 *
 * Walks every configured tap, ensures its clone is materialized
 * (cheap; no fetch), and checks for the named skill at the tap root.
 * If exactly one tap holds it, that's the answer; if zero, throw
 * `invalid_ref`; if two or more, throw `ambiguous_reference`.
 *
 * Doesn't load the skill — just confirms presence. The caller does
 * the load via the shared expand/acquire path.
 */

import { join } from "node:path";
import { CrewError } from "../core/errors.ts";
import { tapPath } from "../core/paths.ts";
import type { Config, TapConfig } from "../core/types.ts";
import { ensureClone } from "../git/repo.ts";
import { tapRootDir } from "../sources/acquire/index.ts";
import { isDirectory } from "../util/fs.ts";

export function findTapForBareName(name: string, config: Config, home: string): TapConfig {
  const found: TapConfig[] = [];
  for (const tap of config.taps) {
    let root: string;
    if (tap.kind === "git") {
      const tp = tapPath(tap.name, home);
      try {
        ensureClone(tap.url, tp);
      } catch {
        continue; // soft-fail unreachable taps; same policy as search
      }
      root = tapRootDir(tp, tap);
    } else {
      root = tap.path;
    }
    if (isDirectory(join(root, name))) found.push(tap);
  }
  if (found.length === 0) {
    const tapNames = config.taps.map((t) => t.name).join(", ");
    throw new CrewError(
      "invalid_ref",
      `skill \`${name}\` isn't in any configured tap (searched: ${tapNames || "<none>"}) — try \`crew search ${name}\`, or add a tap with \`crew tap add <url>\``,
      { skill: name },
    );
  }
  if (found.length > 1) {
    const candidates = found.map((t) => `${t.name}/${name}`).join(", ");
    throw new CrewError(
      "ambiguous_reference",
      `skill \`${name}\` matches multiple taps (${candidates}) — qualify with one of those names to pick`,
      { candidates },
    );
  }
  return found[0]!;
}
