/**
 * Which sibling a bare dependency resolves to (§9 step 6; C-SPEC-16): one
 * whose SKILL.md is invalid fails the install with that reason, naming
 * the dependency — never passed over for another tap's skill of the same
 * name. A sibling is matched by its declared name, and an entry named for
 * the dependency that isn't a skill at all is no sibling.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));

test("C-SPEC-16 an invalid dependency beside its parent fails the install, naming it", () => {
  const other = makeTempDir();
  makeSkill(join(other, "skills"), "b", skillFrontmatter({ name: "b" }));
  const home = makeCrewHome();
  runCli(["tap", "add", other, "other"], { home, streams: captureStreams().streams });
  const src = makeTempDir();
  makeSkill(src, "a", skillFrontmatter({ name: "a", dependencies: ["b"] }));
  makeSkill(src, "b", skillFrontmatter({ name: "b" }));
  writeFileSync(join(src, "b", "SKILL.md"), "---\nname: b\n---\nNo description.\n");

  const cap = captureStreams();
  const code = runCli(["install", join(src, "a"), "--json"], { home, streams: cap.streams });
  const { error } = JSON.parse(cap.stdout());
  expect([code, error.name]).toEqual([4, "invalid_skill"]);
  expect(error.message).toMatch(/^dependency `b` \(`\S+\/b`\): /);
  expect(error.details).toMatchObject({ dependency: "b", path: join(src, "b") });
  expect(readdirSync(claude.userRoot)).toEqual([]);
});

/** A home whose tap `other` holds a valid `b`, and a source where `a` depends on `b`. */
function setup(): { home: string; src: string } {
  const other = makeTempDir();
  makeSkill(join(other, "skills"), "b", skillFrontmatter({ name: "b" }));
  const home = makeCrewHome();
  runCli(["tap", "add", other, "other"], { home, streams: captureStreams().streams });
  const src = makeTempDir();
  makeSkill(src, "a", skillFrontmatter({ name: "a", dependencies: ["b"] }));
  return { home, src };
}

function installA(home: string, src: string): number {
  return runCli(["install", join(src, "a")], { home, streams: captureStreams().streams });
}

test("a sibling is matched by its declared name, not its folder name", () => {
  const { home, src } = setup();
  makeSkill(src, "b", skillFrontmatter({ name: "c" }));
  makeSkill(src, "x", skillFrontmatter({ name: "b" }), "From x.\n");
  expect(installA(home, src)).toBe(0);
  expect(readFileSync(join(claude.userRoot, "b", "SKILL.md"), "utf8")).toContain("From x.");
});

test("an entry named for the dependency that isn't a skill is no sibling", () => {
  const { home, src } = setup();
  mkdirSync(join(src, "b"));
  writeFileSync(join(src, "b", "README.md"), "Not a skill.\n");
  // A folder named `b.md` is not `b` (only a gist file drops its `.md`),
  // so its invalid SKILL.md is no concern of this dependency's.
  makeSkill(src, "b.md", "name: other-name");
  expect(installA(home, src)).toBe(0);
  const b = readState(home).installations.find((e) => e.name === "b");
  expect(b?.source.tap).toBe("other");
});
