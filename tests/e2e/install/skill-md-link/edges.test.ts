/**
 * Edges of the SKILL.md link rule at install (§9 step 4; C-SPEC-15): a
 * source named with a trailing slash is held to it the same; link text
 * that isn't UTF-8 is refused, never followed; a chain
 * longer than crew's limit is refused; and a failure to look on the way
 * names the path that failed, not SKILL.md (§13; C-SPEC-16).
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

test("C-SPEC-15 a chain longer than crew's limit is refused", () => {
  const src = sourceWithLink((folder) => {
    let target = "body.md";
    // SKILL.md plus 32 more: 33 links, one over crew's limit of 32.
    for (let i = 0; i < 32; i++) {
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

test("C-SPEC-16 a path on the way crew can't look into is named, not SKILL.md", () => {
  const src = sourceWithLink((folder) => {
    mkdirSync(join(folder, "sub"));
    writeFileSync(join(folder, "sub", "body.md"), "x");
    return join("sub", "body.md");
  });
  const sub = join(src, "linked", "sub");
  chmodSync(sub, 0o666);
  try {
    const r = install(makeCrewHome(), src);
    expect(r.code).toBe(1);
    expect(readdirSync(claude.userRoot)).toEqual(["good"]);
    expect(r.out).toMatch(/couldn't look at `\S+\/linked\/sub\/body\.md`/);
  } finally {
    chmodSync(sub, 0o755);
  }
});

test("C-SPEC-15 a SKILL.md link whose text isn't UTF-8 is refused, never followed", () => {
  // On Linux a folder could carry those very bytes as its name and lead
  // anywhere; the text crew would check decodes to a different name.
  const notUtf8 = Buffer.from([0xff, 0x2f, 0x78, 0x2e, 0x6d, 0x64]); // "\xff/x.md"
  const src = sourceWithLink(() => notUtf8);
  const r = install(makeCrewHome(), src);
  expect(r.code).toBe(1);
  expect(readdirSync(claude.userRoot)).toEqual(["good"]);
  expect(r.out).toContain("reached through a link crew won't follow");
});
