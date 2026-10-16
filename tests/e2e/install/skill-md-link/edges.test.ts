/**
 * Edges of the SKILL.md link rule at install (§9 step 4; C-SPEC-15): a
 * source named with a trailing slash is held to it the same; link text
 * that isn't UTF-8 is refused, never followed; a chain at crew's limit
 * installs and one longer is refused; past a missing part the rest is
 * judged by its text, quickly however long; and a failure to look on the
 * way names the path that failed, not SKILL.md (§13; C-SPEC-16).
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { assertSkillMdLinkAllowed } from "../../../../src/skill/skill-md-link.ts";
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

/** A source whose `linked/SKILL.md` reaches `body.md` through `links` links, SKILL.md included. */
function chainOf(links: number): string {
  return sourceWithLink((folder) => {
    let target = "body.md";
    for (let i = 1; i < links; i++) {
      symlinkSync(target, join(folder, `hop${i}`));
      target = `hop${i}`;
    }
    return target;
  });
}

test("C-SPEC-15 a chain at crew's limit installs", () => {
  // At the temp folder's real path: on macOS `/var` is a link too, which
  // the system counts against the same limit of 32 when it reads the file.
  const r = install(makeCrewHome(), realpathSync(chainOf(32)));
  expect(r.code).toBe(0);
  expect(readdirSync(claude.userRoot).sort()).toEqual(["good", "linked"]);
});

test("C-SPEC-15 a chain longer than crew's limit is refused", () => {
  const r = install(makeCrewHome(), chainOf(33));
  expect(r.code).toBe(1);
  expect(readdirSync(claude.userRoot)).toEqual(["good"]);
  expect(r.out).toContain("reached through a link crew won't follow");
});

test("C-SPEC-15 past a missing part, a link the rest names is judged by its text", () => {
  // Followed, `lnk` would lead down (`a/b`), so the `..`s after it stay
  // inside; as text they climb above the folder. The system would stop at
  // `missing`, so following would be judging a path no one reads.
  const src = sourceWithLink((folder) => {
    symlinkSync(join("a", "b"), join(folder, "lnk"));
    return "missing/../lnk/../../x.md";
  });
  const r = install(makeCrewHome(), src);
  expect(r.code).toBe(1);
  expect(r.out).toContain("reached through a link crew won't follow");
});

test("C-SPEC-15 a long chain past a missing part is judged quickly", () => {
  // 32 links of the longest text macOS allows, the last into a missing
  // folder: ~16,000 parts left to judge by text, which must stay linear.
  const long = (head: string) => `${head}${"/a".repeat(500)}`;
  const folder = join(
    sourceWithLink((f) => {
      for (let i = 1; i < 32; i++)
        symlinkSync(long(i === 31 ? "missing" : `L${i + 1}`), join(f, `L${i}`));
      return long("L1");
    }),
    "linked",
  );
  const started = performance.now();
  assertSkillMdLinkAllowed(folder);
  expect(performance.now() - started).toBeLessThan(250);
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
