/** Source file reads preserve operational failures before validation or staging (§9, §13). */

import { accessSync, constants } from "node:fs";
import { CrewError } from "../core/errors.ts";
import { hashDirectory } from "../hash/content.ts";
import { readFrontmatter } from "../skill/read-frontmatter.ts";
import { copyTree } from "../util/copy.ts";
import { readText } from "../util/fs.ts";
import type { YamlValue } from "../yaml/parse.ts";

/** Read manifest bytes without confusing filesystem failures with invalid frontmatter. */
export function readSourceText(path: string): string {
  try {
    return readText(path);
  } catch (err) {
    throw sourceReadFailure(path, err);
  }
}

/** Preserve bounded metadata reads and parser errors while translating filesystem failures. */
export function readSourceFrontmatter(path: string): YamlValue {
  try {
    return readFrontmatter(path);
  } catch (err) {
    if (err instanceof CrewError) throw err;
    throw sourceReadFailure(path, err);
  }
}

/** Hash an acquired source; target and store hashing retain their existing error behavior. */
export function hashSourceDirectory(path: string): string {
  try {
    return hashDirectory(path);
  } catch (err) {
    throw sourceReadFailure(path, err);
  }
}

/** Copy an acquired source, distinguishing source permissions from destination failures. */
export function copySourceTree(source: string, destination: string): void {
  try {
    copyTree(source, destination, { stripRootMarker: true });
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.syscall !== "copyfile") throw err;
    // copyfile reports the source in `path` even when the destination write failed.
    const path = error.path!;
    try {
      accessSync(path, constants.R_OK);
    } catch (readError) {
      throw sourceReadFailure(path, readError);
    }
    throw err;
  }
}

function sourceReadFailure(path: string, err: unknown): CrewError {
  return new CrewError(
    "source_unreachable",
    `cannot read source \`${path}\`: ${(err as Error).message}`,
    {
      path,
    },
  );
}
