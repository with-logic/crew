/** C-UPD-18j: re-expansion preserves a same-location foreign install (§5.4, §10.1.1). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { readState } from "../../../src/state/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { addShared, createTap, invoke } from "./fixtures.ts";

const original = {
  userPath: claudeCodeAdapter.userPath,
  detect: claudeCodeAdapter.detect,
};
let agentRoot = "";
beforeEach(() => {
  agentRoot = makeTempDir("crew-conflict-agent-");
  claudeCodeAdapter.userPath = () => agentRoot;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = original.userPath;
  claudeCodeAdapter.detect = original.detect;
});

for (const dryRun of [false, true]) {
  for (const force of [false, true]) {
    test(`C-UPD-18j foreign install survives dryRun=${dryRun} force=${force}`, () => {
      const home = makeCrewHome();
      const cwd = makeTempDir("crew-conflict-cwd-");
      const first = createTap("first", "alpha");
      const foreign = createTap("foreign", "shared");
      for (const [repo, tap] of [
        [first, "first"],
        [foreign, "foreign"],
      ] as const) {
        expect(invoke(home, ["tap", "add", `file://${repo}`, tap], cwd).code).toBe(0);
        expect(invoke(home, ["install", tap, "--agent", "claude-code"], cwd).code).toBe(0);
      }
      const before = readState(home).installations.find((entry) => entry.name === "shared")!;
      const manifest = join(agentRoot, "shared", "SKILL.md");
      const marker = join(agentRoot, "shared", ".crew.json");
      const bytes = readFileSync(manifest, "utf8");
      const provenance = readFileSync(marker, "utf8");
      addShared(first, "incoming replacement\n");
      const result = invoke(
        home,
        [
          "update",
          "first",
          "--json",
          ...(dryRun ? ["--dry-run"] : []),
          ...(force ? ["--force"] : []),
        ],
        cwd,
      );
      expect(result.code).toBe(1);
      expect(JSON.parse(result.stdout).tap_reexpand_rows).toContainEqual(
        expect.objectContaining({
          name: "shared",
          kind: "tap_error",
          error: expect.objectContaining({ code: "name_conflict" }),
        }),
      );
      expect(readFileSync(manifest, "utf8")).toBe(bytes);
      expect(readFileSync(marker, "utf8")).toBe(provenance);
      expect(readState(home).installations.find((entry) => entry.name === "shared")).toEqual(
        before,
      );
    });
  }
}
