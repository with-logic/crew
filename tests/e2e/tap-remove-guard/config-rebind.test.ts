/** Failed source revalidation leaves fresh tap discovery untouched (§14, §16.5). */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { readConfig, writeConfig } from "../../../src/config/load.ts";
import { CrewError } from "../../../src/core/errors.ts";
import { paths } from "../../../src/core/paths.ts";
import { runInstall } from "../../../src/install/flow.ts";
import { readState } from "../../../src/state/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

let agentRoot = "";
let original: { userPath: () => string; detect: () => boolean };
beforeEach(() => {
  agentRoot = makeTempDir("crew-rebind-agent-");
  original = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
  claudeCodeAdapter.userPath = () => agentRoot;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = original.userPath;
  claudeCodeAdapter.detect = original.detect;
});
test("C-CONC-01 rejected recursive install does not change a replacement tap", () => {
  const home = makeCrewHome();
  const sourceA = makeTempDir("crew-rebind-A-");
  const sourceB = makeTempDir("crew-rebind-B-");
  makeSkill(sourceA, "alpha", skillFrontmatter({ name: "alpha" }));
  makeSkill(sourceB, "beta", skillFrontmatter({ name: "beta" }));
  const tap = {
    name: "mytap",
    kind: "path" as const,
    registered: true,
    url: "",
    subpath: "",
    path: sourceA,
  };
  const stale = { ...readConfig(home), taps: [tap] };
  const fresh = { ...stale, taps: [{ ...tap, path: sourceB }] };
  writeConfig(fresh, home);
  const configBefore = readFileSync(paths(home).configFile, "utf8");
  const options = {
    refs: [sourceA],
    scope: "user" as const,
    force: false,
    dryRun: false,
    restrictAgents: ["claude-code"],
    home,
    cwd: sourceA,
    recursive: true,
  };
  let caught: unknown;
  try {
    runInstall(stale, options);
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(CrewError);
  expect((caught as CrewError).code).toBe("source_unreachable");
  expect(readFileSync(paths(home).configFile, "utf8")).toBe(configBefore);
  expect(readState(home).installations).toEqual([]);
  runInstall(fresh, { ...options, refs: [sourceB], recursive: false });
  expect(readState(home).installations.map((entry) => entry.name)).toEqual(["beta"]);
});
