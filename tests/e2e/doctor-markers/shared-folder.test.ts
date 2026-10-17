/**
 * One skills folder serving both scopes (§11.2 check 9; C-STATE-05a): with
 * a project root at the user's home, the project folder is where the user
 * folder is, so each scope's walk finds the other's installs there. Those
 * are the other walk's to check — no finding, from that home or anywhere
 * else — and `--repair` leaves state as it was. Agents share folders too
 * (§7.2): another agent's project walk passing through a user folder
 * leaves its installs to the agents they list. (One in a folder its own
 * scope's walk never reads is a finding: `./unusable.test.ts`.)
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { ampAdapter } from "../../../src/agents/amp.ts";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { buildRepo, type Finding, redirectAgents } from "./helpers.ts";

let agents: ReturnType<typeof redirectAgents>;
let userHome: string;
beforeEach(() => {
  agents = redirectAgents();
  // claude-code's user folder is the project folder of a root at this home.
  userHome = makeTempDir("crew-user-home-");
  claudeCodeAdapter.userPath = () => join(userHome, ".claude", "skills");
});
afterEach(() => agents.restore());

/** Run the CLI against `home` in `cwd`; its exit code and stdout. */
function run(home: string, cwd: string, args: readonly string[]): { code: number; out: string } {
  const cap = captureStreams();
  const code = runCli([...args], { home, cwd, streams: cap.streams });
  return { code, out: cap.stdout() };
}

/** `crew doctor --json` (and `flags`) from `cwd`: its exit code and findings. */
function doctorIn(home: string, cwd: string, flags: readonly string[] = []) {
  const r = run(home, cwd, ["doctor", ...flags, "--json"]);
  return { code: r.code, findings: (JSON.parse(r.out) as { findings: Finding[] }).findings };
}

const CLAUDE = ["--agent", "claude-code"];

test("C-STATE-05a a user install is no finding from the home its folder is a project folder of", () => {
  const home = makeCrewHome();
  const repo = buildRepo(["a"]);
  expect(run(home, makeTempDir("crew-cwd-"), ["install", `file://${repo}`, ...CLAUDE]).code).toBe(
    0,
  );
  const before = readState(home);
  // However the home is spelled: on macOS, `/var/…` is `/private/var/…`.
  for (const cwd of [userHome, realpathSync(userHome)]) {
    expect(doctorIn(home, cwd)).toEqual({ code: 0, findings: [] });
  }
  expect(doctorIn(home, userHome, ["--repair"]).code).toBe(0);
  expect(readState(home)).toEqual(before);
});

test("C-STATE-05a a project install at the user's home is no finding, from there or anywhere else", () => {
  const home = makeCrewHome();
  const repo = buildRepo(["a", "b"]);
  const elsewhere = makeTempDir("crew-cwd-");
  expect(run(home, elsewhere, ["install", `file://${repo}//skills/a`, ...CLAUDE]).code).toBe(0);
  const project = ["install", `file://${repo}//skills/b`, "--scope", "project", ...CLAUDE];
  expect(run(home, userHome, project).code).toBe(0);
  const before = readState(home);
  expect(before.installations.map((e) => `${e.name}:${e.scope}`).sort()).toEqual([
    "a:user",
    "b:project",
  ]);
  for (const cwd of [elsewhere, userHome]) {
    expect(doctorIn(home, cwd)).toEqual({ code: 0, findings: [] });
  }
  expect(doctorIn(home, elsewhere, ["--repair"]).code).toBe(0);
  expect(readState(home)).toEqual(before);
});

test("C-STATE-05a another agent's project walk through a user folder leaves its installs to the agents they list", () => {
  // codex's user folder is `<home>/.agents/skills`, which is amp's project
  // folder at a root at that home; amp's own user folder is elsewhere.
  codexAdapter.userPath = () => join(userHome, ".agents", "skills");
  const ampProject = ampAdapter.projectPath;
  ampAdapter.projectPath = (cwd: string) => join(cwd, ".agents", "skills");
  try {
    const home = makeCrewHome();
    const repo = buildRepo(["a"]);
    const install = ["install", `file://${repo}`, "--agent", "codex"];
    expect(run(home, makeTempDir("crew-cwd-"), install).code).toBe(0);
    const before = readState(home);
    expect(doctorIn(home, userHome)).toEqual({ code: 0, findings: [] });
    expect(doctorIn(home, userHome, ["--repair"]).code).toBe(0);
    expect(readState(home)).toEqual(before);
  } finally {
    ampAdapter.projectPath = ampProject;
  }
});
