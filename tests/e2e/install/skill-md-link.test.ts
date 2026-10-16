/**
 * A skill's `SKILL.md` may be a symlink only to a file inside the skill's
 * own folder (§9 step 4; C-SPEC-15): crew copies a link as a link, so one
 * leading anywhere else would install a skill with no `SKILL.md`.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

function install(home: string, source: string): { code: number; out: string } {
  const cap = captureStreams();
  const code = runCli(["install", source], { home, streams: cap.streams });
  // Collapse the renderer's line wrapping so messages match as one line.
  return { code, out: (cap.stdout() + cap.stderr()).replace(/\s+/g, " ") };
}

test("C-SPEC-15 a SKILL.md linking out of its folder is invalid; the rest install", () => {
  const src = makeTempDir();
  makeSkill(src, "good", skillFrontmatter({ name: "good" }));
  mkdirSync(join(src, "docs"));
  writeFileSync(
    join(src, "docs", "linked.md"),
    `---\n${skillFrontmatter({ name: "linked" })}\n---\n`,
  );
  mkdirSync(join(src, "linked"));
  symlinkSync(join("..", "docs", "linked.md"), join(src, "linked", "SKILL.md"));

  const r = install(makeCrewHome(), src);
  expect(r.code).toBe(1);
  expect(readdirSync(claude.userRoot)).toEqual(["good"]);
  expect(r.out).toMatch(/`\S+\/linked\/SKILL\.md` links outside its skill's folder/);
});

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
