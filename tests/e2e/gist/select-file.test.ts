/**
 * One skill of a gist: `<gist-url>//<file>` (§8.2 "Gists", §9 step 5;
 * C-INST-26, C-REF-39, C-LIST-09).
 *
 * The gist is served from a local repo by `useGistFixture`; nothing here
 * touches the network.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "../../../src/config/load.ts";
import { readState } from "../../../src/state/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { commitAll } from "../../helpers/fixtures.ts";
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

describe("crew install <gist-url>//<file>", () => {
  test("C-INST-26 installs only that skill, attributed to the whole-gist tap", () => {
    fx.gist({ "prd.md": skillFile("prd"), "build.md": skillFile("build") });
    const home = makeCrewHome();
    expect(run(home, ["install", `${GIST_PAGE_URL}//prd.md`]).code).toBe(0);
    expect(readdirSync(fx.skills())).toEqual(["prd"]);
    const [entry] = readState(home).installations;
    expect([entry!.source.tap, entry!.source.path]).toEqual([GIST_TAP, "prd.md"]);
    expect(entry!.tracks_tap).toBeUndefined();
    const tap = readConfig(home).taps.find((t) => t.name === GIST_TAP);
    expect(tap?.subpath).toBe("");

    // The whole-gist tap now backs qualified references too.
    expect(run(home, ["install", `${GIST_TAP}/build`]).code).toBe(0);
    expect(readdirSync(fx.skills()).sort()).toEqual(["build", "prd"]);
  });

  test("C-LIST-09 the label crew list shows installs the same skill again", () => {
    fx.gist({ "prd.md": skillFile("prd"), "build.md": skillFile("build") });
    const home = makeCrewHome();
    expect(run(home, ["install", `${GIST_PAGE_URL}//prd.md`]).code).toBe(0);
    const label = /\S+\/\/prd\.md/.exec(run(home, ["list"]).stdout)?.[0];
    expect(label).toBe(`${GIST_CLONE_URL}//prd.md`);

    expect(run(home, ["install", label!]).code).toBe(0);
    const entries = readState(home).installations;
    expect(entries.map((e) => [e.name, e.source.tap, e.source.path])).toEqual([
      ["prd", GIST_TAP, "prd.md"],
    ]);
  });

  test("C-INST-26 a file the gist doesn't have is no_skills_found naming that file", () => {
    fx.gist({ "prd.md": skillFile("prd") });
    for (const file of ["missing.md", "PRD.md"]) {
      const r = run(makeCrewHome(), ["install", `${GIST_PAGE_URL}//${file}`, "--json"]);
      expect(r.code).toBe(4);
      const { error } = json(r);
      expect(error.name).toBe("no_skills_found");
      expect(error.message).toMatch(
        new RegExp(
          `^the gist https://gist\\.github\\.com/\\S+ at [0-9a-f]{8} has no file \`${file}\`$`,
        ),
      );
    }
  });

  test("C-INST-26 a named file is validated even without frontmatter", () => {
    fx.gist({ "prd.md": skillFile("prd"), "README.md": "# Notes\n" });
    const r = run(makeCrewHome(), ["install", `${GIST_PAGE_URL}//README.md`, "--json"]);
    expect(r.code).toBe(4);
    const body = json(r);
    expect(body.error).toBeUndefined();
    expect(body.records).toEqual([]);
    expect(body.skipped.map((s: { message: string; code: string }) => [s.code, s.message])).toEqual(
      [
        [
          "invalid_skill",
          "`README.md` is missing its YAML frontmatter — the first line should be `---`",
        ],
      ],
    );
    expect(readdirSync(fx.skills())).toEqual([]);
  });

  test("C-INST-26 a named file reached through a symlink is invalid_ref", () => {
    const { dir } = fx.gist({ "prd.md": skillFile("prd") });
    symlinkSync("prd.md", join(dir, "alias.md"));
    commitAll(dir, "add a link");
    const r = run(makeCrewHome(), ["install", `${GIST_PAGE_URL}//alias.md`, "--json"]);
    expect(r.code).toBe(4);
    expect(json(r).error.name).toBe("invalid_ref");
  });

  test("C-INST-26 a gist with a root SKILL.md takes no //<file>", () => {
    fx.gist({ "SKILL.md": skillFile("whole"), "helper.md": skillFile("helper") });
    for (const file of ["SKILL.md", "helper.md"]) {
      const r = run(makeCrewHome(), ["install", `${GIST_PAGE_URL}//${file}`, "--json"]);
      expect(r.code).toBe(4);
      expect(json(r).error.name).toBe("invalid_ref");
      expect(json(r).error.message).toContain("is one skill (it has a root SKILL.md)");
    }
    expect(readdirSync(fx.skills())).toEqual([]);
  });

  test("C-REF-39 a //<file> that isn't a top-level .md name is invalid_ref", () => {
    fx.gist({ "prd.md": skillFile("prd") });
    for (const file of ["notes.txt", "sub/prd.md"]) {
      const r = run(makeCrewHome(), ["install", `${GIST_PAGE_URL}//${file}`, "--json"]);
      expect(r.code).toBe(4);
      expect(json(r).error.name).toBe("invalid_ref");
    }
  });
});

describe("crew info <gist-url>//<file>", () => {
  test("previews just the named file", () => {
    fx.gist({ "prd.md": skillFile("prd"), "build.md": skillFile("build") });
    const home = makeCrewHome();
    const whole = json(run(home, ["info", GIST_PAGE_URL, "--json"]));
    expect(whole.skills.map((s: { name: string }) => s.name).sort()).toEqual(["build", "prd"]);
    const one = json(run(home, ["info", `${GIST_PAGE_URL}//build.md`, "--json"]));
    expect(one.skills.map((s: { name: string }) => s.name)).toEqual(["build"]);
  });

  test("an invalid named file reports why, as install does", () => {
    fx.gist({ "prd.md": skillFile("prd"), "bad.md": "---\nname: Not Valid\n---\n" });
    const r = run(makeCrewHome(), ["info", `${GIST_PAGE_URL}//bad.md`, "--json"]);
    expect(r.code).toBe(4);
    expect(json(r).error.name).toBe("invalid_skill");
    expect(json(r).error.message).toStartWith("`bad.md`: `name: Not Valid`");
  });
});
