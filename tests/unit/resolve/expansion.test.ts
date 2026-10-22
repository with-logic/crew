/** Resolver expansion keeps a selected subtree's tap-relative prefix (§9 step 5). */

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TapConfig } from "../../../src/core/types.ts";
import { expandSkillsAsItems } from "../../../src/install/resolve/expand-items.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

test("subtree expansion joins its tap prefix with nested skill paths before staging", () => {
  const home = makeCrewHome();
  const root = makeTempDir();
  const subtree = join(root, "packages", "team");
  const skill = makeSkill(
    join(subtree, "skills", "marketing"),
    "email",
    skillFrontmatter({ name: "email" }),
    "nested skill bytes",
  );
  const tap: TapConfig = {
    name: "local",
    kind: "path",
    registered: true,
    path: root,
    url: "",
    subpath: "",
  };
  const result = expandSkillsAsItems(
    subtree,
    tap,
    "packages/team",
    null,
    null,
    false,
    true,
    true,
    home,
  );
  expect(result.skipped).toEqual([]);
  expect(result.items).toHaveLength(1);
  const item = result.items[0]!;
  expect(item.tapRelativePath).toBe("packages/team/skills/marketing/email");
  expect(item.loaded.path).toBe(skill);
  expect(item.tap).toBe(tap);
  expect(readFileSync(join(item.staged.storePath, "SKILL.md"))).toEqual(
    readFileSync(join(skill, "SKILL.md")),
  );
});
