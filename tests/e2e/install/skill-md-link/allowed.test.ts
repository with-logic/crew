/**
 * A `SKILL.md` that links to a file inside its folder through relative,
 * `..`-free links installs, and reads the same once copied (§9 step 4;
 * C-SPEC-15). A folder crew can't look into isn't taken for a skill.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import { install, sourceWithLink } from "./helpers.ts";

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));

test("C-SPEC-15 a SKILL.md linked to a file inside its folder installs, and still reads", () => {
  const src = makeTempDir();
  makeSkill(src, "demo", skillFrontmatter({ name: "demo" }), "The body.\n");
  const folder = join(src, "demo");
  writeFileSync(join(folder, "body.md"), readFileSync(join(folder, "SKILL.md")));
  rmSync(join(folder, "SKILL.md"));
  symlinkSync("body.md", join(folder, "SKILL.md"));

  expect(install(makeCrewHome(), src).code).toBe(0);
  expect(readFileSync(join(claude.userRoot, "demo", "SKILL.md"), "utf8")).toContain("The body.");
});

test("a folder crew can't look into isn't taken for a skill", () => {
  const src = makeTempDir();
  makeSkill(src, "good", skillFrontmatter({ name: "good" }));
  mkdirSync(join(src, "sealed"));
  chmodSync(join(src, "sealed"), 0o666);
  try {
    expect(install(makeCrewHome(), src).code).toBe(0);
    expect(readdirSync(claude.userRoot)).toEqual(["good"]);
  } finally {
    chmodSync(join(src, "sealed"), 0o755);
  }
});

for (const [what, link] of [
  [
    "through a folder link that stays inside it",
    (folder: string) => {
      symlinkSync(".", join(folder, "here"));
      return join("here", "body.md");
    },
  ],
  [
    "to another link inside it",
    (folder: string) => {
      symlinkSync("body.md", join(folder, "hop"));
      return "hop";
    },
  ],
  [
    "through a versioned folder link, as `current -> v1`",
    (folder: string) => {
      mkdirSync(join(folder, "v1"));
      renameSync(join(folder, "body.md"), join(folder, "v1", "SKILL.md"));
      symlinkSync("v1", join(folder, "current"));
      return join("current", "SKILL.md");
    },
  ],
] as const) {
  test(`C-SPEC-15 a SKILL.md linked ${what} installs, and still reads`, () => {
    const r = install(makeCrewHome(), sourceWithLink(link));
    expect(r.code).toBe(0);
    expect(readdirSync(claude.userRoot).sort()).toEqual(["good", "linked"]);
    expect(readFileSync(join(claude.userRoot, "linked", "SKILL.md"), "utf8")).toContain(
      "name: linked",
    );
  });
}
