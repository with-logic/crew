/**
 * A skill crew can't read is one failed skill, not a failed command
 * (§9 steps 4, 8: no validation failure aborts the whole command;
 * C-SPEC-15, C-SPEC-16, C-INST-21).
 *
 * A `SKILL.md` that is a directory, or that the user can't read, is
 * skipped with a message naming it while the source's other skills
 * install — the run exits 1, as for any partial failure. So is a skill
 * with any other file crew can't copy into the store (§9 step 8).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
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

describe("crew install of a folder with a skill crew can't load", () => {
  test("C-SPEC-15 a SKILL.md that is a directory skips that skill; the rest install", () => {
    const src = makeTempDir();
    makeSkill(src, "good", skillFrontmatter({ name: "good" }));
    mkdirSync(join(src, "odd", "SKILL.md"), { recursive: true });

    const r = install(makeCrewHome(), src);
    expect(r.code).toBe(1);
    expect(readdirSync(claude.userRoot)).toEqual(["good"]);
    expect(r.out).toMatch(/`\S+\/odd\/SKILL\.md` isn't a regular file/);
    expect(r.out).not.toContain("unexpected error");
  });

  test("C-SPEC-16 a SKILL.md crew can't read skips that skill, naming it; the rest install", () => {
    const src = makeTempDir();
    makeSkill(src, "good", skillFrontmatter({ name: "good" }));
    makeSkill(src, "locked", skillFrontmatter({ name: "locked" }));
    chmodSync(join(src, "locked", "SKILL.md"), 0o000);
    try {
      const r = install(makeCrewHome(), src);
      expect(r.code).toBe(1);
      expect(readdirSync(claude.userRoot)).toEqual(["good"]);
      expect(r.out).toMatch(/couldn't read `\S+\/locked\/SKILL\.md` — EACCES/);
    } finally {
      chmodSync(join(src, "locked", "SKILL.md"), 0o644);
    }
  });

  test("C-SPEC-16 a skill with a file crew can't copy skips that skill, naming the file; the rest install", () => {
    const src = makeTempDir();
    makeSkill(src, "good", skillFrontmatter({ name: "good" }));
    makeSkill(src, "locked", skillFrontmatter({ name: "locked" }));
    const notes = join(src, "locked", "notes.txt");
    writeFileSync(notes, "private");
    chmodSync(notes, 0o000);
    try {
      const r = install(makeCrewHome(), src);
      expect(r.code).toBe(1);
      expect(readdirSync(claude.userRoot)).toEqual(["good"]);
      expect(r.out).toMatch(/couldn't copy `\S+\/locked\/notes\.txt` into the store — EACCES/);
      expect(r.out).not.toContain("unexpected error");
    } finally {
      chmodSync(notes, 0o644);
    }
  });

  test("C-INST-21 a source whose only skill can't be read is an operational failure (exit 1)", () => {
    const src = makeTempDir();
    makeSkill(src, "locked", skillFrontmatter({ name: "locked" }));
    chmodSync(join(src, "locked", "SKILL.md"), 0o000);
    try {
      expect(install(makeCrewHome(), src).code).toBe(1);
    } finally {
      chmodSync(join(src, "locked", "SKILL.md"), 0o644);
    }
  });
});
