/**
 * A gist's tap: its identity across spellings and releases, and the
 * commands that read or record it — search, tap add, doctor (§5.4,
 * §16.3, §16.5, §17; C-TAP-27, C-TAP-30, C-TAP-31).
 *
 * The gist is served from a local repo by `useGistFixture`; nothing here
 * touches the network.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { readConfig, writeConfig } from "../../../src/config/load.ts";
import { legacyTapPath } from "../../../src/core/paths.ts";
import { repoClonePath } from "../../../src/core/repo-path.ts";
import { runGit } from "../../../src/git/exec.ts";
import { readState } from "../../../src/state/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import {
  GIST_CLONE_URL,
  GIST_ID,
  GIST_PAGE_URL,
  GIST_TAP,
  json,
  run,
  skillFile,
  useGistFixture,
} from "./helpers.ts";

const fx = useGistFixture();

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));
const skillsDir = (): string => claude.userRoot;

describe("gist tap identity", () => {
  test("C-TAP-30 every https spelling of the gist records one tap named gist-<id8>", () => {
    fx.gist({ "prd.md": skillFile("prd") });
    const home = makeCrewHome();
    expect(run(home, ["install", GIST_PAGE_URL]).code).toBe(0);
    expect(run(home, ["install", GIST_CLONE_URL]).code).toBe(0);
    expect(run(home, ["install", `https://gist.github.com/${GIST_ID.toUpperCase()}`]).code).toBe(0);
    const gistTaps = readConfig(home).taps.filter((t) => t.url === GIST_CLONE_URL);
    expect(gistTaps.map((t) => [t.name, t.subpath, t.registered])).toEqual([[GIST_TAP, "", false]]);
  });

  test("C-TAP-31 a gist tap recorded with its owner keeps serving that gist, from its 0.10 clone", () => {
    // Recorded by crew 0.10: the tap's URL names the owner, and its clone
    // sits in that release's per-tap `taps/<name>/` layout.
    const { dir } = fx.gist({ "prd.md": skillFile("prd") }, [GIST_PAGE_URL]);
    const home = makeCrewHome();
    const config = readConfig(home);
    const legacy = { name: GIST_ID, kind: "git" as const, registered: false, url: GIST_PAGE_URL };
    writeConfig({ ...config, taps: [...config.taps, { ...legacy, subpath: "", path: "" }] }, home);
    runGit(["clone", "--quiet", `file://${dir}`, legacyTapPath(GIST_ID, home)]);
    // A marker only the old clone has, to tell a move from a fresh clone.
    writeFileSync(join(legacyTapPath(GIST_ID, home), ".git", "crew-moved"), "");

    expect(run(home, ["install", GIST_CLONE_URL]).code).toBe(0);
    expect(run(home, ["install", GIST_PAGE_URL]).code).toBe(0);
    expect(readState(home).installations.map((e) => [e.name, e.source.tap])).toEqual([
      ["prd", GIST_ID],
    ]);
    // Moved to the gist's shared clone, not cloned again beside a stranded copy.
    const shared = repoClonePath(GIST_CLONE_URL, home);
    expect(readdirSync(join(home, "repos"))).toEqual([basename(shared)]);
    expect(existsSync(join(shared, ".git", "crew-moved"))).toBe(true);
    expect(existsSync(legacyTapPath(GIST_ID, home))).toBe(false);

    const added = run(home, ["tap", "add", GIST_PAGE_URL]);
    expect(added.code).toBe(0);
    // Reported under the name it was recorded with, not a derived `gist-<id8>`.
    expect(added.stdout).toContain(GIST_ID);
    expect(added.stdout).not.toContain(GIST_TAP);
    const gistTaps = readConfig(home).taps.filter((t) => t.url.includes(GIST_ID));
    expect(gistTaps.map((t) => [t.name, t.registered])).toEqual([[GIST_ID, true]]);
  });
});

describe("reading a gist tap", () => {
  test("crew search finds a gist's valid skills and doesn't fail on an invalid file", () => {
    fx.gist({ "prd.md": skillFile("prd"), "bad.md": "---\nname: Not Valid\n---\n" });
    const home = makeCrewHome();
    expect(run(home, ["install", `${GIST_PAGE_URL}//prd.md`]).code).toBe(0);
    const r = run(home, ["search", "prd", "--json"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(GIST_TAP);
    expect(r.stdout).not.toContain("Not Valid");
  });

  test("C-TAP-30 crew tap add names a gist tap gist-<id8>", () => {
    fx.gist({ "prd.md": skillFile("prd") });
    const home = makeCrewHome();
    expect(run(home, ["tap", "add", GIST_PAGE_URL]).code).toBe(0);
    const tap = readConfig(home).taps.find((t) => t.url === GIST_CLONE_URL);
    expect([tap?.name, tap?.registered]).toEqual([GIST_TAP, true]);
    expect(run(home, ["install", "prd"]).code).toBe(0);
    expect(readdirSync(skillsDir())).toEqual(["prd"]);
  });

  test("C-TAP-27 crew tap add rejects a gist's //<file>, suggests installing it, and writes nothing", () => {
    const home = makeCrewHome();
    const before = readConfig(home);
    const r = run(home, ["tap", "add", `${GIST_PAGE_URL}//prd.md`, "--json"]);
    expect(r.code).toBe(4);
    expect(json(r).error.name).toBe("usage_error");
    const human = run(home, ["tap", "add", `${GIST_PAGE_URL}//prd.md`]);
    expect(human.stderr + human.stdout).toContain(`crew install ${GIST_PAGE_URL}//prd.md`);
    // A name that can't be a gist skill file gets no install suggestion that would fail too.
    const notes = run(home, ["tap", "add", `${GIST_PAGE_URL}//notes.txt`]);
    expect(notes.code).toBe(4);
    expect(notes.stderr + notes.stdout).not.toContain("crew install");
    expect(readConfig(home)).toEqual(before);
  });

  test("doctor --repair rebuilds a missing gist tap from its markers", () => {
    fx.gist({ "prd.md": skillFile("prd") });
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
