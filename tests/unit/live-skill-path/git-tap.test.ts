/**
 * `liveSkillPath`: finding an installed skill again in a live checkout
 * (§8.4, §10.1; C-UPD-11, C-UPD-39, C-UPD-40).
 *
 * Each case lays out the tap's clone by hand, so the link and permission
 * shapes upstream could leave behind are exact. Gone — including a link
 * that dangles or loops — is `no_skills_found`; a link out of the
 * repository, resolvable or not, is `invalid_ref` (both `source_gone` on
 * update); anything else crew can't look at is `source_unreachable`.
 */

import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { liveSkillPath } from "../../../src/sources/acquire/live-skill-path.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { clone, failure, TAP } from "./helpers.ts";

describe("liveSkillPath in a git tap", () => {
  test("a skill folder is found where it was recorded", () => {
    const { home, root, skills } = clone();
    makeSkill(skills, "demo", skillFrontmatter({ name: "demo" }));
    expect(liveSkillPath(TAP, home, root, "skills/demo")).toBe(join(skills, "demo"));
  });

  test("C-UPD-40 a link out of the repository is never read, even one crew can't resolve", () => {
    const { home, root, skills } = clone();
    const outside = makeTempDir("crew-live-outside-");
    makeSkill(join(outside, "locked"), "demo", skillFrontmatter({ name: "demo" }));
    symlinkSync(join(outside, "locked", "demo"), join(skills, "demo"));
    chmodSync(join(outside, "locked"), 0o000);
    try {
      expect(failure(() => liveSkillPath(TAP, home, root, "skills/demo")).code).toBe("invalid_ref");
    } finally {
      chmodSync(join(outside, "locked"), 0o755);
    }
  });

  test("C-UPD-40 an in-repository link to a folder crew can't read is a local fault", () => {
    const { home, root, skills } = clone();
    makeSkill(join(root, "shared", "locked"), "demo", skillFrontmatter({ name: "demo" }));
    symlinkSync(join("..", "shared", "locked", "demo"), join(skills, "demo"));
    chmodSync(join(root, "shared", "locked"), 0o000);
    try {
      expect(failure(() => liveSkillPath(TAP, home, root, "skills/demo")).code).toBe(
        "source_unreachable",
      );
    } finally {
      chmodSync(join(root, "shared", "locked"), 0o755);
    }
  });

  test("C-UPD-40 a SKILL.md relinked out of the repository is never read", () => {
    const { home, root, skills } = clone();
    const outside = makeTempDir("crew-live-outside-");
    writeFileSync(join(outside, "SKILL.md"), `---\n${skillFrontmatter({ name: "demo" })}\n---\n`);
    mkdirSync(join(skills, "demo"));
    symlinkSync(join(outside, "SKILL.md"), join(skills, "demo", "SKILL.md"));
    expect(failure(() => liveSkillPath(TAP, home, root, "skills/demo")).code).toBe("invalid_skill");
  });

  test("C-UPD-40 a folder crew can't look into is a local fault, named with its reason", () => {
    const { home, root, skills } = clone();
    makeSkill(skills, "demo", skillFrontmatter({ name: "demo" }));
    chmodSync(skills, 0o000);
    try {
      const err = failure(() => liveSkillPath(TAP, home, root, "skills/demo"));
      expect(err.code).toBe("source_unreachable");
      expect(err.message).toMatch(
        /^couldn't look at `\S+\/skills\/demo` — EACCES: permission denied$/,
      );
    } finally {
      chmodSync(skills, 0o755);
    }
  });
});
