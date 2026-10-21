/** Invocation-scoped sibling indexes and captured commit trees (§9 steps 3, 6). */

import { join, posix } from "node:path";
import { tapClonePath } from "../../../core/repo-path.ts";
import { createExportedTree, type ExportedTree } from "../../../git/export.ts";
import type { GistSiblingCache } from "../../dep-resolution.ts";
import type { PendingItem } from "../enqueue.ts";

/** Shared only while one install-set walk owns every cached tree. */
export interface DependencyTrees {
  readonly gistSiblings: GistSiblingCache;
  readonly parentDir: (parent: PendingItem) => string | undefined;
}

/** Keep captured roots readable until the complete dependency walk returns or throws. */
export function withDependencyTrees<T>(home: string, fn: (trees: DependencyTrees) => T): T {
  const exports = new Map<string, ExportedTree>();
  try {
    return fn({
      gistSiblings: new Map(),
      parentDir: (parent) => parentDir(parent, home, exports),
    });
  } finally {
    cleanupExports(exports.values());
  }
}

function cleanupExports(trees: Iterable<ExportedTree>): void {
  const failures: unknown[] = [];
  for (const tree of trees) {
    try {
      tree.cleanup();
    } catch (err) {
      failures.push(err);
    }
  }
  if (failures.length > 0) throw failures[0];
}

/** Bare siblings use the captured SHA, even if a subsequent root fetch moved the ref. */
function parentDir(
  parent: PendingItem,
  home: string,
  exports: Map<string, ExportedTree>,
): string | undefined {
  if (parent.requestedRef === null || parent.resolvedSha === null || parent.tap.kind !== "git")
    return undefined;
  const clone = tapClonePath(parent.tap, home);
  // Widen a skill-root tap to its enclosing directory so siblings remain visible.
  const subpath = parent.tap.subpath;
  const enclosing = subpath.length === 0 ? "" : posix.dirname(subpath);
  const rootPath = enclosing === "." || enclosing === "/" ? "" : enclosing;
  const key = JSON.stringify([clone, rootPath, parent.resolvedSha]);
  let tree = exports.get(key);
  if (tree === undefined) {
    tree = createExportedTree(clone, parent.resolvedSha, rootPath, home);
    exports.set(key, tree);
  }
  const rel =
    subpath.length > 0
      ? posix.join(posix.basename(subpath), parent.tapRelativePath)
      : parent.tapRelativePath;
  return rel.length > 0 ? join(tree.rootDir, rel) : tree.rootDir;
}
