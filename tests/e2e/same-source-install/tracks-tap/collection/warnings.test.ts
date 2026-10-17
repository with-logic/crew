/**
 * A collection a marker crew can't read held back says so (§16.5;
 * C-UPD-17a): on stderr, naming that marker and the auto taps kept, and
 * in `--json` `warnings`, at uninstall and at install. A collection that
 * goes ahead, or has nothing to do, warns of nothing.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { codexAdapter } from "../../../../../src/agents/codex.ts";
import { runCli } from "../../../../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../../../../helpers/env.ts";
import { buildRepo } from "../../helpers.ts";
import { BOTH, CLAUDE, redirectAgents, tapKept, tapOf } from "../helpers.ts";

let agents: ReturnType<typeof redirectAgents>;
beforeEach(() => {
  agents = redirectAgents();
});
afterEach(() => agents.restore());

interface Run {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

/** Run the CLI against `home`: exit code, stdout, stderr. */
function run(home: string, args: readonly string[]): Run {
  const cap = captureStreams();
  const code = runCli([...args], { home, streams: cap.streams });
  return { code, out: cap.stdout(), err: cap.stderr() };
}

/** Run each of `runs` while codex's `y` folder can't be searched. */
function whileHidden(home: string, runs: readonly (readonly string[])[]): Run[] {
  const folder = join(codexAdapter.userPath(), "y");
  chmodSync(folder, 0o000);
  try {
    return runs.map((args) => run(home, args));
  } finally {
    chmodSync(folder, 0o755);
  }
}

/** The `warnings` of a `--json` run. */
function warningsOf(json: Run): string[] {
  return (JSON.parse(json.out) as { warnings: string[] }).warnings;
}

/** x from its own repo in claude-code, y in claude-code and codex: returns x's repo. */
function installXY(home: string): string {
  const [repoX, repoY] = [buildRepo(["x", "w"]), buildRepo(["y"])];
  for (const args of [
    ["install", `file://${repoX}//skills/x`, ...CLAUDE],
    ["install", `file://${repoY}//skills/y`, ...BOTH],
  ]) {
    if (run(home, args).code !== 0) throw new Error(`crew ${args.join(" ")} failed`);
  }
  return repoX;
}

test("C-UPD-17a an uninstall whose collection a marker holds back warns, naming it and the tap", () => {
  const home = makeCrewHome();
  installXY(home);
  const xTap = tapOf(home, "x");
  const [human, json] = whileHidden(home, [
    ["uninstall", "x", "--yes"],
    ["uninstall", "y", "--agent", "claude-code", "--yes", "--json"],
  ]);
  expect(human!.code).toBe(0);
  const marker = join(codexAdapter.userPath(), "y", ".crew.json");
  expect(human!.err.trimEnd()).toBe(
    `warning: kept auto tap \`${xTap}\`: crew can't read \`${marker}\`, which might still name it. Check its permissions (and its folder's); once crew can read it, a later \`crew uninstall\` removes a tap nothing names.`,
  );
  expect(tapKept(home, xTap)).toBe(true);
  // A later run held back again lists the same warning in its JSON.
  expect(warningsOf(json!)).toEqual([expect.stringContaining(`\`${xTap}\``)]);

  const later = run(home, ["uninstall", "y", "--yes", "--json"]);
  expect(warningsOf(later)).toEqual([]);
  expect(later.err).toBe("");
  expect(tapKept(home, xTap)).toBe(false);
});

test("C-UPD-17a a collection that keeps several taps says so in the plural", () => {
  const home = makeCrewHome();
  const repoX = installXY(home);
  if (run(home, ["install", `file://${repoX}//skills/w`, ...CLAUDE]).code !== 0)
    throw new Error("crew install w failed");
  const [xTap, wTap] = [tapOf(home, "x"), tapOf(home, "w")];
  const [held] = whileHidden(home, [["uninstall", "x", "w", "--yes"]]);
  expect(held!.code).toBe(0);
  const taps = [xTap, wTap].map((t) => `\`${t}\``);
  expect(held!.err).toMatch(/^warning: kept auto taps `[^`]+`, `[^`]+`: crew can't read /);
  for (const tap of taps) expect(held!.err).toContain(tap);
  expect(held!.err).toContain("which might still name them.");
  expect(held!.err).toContain("a later `crew uninstall` removes the taps nothing names.");
});

for (const mode of ["human", "json"] as const) {
  test(`C-UPD-17a an install whose re-attribution's collection a marker holds back warns too (${mode})`, () => {
    const home = makeCrewHome();
    const repoX = installXY(home);
    const narrow = tapOf(home, "x");
    const flags = mode === "json" ? ["--json"] : [];
    const [moved, again] = whileHidden(home, [
      ["install", `file://${repoX}`, ...CLAUDE, ...flags],
      ["install", `file://${repoX}`, ...CLAUDE, "--json"],
    ]);
    expect(moved!.code).toBe(0);
    const warning = mode === "json" ? warningsOf(moved!) : moved!.err.trimEnd().split("\n");
    expect(warning).toEqual([
      expect.stringContaining(`warning: kept auto tap \`${narrow}\`: crew can't read`),
    ]);
    expect(tapKept(home, narrow)).toBe(true);
    // Already moved, a second run collects nothing, so has nothing to warn of.
    expect(warningsOf(again!)).toEqual([]);
  });
}
