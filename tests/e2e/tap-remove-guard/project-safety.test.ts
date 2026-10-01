/** Tap collection removal prevalidates every install location (§7.4, §16.3). */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { paths } from "../../../src/core/paths.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { buildTapRepo, makeCrewHome, run, tapWithInstall } from "./helpers.ts";

let ccRoot = "";
let ccOriginal: { userPath: () => string; detect: () => boolean };
beforeEach(() => {
  ccRoot = makeTempDir("crew-tap-remove-agent-");
  ccOriginal = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
  claudeCodeAdapter.userPath = () => ccRoot;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = ccOriginal.userPath;
  claudeCodeAdapter.detect = ccOriginal.detect;
});

describe("tap uninstall project identity preflight", () => {
  for (const root of [undefined, "", "relative"] as const) {
    test(`C-STATE-11 malformed project root ${String(root)} preserves earlier installs`, () => {
      const home = makeCrewHome();
      expect(tapWithInstall(home, buildTapRepo())).toBe(0);
      const statePath = paths(home).stateFile;
      const state = JSON.parse(readFileSync(statePath, "utf8"));
      state.installations.push({ ...state.installations[0], scope: "project", project_root: root });
      writeFileSync(statePath, JSON.stringify(state));
      const before = readFileSync(statePath, "utf8");
      const config = readFileSync(paths(home).configFile, "utf8");
      for (const dry of [[], ["--dry-run"]]) {
        const result = run(home, ["tap", "remove", "mytap", "--uninstall", ...dry]);
        expect(result.code).toBe(4);
        expect(result.stderr).toContain("project root");
        expect(existsSync(join(ccRoot, "alpha"))).toBe(true);
        expect(readFileSync(statePath, "utf8")).toBe(before);
        expect(readFileSync(paths(home).configFile, "utf8")).toBe(config);
      }
    });
  }
});
