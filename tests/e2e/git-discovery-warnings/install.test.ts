/** Install scans and dependencies share one warning; installed info stays quiet (§9, §9.1). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { readState } from "../../../src/state/load.ts";
import { commitAll, makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { cli, freshHome, register, source, WARNING } from "./fixtures.ts";

let target: string;
let saved: Pick<typeof claudeCodeAdapter, "userPath" | "projectPath" | "detect">;
beforeEach(() => {
  saved = {
    userPath: claudeCodeAdapter.userPath,
    projectPath: claudeCodeAdapter.projectPath,
    detect: claudeCodeAdapter.detect,
  };
  target = makeTempDir("crew-warning-install-target-");
  claudeCodeAdapter.userPath = () => target;
  claudeCodeAdapter.projectPath = (cwd) => join(cwd, "warning-target");
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  Object.assign(claudeCodeAdapter, saved);
});

for (const ref of [
  "fixture",
  "healthy",
  "fixture/healthy",
  "group",
  "fixture/group/healthy",
  "git",
]) {
  test(`C-TAP-08g install ${ref} preserves one healthy candidate and warns once`, () => {
    const { home, reset } = freshHome();
    expect(reset.code).toBe(0);
    const { repo } = source("namespace");
    const registered = register(home, repo, "namespace");
    expect(registered.code).toBe(0);
    expect(registered.err).toBe("");
    const actual = ref === "git" ? `file://${repo}` : ref;
    const result = cli(home, ["install", actual, "--agent", "claude-code", "--json"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out).warnings).toEqual([WARNING]);
    expect(result.err).toBe("");
    for (const value of ["excluded-entry", "absent-discovery-target", "another-absent-target"])
      expect(`${result.out}${result.err}`).not.toContain(value);
    expect(JSON.parse(result.out).skipped).toEqual([]);
    expect(readState(home).installations.map((entry) => entry.name)).toEqual(["healthy"]);
    expect(readFileSync(join(target, "healthy", "SKILL.md"), "utf8")).toContain("name: healthy");
    const installed = cli(home, ["info", "healthy", "--json"]);
    expect(installed.code).toBe(0);
    expect(JSON.parse(installed.out)).not.toHaveProperty("warnings");
    expect(installed.err).toBe("");
    const quiet = cli(home, ["install", actual, "--agent", "claude-code", "--quiet"]);
    expect(quiet.code).toBe(0);
    expect(quiet.err).toBe(`${WARNING}\n`);
    expect(quiet.out).not.toContain(WARNING);
    for (const value of ["excluded-entry", "absent-discovery-target", "another-absent-target"])
      expect(`${quiet.out}${quiet.err}`).not.toContain(value);
    expect(quiet.out).toBe("");
  });
}

test("C-TAP-08g dry-run direct recursive install warns without writing installed state", () => {
  const { home, reset } = freshHome();
  expect(reset.code).toBe(0);
  const { repo } = source("recursive");
  const result = cli(home, [
    "install",
    `file://${repo}`,
    "--recursive",
    "--dry-run",
    "--agent",
    "claude-code",
    "--json",
  ]);
  expect(result.code).toBe(0);
  expect(JSON.parse(result.out).warnings).toEqual([WARNING]);
  expect(result.err).toBe("");
  for (const value of ["excluded-entry", "absent-discovery-target", "another-absent-target"])
    expect(`${result.out}${result.err}`).not.toContain(value);
  expect(JSON.parse(result.out).skipped).toEqual([]);
  expect(readState(home).installations).toEqual([]);
});

test("C-TAP-08g repeated roots and dependency scans across two taps warn once", () => {
  const { home, reset } = freshHome();
  expect(reset.code).toBe(0);
  const one = source("flat", "first");
  makeSkill(
    one.parent,
    "consumer",
    skillFrontmatter({ name: "consumer", dependencies: ["two/second"] }),
  );
  commitAll(one.repo, "add a dependency on the second tap");
  const two = source("skills", "second");
  const registeredOne = register(home, one.repo, "flat", "one");
  expect(registeredOne.code).toBe(0);
  expect(registeredOne.err).toBe("");
  const registeredTwo = register(home, two.repo, "skills", "two");
  expect(registeredTwo.code).toBe(0);
  expect(registeredTwo.err).toBe("");
  const result = cli(home, ["install", "one", "one", "--agent", "claude-code", "--json"]);
  expect(result.code).toBe(0);
  expect(JSON.parse(result.out).warnings).toEqual([WARNING]);
  expect(result.err).toBe("");
  for (const value of ["excluded-entry", "absent-discovery-target", "another-absent-target"])
    expect(`${result.out}${result.err}`).not.toContain(value);
  expect(JSON.parse(result.out).skipped).toEqual([]);
  expect(
    readState(home)
      .installations.map((entry) => entry.name)
      .sort(),
  ).toEqual(["consumer", "first", "second"]);
});
