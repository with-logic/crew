/** Update groups and previews aggregate actual discovery without changing state (§10.1.1). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { paths } from "../../../src/core/paths.ts";
import { readState } from "../../../src/state/load.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { cli, freshHome, register, source, WARNING } from "./fixtures.ts";

let target: string;
let saved: Pick<typeof claudeCodeAdapter, "userPath" | "projectPath" | "detect">;
beforeEach(() => {
  saved = {
    userPath: claudeCodeAdapter.userPath,
    projectPath: claudeCodeAdapter.projectPath,
    detect: claudeCodeAdapter.detect,
  };
  target = makeTempDir("crew-warning-update-target-");
  claudeCodeAdapter.userPath = () => target;
  claudeCodeAdapter.projectPath = (cwd) => join(cwd, "warning-target");
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  Object.assign(claudeCodeAdapter, saved);
});

test("C-TAP-08g update, dry-run and outdated warn once across taps and scope groups", () => {
  const { home, reset } = freshHome();
  expect(reset.code).toBe(0);
  const project = makeTempDir("crew-warning-project-");
  for (const [tap, layout] of [
    ["one", "flat"],
    ["two", "namespace"],
  ] as const) {
    const { repo } = source(layout, tap);
    const registered = register(home, repo, layout, tap);
    expect(registered.code).toBe(0);
    expect(registered.err).toBe("");
    for (const scope of ["user", "project"]) {
      expect(
        cli(home, ["install", tap, "--scope", scope, "--agent", "claude-code"], project).code,
      ).toBe(0);
    }
  }
  const before = readFileSync(paths(home).stateFile, "utf8");
  const outdated = cli(home, ["outdated", "--json"], project);
  const preview = cli(home, ["update", "--dry-run", "--json"], project);
  expect(outdated.code).toBe(0);
  expect(JSON.parse(outdated.out).warnings).toEqual([WARNING]);
  expect(outdated.err).toBe("");
  for (const value of ["excluded-entry", "absent-discovery-target", "another-absent-target"])
    expect(`${outdated.out}${outdated.err}`).not.toContain(value);
  expect(preview.code).toBe(0);
  expect(JSON.parse(preview.out).warnings).toEqual([WARNING]);
  expect(preview.err).toBe("");
  for (const value of ["excluded-entry", "absent-discovery-target", "another-absent-target"])
    expect(`${preview.out}${preview.err}`).not.toContain(value);
  expect(preview.out).toBe(outdated.out);
  expect(readFileSync(paths(home).stateFile, "utf8")).toBe(before);
  expect(JSON.parse(preview.out).tap_reexpand_rows).toEqual([]);
  expect(JSON.parse(preview.out).rows).toHaveLength(4);
  for (const args of [["outdated"], ["update", "--dry-run"], ["update"]]) {
    const result = cli(home, [...args, "--quiet"], project);
    expect(result.code).toBe(0);
    expect(result.err).toBe(`${WARNING}\n`);
    expect(result.out).not.toContain(WARNING);
    for (const value of ["excluded-entry", "absent-discovery-target", "another-absent-target"])
      expect(`${result.out}${result.err}`).not.toContain(value);
    expect(result.out).toBe("");
  }
  const result = cli(home, ["update", "--json"], project);
  expect(result.code).toBe(0);
  expect(JSON.parse(result.out).warnings).toEqual([WARNING]);
  expect(result.err).toBe("");
  for (const value of ["excluded-entry", "absent-discovery-target", "another-absent-target"])
    expect(`${result.out}${result.err}`).not.toContain(value);
  expect(JSON.parse(result.out).tap_reexpand_rows).toEqual([]);
  expect(readState(home).installations).toHaveLength(4);
  for (const tap of ["one", "two"])
    expect(readFileSync(join(target, tap, "SKILL.md"), "utf8")).toContain(`name: ${tap}`);
});

test("C-TAP-08g clean install and update results omit optional warnings", () => {
  const { home, reset } = freshHome();
  expect(reset.code).toBe(0);
  const { repo } = source("flat", "healthy", false);
  const registered = register(home, repo, "flat");
  expect(registered.code).toBe(0);
  expect(registered.err).toBe("");
  for (const args of [
    ["info", "fixture"],
    ["install", "fixture", "--agent", "claude-code"],
    ["update"],
    ["update", "--dry-run"],
    ["outdated"],
  ]) {
    const result = cli(home, [...args, "--json"]);
    expect(result.code).toBe(0);
    expect(result.err).toBe("");
    expect(JSON.parse(result.out)).not.toHaveProperty("warnings");
  }
});
