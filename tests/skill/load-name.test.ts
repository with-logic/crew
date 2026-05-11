import { describe, expect, test } from "bun:test";
import { CrewError } from "../../src/core/errors.ts";
import { loadSkillName } from "../../src/skill/load.ts";
import { makeTempDir } from "../helpers/fixtures.ts";

describe("loadSkillName", () => {
  test("missing SKILL.md fails with CrewError", () => {
    const d = makeTempDir();
    expect(() => loadSkillName(d)).toThrow(CrewError);
  });
});
