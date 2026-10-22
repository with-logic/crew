/**
 * Dependency enqueueing for the install resolver (§9 step 6).
 *
 * This file owns the walk over a parent's dependency list. Captured
 * trees live in `./context.ts`; sibling staging lives in `./parent-tree.ts`.
 */

import type { Config, TapConfig, TapSource } from "../../../core/types.ts";
import { parseRef } from "../../../refs/parse.ts";
import { withAcquiredTap } from "../../../sources/acquire/index.ts";
import type { GitDiscoveryWarnings } from "../../../sources/discovery.ts";
import type { SkippedSkill } from "../../../sources/expand.ts";
import { findSiblingDep } from "../../dep-resolution/index.ts";
import { attributeRef } from "../../tap-attribution.ts";
import { enqueueTapRef, type PendingItem } from "../enqueue.ts";
import { expandSkillsAsItems, sourceRequestedRef } from "../expand-items.ts";
import type { DependencyTrees } from "./context.ts";
import { siblingItems } from "./parent-tree.ts";

/**
 * Resolve and enqueue items for every dependency of one parent.
 *
 * Batched deliberately. A parent installed at an explicit ref has its
 * siblings read at the parent's commit (§9 step 3), which means
 * exporting that commit; doing it per dependency re-exports the same
 * tree once for each edge. The install-set context shares captured trees
 * across parents and owns their cleanup.
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
  cwd: string,
  home: string,
  requireTap: (tap: TapConfig) => void,
  trees: DependencyTrees,
  discovery?: GitDiscoveryWarnings,
): { items: PendingItem[]; config: Config; skipped: readonly SkippedSkill[] } {
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
    // `findSiblingDep` can register an auto tap, so each hit carries the
    // config to carry forward; threading it through the loop is what
    // keeps a batched walk equivalent to resolving one at a time.
    const parentPath = trees.parentPath(parent);
    for (const dep of bare) {
      const sibling = findSiblingDep(
        { tap: parent.tap, tapRelativePath: parent.tapRelativePath, parentPath },
        dep.source.name,
        home,
        current,
        discovery,
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
    const enqueued = enqueueDep(depRef, current, cwd, home, requireTap, discovery);
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
  discovery?: GitDiscoveryWarnings,
): { items: PendingItem[]; config: Config; skipped: readonly SkippedSkill[] } {
  const source = parseRef(depRef, cwd);

  if (source.type === "tap") return enqueueTapRef(source, config, home, false, null, discovery);

  // Git or path dep ref. Dep edges don't subscribe the user to every
  // sibling of the dep's source.
  const attrib = attributeRef(source, config);
  requireTap(attrib.tap);
  const requestedRef = sourceRequestedRef(source);
  const expansion = withAcquiredTap(attrib.tap, requestedRef, home, (acquired) =>
    expandSkillsAsItems(
      acquired.rootDir,
      attrib.tap,
      "",
      acquired.resolvedSha,
      requestedRef,
      acquired.pinned,
      false,
      false,
      home,
      discovery,
    ),
  );
  return { items: expansion.items, config: attrib.config, skipped: expansion.skipped };
}
