/**
 * The removal sweep (§9.2): which skills it removes, and that it previews
 * on a dry run and does nothing for a manifest that is no longer current.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readState } from "../../../src/state/load.ts";
import { crew } from "../../e2e/manifest/helpers.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import { installProject, namesIn, skillDir, sweep } from "./helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

describe("processDroppedEntries", () => {
  test("removes every dropped skill, a dependent before what it depends on", () => {
    const installed = installProject({ base: null, top: "base" }, ["top"]);

    const { outcome } = sweep(installed);

    expect(outcome?.records.map((record) => record.name)).toEqual(["top", "base"]);
    expect(outcome?.records.flatMap((record) => record.failures)).toEqual([]);
    expect(outcome?.keptAsUnsafe).toEqual([]);
    expect(outcome?.interrupted).toBe(false);
    expect(namesIn(outcome?.state ?? readState(installed.home))).toEqual([]);
    expect(existsSync(skillDir(installed.project, "top"))).toBe(false);
    expect(existsSync(skillDir(installed.project, "base"))).toBe(false);
  });

  test("returns the new state without writing it", () => {
    const installed = installProject({ alpha: null }, ["alpha"]);

    sweep(installed);

    expect(namesIn(readState(installed.home))).toEqual(["alpha"]);
  });

  test("leaves what the manifest still resolves to and what it never owned", () => {
    const installed = installProject({ alpha: null, beta: null, mine: null }, ["alpha", "beta"]);
    const { home, project } = installed;
    expect(crew(home, project, ["install", "--scope", "project", "./tools/mine"]).code).toBe(0);

    const { outcome } = sweep(installed, { resolved: ["alpha"] });

    expect(outcome?.records.map((record) => record.name)).toEqual(["beta"]);
    expect(namesIn(outcome?.state ?? readState(home))).toEqual(["alpha", "mine"]);
    expect(existsSync(skillDir(project, "alpha"))).toBe(true);
    expect(existsSync(skillDir(project, "mine"))).toBe(true);
  });

  test("leaves what another project's manifest owns", () => {
    const installed = installProject({ alpha: null }, ["alpha"]);
    const other = installProject({ beta: null }, ["beta"], installed.home);

    const { outcome } = sweep(installed);

    expect(outcome?.records.map((record) => record.name)).toEqual(["alpha"]);
    expect(namesIn(outcome?.state ?? readState(installed.home))).toEqual(["beta"]);
    expect(existsSync(skillDir(other.project, "beta"))).toBe(true);
  });

  test("a dry run reports what would go and removes nothing", () => {
    const installed = installProject({ base: null, top: "base" }, ["top"]);

    const { outcome } = sweep(installed, { dryRun: true });

    expect(outcome?.records.map((record) => record.name)).toEqual(["top", "base"]);
    expect(existsSync(skillDir(installed.project, "top"))).toBe(true);
    expect(existsSync(skillDir(installed.project, "base"))).toBe(true);
  });

  test("does nothing when the manifest is no longer current before it starts", () => {
    const installed = installProject({ alpha: null }, ["alpha"]);

    for (const dryRun of [false, true]) {
      const { outcome } = sweep(installed, { dryRun, isStillCurrent: () => false });
      expect(outcome).toBeNull();
    }

    expect(existsSync(skillDir(installed.project, "alpha"))).toBe(true);
  });
});
