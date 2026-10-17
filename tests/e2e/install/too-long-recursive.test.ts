/**
 * Recursive discovery past the system's path limit (§9 step 5.4, §13;
 * C-SPEC-18): a folder whose own path fits but whose entries' paths run
 * past the limit stops the walk as `source_unreachable` naming where —
 * never a raw filesystem error reported as crew's own. Git checks such a
 * tree out under a deep crew home; crew then can't look its entries up.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { repoClonePath } from "../../../src/core/repo-path.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import { crew, gitRepo, skillAt } from "./folder-links/helpers.ts";

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));

/** The system's limit on a path crew builds (bytes, with its terminating NUL). */
const PATH_MAX = process.platform === "linux" ? 4096 : 1024;
/** A folder name well within a name's limit. */
const LONG = "l".repeat(200);

/** A crew home deep enough that its clone of `url` fits, but `LONG` twice below it doesn't. */
function deepCrewHome(url: string): string {
  const base = makeCrewHome();
  let home = base;
  while (home.length < PATH_MAX - 300) {
    home = join(home, "h".repeat(Math.min(150, PATH_MAX - 300 - home.length)));
  }
  mkdirSync(home, { recursive: true });
  copyFileSync(join(base, "config.yaml"), join(home, "config.yaml"));
  const tooLong = join(repoClonePath(url, home), "deep", LONG, LONG);
  if (tooLong.length < PATH_MAX) throw new Error(`\`${tooLong}\` fits the system's limit`);
  return home;
}

test("C-SPEC-18 recursive discovery past the path limit is source_unreachable, not an unexpected error", () => {
  const repo = gitRepo((r) => skillAt(join(r, "deep", LONG, LONG), "far"));
  const url = `file://${repo}`;
  const r = crew(deepCrewHome(url), ["install", "--recursive", url, "--json"]);
  const { error } = JSON.parse(r.out) as { error: { name: string; message: string } };
  expect([r.code, error.name]).toEqual([5, "source_unreachable"]);
  expect(error.message).not.toContain("unexpected error");
});
