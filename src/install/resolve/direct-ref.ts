/**
 * Enqueue the skills a direct git URL or path reference names (§9 steps
 * 1–5) — every reference that isn't tap-shaped.
 *
 * Shared by root and dependency references: find or create the source's
 * tap, acquire it — exporting the reference's `@<ref>` first, so the
 * bytes and the recorded SHA both come from that commit (§9 step 3) —
 * and expand what is there. A gist's `//<file>` narrows the whole-gist
 * tap to that one skill and, like `<tap>/<skill>`, never subscribes to
 * the tap (§8.2).
 */

import type { Config, GitSource, PathSource, TapConfig, TapDiscovery } from "../../core/types.ts";
import { splitGistFile } from "../../refs/gist.ts";
import { withAcquiredTap } from "../../sources/acquire/index.ts";
import type { SkippedSkill } from "../../sources/expand.ts";
import { selectGistFile } from "../../sources/gist.ts";
import { attributeRef } from "../tap-attribution.ts";
import type { PendingItem } from "./enqueue.ts";
import { expandSkillsAsItems, type ItemOptions, sourceRequestedRef } from "./expand-items.ts";

/**
 * How a direct reference's skills are recorded: `explicit` for a
 * reference the user typed; `tracksTap` when naming the whole source
 * subscribes to its tap (§10.1.1). `discovery` sets recursive discovery
 * on the source's tap — a new one, or an existing one it upgrades (§16.3).
 */
export type DirectRefOptions = Pick<ItemOptions, "explicit" | "tracksTap"> & {
  readonly discovery?: TapDiscovery;
};

/** Resolve a git URL or path reference into pending items. */
export function enqueueDirectRef(
  source: GitSource | PathSource,
  config: Config,
  home: string,
  requireTap: (tap: TapConfig) => void,
  options: DirectRefOptions,
): { items: PendingItem[]; config: Config; skipped: readonly SkippedSkill[] } {
  const { tapSource, gistFile } = splitGistFile(source);
  const attrib = attributeRef(tapSource, config, options.discovery);
  requireTap(attrib.tap);
  const requestedRef = sourceRequestedRef(source);
  const expansion = withAcquiredTap(attrib.tap, requestedRef, home, (acquired) =>
    expandSkillsAsItems(
      selectGistFile(acquired, attrib.tap, gistFile, requestedRef),
      attrib.tap,
      acquired,
      {
        baseTapPath: gistFile,
        requestedRef,
        explicit: options.explicit,
        tracksTap: options.tracksTap && gistFile === "",
      },
      home,
    ),
  );
  return { items: expansion.items, config: attrib.config, skipped: expansion.skipped };
}
