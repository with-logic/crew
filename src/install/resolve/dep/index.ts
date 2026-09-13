/**
 * Dependency enqueueing for the install resolver (§9 step 6).
 *
 * This file owns the walk over a parent's dependency list; reading the
 * parent's own tree (and turning a sibling hit into an item) lives in
 * `./parent-tree.ts`.
 */

import type { Config, TapSource } from "../../../core/types.ts";
import { parseRef } from "../../../refs/parse.ts";
import { withAcquiredTap } from "../../../sources/acquire/index.ts";
import type { SkippedSkill } from "../../../sources/expand.ts";
import { findSiblingDep } from "../../dep-resolution.ts";
import { attributeRef } from "../../tap-attribution.ts";
import { enqueueTapRef, type PendingItem } from "../enqueue.ts";
import { expandSkillsAsItems, sourceRequestedRef } from "../expand-items.ts";
import { siblingItems, withParentSkillDir } from "./parent-tree.ts";

/**
 * Resolve and enqueue items for every dependency of one parent.
 *
 * Batched deliberately. A parent installed at an explicit ref has its
 * siblings read at the parent's commit (§9 step 3), which means
 * exporting that commit; doing it per dependency re-exports the same
 * tree once for each edge. One export serves them all, and the export's
 * lifetime still ends with this call, so nothing outlives the scratch
 * directory.
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
    const found = withParentSkillDir(parent, home, (parentDir) => {
      const hits: PendingItem[] = [];
      for (const dep of bare) {
        const sibling = findSiblingDep(
          { tap: parent.tap, tapRelativePath: parent.tapRelativePath, parentDir },
          dep.source.name,
          home,
          current,
        );
        // A miss falls through to the cross-tap search below, which
        // does not need the parent's tree.
        if (sibling) {
          const produced = siblingItems(sibling, parent, home);
          hits.push(...produced.items);
          current = produced.config;
        } else unresolved.push(dep.raw);
      }
      return hits;
    });
    items.push(...found);
  }

  for (const depRef of [...unresolved, ...others]) {
    const enqueued = enqueueDep(depRef, parent, current, cwd, home);
    current = enqueued.config;
    items.push(...enqueued.items);
    skipped.push(...enqueued.skipped);
  }

  return { items, config: current, skipped };
}

/** Resolve and enqueue items for a single dependency reference. */
export function enqueueDep(
  depRef: string,
  parent: PendingItem,
  config: Config,
  cwd: string,
  home: string,
): { items: PendingItem[]; config: Config; skipped: readonly SkippedSkill[] } {
  const source = parseRef(depRef, cwd);

  // Bare-name dep with a tap-aware parent: prefer a sibling in the parent's tap.
  if (source.type === "tap" && source.tap === null) {
    // A parent read at an explicit ref has its siblings read at the
    // parent's commit, not HEAD — otherwise their bytes get recorded
    // under the parent's SHA while actually coming from somewhere
    // else (§9 step 3).
    const found = withParentSkillDir(parent, home, (parentDir) => {
      const sibling = findSiblingDep(
        { tap: parent.tap, tapRelativePath: parent.tapRelativePath, parentDir },
        source.name,
        home,
        config,
      );
      return sibling ? siblingItems(sibling, parent, home) : null;
    });
    if (found) return found;
    // Fall through to bare-name search across all configured taps.
  }

  if (source.type === "tap") return enqueueTapRef(source, config, home, false, null);

  // Git or path dep ref. Dep edges don't subscribe the user to every
  // sibling of the dep's source.
  const attrib = attributeRef(source, config);
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
    ),
  );
  return { items: expansion.items, config: attrib.config, skipped: expansion.skipped };
}
