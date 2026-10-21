/** Classify source-file reads without changing parser or traversal errors (§9, §13). */

import { CrewError } from "../core/errors.ts";

/** Identify normalized source reads that discovery must not treat as invalid skills. */
export function isSourceReadFailure(err: unknown): err is CrewError {
  return err instanceof CrewError && err.code === "source_unreachable";
}

/** Run a file reader while preserving validation errors from its parser. */
export function readSourceFile<T>(path: string, read: (path: string) => T): T {
  try {
    return read(path);
  } catch (err) {
    if (err instanceof CrewError) throw err;
    throw sourceReadFailure(path, err);
  }
}

/** A local source read failure needs a filesystem remedy rather than network advice. */
export function sourceReadFailure(path: string, err: unknown): CrewError {
  const error = new CrewError(
    "source_unreachable",
    `cannot read source \`${path}\`: ${(err as Error).message}`,
    { path },
    "Check that the source file exists and that you can read it and access its parent directories.",
  );
  Object.defineProperty(error, "cause", { value: err, enumerable: false });
  return error;
}
