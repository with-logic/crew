/** Invocation-scoped captured directory trees for dependency resolution (§9 steps 3, 6). */

import { existsSync } from "node:fs";
import { join, posix } from "node:path";
import { tapClonePath } from "../../../core/repo-path.ts";
import { createExportedTree, type ExportedTree } from "../../../git/export.ts";
import type { PendingItem } from "../enqueue.ts";

const MAX_RETAINED_TREES = 2;

/** Shared only while one install-set walk owns the captured trees. */
export interface DependencyTrees {
  readonly parentDir: (parent: PendingItem) => string | undefined;
}

/** Reuse bounded captured roots and release every retained tree on scope exit. */
export function withDependencyTrees<T>(home: string, fn: (trees: DependencyTrees) => T): T {
  const exports = new Map<string, ExportedTree>();
  try {
    return fn({ parentDir: (parent) => parentDir(parent, home, exports) });
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

/** Bare siblings read the captured SHA even when a later fetch moved the parent's ref. */
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
  // §9 step 3: cache cleaning must not replace captured bytes with live HEAD.
  if (tree !== undefined && !existsSync(tree.rootDir)) {
    tree.cleanup();
    exports.delete(key);
    tree = undefined;
  }
  if (tree === undefined) {
    if (exports.size === MAX_RETAINED_TREES) {
      const [oldestKey, oldest] = exports.entries().next().value!;
      // A failed eviction stays owned by the final cleanup scope.
      oldest.cleanup();
      exports.delete(oldestKey);
    }
    tree = createExportedTree(clone, parent.resolvedSha, rootPath, home);
    exports.set(key, tree);
  }
  const rel =
    subpath.length > 0
      ? posix.join(posix.basename(subpath), parent.tapRelativePath)
      : parent.tapRelativePath;
  return rel.length > 0 ? join(tree.rootDir, rel) : tree.rootDir;
}
