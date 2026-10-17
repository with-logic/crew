/**
 * `<tap>/<skill>` references to candidates crew can't name (§8.3; C-REF-40):
 * the refusal keeps the candidate's own next step — a folder linked out
 * of the repository says to make it a folder there, one crew can't read
 * says to check its permissions — rather than the generic hint for its
 * code. A candidate in another namespace, or found by recursive discovery
 * outside `skills/`, doesn't answer a three-segment reference; and a
 * `<tap>/<skill>` whose tap crew can't read at all fails with that tap's
 * error rather than as not found — unless a namespace of that name in
 * another tap answers it.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import { crew, gitRepo, link, outsideSkill, skillAt } from "./folder-links/helpers.ts";

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));

/** A home with `source` added as the registered tap `mine`; throws when it can't be added. */
function withTap(source: string, ...flags: string[]): string {
  const home = makeCrewHome();
  const added = crew(home, ["tap", "add", ...flags, source, "mine"]);
  if (added.code !== 0) throw new Error(`crew tap add failed: ${added.out}`);
  return home;
}

/** `crew <args> --json` against `home`: its exit code and error name (or null). */
function failure(home: string, args: string[]): [number, string | null] {
  const cap = captureStreams();
  const code = runCli([...args, "--json"], { home, streams: cap.streams });
  const body = JSON.parse(cap.stdout()) as { error?: { name: string } };
  return [code, body.error?.name ?? null];
}

/** A skill folder `name` under `parent` whose declared `name` is invalid. */
function badSkillAt(parent: string, name: string): void {
  makeSkill(parent, name, skillFrontmatter({ name: "Bad_Name" }));
}

test("C-REF-40 a folder linked out of the repository keeps its own next step", () => {
  const repo = gitRepo((r) => {
    skillAt(join(r, "skills"), "good");
    link(outsideSkill("evil", true), join(r, "skills", "evil"));
  });
  const r = crew(withTap(`file://${repo}`), ["install", "mine/evil"]);
  expect(r.code).toBe(4);
  // Named by its place in the repository, not crew's clone of it.
  expect(r.out).toContain("`skills/evil` leads out of the repository");
  expect(r.out).toContain("Make it a folder in the repository, or a link to a folder inside it.");
});

test("C-REF-40 a candidate crew can't read is source_unreachable, with the permissions hint", () => {
  const tap = makeTempDir();
  skillAt(join(tap, "skills"), "good");
  const locked = join(tap, "skills", "locked");
  mkdirSync(locked);
  const home = withTap(tap);
  chmodSync(locked, 0o000);
  try {
    const r = crew(home, ["install", "mine/locked"]);
    expect(r.code).toBe(5);
    expect(r.out).toContain("(source_unreachable)");
    expect(r.out).toContain("Check that it is readable by you");
  } finally {
    chmodSync(locked, 0o755);
  }
});

test("C-REF-40 a candidate in another namespace doesn't answer a three-segment reference", () => {
  const tap = makeTempDir();
  badSkillAt(join(tap, "skills", "team"), "bad");
  skillAt(join(tap, "skills", "other"), "good");
  const home = withTap(tap);
  expect(failure(home, ["install", "mine/team/bad"])).toEqual([4, "invalid_skill"]);
  expect(failure(home, ["install", "mine/other/bad"])).toEqual([4, "invalid_ref"]);
});

test("C-REF-40 a recursive find outside skills/ has no namespace to answer for", () => {
  const tap = makeTempDir();
  badSkillAt(join(tap, "x", "ns"), "bar");
  skillAt(join(tap, "x", "ns"), "good");
  const home = withTap(tap, "--recursive");
  expect(failure(home, ["install", "mine/ns/bar"])).toEqual([4, "invalid_ref"]);
  // As `<tap>/<skill>` it is the tap's own candidate, refused for its name.
  expect(failure(home, ["install", "mine/bar"])).toEqual([4, "invalid_skill"]);
});

test("C-REF-40 a <tap>/<skill> whose tap crew can't read fails with that tap's error", () => {
  const tap = makeTempDir();
  skillAt(join(tap, "skills"), "good");
  const skills = join(tap, "skills");
  const home = withTap(tap);
  chmodSync(skills, 0o000);
  try {
    const r = crew(home, ["install", "mine/baz"]);
    expect(r.code).toBe(5);
    expect(r.out).toContain("(source_unreachable)");
    expect(r.out).toContain(`couldn't read \`${skills}\``);
  } finally {
    chmodSync(skills, 0o755);
  }
});

test("C-REF-40 a <tap>/<skill> whose tap crew can't read is answered by a namespace elsewhere", () => {
  const tap = makeTempDir();
  skillAt(join(tap, "skills"), "good");
  const other = makeTempDir();
  // In `other`, `mine` is a namespace holding `baz`.
  skillAt(join(other, "skills", "mine"), "baz");
  const home = withTap(tap);
  expect(crew(home, ["tap", "add", other, "other"]).code).toBe(0);
  const skills = join(tap, "skills");
  chmodSync(skills, 0o000);
  try {
    expect(failure(home, ["install", "mine/baz"])).toEqual([0, null]);
  } finally {
    chmodSync(skills, 0o755);
  }
  expect(readdirSync(claude.userRoot)).toEqual(["baz"]);
});
