/**
 * A gist installed at a ref (§8.2, §10.1; C-UPD-38, C-UPD-39): its skills
 * update from that ref, each read from a narrowed export of its one file,
 * and one whose file became a symlink there is gone. A recorded path that
 * isn't one top-level file is never read, at a ref or not.
 *
 * The gist is served from a local repo by `useGistFixture`; nothing here
 * touches the network.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { paths } from "../../../src/core/paths.ts";
import { readState, writeState } from "../../../src/state/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { commitAll } from "../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import {
  GIST_CLONE_URL,
  GIST_PAGE_URL,
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

test("C-UPD-38 skills installed from a gist @main update to the branch's new bytes", () => {
  const { dir } = fx.gist({ "prd.md": skillFile("prd"), "build.md": skillFile("build") });
  const home = makeCrewHome();
  expect(run(home, ["install", `${GIST_CLONE_URL}@main`]).code).toBe(0);
  const edited = {
    "prd.md": skillFile("prd", "New PRD.\n"),
    "build.md": skillFile("build", "New build.\n"),
  };
  writeGistFiles(dir, edited);

  const r = run(home, ["update", "--json"]);
  expect(r.code).toBe(0);
  const outcomes = json(r)
    .rows.map((row) => `${row.name}:${row.outcome.kind}`)
    .sort();
  expect(outcomes).toEqual(["build:updated", "prd:updated"]);
  for (const [file, bytes] of Object.entries(edited)) {
    const name = file.replace(/\.md$/, "");
    expect(readFileSync(join(claude.userRoot, name, "SKILL.md"), "utf8")).toBe(bytes);
  }
});

/** `name:outcome` for every row of a `crew update --json` run. */
function outcomes(r: { stdout: string }): string[] {
  return json(r).rows.map((row) => `${row.name}:${row.outcome.kind}`);
}

const installed = (): string => readFileSync(join(claude.userRoot, "prd", "SKILL.md"), "utf8");

test("C-UPD-39 a gist //<file> at a ref that became a symlink there is source_gone", () => {
  const { dir } = fx.gist({ "prd.md": skillFile("prd"), "real.md": skillFile("real") });
  const home = makeCrewHome();
  expect(run(home, ["install", `${GIST_CLONE_URL}@main//prd.md`]).code).toBe(0);
  rmSync(join(dir, "prd.md"));
  symlinkSync("real.md", join(dir, "prd.md"));
  commitAll(dir, "link prd to real");

  const r = run(home, ["update", "--json"]);
  expect(r.code).toBe(0);
  expect(outcomes(r)).toEqual(["prd:source_gone"]);
  expect(installed()).toBe(skillFile("prd"));
});

for (const ref of ["", "@main"]) {
  test(`C-UPD-39 a gist entry whose path climbs out of the gist is never read (${ref || "no ref"})`, () => {
    const { dir } = fx.gist({ "prd.md": skillFile("prd") });
    const home = makeCrewHome();
    const url = ref === "" ? GIST_PAGE_URL : GIST_CLONE_URL;
    expect(run(home, ["install", `${url}${ref}//prd.md`]).code).toBe(0);
    // A hand-edited (or repaired) entry naming a file beside crew's clone.
    writeFileSync(join(paths(home).reposDir, "x.md"), skillFile("prd", "OUTSIDE\n"));
    const state = readState(home);
    const entries = state.installations.map((e) => ({
      ...e,
      source: { ...e.source, path: "../x.md" },
    }));
    writeState({ ...state, installations: entries }, home);
    writeGistFiles(dir, { "prd.md": skillFile("prd", "Moved on.\n") });

    const r = run(home, ["update", "--json"]);
    expect(r.code).toBe(0);
    expect(outcomes(r)).toEqual(["prd:source_gone"]);
    expect(installed()).toBe(skillFile("prd"));
  });
}
