/**
 * `crew update` of a skill installed at an `@<ref>` (§9 step 3, §10.1;
 * C-UPD-40): the skill is read from a scratch export of the commit, and
 * its `SKILL.md` is still never read through a link out of it.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../helpers/scoped-install.ts";

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));

function run(home: string, args: string[]): { code: number; stdout: string } {
  const cap = captureStreams();
  const code = runCli(args, { home, streams: cap.streams });
  return { code, stdout: cap.stdout() };
}

test("C-UPD-40 a SKILL.md relinked out of the repository is never read at a ref", () => {
  const home = makeCrewHome();
  const repo = makeTempDir();
  makeSkill(join(repo, "skills"), "demo", skillFrontmatter({ name: "demo" }), "Original.\n");
  makeGitRepo(repo);
  run(home, ["tap", "add", `file://${repo}`, "acme"]);
  expect(run(home, ["install", "acme/demo@main"]).code).toBe(0);

  const outside = makeTempDir();
  writeFileSync(
    join(outside, "SKILL.md"),
    `---\n${skillFrontmatter({ name: "demo" })}\n---\nOUTSIDE\n`,
  );
  rmSync(join(repo, "skills", "demo", "SKILL.md"));
  symlinkSync(join(outside, "SKILL.md"), join(repo, "skills", "demo", "SKILL.md"));
  commitAll(repo, "link SKILL.md out of the repo");

  const r = run(home, ["update", "--json"]);
  const rows: { name: string; outcome: { kind: string } }[] = JSON.parse(r.stdout).rows;
  expect(rows.map((row) => `${row.name}:${row.outcome.kind}`)).toEqual(["demo:source_gone"]);
  expect(readFileSync(join(claude.userRoot, "demo", "SKILL.md"), "utf8")).toContain("Original.");
});
