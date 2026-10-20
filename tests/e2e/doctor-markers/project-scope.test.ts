/**
 * Doctor's check 9 at project scope (§11.2; C-STATE-05a): a project
 * install's marker crew can't read is an `unreadable_marker` finding, its
 * entry isn't also reported as missing its marker, and `--repair` keeps
 * the entry — found from its recorded project root, whatever the cwd. A
 * project root crew can't look at, a folder above it being one it can't
 * search, is one such finding: it hides the installs under it, and it
 * isn't reported as missing.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { buildRepo, codes, type Finding, redirectAgents } from "./helpers.ts";

let agents: ReturnType<typeof redirectAgents>;
beforeEach(() => {
  agents = redirectAgents();
});
afterEach(() => agents.restore());

/** Run the CLI against `home` in `cwd`; its exit code and stdout. */
function run(home: string, cwd: string, args: readonly string[]): { code: number; out: string } {
  const cap = captureStreams();
  const code = runCli([...args], { home, cwd, streams: cap.streams });
  return { code, out: cap.stdout() };
}

test("C-STATE-05a a project install's unreadable marker is reported, and --repair keeps its entry", () => {
  const home = makeCrewHome();
  const project = makeTempDir("crew-project-");
  const repo = buildRepo(["a"]);
  const install = ["install", `file://${repo}`, "--scope", "project", "--agent", "codex"];
  expect(run(home, project, install).code).toBe(0);
  const marker = join(codexAdapter.projectPath(project), "a", ".crew.json");
  chmodSync(marker, 0o000);
  try {
    // From elsewhere: the entry's folder comes from its project root.
    const elsewhere = makeTempDir("crew-cwd-");
    const plain = run(home, elsewhere, ["doctor", "--json"]);
    const findings = (JSON.parse(plain.out) as { findings: Finding[] }).findings;
    expect(codes(findings)).toEqual(["unreadable_marker:error"]);
    expect(run(home, project, ["doctor", "--repair", "--json"]).code).toBe(1);
    const a = readState(home).installations.find((e) => e.name === "a");
    expect([a?.scope, a?.project_root]).toEqual(["project", project]);
  } finally {
    chmodSync(marker, 0o644);
  }
});

test("C-STATE-05a a project root below a folder crew can't search hides its installs; it isn't missing", () => {
  const home = makeCrewHome();
  const sealed = makeTempDir("crew-sealed-");
  const project = join(sealed, "project");
  mkdirSync(project);
  const repo = buildRepo(["a", "b"]);
  const install = ["install", `file://${repo}`, "--scope", "project", "--agent", "codex"];
  expect(run(home, project, install).code).toBe(0);
  const elsewhere = makeTempDir("crew-cwd-");
  chmodSync(sealed, 0o600);
  try {
    const plain = run(home, elsewhere, ["doctor", "--json"]);
    expect(plain.code).toBe(1);
    const findings = (JSON.parse(plain.out) as { findings: Finding[] }).findings;
    // One finding naming the root: neither entry is missing its marker, nor the root missing.
    expect(codes(findings)).toEqual(["unreadable_marker:error"]);
    expect(findings[0]!.message).toContain(`crew can't read \`${project}\` (EACCES`);
    const repaired = run(home, elsewhere, ["doctor", "--repair"]);
    expect(repaired.code).toBe(1);
    expect(repaired.out).toContain("0 findings addressed");
  } finally {
    chmodSync(sealed, 0o755);
  }
  const names = readState(home).installations.map((e) => `${e.name}:${e.project_root}`);
  expect(names.sort()).toEqual([`a:${project}`, `b:${project}`]);
});
