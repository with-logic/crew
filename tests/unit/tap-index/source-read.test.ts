/** Tap indexing preserves source-file operational failures (§9, §13, §16). */

import { expect, test } from "bun:test";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import type { TapConfig } from "../../../src/core/types.ts";
import { indexTap } from "../../../src/install/tap-index.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

test("an unreadable manifest does not make a skill disappear from the index", () => {
  const root = makeTempDir();
  const skill = makeSkill(root, "demo", skillFrontmatter({ name: "demo" }));
  const manifest = join(skill, "SKILL.md");
  const tap: TapConfig = {
    name: "t",
    kind: "path",
    registered: true,
    url: "",
    subpath: "",
    path: root,
  };
  chmodSync(manifest, 0);
  try {
    expect(() => indexTap(tap, "/unused")).toThrow(
      expect.objectContaining({ code: "source_unreachable" }),
    );
  } finally {
    chmodSync(manifest, 0o600);
  }
});
