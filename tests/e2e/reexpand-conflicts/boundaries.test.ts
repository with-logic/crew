/** C-UPD-18j: source conflicts are scoped and include additions from earlier groups (§5.4). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { readState } from "../../../src/state/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { addShared, createTap, invoke } from "./fixtures.ts";

const original = {
  userPath: claudeCodeAdapter.userPath,
  projectPath: claudeCodeAdapter.projectPath,
  detect: claudeCodeAdapter.detect,
};
let agentRoot = "";
beforeEach(() => {
  agentRoot = makeTempDir("crew-boundary-agent-");
  claudeCodeAdapter.userPath = () => agentRoot;
  claudeCodeAdapter.projectPath = (cwd) => join(cwd, "skills");
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = original.userPath;
  claudeCodeAdapter.projectPath = original.projectPath;
  claudeCodeAdapter.detect = original.detect;
});

for (const foreignScope of ["user", "project"]) {
  test(`C-UPD-18j a foreign ${foreignScope} install at another location allows additions`, () => {
    const home = makeCrewHome();
    const firstProject = makeTempDir("crew-first-project-");
    const foreignProject = makeTempDir("crew-foreign-project-");
    const first = createTap("first", "alpha");
    const foreign = createTap("foreign", "shared");
    for (const [repo, tap] of [
      [first, "first"],
      [foreign, "foreign"],
    ] as const)
      expect(invoke(home, ["tap", "add", `file://${repo}`, tap], firstProject).code).toBe(0);
    expect(
      invoke(
        home,
        ["install", "first", "--scope", "project", "--agent", "claude-code"],
        firstProject,
      ).code,
    ).toBe(0);
    expect(
      invoke(
        home,
        ["install", "foreign", "--scope", foreignScope, "--agent", "claude-code"],
        foreignProject,
      ).code,
    ).toBe(0);
    const foreignRoot = foreignScope === "user" ? agentRoot : join(foreignProject, "skills");
    const foreignBefore = readFileSync(join(foreignRoot, "shared", "SKILL.md"), "utf8");
    addShared(first, "first source\n");
    expect(invoke(home, ["update", "first", "--json"], firstProject).code).toBe(0);
    expect(readState(home).installations.filter((entry) => entry.name === "shared")).toHaveLength(
      2,
    );
    expect(readFileSync(join(firstProject, "skills", "shared", "SKILL.md"), "utf8")).toContain(
      "first source",
    );
    expect(readFileSync(join(foreignRoot, "shared", "SKILL.md"), "utf8")).toBe(foreignBefore);
  });
}

for (const dryRun of [false, true]) {
  test(`C-UPD-18j two groups adding a foreign same-name child conflict (dryRun=${dryRun})`, () => {
    const home = makeCrewHome();
    const cwd = makeTempDir("crew-groups-project-");
    const first = createTap("first", "alpha");
    const second = createTap("second", "beta");
    for (const [repo, tap] of [
      [first, "first"],
      [second, "second"],
    ] as const) {
      expect(invoke(home, ["tap", "add", `file://${repo}`, tap], cwd).code).toBe(0);
      expect(invoke(home, ["install", tap, "--agent", "claude-code"], cwd).code).toBe(0);
    }
    addShared(first, "first wins\n");
    addShared(second, "second must not replace\n");
    const before = readState(home);
    const result = invoke(
      home,
      ["update", "first", "second", "--force", "--json", ...(dryRun ? ["--dry-run"] : [])],
      cwd,
    );
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout).tap_reexpand_rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "shared",
          tap: "first",
          kind: dryRun ? "would_add" : "added",
        }),
        expect.objectContaining({
          name: "shared",
          tap: "second",
          kind: "tap_error",
          error: expect.objectContaining({ code: "name_conflict" }),
        }),
      ]),
    );
    if (dryRun) expect(readState(home)).toEqual(before);
    else {
      expect(readFileSync(join(agentRoot, "shared", "SKILL.md"), "utf8")).toContain("first wins");
      expect(
        readState(home)
          .installations.filter((entry) => entry.name === "shared")
          .map((entry) => entry.source.tap),
      ).toEqual(["first"]);
    }
  });
}
