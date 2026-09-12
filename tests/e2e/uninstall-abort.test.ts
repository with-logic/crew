/**
 * `crew uninstall` when a removal aborts on a safety check (§7.4 steps
 * 4–5, C-UNINST-13a/13b).
 *
 * An abort leaves the skill's bytes on disk. Two consequences are pinned
 * here: the entry keeps its `state.json` ownership, so state never
 * claims a skill is gone while the install site still holds it; and
 * pruning — which is a consequence of a CONFIRMED physical removal —
 * does not sweep the location's dependencies, because the protected
 * bytes still require them.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../src/cli/main.ts";
import { readState } from "../../src/state/load.ts";
import { makeCrewHome } from "../helpers/env.ts";
import { makeTempDir } from "../helpers/fixtures.ts";
import {
  installChain,
  installedNames,
  quiet,
  redirectClaudeCode,
  restoreClaudeCode,
} from "../helpers/scoped-install.ts";

let originals: ReturnType<typeof redirectClaudeCode>["originals"];
let userRoot: string;

beforeEach(() => {
  const r = redirectClaudeCode();
  originals = r.originals;
  userRoot = r.userRoot;
});
afterEach(() => {
  restoreClaudeCode(originals);
});

/** Delete a skill's marker so removing it aborts as `untracked_directory`. */
function makeUntracked(name: string): void {
  rmSync(join(userRoot, name, ".crew.json"));
}

describe("uninstall aborts on a safety check", () => {
  test("C-UNINST-13a an aborted removal keeps its state entry", () => {
    const home = makeCrewHome();
    const cwd = makeTempDir("crew-cwd-");
    expect(installChain(home, "foo", "bar", "baz", cwd)).toBe(0);
    makeUntracked("foo");

    const code = runCli(["uninstall", "foo"], { home, cwd, streams: quiet() });

    expect(code).toBe(1);
    // The bytes are still there, so state must still record them.
    expect(existsSync(join(userRoot, "foo"))).toBe(true);
    expect(installedNames(home)).toContain("foo");
    // And the edge it owns survives, so a later prune can't sweep `bar`.
    const bar = readState(home).installations.find((e) => e.name === "bar");
    expect(bar?.required_by).toEqual(["foo"]);
  });

  test("C-UNINST-13b a protected middle node keeps its dependency installed", () => {
    const home = makeCrewHome();
    const cwd = makeTempDir("crew-cwd-");
    expect(installChain(home, "foo", "bar", "baz", cwd)).toBe(0);
    expect(installedNames(home)).toEqual(["bar", "baz", "foo"]);
    // `bar` is protected: removing it aborts and its bytes stay, so
    // `baz` is still required by something physically installed.
    makeUntracked("bar");

    runCli(["uninstall", "--prune", "foo"], { home, cwd, streams: quiet() });

    expect(existsSync(join(userRoot, "bar"))).toBe(true);
    expect(existsSync(join(userRoot, "baz"))).toBe(true);
    expect(installedNames(home)).toEqual(["bar", "baz"]);
  });

  test("C-UNINST-13b the prune sweep terminates when an orphan is protected", () => {
    const home = makeCrewHome();
    const cwd = makeTempDir("crew-cwd-");
    expect(installChain(home, "foo", "bar", "baz", cwd)).toBe(0);
    // Protect the ORPHAN itself rather than the middle node: removing
    // `foo` orphans `bar`, whose removal then aborts and keeps its
    // entry. The sweep must not revisit it forever.
    makeUntracked("bar");
    rmSync(join(userRoot, "bar", "SKILL.md"));

    const code = runCli(["uninstall", "--prune", "foo"], { home, cwd, streams: quiet() });

    expect(code).toBe(0);
    expect(installedNames(home)).toEqual(["bar", "baz"]);
  });
});
