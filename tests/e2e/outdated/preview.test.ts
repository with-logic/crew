/**
 * `crew outdated` is `crew update --dry-run` with a trimmed rendering
 * (§10.1.1, C-UPD-18d).
 *
 * Install from a local git tap, move upstream (edit + add a sibling),
 * then prove `outdated` lists both pending changes, writes nothing,
 * and that its `--json` payload is byte-identical to
 * `update --dry-run --json`.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { paths } from "../../../src/core/paths.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { commitAll, makeSkill, skillFrontmatter } from "../../helpers/fixtures.ts";
import {
  addSecondRepo,
  ccRoot,
  installedFromRepo,
  moveUpstream,
  snapshot,
  tapHeads,
  useClaudeCodeRoot,
} from "./helpers.ts";

useClaudeCodeRoot();

describe("C-UPD-18d crew outdated", () => {
  test("lists pending updates and additions, writes nothing, matches update --dry-run --json", () => {
    const { home, repo } = installedFromRepo();
    const before = snapshot(home);

    moveUpstream(repo, "alpha");
    // `moveUpstream` already committed the edit; commit the sibling too.
    makeSkill(repo, "beta", skillFrontmatter({ name: "beta", description: "new sibling" }));
    commitAll(repo, "add beta");

    const human = captureStreams();
    expect(runCli(["outdated"], { home, streams: human.streams })).toBe(0);
    const out = human.stdout();
    expect(out).toContain("1 skill would change");
    expect(out).toContain("alpha");
    expect(out).toContain("would update");
    expect(out).toMatch(/1 new skill available from \S+: beta/);
    expect(out).toContain("Run `crew update` to apply.");
    expect(out).not.toContain("up to date");
    expect(snapshot(home)).toEqual(before);
    expect(existsSync(join(ccRoot.path, "beta"))).toBe(false);

    const outdatedJson = captureStreams();
    expect(runCli(["outdated", "--json"], { home, streams: outdatedJson.streams })).toBe(0);
    const dryRunJson = captureStreams();
    expect(runCli(["update", "--dry-run", "--json"], { home, streams: dryRunJson.streams })).toBe(
      0,
    );
    expect(outdatedJson.stdout()).toBe(dryRunJson.stdout());
    expect((JSON.parse(outdatedJson.stdout()) as { dry_run: boolean }).dry_run).toBe(true);
    expect(snapshot(home)).toEqual(before);
  });

  test("says everything is up to date when nothing would change", () => {
    const { home } = installedFromRepo();
    const before = snapshot(home);
    const c = captureStreams();
    expect(runCli(["outdated"], { home, streams: c.streams })).toBe(0);
    expect(c.stdout()).toContain("Everything is up to date.");
    expect(c.stdout()).not.toContain("alpha");
    expect(snapshot(home)).toEqual(before);
  });

  test("accepts selectors like update and reports the selected skill only", () => {
    const { home, repo } = installedFromRepo();
    const otherRepo = addSecondRepo(home, "gamma");
    // Both taps have a pending update, so naming one must exclude the
    // other. With a single installed skill this test could not tell an
    // honoured selector from an ignored one.
    moveUpstream(repo, "alpha");
    moveUpstream(otherRepo, "gamma");

    const before = tapHeads(home);
    const c = captureStreams();
    expect(runCli(["outdated", "alpha"], { home, streams: c.streams })).toBe(0);
    const out = c.stdout();
    expect(out).toContain("1 skill would change");
    expect(out).toContain("alpha");
    expect(out).toContain("would update");
    expect(out).not.toContain("gamma");
    expect(readFileSync(join(ccRoot.path, "alpha", "SKILL.md"), "utf8")).toContain("body v1");

    // The unselected tap must not even be fetched (§16.4 fetch scope).
    const after = tapHeads(home);
    const gammaTap = Object.keys(after).find((t) => t.startsWith("crew-second-"))!;
    expect(after[gammaTap]).toBe(before[gammaTap]);
  });

  test("C-UPD-18e leaves state.json absent on a fresh home and never locks", () => {
    const home = makeCrewHome();
    rmSync(paths(home).stateFile, { force: true });
    rmSync(`${paths(home).stateFile}.lock`, { recursive: true, force: true });

    const c = captureStreams();
    expect(runCli(["outdated"], { home, streams: c.streams })).toBe(0);

    // Acquiring the state lock would itself create both paths (§14).
    expect(existsSync(paths(home).stateFile)).toBe(false);
    expect(existsSync(`${paths(home).stateFile}.lock`)).toBe(false);
  });

  test("appears in help", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    expect(runCli(["help", "outdated"], { home, streams: c.streams })).toBe(0);
    expect(c.stdout()).toContain("crew outdated [<name>...]");
  });
});
