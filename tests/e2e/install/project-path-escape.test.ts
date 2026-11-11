/**
 * Project paths in `crew install` human output are escaped (§5.2, C-INST-24).
 *
 * A project-scope install echoes the working directory, and a directory
 * name is attacker-controlled: a cloned repo or an unpacked archive can
 * carry ESC or a newline. Neither may reach the terminal intact.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

const original = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };

beforeEach(() => {
  const userRoot = makeTempDir("crew-escape-agent-");
  claudeCodeAdapter.userPath = () => userRoot;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => Object.assign(claudeCodeAdapter, original));

const ESC = String.fromCodePoint(0x1b);
const HOSTILE = `proj${ESC}[2K${String.fromCodePoint(0x0a)}forged`;
const ESCAPED = "proj\\x1b[2K\\x0aforged";

/** Lines an embedded newline managed to open on its own. */
function forgedLines(stdout: string): string[] {
  return stdout.split("\n").filter((line) => line.trimStart().startsWith("forged"));
}

test("C-INST-24 a project directory name cannot inject control characters into install output", () => {
  const home = makeCrewHome();
  const skill = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
  const project = join(makeTempDir("crew-escape-proj-"), HOSTILE);
  mkdirSync(project);
  const args = ["install", "--scope", "project", "--agent", "claude-code", skill];

  const fresh = captureStreams();
  expect(runCli(args, { home, cwd: project, streams: fresh.streams })).toBe(0);
  expect(existsSync(join(project, ".claude", "skills", "demo", "SKILL.md"))).toBe(true);
  expect(fresh.stdout()).not.toContain(ESC);
  expect(forgedLines(fresh.stdout())).toEqual([]);
  // Once in the scope tag, once in the per-agent install path.
  expect(fresh.stdout().split(ESCAPED)).toHaveLength(3);

  const again = captureStreams();
  expect(runCli(args, { home, cwd: project, streams: again.streams })).toBe(0);
  expect(again.stdout()).toContain("already installed");
  expect(again.stdout()).not.toContain(ESC);
  expect(forgedLines(again.stdout())).toEqual([]);
  expect(again.stdout().split(ESCAPED)).toHaveLength(3);

  // JSON is a machine contract: the path is reported as-is, with the
  // control characters carried by JSON string escapes rather than `\xNN`.
  const json = captureStreams();
  expect(runCli([...args, "--json"], { home, cwd: project, streams: json.streams })).toBe(0);
  expect(json.stdout()).not.toContain(ESCAPED);
});

test("C-INST-24 a skipped skill's diagnostic cannot inject control characters either", () => {
  const home = makeCrewHome();
  const source = join(makeTempDir("crew-escape-src-"), HOSTILE);
  mkdirSync(source);
  makeSkill(source, "good", skillFrontmatter({ name: "good" }));
  makeSkill(source, "broken", "name: broken");

  const run = captureStreams();
  const code = runCli(["install", "--agent", "claude-code", source], {
    home,
    cwd: makeTempDir(),
    streams: run.streams,
  });

  expect(code).toBe(1);
  expect(run.stdout()).toContain("Failed (1)");
  expect(run.stdout()).not.toContain(ESC);
  expect(forgedLines(run.stdout())).toEqual([]);
});

test("C-INST-24 --json reports the manifest path exactly, control characters and all", () => {
  const home = makeCrewHome();
  const project = join(makeTempDir("crew-escape-proj-"), HOSTILE);
  mkdirSync(project);
  writeFileSync(join(project, ".crewrc"), "");

  const run = captureStreams();
  expect(runCli(["install", "--json"], { home, cwd: project, streams: run.streams })).toBe(0);

  const payload = JSON.parse(run.stdout()) as { manifest_path: string };
  expect(payload.manifest_path).toBe(join(project, ".crewrc"));
});
