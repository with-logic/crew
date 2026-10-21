/** Invalid new children retain validation precedence over ownership errors (§9, §10.1.1). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig, writeConfig } from "../../../src/config/load.ts";
import { readState, writeState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

let root: string;
let original: { userPath: () => string; detect: () => boolean };
beforeEach(() => {
  root = makeTempDir();
  original = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
  claudeCodeAdapter.userPath = () => root;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = original.userPath;
  claudeCodeAdapter.detect = original.detect;
});

for (const mixed of [false, true]) {
  for (const flags of [[], ["--force"], ["--dry-run"], ["--dry-run", "--force"]]) {
    test(`C-INST-14 invalid child preserves validation and mixed-owner precedence (${mixed}, ${flags.join(" ")})`, () => {
      const home = makeCrewHome();
      const invoke = (args: string[]) => {
        const cap = captureStreams();
        const code = runCli(args, { home, streams: cap.streams });
        return { code, output: cap.stdout() };
      };
      const incoming = makeTempDir();
      makeSkill(incoming, "alpha", skillFrontmatter({ name: "alpha" }));
      makeGitRepo(incoming);
      const foreign = makeTempDir();
      makeSkill(foreign, "shared", skillFrontmatter({ name: "shared" }), "foreign bytes");
      makeGitRepo(foreign);
      for (const [repo, tap] of [
        [incoming, "incoming"],
        [foreign, "foreign"],
      ] as const) {
        expect(invoke(["tap", "add", `file://${repo}`, tap]).code).toBe(0);
        expect(invoke(["install", tap, "--agent", "claude-code"]).code).toBe(0);
      }
      const state = readState(home);
      if (mixed) {
        const config = readConfig(home);
        const tap = config.taps.find((entry) => entry.name === "incoming")!;
        writeConfig({ ...config, taps: [...config.taps, { ...tap, name: "alias" }] }, home);
        const owner = state.installations.find((entry) => entry.name === "shared")!;
        writeState(
          {
            ...state,
            installations: [
              ...state.installations,
              { ...owner, source: { tap: "alias", path: "shared" } },
            ],
          },
          home,
        );
      }
      const dest = join(root, "shared");
      const bytes = readFileSync(join(dest, "SKILL.md"), "utf8");
      const marker = readFileSync(join(dest, ".crew.json"), "utf8");
      const before = readState(home).installations.filter((entry) => entry.name === "shared");
      makeSkill(incoming, "shared", "name: shared", "invalid incoming bytes");
      makeSkill(incoming, "healthy", skillFrontmatter({ name: "healthy" }));
      commitAll(incoming, "invalid child and healthy sibling");
      const result = invoke(["update", "incoming", "--json", ...flags]);
      expect(result.code).toBe(1);
      const payload: unknown = JSON.parse(result.output);
      expect(payload).toMatchObject({
        tap_reexpand_rows: expect.arrayContaining([
          expect.objectContaining({
            name: "shared",
            kind: "tap_error",
            error: expect.objectContaining({ code: mixed ? "name_conflict" : "invalid_skill" }),
          }),
          expect.objectContaining({
            name: "healthy",
            kind: flags.includes("--dry-run") ? "would_add" : "added",
          }),
        ]),
      });
      expect(readFileSync(join(dest, "SKILL.md"), "utf8")).toBe(bytes);
      expect(readFileSync(join(dest, ".crew.json"), "utf8")).toBe(marker);
      expect(readState(home).installations.filter((entry) => entry.name === "shared")).toEqual(
        before,
      );
    });
  }
}
