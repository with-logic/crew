/**
 * Unit tests for install tap/skill collision helpers (§16.4).
 */

import { describe, expect, test } from "bun:test";
import type { TapConfig } from "../../src/core/types.ts";
import { countSkills } from "../../src/install/collision-check.ts";
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

describe("countSkills", () => {
  test("path taps count indexed skills by declared SKILL.md name", () => {
    const root = makeTempDir("collision-count-");
    makeSkill(
      root,
      "firebase-data-connect-basics",
      skillFrontmatter({ name: "firebase-data-connect" }),
    );
    makeSkill(root, "numeric", skillFrontmatter({ name: "3-statement-model" }));

    expect(countSkills(pathTap(root), "/unused")).toBe(2);
  });

  test("root-skill tap with invalid name counts as zero", () => {
    const root = makeTempDir("collision-count-");
    makeSkill(root, ".", skillFrontmatter({ name: "Bad" }));

    expect(countSkills(pathTap(root), "/unused")).toBe(0);
  });
});
