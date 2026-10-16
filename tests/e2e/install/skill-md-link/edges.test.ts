/**
 * Edges of the SKILL.md link rule at install (§9 step 4; C-SPEC-15): a
 * source named with a trailing slash is held to it the same; a chain
 * longer than any system follows is refused; and a failure to look on
 * the way names the folder that failed, not SKILL.md (§13).
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../../helpers/env.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import { install, sourceWithLink } from "./helpers.ts";

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));

test("C-SPEC-15 a skill named with a trailing slash is held to the .crew.json rule the same", () => {
  const src = sourceWithLink((folder) => {
    writeFileSync(join(folder, ".crew.json"), readFileSync(join(folder, "body.md")));
    mkdirSync(join(folder, "sub"));
    // Back up to the folder with `..`, where a trailing slash would no
    // longer match it unless the folder is normalized first.
    return "sub/../.crew.json";
  });
  const r = install(makeCrewHome(), `${join(src, "linked")}/`);
  expect(r.code).toBe(4);
  expect(r.out).toContain("reached through a link crew won't follow");
});

test("C-SPEC-15 a chain of more links than any system follows is refused", () => {
  const src = sourceWithLink((folder) => {
    let target = "body.md";
    for (let i = 0; i < 33; i++) {
      symlinkSync(target, join(folder, `hop${i}`));
      target = `hop${i}`;
    }
    return target;
  });
  const r = install(makeCrewHome(), src);
  expect(r.code).toBe(1);
  expect(readdirSync(claude.userRoot)).toEqual(["good"]);
  expect(r.out).toContain("reached through a link crew won't follow");
});

test("a folder on the way crew can't look into is named, not SKILL.md", () => {
  const src = sourceWithLink((folder) => {
    mkdirSync(join(folder, "sub"));
    writeFileSync(join(folder, "sub", "body.md"), "x");
    return join("sub", "body.md");
  });
  const sub = join(src, "linked", "sub");
  chmodSync(sub, 0o666);
  try {
    const r = install(makeCrewHome(), src);
    expect(r.out).toMatch(/couldn't look at `\S+\/linked\/sub\/body\.md`/);
  } finally {
    chmodSync(sub, 0o755);
  }
});
