/**
 * Generated registry file IO for known-tap maintenance (§16.2.1).
 */

import { join } from "node:path";
import type { RenderedKnownTapRegistryFile } from "../../src/known-taps/build/render.ts";
import { listDir, readText, rmrf, writeText } from "../../src/util/fs.ts";

export function writeRegistryFiles(
  outPath: string,
  files: readonly RenderedKnownTapRegistryFile[],
): void {
  rmrf(outPath);
  for (const file of files) {
    writeText(join(outPath, file.path), file.contents);
  }
}

export function checkRegistryFiles(
  outPath: string,
  expected: readonly RenderedKnownTapRegistryFile[],
): void {
  const stale = staleFile(outPath, expected);
  if (stale !== null) throw new Error(staleMessage(stale));
}

interface StaleFile {
  readonly path: string;
  readonly actual: string | null;
  readonly expected: string | null;
}

function staleFile(
  outPath: string,
  expected: readonly RenderedKnownTapRegistryFile[],
): StaleFile | null {
  const expectedByPath = new Map(expected.map((file) => [file.path, file.contents]));
  // listDir returns [] when outPath is absent; the expected-file loop below
  // then reports the first missing generated file.
  for (const name of listDir(outPath)) {
    if (!expectedByPath.has(name)) {
      return { path: name, actual: readText(join(outPath, name)), expected: null };
    }
  }
  for (const file of expected) {
    const actual = readTextOrNull(join(outPath, file.path));
    if (actual !== file.contents) {
      return { path: file.path, actual, expected: file.contents };
    }
  }
  return null;
}

function readTextOrNull(path: string): string | null {
  try {
    return readText(path);
  } catch (err) {
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

function staleMessage(stale: StaleFile): string {
  if (stale.actual === null) {
    return `known-tap registry is missing ${stale.path}; run \`bun run known-taps build\``;
  }
  if (stale.expected === null) {
    return `known-tap registry has stale file ${stale.path}; run \`bun run known-taps build\``;
  }
  return mismatchedFileMessage(stale.path, stale.actual, stale.expected);
}

function mismatchedFileMessage(path: string, actual: string, expected: string): string {
  const actualLines = actual.split("\n");
  const expectedLines = expected.split("\n");
  const max = Math.max(actualLines.length, expectedLines.length);
  for (let i = 0; i < max; i++) {
    if (actualLines[i] !== expectedLines[i]) {
      return `known-tap registry is stale in ${path} at line ${i + 1}; run \`bun run known-taps build\``;
    }
  }
  return "known-tap registry is stale; run `bun run known-taps build`";
}
