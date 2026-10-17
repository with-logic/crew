/**
 * A gist file crew can't look at — its path runs past the system's limit
 * — is `source_unreachable` naming the file (§13; C-SPEC-16, C-UPD-40),
 * never a raw filesystem error reported as crew's own: at install, on the
 * update whose fetch brings it, and in the walk for a dependency beside
 * its parent. The crew home sits deep enough that the clone works but a
 * long file name inside it can't be looked up.
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

/** A run's exit code, its error's name, and whether it names the gist's file as too long. */
function failureOf(r: { code: number; stdout: string }) {
  const { error } = json(r);
  const namesTooLongFile =
    /^couldn't look at `\S+` — ENAMETOOLONG/.test(error.message) &&
    String(error.details["path"]).endsWith(`/${LONG}`);
  return { code: r.code, name: error.name, namesTooLongFile };
}

/** `source_unreachable` naming the file — never a raw error reported as crew's own (exit 4). */
const TOO_LONG = { code: 5, name: "source_unreachable", namesTooLongFile: true };

test("C-SPEC-16 a gist file crew can't look at fails the install as source_unreachable", () => {
  fx.gist({ "prd.md": skillFile("prd"), [LONG]: skillFile("long") });
  const r = run(deepCrewHome(), ["install", GIST_PAGE_URL, "--json"]);
  expect(failureOf(r)).toEqual(TOO_LONG);
  expect(readdirSync(claude.userRoot)).toEqual([]);
});

test("C-UPD-40 a gist file crew can't look at, fetched by an update, fails it as source_unreachable", () => {
  const { dir } = fx.gist({ "prd.md": skillFile("prd") });
  const home = deepCrewHome();
  expect(run(home, ["install", GIST_PAGE_URL]).code).toBe(0);
  writeGistFiles(dir, { [LONG]: skillFile("long") });
  expect(failureOf(run(home, ["update", "--json"]))).toEqual(TOO_LONG);
  expect(readdirSync(claude.userRoot)).toEqual(["prd"]);
});

test("C-SPEC-16 a gist file crew can't look at, beside a parent, fails its dependency's lookup", () => {
  fx.gist({
    "prd.md": skillFile("prd"),
    "build.md": skillFile("build", "Build.\n", ["prd"]),
    [LONG]: skillFile("long"),
  });
  const r = run(deepCrewHome(), ["install", `${GIST_PAGE_URL}//build.md`, "--json"]);
  expect(failureOf(r)).toEqual(TOO_LONG);
  expect(readdirSync(claude.userRoot)).toEqual([]);
});
