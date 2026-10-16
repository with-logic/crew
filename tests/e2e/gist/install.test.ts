/**
 * `crew install <gist-url>` for a whole gist (§8.2 "Gists", §9 step 5;
 * C-INST-23..25, C-INST-28). Tap identity is in `tap.test.ts`.
 *
 * Every test installs from a real gist URL, served from a local repo by
 * `useGistFixture`, so nothing here touches the network.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { readConfig } from "../../../src/config/load.ts";
import { readState } from "../../../src/state/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { commitAll, makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import {
  GIST_CLONE_URL,
  GIST_PAGE_URL,
  GIST_TAP,
  json,
  run,
  skillFile,
  useGistFixture,
  writeGistFiles,
} from "./helpers.ts";

const fx = useGistFixture();

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));
const skillsDir = (): string => claude.userRoot;

describe("crew install <gist-url>", () => {
  test("C-INST-23 installs one skill per skill file, ignoring everything else", () => {
    const prd = skillFile("prd");
    const build = skillFile("build");
    fx.gist({
      "prd.md": prd,
      "build.md": build,
      "README.md": "# Notes\n\nNo frontmatter, so not a skill.\n",
      "config.yaml": "---\nname: not-markdown\ndescription: ignored\n",
    });
    const home = makeCrewHome();
    expect(run(home, ["install", GIST_PAGE_URL]).code).toBe(0);

    expect(readdirSync(skillsDir()).sort()).toEqual(["build", "prd"]);
    expect(readdirSync(join(skillsDir(), "prd")).sort()).toEqual([".crew.json", "SKILL.md"]);
    expect(readFileSync(join(skillsDir(), "prd", "SKILL.md"), "utf8")).toBe(prd);
    expect(readFileSync(join(skillsDir(), "build", "SKILL.md"), "utf8")).toBe(build);

    const entries = readState(home).installations;
    const sources = entries.map((e) => [e.name, e.source.tap, e.source.path, e.tracks_tap]);
    expect(sources.sort()).toEqual([
      ["build", GIST_TAP, "build.md", true],
      ["prd", GIST_TAP, "prd.md", true],
    ]);
    const marker = JSON.parse(readFileSync(join(skillsDir(), "prd", ".crew.json"), "utf8"));
    expect(marker.path).toBe("prd.md");
    expect(marker.tap_url).toBe(GIST_CLONE_URL);
  });

  test("C-INST-23 the .md match ignores case, and frontmatter may follow blank lines or CRLF", () => {
    fx.gist({
      "NOTES.MD": skillFile("notes"),
      "spaced.md": `\n\n${skillFile("spaced")}`,
      "windows.md": skillFile("windows").replaceAll("\n", "\r\n"),
      "titled.md": `# Title\n\n${skillFile("titled")}`,
    });
    const home = makeCrewHome();
    expect(run(home, ["install", GIST_PAGE_URL]).code).toBe(0);
    expect(readdirSync(skillsDir()).sort()).toEqual(["notes", "spaced", "windows"]);
  });

  test("C-INST-24 a gist with a root SKILL.md is one skill holding every file", () => {
    fx.gist({ "SKILL.md": skillFile("whole"), "helper.md": skillFile("helper") });
    const home = makeCrewHome();
    expect(run(home, ["install", GIST_PAGE_URL]).code).toBe(0);
    expect(readdirSync(skillsDir())).toEqual(["whole"]);
    expect(existsSync(join(skillsDir(), "whole", "helper.md"))).toBe(true);
    expect(readState(home).installations.map((e) => e.source.path)).toEqual([""]);
  });

  test("C-INST-24 only an exact SKILL.md makes a gist one skill, on any disk", () => {
    const { dir } = fx.gist({ "skill.md": skillFile("lower"), "prd.md": skillFile("prd") });
    const home = makeCrewHome();
    expect(run(home, ["install", GIST_PAGE_URL]).code).toBe(0);
    expect(readdirSync(skillsDir()).sort()).toEqual(["lower", "prd"]);
    expect(run(makeCrewHome(), ["install", `${GIST_PAGE_URL}//prd.md`]).code).toBe(0);
    // Indexing and update's re-expansion read the gist the same way.
    expect(run(home, ["install", `${GIST_TAP}/prd`]).code).toBe(0);
    writeGistFiles(dir, { "new.md": skillFile("new") });
    const r = run(home, ["update", "--json"]);
    expect(r.code).toBe(0);
    const outcomes = json(r).rows.map((row) => `${row.name}:${row.outcome.kind}`);
    expect(outcomes).not.toContain("prd:source_gone");
    expect(readdirSync(skillsDir()).sort()).toEqual(["lower", "new", "prd"]);
  });

  test("C-INST-25 an invalid skill file fails, named by its file, while its siblings install", () => {
    fx.gist({
      "prd.md": skillFile("prd"),
      "bad.md": "---\nname: Not Valid\n---\n",
      "nodesc.md": "---\nname: nodesc\n---\n",
    });
    const home = makeCrewHome();
    const r = run(home, ["install", GIST_PAGE_URL]);
    expect(r.code).toBe(1);
    expect(readdirSync(skillsDir())).toEqual(["prd"]);
    expect(r.stdout).toContain("`bad.md`: `name: Not Valid` has invalid characters");
    expect(r.stdout).toContain("`nodesc.md` frontmatter is missing `description`");
    expect(r.stdout).not.toContain("SKILL.md");
    // A re-run still exits 1 for the bad files, so it still says why.
    const again = run(home, ["install", GIST_PAGE_URL]);
    expect(again.code).toBe(1);
    expect(again.stdout).toContain("Failed (2):");
  });

  test("C-INST-25 an unreadable gist file fails alone; its siblings install", () => {
    fx.gist({ "prd.md": skillFile("prd"), "build.md": skillFile("build") });
    const home = makeCrewHome();
    expect(run(home, ["tap", "add", GIST_PAGE_URL]).code).toBe(0);
    const locked = join(home, "repos", readdirSync(join(home, "repos"))[0]!, "build.md");
    chmodSync(locked, 0o000);
    try {
      const r = run(home, ["install", GIST_PAGE_URL]);
      expect(r.code).toBe(1);
      expect(readdirSync(skillsDir())).toEqual(["prd"]);
      expect(r.stdout.replace(/\s+/g, " ")).toContain("couldn't read");
    } finally {
      chmodSync(locked, 0o644);
    }
  });

  test("C-INST-25 a symlink in a gist is never a skill candidate", () => {
    const { dir } = fx.gist({ "prd.md": skillFile("prd") });
    symlinkSync("prd.md", join(dir, "alias.md"));
    commitAll(dir, "add a link");
    const home = makeCrewHome();
    expect(run(home, ["install", GIST_PAGE_URL]).code).toBe(0);
    expect(readState(home).installations.map((e) => e.source.path)).toEqual(["prd.md"]);
  });

  test("C-INST-25 a symlinked root SKILL.md neither makes the gist one skill nor is read", () => {
    const outside = makeTempDir();
    writeFileSync(join(outside, "SKILL.md"), skillFile("outside"));
    const { dir } = fx.gist({ "real.md": skillFile("real") });
    symlinkSync(join(outside, "SKILL.md"), join(dir, "SKILL.md"));
    commitAll(dir, "link a SKILL.md out of the gist");
    expect(run(makeCrewHome(), ["install", GIST_PAGE_URL]).code).toBe(0);
    expect(readdirSync(skillsDir())).toEqual(["real"]);
  });

  test("C-INST-25 a gist with no skill files is no_skills_found", () => {
    fx.gist({ "README.md": "# Just notes\n" });
    const r = run(makeCrewHome(), ["install", GIST_PAGE_URL, "--json"]);
    expect(r.code).toBe(4);
    expect(json(r).error.name).toBe("no_skills_found");
    expect(json(r).error.message).toMatch(
      /^the gist https:\/\/gist\.github\.com\/\S+ at [0-9a-f]{8} has no skills/,
    );
  });

  test("C-INST-28 --recursive doesn't apply to a gist, for install or tap add", () => {
    const home = makeCrewHome();
    const before = readConfig(home);
    for (const args of [
      ["install", "--recursive", GIST_PAGE_URL],
      ["install", "--recursive", "--from-git", GIST_PAGE_URL],
      ["tap", "add", "--recursive", GIST_PAGE_URL],
    ]) {
      const r = run(home, [...args, "--json"]);
      expect(r.code).toBe(4);
      expect(json(r).error.name).toBe("usage_error");
      expect(json(r).error.message).toContain("`--recursive` doesn't apply to a gist");
    }
    expect(readConfig(home)).toEqual(before);
    // Rejected before any earlier reference is staged or cloned.
    const local = makeTempDir();
    makeSkill(local, "good", skillFrontmatter({ name: "good" }));
    expect(run(home, ["install", join(local, "good"), GIST_PAGE_URL, "--recursive"]).code).toBe(4);
    expect(existsSync(join(home, "store"))).toBe(false);
  });
});
