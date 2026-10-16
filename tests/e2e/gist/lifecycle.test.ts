/**
 * A gist after install: update, re-expansion, dependencies, and the
 * commands that read a gist tap (§9 step 6, §10.1.1, §16.3; C-UPD-23,
 * C-INST-27, C-TAP-26, C-TAP-27).
 *
 * The gist is served from a local repo by `serveGist`; nothing here
 * touches the network.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { readConfig, writeConfig } from "../../../src/config/load.ts";
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
  writeGistFiles,
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

function gist(files: Record<string, string>): { dir: string; sha: string } {
  const made = makeGist(files);
  unserve = serveGist(made.dir);
  return made;
}

const installed = (name: string): string =>
  readFileSync(join(claude.skills, name, "SKILL.md"), "utf8");

describe("crew update on a gist", () => {
  test("C-UPD-23 edits update, new files install, deleted files are source_gone", () => {
    const { dir } = gist({ "prd.md": skillFile("prd"), "build.md": skillFile("build") });
    const home = makeCrewHome();
    expect(run(home, ["install", GIST_PAGE_URL]).code).toBe(0);

    const edited = skillFile("prd", "A sharper PRD.\n");
    writeGistFiles(dir, { "prd.md": edited, "review.md": skillFile("review") });
    expect(run(home, ["update"]).code).toBe(0);
    expect(installed("prd")).toBe(edited);
    expect(installed("review")).toBe(skillFile("review"));
    const review = readState(home).installations.find((e) => e.name === "review");
    expect([review?.source.path, review?.tracks_tap]).toEqual(["review.md", true]);

    rmSync(join(dir, "build.md"));
    commitAll(dir, "drop build");
    const r = run(home, ["update", "--json"]);
    expect(r.stdout).toContain("source_gone");
    expect(existsSync(join(claude.skills, "build", "SKILL.md"))).toBe(true);
  });
});

describe("dependencies between gist skills", () => {
  test("C-INST-27 a bare dependency is the sibling file, read at the parent's commit", () => {
    const first = gist({
      "prd.md": skillFile("prd", "First PRD.\n"),
      "build.md": skillFile("build", "Build it.\n", ["prd"]),
    });
    writeGistFiles(first.dir, { "prd.md": skillFile("prd", "Later PRD.\n") });

    const home = makeCrewHome();
    const r = run(home, ["install", `${GIST_CLONE_URL}@${first.sha}//build.md`]);
    expect(r.code).toBe(0);
    expect(installed("prd")).toBe(skillFile("prd", "First PRD.\n"));
    const prd = readState(home).installations.find((e) => e.name === "prd");
    expect([prd?.source.tap, prd?.source.path, prd?.resolved_sha, prd?.explicit]).toEqual([
      GIST_TAP,
      "prd.md",
      first.sha,
      false,
    ]);
  });
});

describe("reading a gist tap", () => {
  test("crew info previews every skill, or just the named file", () => {
    gist({ "prd.md": skillFile("prd"), "build.md": skillFile("build") });
    const home = makeCrewHome();
    const whole = JSON.parse(run(home, ["info", GIST_PAGE_URL, "--json"]).stdout);
    expect(whole.skills.map((s: { name: string }) => s.name).sort()).toEqual(["build", "prd"]);
    const one = JSON.parse(run(home, ["info", `${GIST_PAGE_URL}//build.md`, "--json"]).stdout);
    expect(one.skills.map((s: { name: string }) => s.name)).toEqual(["build"]);
  });

  test("crew search finds skills in a gist tap, skipping invalid files", () => {
    gist({ "prd.md": skillFile("prd"), "bad.md": "---\nname: Not Valid\n---\n" });
    const home = makeCrewHome();
    expect(run(home, ["install", `${GIST_PAGE_URL}//prd.md`]).code).toBe(0);
    const r = run(home, ["search", "prd"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(GIST_TAP);
  });

  test("C-TAP-26 crew tap add names a gist tap gist-<id8>", () => {
    gist({ "prd.md": skillFile("prd") });
    const home = makeCrewHome();
    expect(run(home, ["tap", "add", GIST_PAGE_URL]).code).toBe(0);
    const tap = readConfig(home).taps.find((t) => t.url === GIST_CLONE_URL);
    expect([tap?.name, tap?.registered]).toEqual([GIST_TAP, true]);
    expect(run(home, ["install", "prd"]).code).toBe(0);
    expect(readdirSync(claude.skills)).toEqual(["prd"]);
  });

  test("C-TAP-27 crew tap add rejects a gist's //<file> and writes nothing", () => {
    const home = makeCrewHome();
    const before = readConfig(home);
    const r = run(home, ["tap", "add", `${GIST_PAGE_URL}//prd.md`, "--json"]);
    expect(r.code).toBe(4);
    expect(JSON.parse(r.stdout).error.name).toBe("usage_error");
    expect(readConfig(home)).toEqual(before);
  });

  test("doctor --repair rebuilds a missing gist tap from its markers", () => {
    gist({ "prd.md": skillFile("prd") });
    const home = makeCrewHome();
    expect(run(home, ["install", GIST_PAGE_URL]).code).toBe(0);
    const config = readConfig(home);
    writeConfig({ ...config, taps: config.taps.filter((t) => t.name !== GIST_TAP) }, home);

    expect(run(home, ["doctor", "--repair"]).code).toBe(0);
    const tap = readConfig(home).taps.find((t) => t.name === GIST_TAP);
    expect(tap?.url).toBe(GIST_CLONE_URL);
    expect(run(home, ["update"]).code).toBe(0);
  });
});
