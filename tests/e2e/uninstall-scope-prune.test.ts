/**
 * `crew uninstall --prune` interaction with scope (§7.4 step 5).
 *
 * Pruning is a consequence of a FULL removal at one location. These
 * tests pin the three ways that can go wrong: sweeping another scope,
 * sweeping another project root, and sweeping when nothing was removed
 * at all. Split from `uninstall-scope.test.ts` for the 200-line cap;
 * shared setup lives in `helpers/scoped-install.ts`.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { runCli } from "../../src/cli/main.ts";
import { readState } from "../../src/state/load.ts";
import { makeCrewHome } from "../helpers/env.ts";
import { makeTempDir } from "../helpers/fixtures.ts";
import {
  installedNames,
  installSkill,
  installWithDep,
  quiet,
  redirectClaudeCode,
  restoreClaudeCode,
} from "../helpers/scoped-install.ts";

let originals: ReturnType<typeof redirectClaudeCode>["originals"];

beforeEach(() => {
  originals = redirectClaudeCode().originals;
});
afterEach(() => {
  restoreClaudeCode(originals);
});

/** `name@scope` labels for every entry, sorted — scope-aware inventory. */
function inventory(home: string): string[] {
  return readState(home)
    .installations.map((e) => `${e.name}@${e.scope}`)
    .sort();
}

describe("--prune stays within the targeted scope", () => {
  test("pruning after a project-scope uninstall does not sweep user-scope orphans", () => {
    const home = makeCrewHome();
    const project = makeTempDir("crew-proj-");
    expect(installWithDep(home, "foo", "bar", "user", project)).toBe(0);
    expect(installWithDep(home, "foo", "bar", "project", project)).toBe(0);

    // Remove user-scope foo directly so user-scope bar becomes an orphan.
    expect(runCli(["uninstall", "foo"], { home, cwd: project, streams: quiet() })).toBe(0);

    // Project-scope uninstall with --prune: prunes project bar, not user bar.
    const code = runCli(["uninstall", "--prune", "--scope", "project", "foo"], {
      home,
      cwd: project,
      streams: quiet(),
    });
    expect(code).toBe(0);
    expect(inventory(home)).toEqual(["bar@user"]);
  });

  test("uninstalling a parent in one project root keeps the other root's dependency edge", () => {
    const home = makeCrewHome();
    const projA = makeTempDir("crew-projA-");
    const projB = makeTempDir("crew-projB-");
    expect(installWithDep(home, "foo", "bar", "project", projA)).toBe(0);
    expect(installWithDep(home, "foo", "bar", "project", projB)).toBe(0);

    // Remove foo in A with --prune. A's bar is now an orphan and goes;
    // B's foo still requires B's bar, so B keeps both.
    const code = runCli(["uninstall", "--prune", "--scope", "project", "foo"], {
      home,
      cwd: projA,
      streams: quiet(),
    });
    expect(code).toBe(0);

    const remaining = readState(home).installations;
    expect(remaining.map((e) => `${e.name}@${e.project_root}`).sort()).toEqual([
      `bar@${projB}`,
      `foo@${projB}`,
    ]);
    // The surviving edge is the point: B's bar must still know B's foo
    // requires it, or a later prune in B would delete a live dependency.
    const barInB = remaining.find((e) => e.name === "bar");
    expect(barInB?.required_by).toEqual(["foo"]);
  });

  test("a second prune in the untouched root still finds nothing to sweep", () => {
    const home = makeCrewHome();
    const projA = makeTempDir("crew-projA-");
    const projB = makeTempDir("crew-projB-");
    expect(installWithDep(home, "foo", "bar", "project", projA)).toBe(0);
    expect(installWithDep(home, "foo", "bar", "project", projB)).toBe(0);

    runCli(["uninstall", "--prune", "--scope", "project", "foo"], {
      home,
      cwd: projA,
      streams: quiet(),
    });
    // B is intact; a bare prune-less listing must still show both.
    expect(installedNames(home)).toEqual(["bar", "foo"]);
  });
});

describe("--prune requires an actual removal", () => {
  test("a forced miss with --prune leaves unrelated orphans alone", () => {
    const home = makeCrewHome();
    const project = makeTempDir("crew-proj-");
    // An orphan exists at user scope: bar was pulled in by foo, and foo
    // is then removed, leaving bar explicit:false with no requirers.
    expect(installWithDep(home, "foo", "bar", "user", project)).toBe(0);
    expect(runCli(["uninstall", "foo"], { home, cwd: project, streams: quiet() })).toBe(0);
    expect(installedNames(home)).toEqual(["bar"]);

    // `missing` is not installed anywhere; --force makes it a no-op.
    // Nothing was removed, so --prune must not sweep the orphan.
    const code = runCli(["uninstall", "--force", "--prune", "missing"], {
      home,
      cwd: project,
      streams: quiet(),
    });
    expect(code).toBe(0);
    expect(installedNames(home)).toEqual(["bar"]);
  });

  test("a forced scope miss with --prune does not sweep the other scope", () => {
    const home = makeCrewHome();
    const project = makeTempDir("crew-proj-");
    expect(installWithDep(home, "foo", "bar", "user", project)).toBe(0);
    expect(runCli(["uninstall", "foo"], { home, cwd: project, streams: quiet() })).toBe(0);

    // `bar` exists only at user scope; targeting project scope with
    // --force is a no-op miss, so the user-scope orphan must survive.
    const code = runCli(["uninstall", "--force", "--prune", "--scope", "project", "bar"], {
      home,
      cwd: project,
      streams: quiet(),
    });
    expect(code).toBe(0);
    expect(installedNames(home)).toEqual(["bar"]);
  });

  test("a partial --agent removal that leaves the entry alive does not prune", () => {
    const home = makeCrewHome();
    const project = makeTempDir("crew-proj-");
    expect(installSkill(home, "solo", "user", project)).toBe(0);

    // claude-code is the only detected agent, so removing it empties the
    // entry; use an agent the skill isn't in to exercise the no-op path.
    const code = runCli(["uninstall", "--prune", "--agent", "codex", "solo"], {
      home,
      cwd: project,
      streams: quiet(),
    });
    expect(code).toBe(0);
    expect(installedNames(home)).toEqual(["solo"]);
  });
});
