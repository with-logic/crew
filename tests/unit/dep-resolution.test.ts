/**
 * Unit tests for same-tap dependency lookup (§9 step 6).
 */

import { describe, expect, test } from "bun:test";
import type { TapConfig } from "../../src/core/types.ts";
import { findSiblingDep } from "../../src/install/dep-resolution.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

function pathTap(path: string): TapConfig {
  return {
    name: "local",
    kind: "path",
    registered: true,
    url: "",
    subpath: "",
    path,
  };
}

describe("findSiblingDep", () => {
  test("invalid sibling frontmatter is skipped while looking for a declared name", () => {
    const root = makeTempDir("dep-resolution-");
    makeSkill(root, "parent-source", skillFrontmatter({ name: "parent" }));
    makeSkill(root, "bad-source", skillFrontmatter({ name: "Bad" }));
    makeSkill(root, "other-source", skillFrontmatter({ name: "other" }));

    const hit = findSiblingDep(
      { tap: pathTap(root), tapRelativePath: "parent-source" },
      "missing",
      "/unused",
    );
    expect(hit).toBeNull();
  });
});
