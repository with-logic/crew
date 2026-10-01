/**
 * C-INST-13k: `crew update` adds a new sibling exactly once.
 *
 * A whole-tap subscription re-walks its tap on update and installs
 * children that appeared upstream (§10.1.1). Before adding one, the
 * same-source index is consulted so a skill already installed through
 * another tap row covering the same repo is not added twice.
 *
 * The index mechanics — including the overlapping-row case where one
 * group must see what another just added — are unit-tested in
 * `tests/unit/installed-lookup.test.ts`. This drives the addition path
 * end to end through `crew update`, so the wiring is covered too and not
 * just the helper in isolation.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

let cc: { root: string };
let ccOriginal: { userPath: () => string; detect: () => boolean };

beforeEach(() => {
  cc = { root: makeTempDir("crew-cc-") };
  ccOriginal = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
  claudeCodeAdapter.userPath = () => cc.root;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = ccOriginal.userPath;
  claudeCodeAdapter.detect = ccOriginal.detect;
});

describe("C-INST-13k overlapping tap groups share new siblings", () => {
  for (const dryRun of [false, true]) {
    test(`C-INST-13k ${dryRun ? "preview" : "update"} adds one child across two groups`, () => {
      const home = makeCrewHome();
      const repo = makeTempDir("crew-overlap-");
      makeGitRepo(repo);
      makeSkill(join(repo, "skills"), "alpha", skillFrontmatter({ name: "alpha" }));
      commitAll(repo, "alpha");
      const invoke = (args: string[]) => runCli(args, { home, streams: captureStreams().streams });
      expect(invoke(["tap", "add", `file://${repo}`, "outer", "--recursive"])).toBe(0);
      expect(invoke(["install", "outer", "--agent", "claude-code"])).toBe(0);
      makeSkill(join(repo, "skills"), "beta", skillFrontmatter({ name: "beta" }));
      commitAll(repo, "beta");
      // The inner alias shares outer's existing clone; refresh before installing beta.
      expect(invoke(["tap", "update", "outer"])).toBe(0);
      expect(invoke(["tap", "add", `file://${repo}//skills`, "inner"])).toBe(0);
      expect(invoke(["install", "inner", "--agent", "claude-code"])).toBe(0);
      const before = readState(home);
      expect(before.installations.map((e) => e.source.tap).sort()).toEqual(["inner", "outer"]);
      expect(before.installations.every((e) => e.tracks_tap)).toBe(true);
      makeSkill(join(repo, "skills"), "gamma", skillFrontmatter({ name: "gamma" }));
      commitAll(repo, "gamma");
      const cap = captureStreams();
      expect(
        runCli(["update", "--agent", "claude-code", "--json", ...(dryRun ? ["--dry-run"] : [])], {
          home,
          streams: cap.streams,
        }),
      ).toBe(0);
      const result = JSON.parse(cap.stdout()) as {
        tap_reexpand_rows: { name: string; kind: string }[];
      };
      expect(result.tap_reexpand_rows.filter((row) => row.name === "gamma")).toHaveLength(1);
      expect(result.tap_reexpand_rows.find((row) => row.name === "gamma")!.kind).toBe(
        dryRun ? "would_add" : "added",
      );
      if (dryRun) {
        expect(readState(home)).toEqual(before);
      } else {
        const gamma = readState(home).installations.filter((e) => e.name === "gamma");
        expect(gamma).toHaveLength(1);
        expect(gamma[0]!.tracks_tap).toBe(true);
      }
    });
  }
});
