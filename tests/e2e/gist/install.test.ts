/**
 * `crew install <gist-url>` (§8.2 "Gists", §9 step 5; C-INST-23..26, C-TAP-26).
 *
 * Every test installs from a real gist URL, served from a local repo by
 * `serveGist`, so nothing here touches the network.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "../../../src/config/load.ts";
import { readState } from "../../../src/state/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { commitAll } from "../../helpers/fixtures.ts";
import {
  GIST_CLONE_URL,
  GIST_PAGE_URL,
  GIST_TAP,
  makeGist,
  redirectClaude,
  run,
  serveGist,
  skillFile,
} from "./helpers.ts";

let claude: ReturnType<typeof redirectClaude>;
let unserve: (() => void) | null = null;

beforeEach(() => {
  claude = redirectClaude();
});
afterEach(() => {
  unserve?.();
  unserve = null;
  claude.restore();
});

function gist(files: Record<string, string>): string {
  const { dir } = makeGist(files);
  unserve = serveGist(dir);
  return dir;
}

describe("crew install <gist-url>", () => {
  test("C-INST-23 installs one skill per skill file, ignoring everything else", () => {
    const prd = skillFile("prd");
    const build = skillFile("build");
    gist({
      "prd.md": prd,
      "build.md": build,
      "README.md": "# Notes\n\nNo frontmatter, so not a skill.\n",
      "config.yaml": "---\nname: not-markdown\ndescription: ignored\n",
    });
    const home = makeCrewHome();
    const r = run(home, ["install", GIST_PAGE_URL]);
    expect(r.code).toBe(0);

    expect(readdirSync(claude.skills).sort()).toEqual(["build", "prd"]);
    expect(readdirSync(join(claude.skills, "prd")).sort()).toEqual([".crew.json", "SKILL.md"]);
    expect(readFileSync(join(claude.skills, "prd", "SKILL.md"), "utf8")).toBe(prd);
    expect(readFileSync(join(claude.skills, "build", "SKILL.md"), "utf8")).toBe(build);

    const entries = readState(home).installations;
    const sources = entries.map((e) => [e.name, e.source.tap, e.source.path, e.tracks_tap]);
    expect(sources.sort()).toEqual([
      ["build", GIST_TAP, "build.md", true],
      ["prd", GIST_TAP, "prd.md", true],
    ]);
    const marker = JSON.parse(readFileSync(join(claude.skills, "prd", ".crew.json"), "utf8"));
    expect(marker.path).toBe("prd.md");
    expect(marker.tap_url).toBe(GIST_CLONE_URL);
  });

  test("C-TAP-26 every spelling of the gist records one tap named gist-<id8>", () => {
    gist({ "prd.md": skillFile("prd") });
    const home = makeCrewHome();
    expect(run(home, ["install", GIST_PAGE_URL]).code).toBe(0);
    expect(run(home, ["install", GIST_CLONE_URL]).code).toBe(0);
    const gistTaps = readConfig(home).taps.filter((t) => t.url === GIST_CLONE_URL);
    expect(gistTaps.map((t) => [t.name, t.subpath, t.registered])).toEqual([[GIST_TAP, "", false]]);
  });

  test("C-INST-24 a gist with a root SKILL.md is one skill holding every file", () => {
    gist({ "SKILL.md": skillFile("whole"), "helper.md": skillFile("helper") });
    const home = makeCrewHome();
    expect(run(home, ["install", GIST_PAGE_URL]).code).toBe(0);
    expect(readdirSync(claude.skills)).toEqual(["whole"]);
    expect(existsSync(join(claude.skills, "whole", "helper.md"))).toBe(true);
    expect(readState(home).installations.map((e) => e.source.path)).toEqual([""]);
  });

  test("C-INST-25 an invalid skill file fails while its siblings install", () => {
    gist({ "prd.md": skillFile("prd"), "bad.md": "---\nname: Not Valid\n---\n" });
    const home = makeCrewHome();
    const r = run(home, ["install", GIST_PAGE_URL, "--json"]);
    expect(r.code).toBe(1);
    expect(readdirSync(claude.skills)).toEqual(["prd"]);
    expect(r.stdout).toContain("bad.md");
  });

  test("C-INST-25 a symlink in a gist is never a skill candidate", () => {
    const dir = gist({ "prd.md": skillFile("prd") });
    symlinkSync("prd.md", join(dir, "alias.md"));
    commitAll(dir, "add a link");
    const home = makeCrewHome();
    expect(run(home, ["install", GIST_PAGE_URL]).code).toBe(0);
    expect(readState(home).installations.map((e) => e.source.path)).toEqual(["prd.md"]);
  });

  test("C-INST-25 a gist with no skill files is no_skills_found", () => {
    gist({ "README.md": "# Just notes\n" });
    const home = makeCrewHome();
    const r = run(home, ["install", GIST_PAGE_URL, "--json"]);
    expect(r.code).toBe(4);
    expect(JSON.parse(r.stdout).error.name).toBe("no_skills_found");
  });
});

describe("crew install <gist-url>//<file>", () => {
  test("C-INST-26 installs only that skill, attributed to the whole-gist tap", () => {
    gist({ "prd.md": skillFile("prd"), "build.md": skillFile("build") });
    const home = makeCrewHome();
    expect(run(home, ["install", `${GIST_PAGE_URL}//prd.md`]).code).toBe(0);
    expect(readdirSync(claude.skills)).toEqual(["prd"]);
    const [entry] = readState(home).installations;
    expect([entry!.source.tap, entry!.source.path]).toEqual([GIST_TAP, "prd.md"]);
    expect(entry!.tracks_tap).toBeUndefined();
    const tap = readConfig(home).taps.find((t) => t.name === GIST_TAP);
    expect(tap?.subpath).toBe("");

    // The whole-gist tap now backs qualified references too.
    expect(run(home, ["install", `${GIST_TAP}/build`]).code).toBe(0);
    expect(readdirSync(claude.skills).sort()).toEqual(["build", "prd"]);
  });

  test("C-INST-26 a file that isn't there is no_skills_found", () => {
    gist({ "prd.md": skillFile("prd") });
    const r = run(makeCrewHome(), ["install", `${GIST_PAGE_URL}//missing.md`, "--json"]);
    expect(r.code).toBe(4);
    expect(JSON.parse(r.stdout).error.name).toBe("no_skills_found");
  });

  test("C-INST-26 a named file is validated even without frontmatter", () => {
    gist({ "prd.md": skillFile("prd"), "README.md": "# Notes\n" });
    const r = run(makeCrewHome(), ["install", `${GIST_PAGE_URL}//README.md`, "--json"]);
    expect(r.code).toBe(4);
    expect(r.stdout).toContain("frontmatter");
    expect(readdirSync(claude.skills)).toEqual([]);
  });

  test("C-INST-26 a named file reached through a symlink is invalid_ref", () => {
    const dir = gist({ "prd.md": skillFile("prd") });
    symlinkSync("prd.md", join(dir, "alias.md"));
    commitAll(dir, "add a link");
    const r = run(makeCrewHome(), ["install", `${GIST_PAGE_URL}//alias.md`, "--json"]);
    expect(r.code).toBe(4);
    expect(JSON.parse(r.stdout).error.name).toBe("invalid_ref");
  });
});
