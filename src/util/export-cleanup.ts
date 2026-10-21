/** Release owned exports without masking an earlier failure (§9 steps 3, 6, §13). */

import { CrewError } from "../core/errors.ts";
import { sanitizeLine } from "./redact.ts";

const cleanupFailures = new WeakSet<Error>();

/** A cleanup fault remains hard even when the primary error normally permits a soft outcome. */
export function hasExportCleanupFailure(error: Error): boolean {
  return cleanupFailures.has(error);
}

interface OwnedExport {
  readonly cleanupPath: string;
  readonly cleanup: () => void;
}

/** Attempt every owned cleanup, preserving the primary error and its classification. */
export function withExportCleanup<T>(fn: () => T, trees: Iterable<OwnedExport>): T {
  let failure: { error: unknown } | undefined;
  let result!: T;
  try {
    result = fn();
  } catch (err) {
    failure = { error: err };
  }
  for (const tree of trees) {
    try {
      tree.cleanup();
    } catch (err) {
      // Export cleanup callbacks only remove owned paths through node:fs.
      const diagnostic = (err as Error).message;
      if (failure === undefined) failure = { error: err };
      const primary =
        failure.error instanceof Error
          ? failure.error
          : new CrewError("usage_error", String(failure.error));
      // Keep CrewError identity, code, details and remedy; only append safe diagnostics (§13).
      primary.message += sanitizeLine(
        `; export cleanup failed; retained path \`${tree.cleanupPath}\`: ${diagnostic}`,
      );
      cleanupFailures.add(primary);
      failure.error = primary;
    }
  }
  if (failure !== undefined) throw failure.error;
  return result;
}

/** Failed materialization still owns its scratch directory and index. */
export function cleanupFailedExport(error: unknown, trees: Iterable<OwnedExport>): never {
  return withExportCleanup(() => {
    throw error;
  }, trees);
}
