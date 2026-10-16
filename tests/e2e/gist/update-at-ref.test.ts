/**
 * A gist installed at a ref (§8.2, §10.1; C-UPD-38): its skills update
 * from that ref, each read from a narrowed export of its one file.
 *
 * The gist is served from a local repo by `useGistFixture`; nothing here
 * touches the network.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../helpers/env.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import { GIST_CLONE_URL, json, run, skillFile, useGistFixture, writeGistFiles } from "./helpers.ts";

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
