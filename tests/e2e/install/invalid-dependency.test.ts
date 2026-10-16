/**
 * A dependency beside its parent whose SKILL.md is invalid fails the
 * install with that reason, naming the dependency — never passed over for
 * another tap's skill of the same name (§9 step 6; C-SPEC-16).
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
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
