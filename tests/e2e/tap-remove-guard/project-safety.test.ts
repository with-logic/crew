/** Tap collection removal prevalidates every install location (§7.4, §16.3). */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { paths } from "../../../src/core/paths.ts";
import {
  agentRoot,
  buildTapRepo,
  makeCrewHome,
  run,
  tapWithInstall,
  useTempAgentRoot,
} from "./helpers.ts";

useTempAgentRoot();

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
        expect(existsSync(join(agentRoot(), "alpha"))).toBe(true);
        expect(readFileSync(statePath, "utf8")).toBe(before);
        expect(readFileSync(paths(home).configFile, "utf8")).toBe(config);
      }
    });
  }
});
