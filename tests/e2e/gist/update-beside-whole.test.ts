/**
 * A gist file installed on its own beside a whole-gist install of the
 * same gist (§10.1, §10.1.1 step 3; C-INST-26, C-UPD-16, C-UPD-40). The
 * entry that doesn't track the gist is judged by its own update at its
 * recorded file exactly, as when nothing beside it tracks the gist: a
 * file that lost its frontmatter fails, and one deleted or renamed — even
 * only in case — is `source_gone`, never moved to another file. A
 * whole-gist install that reaches an entry already installed on its own
 * makes it track the gist, with or without `--force`.
 *
 * The gist is served from a local repo by `useGistFixture`; nothing here
 * touches the network.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runGit } from "../../../src/git/exec.ts";
import type { TapReexpandRow } from "../../../src/install/tap-reexpand/types.ts";
import { readState } from "../../../src/state/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { commitAll } from "../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import {
  GIST_PAGE_URL,
  GIST_TAP,
  json,
  renameGistFile,
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

/** Each installed skill and whether it tracks the gist, e.g. `prd:false`. */
function tracking(home: string): string[] {
  return readState(home)
    .installations.map((e) => `${e.name}:${e.tracks_tap === true}`)
    .sort();
}

/**
 * The whole gist installed while it held only `build.md`; then `prd.md`
 * added upstream and installed on its own, so it doesn't track the gist.
 */
function prdBesideWholeGist(): { dir: string; home: string } {
  const { dir } = fx.gist({ "build.md": skillFile("build") });
  const home = makeCrewHome();
  run(home, ["install", GIST_PAGE_URL]);
  writeGistFiles(dir, { "prd.md": skillFile("prd") }, "add prd");
  // Fetched without `crew update`, which would install `prd` as part of the whole gist.
  run(home, ["tap", "update", GIST_TAP]);
  run(home, ["install", `${GIST_PAGE_URL}//prd.md`]);
  return { dir, home };
}

/** A whole `crew update --json` run: its exit code, prd's outcome, and the re-expansion rows. */
function runUpdate(home: string): {
  code: number;
  prdOutcome: string;
  reexpandRows: TapReexpandRow[];
} {
  const r = run(home, ["update", "--json"]);
  const row = json(r).rows.find((each) => each.name === "prd");
  const prdOutcome = [row?.outcome.kind, row?.outcome.error?.code].filter(Boolean).join(":");
  return { code: r.code, prdOutcome, reexpandRows: [...json(r).tap_reexpand_rows] };
}

test("C-UPD-16 a file installed on its own that loses its frontmatter fails, beside the whole gist", () => {
  const { dir, home } = prdBesideWholeGist();
  expect(tracking(home)).toEqual(["build:true", "prd:false"]);
  writeGistFiles(dir, { "prd.md": "Just notes now, no frontmatter.\n" });

  expect(runUpdate(home)).toEqual({
    code: 1,
    prdOutcome: "failed:invalid_skill",
    reexpandRows: [],
  });
  expect(readFileSync(join(claude.userRoot, "prd", "SKILL.md"), "utf8")).toBe(skillFile("prd"));
});

test("C-UPD-16 a file installed on its own that is deleted is source_gone, beside the whole gist", () => {
  const { dir, home } = prdBesideWholeGist();
  expect(tracking(home)).toEqual(["build:true", "prd:false"]);
  runGit(["rm", "--quiet", "prd.md"], { cwd: dir });
  commitAll(dir, "delete prd.md");

  expect(runUpdate(home)).toEqual({ code: 0, prdOutcome: "source_gone", reexpandRows: [] });
  expect(readFileSync(join(claude.userRoot, "prd", "SKILL.md"), "utf8")).toBe(skillFile("prd"));
});

for (const [what, renamed] of [
  ["to another name", "notes.md"],
  ["only in case", "PRD.md"],
] as const) {
  test(`C-UPD-16 C-UPD-40 a file installed on its own renamed ${what} is source_gone, beside the whole gist`, () => {
    const { dir, home } = prdBesideWholeGist();
    expect(tracking(home)).toEqual(["build:true", "prd:false"]);
    renameGistFile(dir, "prd.md", renamed, skillFile("prd", "Renamed.\n"));

    expect(runUpdate(home)).toEqual({ code: 0, prdOutcome: "source_gone", reexpandRows: [] });
    const entry = readState(home).installations.find((e) => e.name === "prd");
    expect(entry?.source.path).toBe("prd.md");
    expect(readFileSync(join(claude.userRoot, "prd", "SKILL.md"), "utf8")).toBe(skillFile("prd"));
  });
}

for (const flags of [[], ["--force"]]) {
  test(`C-INST-26 C-UPD-16 installing the whole gist makes a file installed on its own track it (${flags.join(" ") || "no flags"})`, () => {
    const { dir } = fx.gist({ "prd.md": skillFile("prd"), "build.md": skillFile("build") });
    const home = makeCrewHome();
    expect(run(home, ["install", `${GIST_PAGE_URL}//prd.md`]).code).toBe(0);
    expect(run(home, ["install", GIST_PAGE_URL, ...flags]).code).toBe(0);
    expect(tracking(home)).toEqual(["build:true", "prd:true"]);
    writeGistFiles(dir, { "prd.md": "Just notes now, no frontmatter.\n" });

    const gone = {
      name: "prd",
      scope: "user",
      tap: GIST_TAP,
      kind: "source_gone",
    } satisfies TapReexpandRow;
    expect(runUpdate(home)).toEqual({ code: 0, prdOutcome: "source_gone", reexpandRows: [gone] });
  });
}
