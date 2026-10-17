/**
 * Gist skill files crew can't name (§8.3, §10.1.1 step 2; C-UPD-18c,
 * C-INST-25, C-REF-40): one whose `name` is invalid, or that crew can't
 * read, that a whole-gist install's gist gains fails on update — named by
 * its file, under `invalid_skill` or `source_unreachable` — while a valid
 * file added beside it installs; and `<gist tap>/<name>` naming one fails
 * with its reason rather than as not found.
 *
 * The gist is served from a local repo by `useGistFixture`; nothing here
 * touches the network.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setGitRunner } from "../../../src/git/exec.ts";
import { rowLabel } from "../../../src/install/tap-reexpand/types.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { cloneDirForTap } from "../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import {
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

/** Each re-expansion row of an update as `name:kind:code`, sorted. */
function reexpandRows(r: { stdout: string }): string[] {
  return json(r)
    .tap_reexpand_rows.map((row) => `${rowLabel(row)}:${row.kind}:${row.error?.code ?? ""}`)
    .sort();
}

test("C-UPD-18c a new gist file whose `name` is invalid fails, named by its file", () => {
  const { dir } = fx.gist({ "prd.md": skillFile("prd") });
  const home = makeCrewHome();
  expect(run(home, ["install", GIST_PAGE_URL]).code).toBe(0);
  writeGistFiles(dir, { "broken.md": skillFile("Bad_Name"), "build.md": skillFile("build") });

  const r = run(home, ["update", "--json"]);
  expect(r.code).toBe(1);
  expect(reexpandRows(r)).toEqual(["broken.md:tap_error:invalid_skill", "build:added:"]);
  const broken = json(r).tap_reexpand_rows.find((row) => rowLabel(row) === "broken.md")!;
  expect(broken.error?.message).toContain("broken.md");
  expect(readFileSync(join(claude.userRoot, "build", "SKILL.md"), "utf8")).toBe(skillFile("build"));
  expect(existsSync(join(claude.userRoot, "Bad_Name"))).toBe(false);
});

test("C-REF-40 `<gist tap>/<name>` naming a file whose `name` is invalid fails with that reason", () => {
  fx.gist({
    "prd.md": skillFile("prd"),
    "broken.md": skillFile("Bad_Name"),
    "loud.MD": skillFile("Bad_Name"),
  });
  const home = makeCrewHome();
  expect(run(home, ["tap", "add", GIST_PAGE_URL]).code).toBe(0);
  // The file's `.md` may be in any case: `loud.MD` is `loud`.
  for (const [ref, file] of [
    ["broken", "broken.md"],
    ["loud", "loud.MD"],
  ]) {
    const r = run(home, ["install", `${GIST_TAP}/${ref}`, "--json"]);
    const { error } = json(r);
    expect([r.code, error.name]).toEqual([4, "invalid_skill"]);
    expect(error.message).toContain(file!);
  }
  // A name with no file at all is still simply not there.
  expect(json(run(home, ["install", `${GIST_TAP}/missing`, "--json"])).error.name).toBe(
    "invalid_ref",
  );
});

test("C-UPD-18c a new gist file crew can't read fails as `source_unreachable`", () => {
  const { dir } = fx.gist({ "prd.md": skillFile("prd") });
  const home = makeCrewHome();
  expect(run(home, ["install", GIST_PAGE_URL]).code).toBe(0);
  writeGistFiles(dir, { "secret.md": skillFile("secret"), "build.md": skillFile("build") });
  const clone = cloneDirForTap(GIST_TAP, home)!;
  const secret = join(clone, "secret.md");
  // Hide the file once the update's own git steps check it out, before
  // discovery reads it: git can't commit a file's read permission.
  const served = setGitRunner((args, options) => {
    const result = served(args, options);
    if (options.cwd === clone && existsSync(secret)) chmodSync(secret, 0o000);
    return result;
  });
  try {
    const r = run(home, ["update", "--json"]);
    expect(r.code).toBe(1);
    expect(reexpandRows(r)).toEqual(["build:added:", "secret.md:tap_error:source_unreachable"]);
  } finally {
    if (existsSync(secret)) chmodSync(secret, 0o644);
  }
  expect(existsSync(join(claude.userRoot, "secret"))).toBe(false);
});
