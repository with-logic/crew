/**
 * Detect the tap-vs-skill collision case for `crew install <bare-name>`
 * (§16.4).
 *
 * A positional is "in collision" when it matches both:
 *   - a configured tap name (registered or auto); and
 *   - the name of a skill inside at least one *other* configured tap.
 *
 * In that case the install command prompts the user (or maps --yes /
 * non-TTY to a deterministic outcome) before proceeding. No collision
 * = no prompt, tap wins silently (or bare-name resolution takes over
 * when the name doesn't match a tap at all).
 *
 * Taps that are not already on disk, or fail to materialize, are
 * silently skipped while checking other taps (same policy as search /
 * bare-name install). `crew tap add` normally clones taps up front.
 */

import { tapPath } from "../core/paths.ts";
import type { Config, TapConfig } from "../core/types.ts";
import { hasSkillMd, loadSkillName } from "../skill/load.ts";
import { tapRootDir } from "../sources/acquire/index.ts";
import { isDirectory } from "../util/fs.ts";
import { indexTap } from "./tap-index.ts";

export interface Collision {
  /** The tap whose name matches the positional. */
  readonly tap: TapConfig;
  /** Other taps that host a skill directory with the same name. */
  readonly otherTaps: readonly TapConfig[];
}

/**
 * Return a `Collision` if the positional matches both a tap name and
 * a same-named skill in another tap; otherwise `null`.
 */
export function detectCollision(name: string, config: Config, home: string): Collision | null {
  const tap = config.taps.find((t) => t.name === name);
  if (!tap) return null;
  const otherTaps: TapConfig[] = [];
  for (const other of config.taps) {
    if (other.name === tap.name) continue;
    try {
      const index = indexTap(other, home);
      if (index.skills.has(name)) otherTaps.push(other);
    } catch {
      // Same soft-fail policy as search / bare-name install.
    }
  }
  if (otherTaps.length === 0) return null;
  return { tap, otherTaps };
}

/**
 * Count the number of skill directories inside a tap. Used for the
 * prompt's "(N skills)" line. A tap whose root is itself a skill
 * (SKILL.md at the root) counts as 1. Returns `null` when the tap
 * can't be materialized locally.
 */
export function countSkills(tap: TapConfig, home: string): number | null {
  const root = tapRootOnDisk(tap, home);
  if (root === null) return null;
  if (hasSkillMd(root)) return rootSkillCount(root);
  let count = 0;
  for (const locs of indexTap(tap, home).skills.values()) count += locs.length;
  return count;
}

function rootSkillCount(root: string): number {
  try {
    loadSkillName(root);
    return 1;
  } catch {
    return 0;
  }
}

/** Non-throwing root-dir lookup for a tap; returns null if not on disk. */
function tapRootOnDisk(tap: TapConfig, home: string): string | null {
  if (tap.kind === "path") {
    return isDirectory(tap.path) ? tap.path : null;
  }
  const root = tapRootDir(tapPath(tap.name, home), tap);
  return isDirectory(root) ? root : null;
}
