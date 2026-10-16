/**
 * Commands that read or record a gist tap: search, tap add, and doctor
 * (§16.3, §16.5, §17; C-TAP-27, C-TAP-30).
 *
 * The gist is served from a local repo by `useGistFixture`; nothing here
 * touches the network.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { readConfig, writeConfig } from "../../../src/config/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import {
  GIST_CLONE_URL,
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
