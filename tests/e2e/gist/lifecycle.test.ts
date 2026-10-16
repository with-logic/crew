/**
 * A gist after install: update, re-expansion, dependencies, and the
 * commands that read a gist tap (§9 step 6, §10.1, §10.1.1, §16.3;
 * C-UPD-38, C-UPD-39, C-INST-26, C-INST-27, C-TAP-27, C-TAP-30).
 *
 * The gist is served from a local repo by `useGistFixture`; nothing here
 * touches the network.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readConfig, writeConfig } from "../../../src/config/load.ts";
import { readState } from "../../../src/state/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { commitAll, makeSkill, skillFrontmatter } from "../../helpers/fixtures.ts";
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

const installed = (name: string): string =>
  readFileSync(join(fx.skills(), name, "SKILL.md"), "utf8");

/** `name:outcome` for every row of a `crew update --json` run. */
function outcomes(r: { stdout: string }): string[] {
  const rows: { name: string; outcome: { kind: string } }[] = json(r).rows;
  return rows.map((row) => `${row.name}:${row.outcome.kind}`).sort();
}

describe("crew update on a gist", () => {
  test("C-UPD-38 edits update, new files install, deleted files are source_gone", () => {
    const { dir } = fx.gist({ "prd.md": skillFile("prd"), "build.md": skillFile("build") });
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
    expect(r.code).toBe(0);
    expect(outcomes(r)).toContain("build:source_gone");
    expect(outcomes(r).filter((o) => o.endsWith(":source_gone"))).toEqual(["build:source_gone"]);
    expect(existsSync(join(fx.skills(), "build", "SKILL.md"))).toBe(true);
  });

  test("C-UPD-38 a //<file> skill whose file is deleted is source_gone", () => {
    const { dir } = fx.gist({ "prd.md": skillFile("prd"), "build.md": skillFile("build") });
    const home = makeCrewHome();
    expect(run(home, ["install", `${GIST_PAGE_URL}//prd.md`]).code).toBe(0);
    rmSync(join(dir, "prd.md"));
    commitAll(dir, "drop prd");

    const r = run(home, ["update", "--json"]);
    expect(r.code).toBe(0);
    expect(outcomes(r)).toEqual(["prd:source_gone"]);
    expect(installed("prd")).toBe(skillFile("prd"));
  });

  test("C-UPD-39 a //<file> skill replaced upstream by a symlink is never read through it", () => {
    const { dir } = fx.gist({ "prd.md": skillFile("prd") });
    const home = makeCrewHome();
    expect(run(home, ["install", `${GIST_PAGE_URL}//prd.md`]).code).toBe(0);
    const outside = mkdtempSync(join(tmpdir(), "crew-outside-"));
    makeSkill(outside, "prd", skillFrontmatter({ name: "prd" }), "Not from the gist.\n");
    rmSync(join(dir, "prd.md"));
    symlinkSync(join(outside, "prd"), join(dir, "prd.md"));
    commitAll(dir, "swap prd for a link");

    const r = run(home, ["update", "--json"]);
    expect(r.code).toBe(0);
    expect(outcomes(r)).toEqual(["prd:source_gone"]);
    expect(installed("prd")).toBe(skillFile("prd"));
  });
});

describe("dependencies between gist skills", () => {
  test("C-INST-27 a bare dependency is the sibling file, read at the parent's commit", () => {
    const first = fx.gist({
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

  test("C-INST-26 a dependency spelled <gist-url>//<file> installs only that skill", () => {
    fx.gist({
      "prd.md": skillFile("prd"),
      "review.md": skillFile("review"),
      "build.md": skillFile("build", "Build it.\n", [`${GIST_CLONE_URL}//prd.md`]),
    });
    const home = makeCrewHome();
    expect(run(home, ["install", `${GIST_PAGE_URL}//build.md`]).code).toBe(0);
    expect(readdirSync(fx.skills()).sort()).toEqual(["build", "prd"]);
    const prd = readState(home).installations.find((e) => e.name === "prd");
    expect([prd?.source.tap, prd?.source.path, prd?.explicit, prd?.tracks_tap]).toEqual([
      GIST_TAP,
      "prd.md",
      false,
      undefined,
    ]);
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
    expect(readdirSync(fx.skills())).toEqual(["prd"]);
  });

  test("C-TAP-27 crew tap add rejects a gist's //<file>, suggests installing it, and writes nothing", () => {
    const home = makeCrewHome();
    const before = readConfig(home);
    const r = run(home, ["tap", "add", `${GIST_PAGE_URL}//prd.md`, "--json"]);
    expect(r.code).toBe(4);
    expect(json(r).error.name).toBe("usage_error");
    expect(json(r).error.message).toContain(`crew install ${GIST_PAGE_URL}//prd.md`);
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
