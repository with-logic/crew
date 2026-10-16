/**
 * Enqueue the skills a direct git URL or path reference names (§9 steps
 * 1–5) — every reference that isn't tap-shaped.
 *
 * Shared by root and dependency references: find or create the source's
 * tap, acquire it — exporting the reference's `@<ref>` first, so the
 * bytes and the recorded SHA both come from that commit (§9 step 3) —
 * and expand what is there. A gist's `//<file>` narrows the whole-gist
 * tap to that one skill and, like `<tap>/<skill>`, never subscribes to
 * the tap (§8.2). `--recursive` is checked here, where every direct
 * reference arrives however it was spelled (positional or `--from-git`).
 */

import type { Config, GitSource, PathSource, TapConfig, TapDiscovery } from "../../core/types.ts";
import { splitGistFile } from "../../refs/gist.ts";
import { withAcquiredTap } from "../../sources/acquire/index.ts";
import type { SkippedSkill } from "../../sources/expand.ts";
import { rejectRecursiveGist, selectGistFile } from "../../sources/gist.ts";
import { attributeRef } from "../tap-attribution.ts";
import type { PendingItem } from "./enqueue.ts";
import { expandSkillsAsItems, sourceRequestedRef } from "./expand-items.ts";

/** How a direct reference's skills are recorded. */
export interface DirectRefOptions {
  /** True for a reference the user typed; false for a dependency edge. */
  readonly explicit: boolean;
  /** Whether naming the whole source subscribes to its tap (§10.1.1). */
  readonly tracksTap: boolean;
  /** Recorded on a newly created tap (`--recursive`, §16.3). */
  readonly discovery?: TapDiscovery;
}

/** Resolve a git URL or path reference into pending items. */
export function enqueueDirectRef(
  source: GitSource | PathSource,
  config: Config,
  home: string,
  requireTap: (tap: TapConfig) => void,
  options: DirectRefOptions,
): { items: PendingItem[]; config: Config; skipped: readonly SkippedSkill[] } {
  if (source.type === "git" && options.discovery === "recursive") rejectRecursiveGist(source.url);
  const { tapSource, gistFile } = splitGistFile(source);
  const attrib = attributeRef(tapSource, config, options.discovery);
  requireTap(attrib.tap);
  const requestedRef = sourceRequestedRef(source);
  const expansion = withAcquiredTap(attrib.tap, requestedRef, home, (acquired) =>
    expandSkillsAsItems(
      selectGistFile(acquired, attrib.tap, gistFile),
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
