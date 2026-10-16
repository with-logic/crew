/**
 * A `SKILL.md` that links to a file inside its folder through relative,
 * `..`-free links installs, and reads the same once copied (§9 step 4;
 * C-SPEC-15), a `..` that stays inside it included.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import {
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

for (const [what, link] of [
  [
    "through three links, as `current -> latest -> v2`",
    (folder: string) => {
      mkdirSync(join(folder, "v2"));
      renameSync(join(folder, "body.md"), join(folder, "v2", "SKILL.md"));
      symlinkSync("v2", join(folder, "latest"));
      symlinkSync("latest", join(folder, "current"));
      return join("current", "SKILL.md");
    },
  ],
  [
    "to a `.crew.json` in a subfolder, which a copy keeps",
    (folder: string) => {
      mkdirSync(join(folder, "sub"));
      renameSync(join(folder, "body.md"), join(folder, "sub", ".crew.json"));
      return join("sub", ".crew.json");
    },
  ],
  [
    "with a `..` that stays inside it",
    (folder: string) => {
      mkdirSync(join(folder, "docs"));
      return "docs/../body.md";
    },
  ],
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
