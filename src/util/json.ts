/**
 * Consistent JSON read/write helpers.
 *
 * JSON files crew manages (state.json, markers) are parsed strictly and
 * serialized with 2-space indentation and a trailing newline per §7.5 and
 * §11.1. Using these helpers everywhere keeps the on-disk format stable.
 */

import { readText, writeText } from "./fs.ts";

/** Read a JSON file and parse it as `T`. Throws if absent or malformed. */
export function readJson<T>(path: string): T {
  return JSON.parse(readText(path)) as T;
}

/** Try to read a JSON file; return null if it's absent. */
export function tryReadJson<T>(path: string): T | null {
  try {
    return JSON.parse(readText(path)) as T;
  } catch (err) {
    if (isEnoent(err)) {
      return null;
    }
    throw err;
  }
}

/** Write a value as pretty JSON with a trailing newline. */
export function writeJson(path: string, value: unknown): void {
  writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

function isEnoent(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "ENOENT";
}
