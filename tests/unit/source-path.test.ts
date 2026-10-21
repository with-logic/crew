/** Source-relative path normalization and literal filename preservation (§9 step 5, §11.1). */

import { expect, test } from "bun:test";
import { join } from "node:path";
import { sourceRelativePath } from "../../src/sources/path.ts";

test("sourceRelativePath normalizes nested source paths to POSIX separators", () => {
  const root = "/source";
  expect(sourceRelativePath(root, join(root, "nested", "discard", "..", "skill"))).toBe(
    "nested/skill",
  );
});

test("sourceRelativePath preserves literal backslashes within POSIX path components", () => {
  const root = "/source";
  expect(sourceRelativePath(root, join(root, "team\\one", "skill"))).toBe("team\\one/skill");
});
