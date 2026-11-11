/**
 * The removal sweep (§9.2): the dropped skills it keeps, each decided
 * before anything is removed.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, lstatSync, renameSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { readState } from "../../../src/state/load.ts";
import { crew, skillDir } from "../../e2e/manifest/helpers.ts";
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

/** Without its marker a directory is no longer provably crew's (§7.4). */
function removeMarker(project: string, name: string): void {
  rmSync(join(skillDir(project, name), ".crew.json"));
}

describe("processDroppedEntries keeps", () => {
  test("a skill that a hand-installed skill still depends on, still owned", () => {
    const installed = installProject({ base: null, top: "base", mine: "base" }, ["top"]);
    const { home, project } = installed;
    expect(crew(home, project, ["install", "--scope", "project", "./tools/mine"]).code).toBe(0);

    const { outcome } = sweep(installed);

    expect(outcome?.records.map((record) => record.name)).toEqual(["top"]);
    const base = outcome?.state.installations.find((entry) => entry.name === "base");
    expect(base?.manifest_owned).toBe(true);
    expect(existsSync(skillDir(project, "base"))).toBe(true);
  });

  test("a skill whose removal a safety check aborts, and what it depends on", () => {
    const installed = installProject({ base: null, top: "base" }, ["top"]);
    removeMarker(installed.project, "top");

    const { outcome, before } = sweep(installed);

    expect(outcome?.records.map((record) => record.name)).toEqual(["top"]);
    expect(outcome?.records[0]?.failures.map((failure) => failure.error.code)).toEqual([
      "untracked_directory",
    ]);
    expect(outcome?.state).toBe(before);
    expect(existsSync(skillDir(installed.project, "top"))).toBe(true);
    expect(existsSync(skillDir(installed.project, "base"))).toBe(true);
  });

  test("only that skill: an unrelated dropped skill is still removed", () => {
    const installed = installProject({ alpha: null, beta: null }, ["alpha", "beta"]);
    removeMarker(installed.project, "alpha");

    const { outcome } = sweep(installed);

    expect(namesIn(outcome?.state ?? readState(installed.home))).toEqual(["alpha"]);
    expect(existsSync(skillDir(installed.project, "beta"))).toBe(false);
  });

  test("nothing a safety check aborted when --force is given", () => {
    const installed = installProject({ alpha: null }, ["alpha"]);
    removeMarker(installed.project, "alpha");

    const { outcome } = sweep(installed, { force: true });

    expect(outcome?.records.flatMap((record) => record.failures)).toEqual([]);
    expect(existsSync(skillDir(installed.project, "alpha"))).toBe(false);
  });

  test("a skill whose install directory is a link, and what it depends on, even with --force", () => {
    const installed = installProject({ base: null, top: "base" }, ["top"]);
    const { project } = installed;
    const elsewhere = join(makeTempDir("crew-elsewhere-"), "top");
    renameSync(skillDir(project, "top"), elsewhere);
    symlinkSync(elsewhere, skillDir(project, "top"));

    const { outcome, before } = sweep(installed, { force: true });

    expect(outcome?.keptForUnverifiedInstallSites).toEqual(["top"]);
    expect(outcome?.records).toEqual([]);
    expect(outcome?.state).toBe(before);
    expect(lstatSync(skillDir(project, "top")).isSymbolicLink()).toBe(true);
    expect(existsSync(join(elsewhere, "SKILL.md"))).toBe(true);
    expect(existsSync(skillDir(project, "base"))).toBe(true);
  });

  test("everything under a skills directory that is a link, without writing a lock into it", () => {
    const installed = installProject({ alpha: null }, ["alpha"]);
    const { project } = installed;
    const elsewhere = join(makeTempDir("crew-elsewhere-"), "skills");
    renameSync(join(project, ".claude", "skills"), elsewhere);
    rmSync(join(elsewhere, ".crew-target"), { force: true });
    symlinkSync(elsewhere, join(project, ".claude", "skills"));

    const { outcome } = sweep(installed);

    expect(outcome?.keptForUnverifiedInstallSites).toEqual(["alpha"]);
    expect(existsSync(join(elsewhere, "alpha", "SKILL.md"))).toBe(true);
    expect(existsSync(join(elsewhere, ".crew-target"))).toBe(false);
  });
});
