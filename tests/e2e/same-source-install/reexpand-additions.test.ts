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
import { type AdapterRedirect, redirectClaudeCode } from "./helpers.ts";

let cc: AdapterRedirect;

beforeEach(() => {
  cc = redirectClaudeCode();
});
afterEach(() => {
  cc.restore();
});

describe("C-INST-13k whole-tap re-expansion adds new siblings", () => {
  test("C-INST-13k a sibling added upstream is installed exactly once", () => {
    const home = makeCrewHome();

    // A recursive whole-repo install: the tap is rooted at the repo and
    // reaches `skills/alpha` one level down, so a sibling added there
    // later is a re-expansion candidate.
    const repo = makeTempDir("crew-overlap-");
    makeGitRepo(repo);
    makeSkill(join(repo, "skills"), "alpha", skillFrontmatter({ name: "alpha", description: "a" }));
    commitAll(repo, "init");

    const cap1 = captureStreams();
    expect(
      runCli(["install", `file://${repo}`, "--recursive", "--agent", "claude-code"], {
        home,
        streams: cap1.streams,
      }),
    ).toBe(0);
    const names = readState(home)
      .installations.map((e) => e.name)
      .sort();
    expect(names).toEqual(["alpha"]);

    // Every entry tracks its tap, so `crew update` re-walks and picks up
    // whatever is new.
    for (const e of readState(home).installations) {
      expect(e.tracks_tap).toBe(true);
    }

    // A new sibling appears upstream inside the overlap.
    makeSkill(join(repo, "skills"), "beta", skillFrontmatter({ name: "beta", description: "new" }));
    commitAll(repo, "add beta");

    const cap = captureStreams();
    expect(runCli(["update", "--agent", "claude-code"], { home, streams: cap.streams })).toBe(0);

    // Exactly one entry for the new skill, not one per covering row.
    const beta = readState(home).installations.filter((e) => e.name === "beta");
    expect(beta).toHaveLength(1);
    expect(beta[0]!.tracks_tap).toBe(true);
  });
});
