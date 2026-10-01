/** Re-expansion preserves the dependency selection locked in step 2 (PRD §10.1/§14). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { readState } from "../../../src/state/load.ts";
import { commitAll, makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { buildFlatTap, bump, freshHome, installedBody, run } from "./helpers.ts";

const originalUserPath = claudeCodeAdapter.userPath;
const originalDetect = claudeCodeAdapter.detect;
let ccRoot = "";
beforeEach(() => {
  ccRoot = makeTempDir("upd-coll-closure-");
  claudeCodeAdapter.userPath = () => ccRoot;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = originalUserPath;
  claudeCodeAdapter.detect = originalDetect;
});

test("C-UPD-33 a new tap member does not adopt another location's dependency closure", () => {
  const home = freshHome();
  const project = makeTempDir("upd-coll-closure-project-");
  const tapA = buildFlatTap("upd-coll-closure-a-", ["alpha"]);
  const tapB = buildFlatTap("upd-coll-closure-b-", []);
  const tapC = buildFlatTap("upd-coll-closure-c-", ["y"]);
  makeSkill(tapB, "x", skillFrontmatter({ name: "x", dependencies: ["y"] }));
  commitAll(tapB, "add x depending on y");
  run(home, ["tap", "add", `file://${tapA}`, "a"]);
  run(home, ["tap", "add", `file://${tapB}`, "b"]);
  run(home, ["tap", "add", `file://${tapC}`, "c"]);
  expect(run(home, ["install", "a"]).code).toBe(0);
  expect(run(home, ["install", "c/y", "--scope", "project"], project).code).toBe(0);
  expect(run(home, ["install", "b", "--scope", "project"], project).code).toBe(0);
  const dependencyBefore = readState(home).installations.find((e) => e.name === "y")!;
  expect(dependencyBefore.required_by).toContain("x");
  const projectSkills = join(project, ".claude", "skills");
  const bodyBefore = installedBody(projectSkills, "y");

  // a gains its own x, unrelated to b/x@project and its c/y dependency.
  makeSkill(tapA, "x", skillFrontmatter({ name: "x" }));
  commitAll(tapA, "add unrelated x");
  bump(tapC, "", "y", "new y must not be fetched or staged");
  const result = run(home, ["update", "a", "--json"]);
  expect(result.code).toBe(0);
  const json = result.json();
  expect(json.tap_reexpand_rows).toContainEqual({
    name: "x",
    scope: "user",
    tap: "a",
    kind: "added",
  });
  expect(json.rows.map((row) => `${row.name}@${row.scope}`)).toEqual(["alpha@user", "x@user"]);
  expect(json.tap_rows.map((row) => row.name)).toEqual(["a"]);
  expect(installedBody(ccRoot, "x")).toContain("name: x");
  expect(installedBody(projectSkills, "y")).toBe(bodyBefore);
  expect(readState(home).installations.find((e) => e.name === "y")).toEqual(dependencyBefore);
});
