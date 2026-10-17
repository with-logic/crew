/**
 * Dependency enqueueing for the install resolver (§9 step 6).
 *
 * This file owns the walk over a parent's dependency list; reading the
 * parent's own tree (and turning a sibling hit into an item) lives in
 * `./parent-tree.ts`.
 */

import type { Config, TapConfig, TapSource } from "../../../core/types.ts";
import { parseRef } from "../../../refs/parse.ts";
import type { SkippedSkill } from "../../../sources/expand.ts";
import { findSiblingDep } from "../../dep-resolution.ts";
import { makeSiblingScan, type SiblingScan } from "../../sibling-scan.ts";
import { enqueueDirectRef } from "../direct-ref.ts";
import { enqueueTapRef, type PendingItem } from "../enqueue.ts";
import { makeParentTrees, type ParentTrees, siblingItems } from "./parent-tree.ts";

/**
 * What one resolution's dependency walk reads once and shares across
 * every parent: the commits siblings are read at, and what each sibling
 * directory holds. The resolver releases `trees` when it is done.
 */
export interface DependencyReads {
  readonly trees: ParentTrees;
  readonly siblings: SiblingScan;
}

/** Fresh shared reads for one resolution. */
export function makeDependencyReads(home: string): DependencyReads {
  return { trees: makeParentTrees(home), siblings: makeSiblingScan() };
}

/**
 * Resolve and enqueue items for every dependency of one parent.
 *
 * A parent installed at an explicit ref has its siblings read at the
 * parent's commit (§9 step 3), which means exporting that commit; doing it
 * per dependency, or per parent, would re-export the same tree once for
 * each edge. `reads` holds one export per tap and commit for the whole
 * resolution, and one reading of each sibling directory.
 *
 * What matters here is whether the parent carries a ref at all, not
 * whether that ref is `pinned` (§11.1): a parent at `@<branch>` is
 * unpinned yet still read from that branch's commit, so it needs the
 * same export as one at `@<tag>`.
 */
export function enqueueDeps(
  depRefs: readonly string[],
  parent: PendingItem,
  config: Config,
  context: { readonly cwd: string; readonly home: string; readonly reads: DependencyReads },
  requireTap: (tap: TapConfig) => void,
): { items: PendingItem[]; config: Config; skipped: readonly SkippedSkill[] } {
  const { cwd, home, reads } = context;
  const items: PendingItem[] = [];
  const skipped: SkippedSkill[] = [];
  let current = config;

  // Bare-name deps are the ones that read from the parent's own tree,
  // so they share a single export; everything else resolves on its own.
  // Each bare dep keeps the `TapSource` it already parsed to, so the
  // sibling walk below reads `.name` off a narrowed value rather than
  // re-parsing and casting.
  const bare: { readonly raw: string; readonly source: TapSource }[] = [];
  const others: string[] = [];
  for (const depRef of depRefs) {
    const source = parseRef(depRef, cwd);
    if (source.type === "tap" && source.tap === null) bare.push({ raw: depRef, source });
    else others.push(depRef);
  }

  const unresolved: string[] = [];
  if (bare.length > 0) {
    const exportedPath = reads.trees.locate(parent);
    // `findSiblingDep` can register an auto tap, so each hit carries the
    // config to carry forward; threading it through the loop is what
    // keeps a batched walk equivalent to resolving one at a time.
    for (const dep of bare) {
      const sibling = findSiblingDep(
        { tap: parent.tap, tapRelativePath: parent.tapRelativePath, exportedPath },
        dep.source.name,
        home,
        current,
        reads.siblings,
      );
      // A miss falls through to the cross-tap search below, which
      // does not need the parent's tree.
      if (sibling) {
        requireTap(sibling.tap);
        const produced = siblingItems(sibling, parent, home);
        items.push(...produced.items);
        current = produced.config;
      } else unresolved.push(dep.raw);
    }
  }

  for (const depRef of [...unresolved, ...others]) {
    const enqueued = enqueueDep(depRef, current, cwd, home, requireTap);
    current = enqueued.config;
    items.push(...enqueued.items);
    skipped.push(...enqueued.skipped);
  }

  return { items, config: current, skipped };
}

/** Enqueue a remaining dependency after the batched sibling search. */
export function enqueueDep(
  depRef: string,
  config: Config,
  cwd: string,
  home: string,
  requireTap: (tap: TapConfig) => void,
): { items: PendingItem[]; config: Config; skipped: readonly SkippedSkill[] } {
  const source = parseRef(depRef, cwd);

  if (source.type === "tap") return enqueueTapRef(source, config, home, false, null);

  // Git or path dep ref. Dep edges don't subscribe the user to every
  // sibling of the dep's source.
  return enqueueDirectRef(source, config, home, requireTap, { explicit: false, tracksTap: false });
}
