/**
 * Unit tests for tap child discovery used by update re-expansion (§10.1.1).
 */

import { describe, expect, test } from "bun:test";
import { symlinkSync } from "node:fs";
import { join } from "node:path";
import type { TapConfig } from "../../src/core/types.ts";
import { currentTapChildren } from "../../src/install/tap-children.ts";
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

describe("currentTapChildren", () => {
  test("C-INST-05g update discovery excludes linked git roots but preserves path sources", () => {
    const root = makeTempDir("tap-children-linked-");
    const skill = makeSkill(root, "real", skillFrontmatter({ name: "real" }));
    const linked = join(root, "linked");
    symlinkSync(skill, linked);
    const tap = pathTap(linked);
    expect(currentTapChildren({ ...tap, kind: "git" }, "/unused", linked).children).toEqual([]);
    expect(currentTapChildren(tap, "/unused", linked).children[0]?.name).toBe("real");
  });

  test("root-skill tap is returned with an empty tap-relative path", () => {
    const root = makeTempDir("tap-children-root-");
    makeSkill(root, ".", skillFrontmatter({ name: "declared-root" }));

    const { children } = currentTapChildren(pathTap(root), "/unused", root);

    expect(children).toEqual([
      {
        name: "declared-root",
        path: root,
        tapRelativePath: "",
      },
    ]);
  });

  test("C-UPD-18c a rejected root retains its path and reason without a name", () => {
    const root = makeTempDir("tap-children-invalid-root-");
    makeSkill(root, ".", skillFrontmatter({ name: "BAD_NAME" }));
    expect(currentTapChildren(pathTap(root), "/unused", root)).toEqual({
      children: [],
      skipped: [
        {
          path: root,
          tapRelativePath: "",
          namespace: null,
          code: "invalid_skill",
          message: expect.stringContaining("BAD_NAME"),
        },
      ],
    });
  });
});
