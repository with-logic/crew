/**
 * The removal sweep (§9.2): what it checks again right before each
 * deletion, and that it stops rather than carry on from a surprise.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, lstatSync, renameSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { readState } from "../../../src/state/load.ts";
import { skillDir } from "../../e2e/manifest/helpers.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import { installProject, namesIn, sweep } from "./helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

// The sweep asks whether the manifest is current once before it starts
// (call 1) and once before each deletion (calls 2, 3, …).
const BEFORE_FIRST_DELETION = 2;
const BEFORE_SECOND_DELETION = 3;

describe("processDroppedEntries, before each deletion", () => {
  test("stops when the manifest is no longer current, keeping the removals already done", () => {
    const installed = installProject({ alpha: null, beta: null }, ["alpha", "beta"]);

    const { outcome } = sweep(installed, {
      isStillCurrent: (call) => call < BEFORE_SECOND_DELETION,
    });

    expect(outcome?.interrupted).toBe(true);
    expect(outcome?.records.map((record) => record.name)).toEqual(["alpha"]);
    expect(namesIn(outcome?.state ?? readState(installed.home))).toEqual(["beta"]);
    expect(existsSync(skillDir(installed.project, "beta"))).toBe(true);
  });

  test("does not delete a directory that became a link after the pre-checks, and stops", () => {
    const installed = installProject({ base: null, top: "base" }, ["top"]);
    const { project } = installed;
    const elsewhere = join(makeTempDir("crew-elsewhere-"), "top");

    const { outcome, before } = sweep(installed, {
      isStillCurrent: (call) => {
        if (call !== BEFORE_FIRST_DELETION) return true;
        renameSync(skillDir(project, "top"), elsewhere);
        symlinkSync(elsewhere, skillDir(project, "top"));
        return true;
      },
    });

    expect(outcome?.keptForUnverifiedInstallSites).toEqual(["top"]);
    expect(outcome?.interrupted).toBe(false);
    expect(outcome?.records).toEqual([]);
    expect(outcome?.state).toBe(before);
    expect(lstatSync(skillDir(project, "top")).isSymbolicLink()).toBe(true);
    expect(existsSync(join(elsewhere, "SKILL.md"))).toBe(true);
    expect(existsSync(skillDir(project, "base"))).toBe(true);
  });

  test("stops when a removal that passed its pre-check then fails, keeping what it depends on", () => {
    const installed = installProject({ base: null, top: "base" }, ["top"]);
    const { project } = installed;

    const { outcome } = sweep(installed, {
      isStillCurrent: (call) => {
        if (call === BEFORE_FIRST_DELETION) rmSync(join(skillDir(project, "top"), ".crew.json"));
        return true;
      },
    });

    expect(outcome?.records.map((record) => record.name)).toEqual(["top"]);
    expect(outcome?.records[0]?.failures.map((failure) => failure.error.code)).toEqual([
      "untracked_directory",
    ]);
    expect(existsSync(join(skillDir(project, "top"), "SKILL.md"))).toBe(true);
    expect(namesIn(outcome?.state ?? readState(installed.home))).toEqual(["base", "top"]);
    expect(existsSync(skillDir(project, "base"))).toBe(true);
  });
});
