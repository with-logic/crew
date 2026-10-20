/**
 * Folder links whose text runs through another link (§9 step 5 "Folder
 * links"; C-SPEC-17): a `..` climbs from where the link before it really
 * leads, as the OS follows it — never from the text. So `link/..`, with
 * `link` leading out of the repository, leads out too, while a chain that
 * really stays inside is followed.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { makeCrewHome } from "../../../helpers/env.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import { crew, gitRepo, link, outsideSkill, skillAt, storedNames } from "./helpers.ts";

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));

const OUT = "leads out of the repository through a link";

/** A folder git keeps: one holding a file. */
function keep(folder: string): void {
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, ".keep"), "");
}

test("C-SPEC-17 a `..` after a link that leads out leads out too", () => {
  // `evil` -> `link/..` is `deep` itself, outside: never the `skills/` the text suggests.
  const deep = outsideSkill("deep");
  mkdirSync(join(deep, "dir"));
  const repo = gitRepo((r) => {
    skillAt(join(r, "skills"), "good");
    link(join(deep, "dir"), join(r, "skills", "link"));
    link("link/..", join(r, "skills", "evil"));
  });
  const home = makeCrewHome();
  const r = crew(home, ["install", `file://${repo}`]);
  expect(r.code).toBe(1);
  expect(r.out).toContain(`\`skills/evil\` ${OUT}`);
  expect(readdirSync(claude.userRoot)).toEqual(["good"]);
  expect(storedNames(home)).toEqual(["good"]);
});

test("C-SPEC-17 a folder in the repository the text would name doesn't stand in for where the link leads", () => {
  // Read as text, `../lnk/../payload` is the repository's own `payload`.
  const payload = outsideSkill("payload", true);
  const sub = join(dirname(payload), "sub");
  mkdirSync(sub);
  const repo = gitRepo((r) => {
    skillAt(join(r, "skills"), "good");
    skillAt(r, "payload");
    link(sub, join(r, "lnk"));
    link("../lnk/../payload", join(r, "skills", "evil"));
  });
  const home = makeCrewHome();
  const r = crew(home, ["install", `file://${repo}`]);
  expect(r.code).toBe(1);
  expect(r.out).toContain(`\`skills/evil\` ${OUT}`);
  expect(storedNames(home)).toEqual(["good"]);
});

test("C-SPEC-17 a chain whose text names its own link is followed once, as the OS does", () => {
  // As text, `skills/a` -> `lnk/../a` is `skills/a` again; on disk it is
  // `skills/sub/a`. Read as text, the check never ends: the run hangs.
  const repo = gitRepo((r) => {
    skillAt(join(r, "skills"), "good");
    keep(join(r, "skills", "sub", "deeper"));
    keep(join(r, "skills", "sub", "a", "docs"));
    link("sub/deeper", join(r, "skills", "lnk"));
    link("lnk/../a", join(r, "skills", "a"));
  });
  const r = crew(makeCrewHome(), ["install", `file://${repo}`]);
  expect(r.code).toBe(0);
  expect(readdirSync(claude.userRoot)).toEqual(["good"]);
}, 10_000);

test("C-SPEC-17 a chain through `..` that really stays inside the repository is followed", () => {
  // `skills/b` -> `lnk/../real-b`, where `lnk` -> `../vendor/pkgs`: on disk, `vendor/real-b`.
  const repo = gitRepo((r) => {
    skillAt(join(r, "skills"), "good");
    keep(join(r, "vendor", "pkgs"));
    skillAt(join(r, "vendor"), "real-b");
    link("../vendor/pkgs", join(r, "skills", "lnk"));
    link("lnk/../real-b", join(r, "skills", "b"));
  });
  const r = crew(makeCrewHome(), ["install", `file://${repo}`]);
  expect(r.code).toBe(0);
  expect(readdirSync(claude.userRoot).sort()).toEqual(["good", "real-b"]);
});
