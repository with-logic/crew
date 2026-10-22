/** Real addition and rejected-child labels retain project identity (§10.1.1, §13). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import type { TapReexpandRow } from "../../../src/install/tap-reexpand/types.ts";
import { readState } from "../../../src/state/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { invoke, snapshot } from "./fixtures.ts";

const original = {
  userPath: claudeCodeAdapter.userPath,
  projectPath: claudeCodeAdapter.projectPath,
  detect: claudeCodeAdapter.detect,
};
let target = "";
beforeEach(() => {
  target = makeTempDir("crew-fields-user-");
  claudeCodeAdapter.userPath = () => target;
  claudeCodeAdapter.projectPath = (cwd: string) => join(cwd, "fixture-skills");
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = original.userPath;
  claudeCodeAdapter.projectPath = original.projectPath;
  claudeCodeAdapter.detect = original.detect;
});

test("C-UPD-43 safe addition and error labels preserve project tags and raw JSON IDs", () => {
  const home = makeCrewHome();
  expect(invoke(home, ["tap", "remove", "core", "--force"]).code).toBe(0);
  const root = makeTempDir("crew-fields-\n\x1b\x85?token=FIELD_LABEL_SECRET-");
  const tap = root.split("/").pop()!;
  const safeTap = "crew-fields-\\x0a\\x1b\\x85?token=***";
  const projects = [makeTempDir("crew-fields-project-a-\n"), makeTempDir("crew-fields-project-b-")];
  makeSkill(root, "alpha", skillFrontmatter({ name: "alpha" }));
  for (const cwd of projects) {
    expect(
      invoke(home, ["install", root, "--scope", "project", "--agent", "claude-code"], cwd).code,
    ).toBe(0);
  }
  const targets = projects.map((cwd) => join(cwd, "fixture-skills"));
  const before = snapshot(home, targets);
  makeSkill(root, "new-child", skillFrontmatter({ name: "new-child" }));
  makeSkill(root, "invalid-child", "description: missing name");
  for (const args of [["update", "--dry-run"], ["outdated"]]) {
    const human = invoke(home, args);
    expect(human.code).toBe(1);
    expect(human.err).toBe("");
    expect(human.out).not.toContain("FIELD_LABEL_SECRET");
    expect(human.out).not.toContain(tap);
    expect(human.out).not.toContain("\x1b");
    expect(human.out).not.toContain("\x85");
    const additionLines = human.out.split("\n").filter((line) => line.includes("1 new skill"));
    const errorLines = human.out.split("\n").filter((line) => line.includes("invalid_skill"));
    expect(additionLines).toHaveLength(2);
    expect(errorLines).toHaveLength(2);
    for (const [index, project] of projects.entries()) {
      const safeProject = project.replace("\n", "\\x0a");
      expect(additionLines[index]).toContain(`${safeTap} (in ${safeProject}): new-child`);
      expect(errorLines[index]).toContain(
        `${safeTap} (in ${safeProject}) (from ${safeTap}) invalid_skill`,
      );
    }
    const json = invoke(home, [...args, "--json"]);
    expect(json.code).toBe(1);
    expect(json.err).toBe("");
    const payload = JSON.parse(json.out) as { tap_reexpand_rows: TapReexpandRow[] };
    expect(payload.tap_reexpand_rows.map((row) => row.kind)).toEqual([
      "tap_error",
      "would_add",
      "tap_error",
      "would_add",
    ]);
    for (const [index, project_root] of projects.entries()) {
      expect(payload.tap_reexpand_rows[index * 2]).toMatchObject({
        name: tap,
        tap,
        scope: "project",
        project_root,
        kind: "tap_error",
        error: { code: "invalid_skill" },
      });
      expect(payload.tap_reexpand_rows[index * 2 + 1]).toEqual({
        name: "new-child",
        tap,
        scope: "project",
        project_root,
        kind: "would_add",
      });
    }
    expect(snapshot(home, targets)).toEqual(before);
  }
  const real = invoke(home, ["update"]);
  expect(real.code).toBe(1);
  expect(real.err).toBe("");
  const additions = real.out.split("\n").filter((line) => line.includes("1 new skill from"));
  expect(additions).toHaveLength(2);
  for (const [index, project] of projects.entries()) {
    expect(additions[index]).toBe(
      `[ok] 1 new skill from ${safeTap} (in ${project.replace("\n", "\\x0a")}): new-child`,
    );
  }
  expect(real.out).not.toContain("FIELD_LABEL_SECRET");
  expect(readState(home).installations.filter((row) => row.name === "new-child")).toHaveLength(2);
  expect(readState(home).installations.some((row) => row.name === "invalid-child")).toBe(false);
  const after = snapshot(home, targets);
  expect(after).not.toEqual(before);
});
