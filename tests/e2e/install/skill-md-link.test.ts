/**
 * A skill's `SKILL.md` may be a symlink only to a file inside the skill's
 * own folder (§9 step 4; C-SPEC-15): crew never reads through a link out
 * of a skill, and copies one as a link, so the link's text must stay
 * inside too. Any other is `invalid_skill`, refused before it is read.
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
import { runCli } from "../../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeGitRepo, makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
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
  expect(r.out).toMatch(/the SKILL\.md of `\S+\/linked` links outside its skill's folder/);
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

/** A source holding `good` and a `linked` skill whose SKILL.md is `link(folder)`. */
function sourceWithLink(link: (folder: string) => string): string {
  const src = makeTempDir();
  makeSkill(src, "good", skillFrontmatter({ name: "good" }));
  makeSkill(src, "linked", skillFrontmatter({ name: "linked" }));
  const folder = join(src, "linked");
  renameSync(join(folder, "SKILL.md"), join(folder, "body.md"));
  symlinkSync(link(folder), join(folder, "SKILL.md"));
  return src;
}

for (const [what, link] of [
  ["by an absolute path, even to a file inside it", (folder: string) => join(folder, "body.md")],
  ["out and back in by name", () => join("..", "linked", "body.md")],
  ["to nothing outside it", () => "/nonexistent/SKILL.md"],
  [
    "through a folder link inside it that leads out",
    (folder: string) => {
      const outside = makeTempDir();
      const md = `---\n${skillFrontmatter({ name: "linked" })}\n---\nOUTSIDE\n`;
      writeFileSync(join(outside, "SKILL.md"), md);
      symlinkSync(outside, join(folder, "sub"));
      return join("sub", "SKILL.md");
    },
  ],
] as const) {
  test(`C-SPEC-15 a SKILL.md linking ${what} is invalid; the rest install`, () => {
    const r = install(makeCrewHome(), sourceWithLink(link));
    expect(r.code).toBe(1);
    expect(readdirSync(claude.userRoot)).toEqual(["good"]);
    expect(r.out).toContain("links outside its skill's folder");
  });
}

test("C-SPEC-15 a SKILL.md linking out to a file crew can't read is invalid, never read", () => {
  const outside = makeTempDir();
  writeFileSync(join(outside, "SKILL.md"), `---\n${skillFrontmatter({ name: "linked" })}\n---\n`);
  chmodSync(join(outside, "SKILL.md"), 0o000);
  try {
    const r = install(
      makeCrewHome(),
      sourceWithLink(() => join(outside, "SKILL.md")),
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain("links outside its skill's folder");
    expect(r.out).not.toContain("EACCES");
  } finally {
    chmodSync(join(outside, "SKILL.md"), 0o644);
  }
});

test("C-SPEC-15 at a ref, a SKILL.md linking out of a selected folder is invalid too", () => {
  const repo = makeTempDir();
  makeSkill(join(repo, "skills"), "foo", skillFrontmatter({ name: "foo" }));
  mkdirSync(join(repo, "shared"));
  renameSync(join(repo, "skills", "foo", "SKILL.md"), join(repo, "shared", "foo.md"));
  symlinkSync(join("..", "..", "shared", "foo.md"), join(repo, "skills", "foo", "SKILL.md"));
  makeGitRepo(repo);

  // Only `skills/foo` is exported at the ref, so the link dangles there.
  const r = install(makeCrewHome(), `file://${repo}@main//skills/foo`);
  expect(r.code).toBe(4);
  expect(r.out).toContain("links outside its skill's folder");
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

test("C-SPEC-15 a SKILL.md that links to itself is invalid at install and in crew info", () => {
  const src = sourceWithLink(() => "SKILL.md");
  const r = install(makeCrewHome(), src);
  expect(r.code).toBe(1);
  expect(r.out).toContain("is a link that leads to no file");
  expect(r.out).not.toContain("ELOOP");
  const cap = captureStreams();
  const code = runCli(["info", join(src, "linked"), "--json"], {
    home: makeCrewHome(),
    streams: cap.streams,
  });
  expect([code, JSON.parse(cap.stdout()).error.name]).toEqual([4, "invalid_skill"]);
});
