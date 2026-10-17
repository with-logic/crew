/**
 * `isReadable` (§9 step 8): which side of a failed copy broke.
 */

import { expect, test } from "bun:test";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isReadable } from "../../src/util/readable.ts";
import { makeTempDir } from "../helpers/fixtures.ts";

test("a file the user can read is readable; one they can't, or that is missing, isn't", () => {
  const dir = makeTempDir();
  const file = join(dir, "f.txt");
  writeFileSync(file, "x");
  expect(isReadable(file)).toBe(true);
  expect(isReadable(join(dir, "missing.txt"))).toBe(false);
  chmodSync(file, 0o000);
  try {
    expect(isReadable(file)).toBe(false);
  } finally {
    chmodSync(file, 0o644);
  }
});
