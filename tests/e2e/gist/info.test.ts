/**
 * `crew info` of a gist, whole or one `//<file>` (§9.1; C-INFO-03).
 *
 * The gist is served from a local repo by `useGistFixture`; nothing here
 * touches the network.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { makeCrewHome } from "../../helpers/env.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import { GIST_PAGE_URL, json, run, skillFile, useGistFixture } from "./helpers.ts";

const fx = useGistFixture();

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));

describe("crew info <gist-url>//<file>", () => {
  for (const configured of [false, true]) {
    const when = configured ? "once the gist's tap exists" : "for a gist crew hasn't seen";
    test(`previews just the named file, ${when}`, () => {
      fx.gist({ "prd.md": skillFile("prd"), "build.md": skillFile("build") });
      const home = makeCrewHome();
      if (configured) expect(run(home, ["install", `${GIST_PAGE_URL}//prd.md`]).code).toBe(0);
      const whole = json(run(home, ["info", GIST_PAGE_URL, "--json"]));
      expect(whole.skills.map((s: { name: string }) => s.name).sort()).toEqual(["build", "prd"]);
      const one = json(run(home, ["info", `${GIST_PAGE_URL}//build.md`, "--json"]));
      expect(one.skills.map((s: { name: string }) => s.name)).toEqual(["build"]);
    });

    test(`C-INFO-03 an invalid named file reports why, as install does, ${when}`, () => {
      fx.gist({ "prd.md": skillFile("prd"), "bad.md": "---\nname: Not Valid\n---\n" });
      const home = makeCrewHome();
      if (configured) expect(run(home, ["install", `${GIST_PAGE_URL}//prd.md`]).code).toBe(0);
      const r = run(home, ["info", `${GIST_PAGE_URL}//bad.md`]);
      expect(r.code).toBe(4);
      expect(r.stderr + r.stdout).toContain("`bad.md`: `name: Not Valid`");
      expect(r.stderr + r.stdout).toContain("Check `bad.md`'s frontmatter");
    });
  }

  test("C-INFO-03 a gist whose only skill file is invalid reports why", () => {
    fx.gist({ "prd.md": "---\nname: prd\n---\n" });
    const r = run(makeCrewHome(), ["info", GIST_PAGE_URL, "--json"]);
    expect(r.code).toBe(4);
    expect(json(r).error.name).toBe("invalid_skill");
    expect(json(r).error.message).toBe(
      "`prd.md` frontmatter is missing `description` — add a non-empty one-line summary the agent will read to decide whether to use this skill",
    );
  });

  test("C-INFO-03 a gist with several invalid files says how many", () => {
    fx.gist({ "a.md": "---\nname: a\n---\n", "b.md": "---\nname: b\n---\n" });
    const r = run(makeCrewHome(), ["info", GIST_PAGE_URL, "--json"]);
    expect(r.code).toBe(4);
    expect(json(r).error.message).toStartWith("none of the 2 skills here is valid — `a.md`");
  });
});
