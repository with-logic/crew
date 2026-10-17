/**
 * Siblings crew can't list (§9 step 6; C-SPEC-16): a bare-name dependency
 * is looked for beside its parent first, so a parent folder crew can't
 * list fails the install as `source_unreachable`, naming the dependency
 * and the folder, rather than passing the dependency over to other taps
 * or failing as an unexpected error.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import { crew } from "./folder-links/helpers.ts";

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));

test("C-SPEC-16 a dependency whose siblings crew can't list fails, naming it and the folder", () => {
  const src = makeTempDir();
  const skills = join(src, "skills");
  makeSkill(skills, "a", skillFrontmatter({ name: "a", dependencies: ["b"] }));
  makeSkill(skills, "b", skillFrontmatter({ name: "b" }));
  // Crew can reach `a` through `skills/`, but not list what's beside it.
  chmodSync(skills, 0o300);
  let r: ReturnType<typeof crew>;
  try {
    r = crew(makeCrewHome(), ["install", join(skills, "a"), "--json"]);
  } finally {
    chmodSync(skills, 0o755);
  }
  const { error } = JSON.parse(r.out) as {
    error: { name: string; message: string; details: { dependency?: string } };
  };
  expect([r.code, error.name, error.details.dependency]).toEqual([5, "source_unreachable", "b"]);
  expect(error.message).toContain(`dependency \`b\``);
  expect(error.message).toContain(`couldn't read \`${skills}\``);
  expect(readdirSync(claude.userRoot)).toEqual([]);
});
