/**
 * `crew update` and SKILL.md link chains (§9 step 4, §10.1; C-UPD-40), at
 * the default branch and at an `@<ref>`: a chain that starts in a
 * subfolder and leads out from there is refused, unread; one that stays
 * inside, as `current -> v1`, updates; and a folder on the way crew can't
 * look into is named in the failure, not SKILL.md.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import { run } from "./helpers.ts";

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));

/** Install `acme/demo<ref>` from a fresh repo; returns the demo folder upstream. */
function installDemo(ref: string): { home: string; demo: string; repo: string } {
  const home = makeCrewHome();
  const repo = makeTempDir();
  const demo = makeSkill(
    join(repo, "skills"),
    "demo",
    skillFrontmatter({ name: "demo" }),
    "Original.\n",
  );
  makeGitRepo(repo);
  run(home, ["tap", "add", `file://${repo}`, "acme"]);
  run(home, ["install", `acme/demo${ref}`]);
  return { home, demo, repo };
}

const installed = (): string => readFileSync(join(claude.userRoot, "demo", "SKILL.md"), "utf8");

for (const ref of ["", "@main"]) {
  const at = ref || "no ref";

  test(`C-UPD-40 a chain that leads out from a subfolder is refused, unread (${at})`, () => {
    const { home, demo, repo } = installDemo(ref);
    const outside = makeTempDir();
    writeFileSync(
      join(outside, "SKILL.md"),
      `---\n${skillFrontmatter({ name: "demo" })}\n---\nOUT\n`,
    );
    mkdirSync(join(demo, "sub"));
    symlinkSync(outside, join(demo, "sub", "b"));
    symlinkSync("b", join(demo, "sub", "a"));
    rmSync(join(demo, "SKILL.md"));
    symlinkSync(join("sub", "a", "SKILL.md"), join(demo, "SKILL.md"));
    commitAll(repo, "chain out from a subfolder");

    const r = run(home, ["update", "--json"]);
    expect(r.code).toBe(1);
    const [row] = JSON.parse(r.stdout).rows;
    expect([row.outcome.kind, row.outcome.error.code]).toEqual(["failed", "invalid_skill"]);
    expect(installed()).toContain("Original.");
  });

  test(`C-UPD-40 a chain that stays inside, as current -> v1, updates (${at})`, () => {
    const { home, demo, repo } = installDemo(ref);
    mkdirSync(join(demo, "v1"));
    renameSync(join(demo, "SKILL.md"), join(demo, "v1", "SKILL.md"));
    writeFileSync(
      join(demo, "v1", "SKILL.md"),
      `---\n${skillFrontmatter({ name: "demo" })}\n---\nEdited.\n`,
    );
    symlinkSync("v1", join(demo, "current"));
    symlinkSync(join("current", "SKILL.md"), join(demo, "SKILL.md"));
    commitAll(repo, "versioned layout");

    const r = run(home, ["update", "--json"]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).rows[0].outcome.kind).toBe("updated");
    expect(installed()).toContain("Edited.");
  });
}

test("C-UPD-40 a path on the way crew can't look into is named in the failure", () => {
  const home = makeCrewHome();
  const tapDir = makeTempDir();
  const demo = makeSkill(tapDir, "demo", skillFrontmatter({ name: "demo" }), "Original.\n");
  expect(run(home, ["tap", "add", tapDir, "mine"]).code).toBe(0);
  expect(run(home, ["install", "mine/demo"]).code).toBe(0);
  mkdirSync(join(demo, "sub"));
  renameSync(join(demo, "SKILL.md"), join(demo, "sub", "body.md"));
  symlinkSync(join("sub", "body.md"), join(demo, "SKILL.md"));
  chmodSync(join(demo, "sub"), 0o666);
  try {
    const r = run(home, ["update", "--json"]);
    expect(r.code).toBe(1);
    const [row] = JSON.parse(r.stdout).rows;
    expect(row.outcome.error.code).toBe("source_unreachable");
    expect(row.outcome.error.message).toMatch(/couldn't look at `\S+\/demo\/sub\/body\.md`/);
  } finally {
    chmodSync(join(demo, "sub"), 0o755);
  }
});
