/**
 * An agent's copy crew can't fully read — a folder in it crew can't list
 * — is a failure to install there, never a §7.3 safety check skipping it
 * (§10.1, §10.1.1 step 2; C-UPD-16c, C-UPD-18e): the update fails that
 * agent with the errno code and keeps the entry as it was, a new child is
 * reported and not recorded, and an install reports the errno code too.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Marker } from "../../../src/core/types.ts";
import { readState } from "../../../src/state/load.ts";
import { readJson } from "../../../src/util/json.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import { run } from "./helpers.ts";

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));

/** Run `fn` with `dir` unlistable, restoring it after. */
function sealed<T>(dir: string, fn: () => T): T {
  chmodSync(dir, 0o000);
  try {
    return fn();
  } finally {
    chmodSync(dir, 0o755);
  }
}

/** A path tap `mine` whose `demo` (with a `refs/` folder) is installed; its tap folder. Throws when setup fails. */
function installDemo(home: string): string {
  const tapDir = makeTempDir();
  const demo = makeSkill(tapDir, "demo", skillFrontmatter({ name: "demo" }), "Original.\n");
  mkdirSync(join(demo, "refs"));
  writeFileSync(join(demo, "refs", "notes.txt"), "notes\n");
  for (const args of [
    ["tap", "add", tapDir, "mine"],
    ["install", "mine/demo"],
  ]) {
    if (run(home, args).code !== 0) throw new Error(`crew ${args.join(" ")} failed`);
  }
  return tapDir;
}

test("C-UPD-16c an installed copy with a folder crew can't list fails the update; state stays", () => {
  const home = makeCrewHome();
  const tapDir = installDemo(home);
  const before = readState(home).installations;
  makeSkill(tapDir, "demo", skillFrontmatter({ name: "demo" }), "Edited.\n");
  const r = sealed(join(claude.userRoot, "demo", "refs"), () => run(home, ["update", "--json"]));
  expect(r.code).toBe(1);
  const [target] = JSON.parse(r.stdout).rows[0].outcome.per_target;
  expect([target.kind, target.error.code]).toEqual(["failed", "EACCES"]);
  expect(readState(home).installations).toEqual(before);
});

test("an install over a copy with a folder crew can't list reports the errno code", () => {
  const home = makeCrewHome();
  installDemo(home);
  const r = sealed(join(claude.userRoot, "demo", "refs"), () =>
    run(home, ["install", "mine/demo", "--force", "--json"]),
  );
  expect(r.code).toBe(1);
  const [agent] = JSON.parse(r.stdout).records[0].agents;
  expect([agent.kind, agent.error.code]).toEqual(["failed", "EACCES"]);
});

test("C-UPD-18e a new child whose leftover copy crew can't read is reported, not recorded", () => {
  const home = makeCrewHome();
  const tapDir = makeTempDir();
  makeSkill(join(tapDir, "skills"), "alpha", skillFrontmatter({ name: "alpha" }));
  expect(run(home, ["tap", "add", tapDir, "mine"]).code).toBe(0);
  expect(run(home, ["install", "mine"]).code).toBe(0);
  makeSkill(join(tapDir, "skills"), "beta", skillFrontmatter({ name: "beta" }));
  // A copy of beta a crashed run left behind, with a folder crew can't list.
  const leftover = join(claude.userRoot, "beta", "refs");
  mkdirSync(leftover, { recursive: true });
  const marker = readJson<Marker>(join(claude.userRoot, "alpha", ".crew.json"));
  writeFileSync(
    join(claude.userRoot, "beta", ".crew.json"),
    JSON.stringify({ ...marker, name: "beta", path: "skills/beta" }),
  );
  const r = sealed(leftover, () => run(home, ["update", "--json"]));
  expect(r.code).toBe(1);
  const rows = JSON.parse(r.stdout).tap_reexpand_rows;
  expect(rows.map((row: { name: string; kind: string; error: { code: string } }) => row)).toEqual([
    expect.objectContaining({
      name: "beta",
      kind: "tap_error",
      error: expect.objectContaining({ code: "EACCES" }),
    }),
  ]);
  expect(readState(home).installations.map((e) => e.name)).toEqual(["alpha"]);
});
