/**
 * A gist file crew can't look at — its path runs past the system's limit
 * — fails alone, never sinking the gist and never as a raw filesystem
 * error reported as crew's own (§9 step 4, §13; C-SPEC-16, C-INST-25,
 * C-UPD-18c): selected by `//<file>` it is `source_unreachable`; at a
 * whole-gist install it is a failed skill while its siblings install; on
 * the update whose fetch brings it, a failed child named by its file; and
 * beside a parent, it isn't the dependency the walk looks for. The crew
 * home sits deep enough that the clone works but a long file name inside
 * it can't be looked up.
 *
 * The gist is served from a local repo by `useGistFixture`; nothing here
 * touches the network.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { repoClonePath } from "../../../src/core/repo-path.ts";
import { makeCrewHome } from "../../helpers/env.ts";
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

/** The system's limit on a path crew builds (bytes, with its terminating NUL). */
const PATH_MAX = process.platform === "linux" ? 4096 : 1024;
/** A gist file name well within a name's limit, too long to follow the deep clone's path. */
const LONG = `${"l".repeat(197)}.md`;

/**
 * A crew home deep enough that its gist clone's path leaves room for git's
 * own files, but not for `LONG` after it.
 */
function deepCrewHome(): string {
  const base = makeCrewHome();
  let home = base;
  while (home.length < PATH_MAX - 250) {
    home = join(home, "h".repeat(Math.min(150, PATH_MAX - 250 - home.length)));
  }
  mkdirSync(home, { recursive: true });
  copyFileSync(join(base, "config.yaml"), join(home, "config.yaml"));
  const tooLong = join(repoClonePath(GIST_CLONE_URL, home), LONG);
  if (tooLong.length < PATH_MAX) throw new Error(`\`${tooLong}\` fits the system's limit`);
  return home;
}

test("C-SPEC-16 a gist file crew can't look at, selected by `//<file>`, is source_unreachable", () => {
  fx.gist({ "prd.md": skillFile("prd"), [LONG]: skillFile("long") });
  const r = run(deepCrewHome(), ["install", `${GIST_PAGE_URL}//${LONG}`, "--json"]);
  const { error } = json(r);
  expect([r.code, error.name]).toEqual([5, "source_unreachable"]);
  expect(error.message).toMatch(/^couldn't look at `\S+` — ENAMETOOLONG/);
  expect(String(error.details["path"]).endsWith(`/${LONG}`)).toBe(true);
  expect(readdirSync(claude.userRoot)).toEqual([]);
});

test("C-INST-25 a gist file crew can't look at fails alone while its sibling installs", () => {
  fx.gist({ "prd.md": skillFile("prd"), [LONG]: skillFile("long") });
  const r = run(deepCrewHome(), ["install", GIST_PAGE_URL, "--json"]);
  expect(r.code).toBe(1);
  const skipped = json(r).skipped.map((s) => [s.path.endsWith(`/${LONG}`), s.code]);
  expect(skipped).toEqual([[true, "source_unreachable"]]);
  expect(readdirSync(claude.userRoot)).toEqual(["prd"]);
});

test("C-UPD-18c a gist file crew can't look at, fetched by an update, fails as a child named by its file", () => {
  const { dir } = fx.gist({ "prd.md": skillFile("prd") });
  const home = deepCrewHome();
  expect(run(home, ["install", GIST_PAGE_URL]).code).toBe(0);
  writeGistFiles(dir, { [LONG]: skillFile("long") });
  const r = run(home, ["update", "--json"]);
  expect(r.code).toBe(1);
  const rows = json(r).tap_reexpand_rows.map((row) => `${row.name}:${row.error?.code}`);
  expect(rows).toEqual([`${LONG}:source_unreachable`]);
  expect(readdirSync(claude.userRoot)).toEqual(["prd"]);
});

test("C-SPEC-16 a gist file crew can't look at, beside a parent, isn't its dependency", () => {
  fx.gist({
    "prd.md": skillFile("prd"),
    "build.md": skillFile("build", "Build.\n", ["prd"]),
    [LONG]: skillFile("long"),
  });
  const r = run(deepCrewHome(), ["install", `${GIST_PAGE_URL}//build.md`]);
  expect(r.code).toBe(0);
  expect(readdirSync(claude.userRoot).sort()).toEqual(["build", "prd"]);
});
