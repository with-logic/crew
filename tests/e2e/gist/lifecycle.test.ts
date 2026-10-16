/**
 * A gist after install: update, re-expansion, revision pages, and
 * dependencies (§8.2, §9 step 6, §10.1, §10.1.1; C-UPD-38, C-UPD-39,
 * C-REF-38, C-INST-26, C-INST-27). Commands that read a gist tap are in
 * `tap.test.ts`.
 *
 * The gist is served from a local repo by `useGistFixture`; nothing here
 * touches the network.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readState } from "../../../src/state/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { commitAll, makeSkill, skillFrontmatter } from "../../helpers/fixtures.ts";
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

const installed = (name: string): string =>
  readFileSync(join(skillsDir(), name, "SKILL.md"), "utf8");

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
    expect(existsSync(join(skillsDir(), "build", "SKILL.md"))).toBe(true);
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

describe("crew update of a gist //<file> that became a link", () => {
  test("C-UPD-39 a skill file replaced by a link inside the gist is source_gone, never read", () => {
    const { dir } = fx.gist({ "prd.md": skillFile("prd"), "real.md": skillFile("real") });
    const home = makeCrewHome();
    expect(run(home, ["install", `${GIST_PAGE_URL}//prd.md`]).code).toBe(0);
    rmSync(join(dir, "prd.md"));
    symlinkSync("real.md", join(dir, "prd.md"));
    commitAll(dir, "link prd to real");

    const r = run(home, ["update", "--json"]);
    expect(r.code).toBe(0);
    expect(outcomes(r)).toEqual(["prd:source_gone"]);
    expect(installed("prd")).toBe(skillFile("prd"));
  });
});

describe("a gist revision page", () => {
  test("C-REF-38 installs that revision's bytes, pinned, even after the gist moved", () => {
    const first = fx.gist({ "prd.md": skillFile("prd", "First PRD.\n") });
    writeGistFiles(first.dir, { "prd.md": skillFile("prd", "Later PRD.\n") });
    const home = makeCrewHome();
    expect(run(home, ["install", `${GIST_PAGE_URL}/${first.sha}`]).code).toBe(0);
    expect(installed("prd")).toBe(skillFile("prd", "First PRD.\n"));
    const [entry] = readState(home).installations;
    expect([entry?.ref, entry?.resolved_sha, entry?.pinned]).toEqual([first.sha, first.sha, true]);
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
    expect(readdirSync(skillsDir()).sort()).toEqual(["build", "prd"]);
    const prd = readState(home).installations.find((e) => e.name === "prd");
    expect([prd?.source.tap, prd?.source.path, prd?.explicit, prd?.tracks_tap]).toEqual([
      GIST_TAP,
      "prd.md",
      false,
      undefined,
    ]);
  });
});
