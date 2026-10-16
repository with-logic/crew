/**
 * `crew update` when upstream changes what a skill's `SKILL.md` is (§9
 * step 4, §10.1; C-UPD-40), at the default branch and at an `@<ref>`.
 *
 * A `SKILL.md` deleted or left dangling is `source_gone`, and the
 * installed bytes stay; so is a skill folder that became a link to
 * itself. One relinked out of the skill's own folder — even to a file
 * elsewhere in the repository, or back in by name — fails the update as
 * `invalid_skill`, as it fails an install, and is never read. A
 * `SKILL.md` linked to a file inside its folder updates.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

/** `name:outcome` for every row of a `crew update --json` run, and its exit code. */
function update(home: string): { code: number; rows: string[] } {
  const r = run(home, ["update", "--json"]);
  const rows: { name: string; outcome: { kind: string } }[] = JSON.parse(r.stdout).rows;
  return { code: r.code, rows: rows.map((row) => `${row.name}:${row.outcome.kind}`) };
}

const installed = (): string => readFileSync(join(claude.userRoot, "demo", "SKILL.md"), "utf8");

/**
 * Install `acme/demo<ref>` from a fresh repo; `demo` also holds
 * `notes.md`. A failed install leaves nothing for `installed()` to read.
 */
function installDemo(ref: string): { home: string; demo: string; repo: string } {
  const home = makeCrewHome();
  const repo = makeTempDir();
  makeSkill(join(repo, "skills"), "demo", skillFrontmatter({ name: "demo" }), "Original.\n");
  const demo = join(repo, "skills", "demo");
  writeFileSync(join(demo, "notes.md"), "Notes.\n");
  makeGitRepo(repo);
  run(home, ["tap", "add", `file://${repo}`, "acme"]);
  run(home, ["install", `acme/demo${ref}`]);
  return { home, demo, repo };
}

const GONE: readonly (readonly [string, (demo: string, repo: string) => void])[] = [
  ["a SKILL.md deleted upstream", (demo) => rmSync(join(demo, "SKILL.md"))],
  [
    "a SKILL.md left as a dangling link",
    (demo) => {
      rmSync(join(demo, "SKILL.md"));
      symlinkSync("nowhere.md", join(demo, "SKILL.md"));
    },
  ],
  [
    "a SKILL.md that links to itself",
    (demo) => {
      rmSync(join(demo, "SKILL.md"));
      symlinkSync("SKILL.md", join(demo, "SKILL.md"));
    },
  ],
  [
    "a skill folder that became a link to itself",
    (demo) => {
      rmSync(demo, { recursive: true });
      symlinkSync("demo", demo);
    },
  ],
];

/** Ways a `SKILL.md` can link out of its folder; each fails the update, unread. */
const OUT: readonly (readonly [string, (demo: string, repo: string) => void])[] = [
  [
    "relinked elsewhere inside the repository",
    (demo, repo) => {
      mkdirSync(join(repo, "shared"));
      renameSync(join(demo, "SKILL.md"), join(repo, "shared", "SKILL.md"));
      symlinkSync(join("..", "..", "shared", "SKILL.md"), join(demo, "SKILL.md"));
    },
  ],
  [
    "linked to a file missing outside its folder",
    (demo) => {
      rmSync(join(demo, "SKILL.md"));
      symlinkSync(join("..", "nowhere.md"), join(demo, "SKILL.md"));
    },
  ],
  [
    "linked through a second link out of its folder",
    (demo, repo) => {
      mkdirSync(join(repo, "shared"));
      renameSync(join(demo, "SKILL.md"), join(repo, "shared", "SKILL.md"));
      symlinkSync(join("..", "..", "shared", "SKILL.md"), join(demo, "hop"));
      symlinkSync("hop", join(demo, "SKILL.md"));
    },
  ],
  [
    "linked out of its folder and back in by name",
    (demo) => {
      renameSync(join(demo, "SKILL.md"), join(demo, "body.md"));
      symlinkSync(join("..", "demo", "body.md"), join(demo, "SKILL.md"));
    },
  ],
];

for (const ref of ["", "@main"]) {
  for (const [what, change] of OUT) {
    test(`C-UPD-40 a SKILL.md ${what} fails the update as invalid (${ref || "no ref"})`, () => {
      const { home, demo, repo } = installDemo(ref);
      expect(installed()).toContain("Original.");
      change(demo, repo);
      commitAll(repo, what);

      const r = run(home, ["update", "--json"]);
      expect(r.code).toBe(1);
      const [row] = JSON.parse(r.stdout).rows;
      expect([row.outcome.kind, row.outcome.error.code]).toEqual(["failed", "invalid_skill"]);
      expect(installed()).toContain("Original.");
    });
  }

  for (const [what, change] of GONE) {
    test(`C-UPD-40 ${what} is source_gone (${ref || "no ref"})`, () => {
      const { home, demo, repo } = installDemo(ref);
      expect(installed()).toContain("Original.");
      change(demo, repo);
      commitAll(repo, what);

      expect(update(home)).toEqual({ code: 0, rows: ["demo:source_gone"] });
      expect(installed()).toContain("Original.");
    });
  }

  test(`C-UPD-40 a SKILL.md linked to a file inside its folder updates (${ref || "no ref"})`, () => {
    const { home, demo, repo } = installDemo(ref);
    writeFileSync(join(demo, "body.md"), readFileSync(join(demo, "SKILL.md"), "utf8"));
    rmSync(join(demo, "SKILL.md"));
    symlinkSync("body.md", join(demo, "SKILL.md"));
    writeFileSync(
      join(demo, "body.md"),
      `---\n${skillFrontmatter({ name: "demo" })}\n---\nEdited.\n`,
    );
    commitAll(repo, "SKILL.md is a link to body.md");

    expect(update(home)).toEqual({ code: 0, rows: ["demo:updated"] });
    expect(installed()).toContain("Edited.");
  });
}
