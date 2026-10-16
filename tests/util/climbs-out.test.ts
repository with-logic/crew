/**
 * `climbsOut`: when a `path.relative` result leaves its base (§8.4).
 */

import { describe, expect, test } from "bun:test";
import { climbsOut } from "../../src/util/symlink-containment.ts";

describe("climbsOut", () => {
  for (const rel of ["..", "../x", "../../x/y", "/abs/x"]) {
    test(`${rel} leaves the base`, () => expect(climbsOut(rel)).toBe(true));
  }
  for (const rel of ["", "x", "x/y", "..notes.md", "..foo/bar"]) {
    test(`${JSON.stringify(rel)} stays inside`, () => expect(climbsOut(rel)).toBe(false));
  }
});
