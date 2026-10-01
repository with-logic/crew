/** Root reference acquisition and expansion (§9 steps 1–5, §14). */

import type { Config, TapConfig } from "../../core/types.ts";
import { parseRef } from "../../refs/parse.ts";
import { acquireTap } from "../../sources/acquire/index.ts";
import type { SkippedSkill } from "../../sources/expand.ts";
import type { KindHint } from "../resolve-ref/index.ts";
import { attributeRef } from "../tap-attribution.ts";
import { enqueueTapRef, type PendingItem } from "./enqueue.ts";
import { expandSkillsAsItems, sourcePinned, sourceRequestedRef } from "./expand-items.ts";

/** Resolve and enqueue the items produced by a single root reference. */
export function enqueueRoot(
  raw: string,
  config: Config,
  cwd: string,
  home: string,
  kindHint: KindHint,
  recursive: boolean,
  requireTap: (tap: TapConfig) => void,
): { items: PendingItem[]; config: Config; skipped: readonly SkippedSkill[] } {
  const source = parseRef(raw, cwd);

  // Bare-name (`<skill>`) and qualified (`<tap>/<skill>`, `<tap>/<ns>/<skill>`) tap refs.
  if (source.type === "tap") {
    return enqueueTapRef(source, config, home, true, kindHint);
  }

  // Git URL or path: find or create the tap. This is always a
  // whole-tap install — the user pointed at a folder (or repo) and
  // said "install this". Future additions should follow.
  const attrib = attributeRef(source, config, recursive ? "recursive" : undefined);
  requireTap(attrib.tap);
  const acquired = acquireTap(attrib.tap, home);
  const expansion = expandSkillsAsItems(
    acquired.rootDir,
    attrib.tap,
    "",
    acquired.resolvedSha,
    sourceRequestedRef(source),
    sourcePinned(source, acquired.resolvedSha),
    true,
    true,
  );
  return { items: expansion.items, config: attrib.config, skipped: expansion.skipped };
}
