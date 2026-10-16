/**
 * `crew info` of a gist, whole or one `//<file>` (§9.1; C-INFO-03).
 *
 * The gist is served from a local repo by `useGistFixture`; nothing here
 * touches the network.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../helpers/env.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import { GIST_PAGE_URL, GIST_TAP, json, run, skillFile, useGistFixture } from "./helpers.ts";

const fx = useGistFixture();

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));

describe("crew info of a gist", () => {
  test("C-INFO-03 a skill file crew can't read says so, naming the file (exit 5)", () => {
    fx.gist({ "prd.md": skillFile("prd") });
    const home = makeCrewHome();
    expect(run(home, ["tap", "add", GIST_PAGE_URL]).code).toBe(0);
    const clone = readdirSync(join(home, "repos"))[0]!;
    chmodSync(join(home, "repos", clone, "prd.md"), 0o000);
    try {
      const r = run(home, ["info", `${GIST_PAGE_URL}//prd.md`, "--json"]);
      expect(r.code).toBe(5);
      expect(json(r).error.name).toBe("source_unreachable");
      expect(json(r).error.message).toMatch(/^couldn't read `\S+\/prd\.md` — EACCES/);
      const human = run(home, ["info", `${GIST_PAGE_URL}//prd.md`]);
      expect(human.stdout + human.stderr).toContain("Check that it is readable by you");
    } finally {
      chmodSync(join(home, "repos", clone, "prd.md"), 0o644);
    }
  });

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
      const body = json(run(home, ["info", `${GIST_PAGE_URL}//bad.md`, "--json"]));
      expect(body.error.details["candidates"]).toEqual(["bad.md"]);
    });
  }

  test("an invalid skill file named through its tap points at that file's frontmatter", () => {
    fx.gist({ "prd.md": skillFile("prd"), "bad.md": "---\nname: bad\n---\n" });
    const home = makeCrewHome();
    expect(run(home, ["tap", "add", GIST_PAGE_URL]).code).toBe(0);
    const r = run(home, ["info", `${GIST_TAP}/bad`]);
    expect(r.code).toBe(4);
    expect(r.stdout + r.stderr).toContain("Check `bad.md`'s frontmatter");
  });

  test("C-INFO-03 a gist whose only skill file is invalid reports why", () => {
    fx.gist({ "prd.md": "---\nname: prd\n---\n" });
    const r = run(makeCrewHome(), ["info", GIST_PAGE_URL, "--json"]);
    expect(r.code).toBe(4);
    expect(json(r).error.name).toBe("invalid_skill");
    expect(json(r).error.message).toBe(
      "`prd.md` frontmatter is missing `description` — add a non-empty one-line summary the agent will read to decide whether to use this skill",
    );
  });

  test("C-INFO-03 an invalid skill is reported ahead of an unreadable one listed first", () => {
    // Gist candidates are in name order, so the unreadable `a.md` comes first.
    fx.gist({ "a.md": skillFile("a"), "b.md": "---\nname: b\n---\n" });
    const home = makeCrewHome();
    expect(run(home, ["tap", "add", GIST_PAGE_URL]).code).toBe(0);
    const locked = join(home, "repos", readdirSync(join(home, "repos"))[0]!, "a.md");
    chmodSync(locked, 0o000);
    try {
      const r = run(home, ["info", GIST_PAGE_URL, "--json"]);
      expect(r.code).toBe(4);
      expect(json(r).error.name).toBe("invalid_skill");
      expect(json(r).error.message).toStartWith(
        "none of the 2 skills here is valid (1 of them couldn't be read) — `b.md`",
      );
    } finally {
      chmodSync(locked, 0o644);
    }
  });

  test("C-INFO-03 a gist whose skill files are all unreadable says crew couldn't read them", () => {
    fx.gist({ "a.md": skillFile("a"), "b.md": skillFile("b") });
    const home = makeCrewHome();
    expect(run(home, ["tap", "add", GIST_PAGE_URL]).code).toBe(0);
    const clone = join(home, "repos", readdirSync(join(home, "repos"))[0]!);
    for (const f of ["a.md", "b.md"]) chmodSync(join(clone, f), 0o000);
    try {
      const r = run(home, ["info", GIST_PAGE_URL, "--json"]);
      expect(r.code).toBe(5);
      expect(json(r).error.name).toBe("source_unreachable");
      expect(json(r).error.message).toStartWith(
        "crew couldn't read any of the 2 skills here — couldn't read `",
      );
      expect(json(r).error.details["candidates"]).toEqual(["a.md", "b.md"]);
    } finally {
      for (const f of ["a.md", "b.md"]) chmodSync(join(clone, f), 0o644);
    }
  });

  test("C-INFO-03 a gist with several invalid files says how many", () => {
    fx.gist({ "a.md": "---\nname: a\n---\n", "b.md": "---\nname: b\n---\n" });
    const r = run(makeCrewHome(), ["info", GIST_PAGE_URL, "--json"]);
    expect(r.code).toBe(4);
    expect(json(r).error.message).toStartWith("none of the 2 skills here is valid — `a.md`");
    expect(json(r).error.details["candidates"]).toEqual(["a.md", "b.md"]);
  });
});
