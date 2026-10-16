/**
 * Containment tests on `path.relative` results (§8.4, §16.5).
 */

import { isAbsolute, sep } from "node:path";

/**
 * True when a `path.relative` result leaves its base: it climbs (`..`, or
 * `../…`) or shares no base at all (absolute, a different drive). A name
 * that merely starts with dots — `..notes.md` — stays inside.
 */
export function climbsOut(rel: string): boolean {
  return rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
}
