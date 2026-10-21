/** Name-only metadata loading preserves discovery validation and parser semantics (§9 step 4). */

import { describe, expect, test } from "bun:test";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CrewError } from "../../src/core/errors.ts";
import { loadSkill, loadSkillName } from "../../src/skill/load.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

function makeSkillDirectory(rawSkillMd: string): string {
  const dir = makeTempDir();
  writeFileSync(join(dir, "SKILL.md"), rawSkillMd);
  return dir;
}

describe("loadSkillName", () => {
  test.each([loadSkill, loadSkillName])(
    "unreadable SKILL.md is source_unreachable (%p)",
    (load) => {
      const skill = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
      const manifest = join(skill, "SKILL.md");
      chmodSync(manifest, 0);
      try {
        expect(() => load(skill)).toThrow(
          expect.objectContaining({
            code: "source_unreachable",
            details: { path: manifest },
            remedy: expect.stringContaining("source file"),
          }),
        );
      } finally {
        chmodSync(manifest, 0o600);
      }
    },
  );

  test("manifest traversal permissions retain their native error", () => {
    const skill = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
    chmodSync(skill, 0o400);
    try {
      expect(() => loadSkill(skill)).toThrow(expect.objectContaining({ code: "EACCES" }));
      expect(() => loadSkillName(skill)).toThrow(expect.objectContaining({ code: "EACCES" }));
    } finally {
      chmodSync(skill, 0o700);
    }
  });

  test("missing SKILL.md fails with CrewError", () => {
    const d = makeTempDir();
    expect(() => loadSkillName(d)).toThrow(CrewError);
  });

  test("name-only discovery accepts missing or invalid unrelated fields", () => {
    for (const fields of ["", "description: []\ncompatibility: []\nmetadata: []\n"])
      expect(loadSkillName(makeSkillDirectory(`---\nname: candidate\n${fields}---\nbody`))).toBe(
        "candidate",
      );
  });

  test("full loading preserves original bytes", () => {
    const raw = "\uFEFF \r\n---\rname: candidate\rdescription: déjà vu ☃\r---\r\nbody\r\n";
    expect(loadSkill(makeSkillDirectory(raw)).skillMd).toBe(raw);
  });

  test("whitespace, UTF-8, line endings and EOF delimiters remain accepted", () => {
    for (const ending of ["\n", "\r", "\r\n"]) {
      for (const padding of [4092, 4093, 4094, 4095]) {
        const raw = `\uFEFF\u2003${ending}${" ".repeat(padding)}--- \t${ending}name: candidate${ending}note: déjà ☃${ending}\u00A0---\u2028`;
        expect(loadSkillName(makeSkillDirectory(raw))).toBe("candidate");
      }
    }
  });

  test("large legitimate headers remain accepted without a size cap", () => {
    const raw = `---\nname: candidate\nnote: ${"x".repeat(128 * 1024)}\n---`;
    expect(loadSkillName(makeSkillDirectory(raw))).toBe("candidate");
  });

  test.each(["", "\u2003\n\t\r\n", "--\n", "- -\n", "----\n", "--- x\n"])(
    "missing opening delimiters preserve the exact error (%j)",
    (raw) => {
      expect(() => loadSkillName(makeSkillDirectory(raw))).toThrow(
        new CrewError(
          "invalid_skill",
          "SKILL.md is missing its YAML frontmatter — the first line should be `---`",
        ),
      );
    },
  );

  test.each(["---", "---\nname: candidate", "---\nname: candidate\n--\n----\n- -\n"])(
    "unclosed delimiters preserve the exact error (%j)",
    (raw) => {
      expect(() => loadSkillName(makeSkillDirectory(raw))).toThrow(
        new CrewError(
          "invalid_skill",
          "SKILL.md frontmatter never closes — add a `---` line after the last YAML field",
        ),
      );
    },
  );

  test("invalid YAML still reports the parser error", () => {
    expect(() => loadSkillName(makeSkillDirectory("---\nname: [\n---\n"))).toThrow(
      "SKILL.md frontmatter isn't valid YAML —",
    );
  });

  test.each(["[]", "name: []", "name: invalid--name"])(
    "name validation still rejects invalid metadata (%s)",
    (yaml) =>
      expect(() => loadSkillName(makeSkillDirectory(`---\n${yaml}\n---`))).toThrow(CrewError),
  );
});
