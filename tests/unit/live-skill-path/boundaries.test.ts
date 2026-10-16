/**
 * `liveSkillPath` against crew's own clone metadata, folder links crew
 * can't resolve, and skill folders it can't look into (§8.4, §10.1;
 * C-UPD-40). Reaching the clone root or its `.git` from a skill below the
 * root, or a link out of the repository anywhere on the path, is
 * `invalid_ref`; a folder crew can't look into is `source_unreachable`.
 */

import { describe, expect, test } from "bun:test";
import { chmodSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TapConfig } from "../../../src/core/types.ts";
import { liveSkillPath } from "../../../src/sources/acquire/live-skill-path.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { clone, failure, TAP } from "./helpers.ts";

describe("liveSkillPath and crew's clone metadata", () => {
  test("C-UPD-40 a skill folder relinked to the clone root is never read", () => {
    const { home, root, skills } = clone();
    writeFileSync(join(root, "SKILL.md"), `---\n${skillFrontmatter({ name: "demo" })}\n---\n`);
    symlinkSync("..", join(skills, "demo"));
    const err = failure(() => liveSkillPath(TAP, home, root, "skills/demo"));
    expect([err.code, err.message]).toEqual([
      "invalid_ref",
      "`skills/demo` now leads to the repository's root or its `.git` through a symlink, so crew won't read it",
    ]);
  });

  test("C-UPD-40 a skill folder relinked into .git is never read", () => {
    const { home, root, skills } = clone();
    makeSkill(join(root, ".git"), "demo", skillFrontmatter({ name: "demo" }));
    symlinkSync(join("..", ".git", "demo"), join(skills, "demo"));
    expect(failure(() => liveSkillPath(TAP, home, root, "skills/demo")).code).toBe("invalid_ref");
  });
});

describe("liveSkillPath through a folder link crew can't resolve", () => {
  test("C-UPD-40 a parent folder linked out of the repository is never read", () => {
    const { home, root } = clone();
    const outside = makeTempDir("crew-live-outside-");
    makeSkill(join(outside, "locked", "skills"), "demo", skillFrontmatter({ name: "demo" }));
    const linked = join(root, "linked");
    symlinkSync(join(outside, "locked", "skills"), linked);
    chmodSync(join(outside, "locked"), 0o000);
    try {
      expect(failure(() => liveSkillPath(TAP, home, root, "linked/demo")).code).toBe("invalid_ref");
    } finally {
      chmodSync(join(outside, "locked"), 0o755);
    }
  });
});

describe("liveSkillPath on a skill folder crew can't look into", () => {
  test("C-UPD-40 in a git tap it is a local fault, not an upstream deletion", () => {
    const { home, root, skills } = clone();
    makeSkill(skills, "demo", skillFrontmatter({ name: "demo" }));
    chmodSync(join(skills, "demo"), 0o444);
    try {
      expect(failure(() => liveSkillPath(TAP, home, root, "skills/demo")).code).toBe(
        "source_unreachable",
      );
    } finally {
      chmodSync(join(skills, "demo"), 0o755);
    }
  });

  test("C-UPD-40 in a path tap it is a local fault, not an upstream deletion", () => {
    const dir = makeTempDir("crew-live-path-");
    const tap: TapConfig = { ...TAP, kind: "path", url: "", path: dir };
    makeSkill(dir, "demo", skillFrontmatter({ name: "demo" }));
    chmodSync(join(dir, "demo"), 0o000);
    try {
      const err = failure(() => liveSkillPath(tap, dir, dir, "demo"));
      expect(err.code).toBe("source_unreachable");
      expect(err.message).toMatch(/^couldn't look at `\S+\/demo\/SKILL\.md` — EACCES/);
    } finally {
      chmodSync(join(dir, "demo"), 0o755);
    }
  });
});

describe("liveSkillPath in a path tap", () => {
  test("a skill deleted from the user's directory is gone", () => {
    const dir = makeTempDir("crew-live-path-");
    const tap: TapConfig = { ...TAP, kind: "path", url: "", path: dir };
    expect(failure(() => liveSkillPath(tap, dir, dir, "demo")).code).toBe("no_skills_found");
  });
});
