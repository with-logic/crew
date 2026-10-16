/**
 * A `SKILL.md` reached through a link crew won't follow is `invalid_skill`
 * at install, refused before anything is read through it (§9 step 4;
 * C-SPEC-15): a link with absolute text or a `..` anywhere on the way,
 * one that loops, one to the folder's `.crew.json`, or — not a link
 * question — one to nothing.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../../../helpers/env.ts";
import {
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import { install, sourceWithLink } from "./helpers.ts";

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));

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
  expect(r.out).toMatch(
    /the SKILL\.md of `\S+\/linked` is reached through a link crew won't follow/,
  );
});

for (const [what, link] of [
  ["by an absolute path, even to a file inside it", (folder: string) => join(folder, "body.md")],
  ["out and back in by name", () => join("..", "linked", "body.md")],
  ["to nothing outside it", () => "/nonexistent/SKILL.md"],
  [
    "to the folder's .crew.json, which a copy replaces with crew's marker",
    (folder: string) => {
      writeFileSync(join(folder, ".crew.json"), readFileSync(join(folder, "body.md")));
      return ".crew.json";
    },
  ],
  [
    "past a folder link with `..`",
    (folder: string) => {
      const outside = makeTempDir();
      mkdirSync(join(outside, "inner"));
      const md = `---\n${skillFrontmatter({ name: "linked" })}\n---\nOUTSIDE\n`;
      writeFileSync(join(outside, "x.md"), md);
      symlinkSync(join(outside, "inner"), join(folder, "sub"));
      return "sub/../x.md";
    },
  ],
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
    expect(r.out).toContain("reached through a link crew won't follow");
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
    expect(r.out).toContain("reached through a link crew won't follow");
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
  expect(r.out).toContain("reached through a link crew won't follow");
});

test("C-SPEC-15 a SKILL.md that is a link to nothing is invalid; the rest install", () => {
  const r = install(
    makeCrewHome(),
    sourceWithLink(() => "nowhere.md"),
  );
  expect(r.code).toBe(1);
  expect(readdirSync(claude.userRoot)).toEqual(["good"]);
  expect(r.out).toMatch(/`\S+\/linked\/SKILL\.md` is a link that leads to no file/);
});

test("C-SPEC-15 a SKILL.md that links to itself is invalid at install and in crew info", () => {
  const src = sourceWithLink(() => "SKILL.md");
  const r = install(makeCrewHome(), src);
  expect(r.code).toBe(1);
  expect(r.out).toContain("reached through a link crew won't follow");
  expect(r.out).toContain("Make the skill's SKILL.md a regular file");
  expect(r.out).not.toContain("ELOOP");
  const cap = captureStreams();
  const code = runCli(["info", join(src, "linked"), "--json"], {
    home: makeCrewHome(),
    streams: cap.streams,
  });
  expect([code, JSON.parse(cap.stdout()).error.name]).toEqual([4, "invalid_skill"]);
});
