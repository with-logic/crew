/** Rejected directory locations remain diagnostics, never declared names (§9, §16.6). */

import { expect, test } from "bun:test";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TapConfig } from "../../../src/core/types.ts";
import { indexTap } from "../../../src/install/tap-index.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

function pathTap(path: string): TapConfig {
  return { name: "local", kind: "path", path, url: "", subpath: "", registered: true };
}

for (const [relative, namespace] of [
  ["", null],
  ["bad", null],
  ["skills/team/bad", "team"],
  ["products/deep/bad", null],
] as const) {
  test(`C-TAP-08d rejected name at ${relative || "root"} retains its location`, () => {
    const root = makeTempDir();
    const dir = makeSkill(root, relative || ".", skillFrontmatter({ name: "BAD_NAME" }));
    const index = indexTap({ ...pathTap(root), discovery: "recursive" }, "/unused");

    expect(index.skills.size).toBe(0);
    expect(index.namespaces.size).toBe(0);
    expect(index.skipped).toEqual([
      {
        path: dir,
        tapRelativePath: relative,
        namespace,
        code: "invalid_skill",
        message: expect.stringContaining("BAD_NAME"),
      },
    ]);
  });
}

test("C-TAP-08d malformed and linked manifests retain diagnostics beside healthy skills", () => {
  const root = makeTempDir();
  const malformed = makeSkill(root, "malformed", "name: [broken");
  const linked = join(root, "linked");
  mkdirSync(linked);
  symlinkSync(join(malformed, "SKILL.md"), join(linked, "SKILL.md"));
  makeSkill(root, "healthy", skillFrontmatter({ name: "declared-healthy" }));

  const index = indexTap(pathTap(root), "/unused");

  expect([...index.skills.keys()]).toEqual(["declared-healthy"]);
  expect(index.skipped).toHaveLength(2);
  expect(index.skipped).toEqual(
    expect.arrayContaining([
      {
        path: linked,
        tapRelativePath: "linked",
        namespace: null,
        code: "invalid_skill",
        message: expect.stringContaining("must not be a symbolic link"),
      },
      {
        path: malformed,
        tapRelativePath: "malformed",
        namespace: null,
        code: "invalid_skill",
        message: expect.stringContaining("isn't valid YAML"),
      },
    ]),
  );
});

test("C-TAP-22b invalid standard candidates prevent recursive fallback", () => {
  const root = makeTempDir();
  makeSkill(root, "bad", "name: BAD_NAME");
  makeSkill(root, "products/deep/hidden", skillFrontmatter({ name: "hidden" }));

  const index = indexTap({ ...pathTap(root), discovery: "recursive" }, "/unused");

  expect(index.skills.size).toBe(0);
  expect(index.skipped).toMatchObject([{ tapRelativePath: "bad", code: "invalid_skill" }]);
});

test("C-GIST-02 owning gist layout still ignores invalid files without diagnostics", () => {
  const root = makeTempDir();
  writeFileSync(join(root, "healthy.md"), "---\nname: healthy\ndescription: works\n---\n");
  writeFileSync(join(root, "bad.md"), "---\nname: BAD_NAME\ndescription: bad\n---\n");
  writeFileSync(join(root, "malformed.md"), "---\nname: [broken\n---\n");
  symlinkSync("bad.md", join(root, "linked.md"));
  const tap = { ...pathTap(root), kind: "git" as const, url: "https://gist.github.com/owner/id" };

  const index = indexTap(tap, "/unused", root);

  expect([...index.skills.keys()]).toEqual(["healthy"]);
  expect(index.skipped).toEqual([]);
});
