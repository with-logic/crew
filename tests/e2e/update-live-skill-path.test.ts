/**
 * `crew update` reading one skill out of a live tap checkout (§8.4,
 * §10.1; C-UPD-11, C-UPD-39).
 *
 * An entry that doesn't track its tap (`<tap>/<skill>`) is updated by
 * reading its recorded path straight out of the tap's clone, with no
 * re-expansion first. That path must still be the skill: gone upstream
 * is the soft `source_gone`, and in a git tap a path that now leads
 * through a symlink is never followed.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../helpers/scoped-install.ts";

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));

function run(home: string, args: string[]): { code: number; stdout: string } {
  const cap = captureStreams();
  const code = runCli(args, { home, streams: cap.streams });
  return { code, stdout: cap.stdout() };
}

function outcomes(r: { stdout: string }): string[] {
  const rows: { name: string; outcome: { kind: string } }[] = JSON.parse(r.stdout).rows;
  return rows.map((row) => `${row.name}:${row.outcome.kind}`);
}

const installed = (): string => readFileSync(join(claude.userRoot, "demo", "SKILL.md"), "utf8");

/**
 * A git tap `acme` holding `skills/demo`, with `acme/demo` installed.
 * Callers assert on `installed()`, which fails if either step did.
 */
function installFromGitTap(): { home: string; repo: string } {
  const home = makeCrewHome();
  const repo = makeTempDir();
  makeSkill(join(repo, "skills"), "demo", skillFrontmatter({ name: "demo" }), "Original.\n");
  makeGitRepo(repo);
  run(home, ["tap", "add", `file://${repo}`, "acme"]);
  run(home, ["install", "acme/demo"]);
  return { home, repo };
}

describe("crew update of a <tap>/<skill> install", () => {
  test("C-UPD-11 a skill deleted upstream is source_gone, not a failure", () => {
    const { home, repo } = installFromGitTap();
    expect(installed()).toContain("Original.");
    rmSync(join(repo, "skills", "demo"), { recursive: true });
    commitAll(repo, "drop demo");

    const r = run(home, ["update", "--json"]);
    expect(r.code).toBe(0);
    expect(outcomes(r)).toEqual(["demo:source_gone"]);
    expect(installed()).toContain("Original.");
  });

  test("C-UPD-39 a skill replaced upstream by a symlink out of the repo is never read", () => {
    const { home, repo } = installFromGitTap();
    expect(installed()).toContain("Original.");
    const outside = makeTempDir();
    makeSkill(outside, "demo", skillFrontmatter({ name: "demo" }), "Not from the repo.\n");
    rmSync(join(repo, "skills", "demo"), { recursive: true });
    symlinkSync(join(outside, "demo"), join(repo, "skills", "demo"));
    commitAll(repo, "swap demo for a link");

    const r = run(home, ["update", "--json"]);
    expect(r.code).toBe(0);
    expect(outcomes(r)).toEqual(["demo:source_gone"]);
    expect(installed()).toContain("Original.");
  });

  test("C-UPD-39 a symlink that stays inside the repository updates normally", () => {
    const home = makeCrewHome();
    const repo = makeTempDir();
    makeSkill(join(repo, "packages"), "demo", skillFrontmatter({ name: "demo" }), "Original.\n");
    mkdirSync(join(repo, "skills"));
    symlinkSync(join("..", "packages", "demo"), join(repo, "skills", "demo"));
    makeGitRepo(repo);
    run(home, ["tap", "add", `file://${repo}`, "acme"]);
    expect(run(home, ["install", "acme/demo"]).code).toBe(0);
    makeSkill(join(repo, "packages"), "demo", skillFrontmatter({ name: "demo" }), "Edited.\n");
    commitAll(repo, "edit demo");

    const r = run(home, ["update", "--json"]);
    expect(r.code).toBe(0);
    expect(outcomes(r)).toEqual(["demo:updated"]);
    expect(installed()).toContain("Edited.");
  });

  test("a path tap is the user's own directory, so a symlinked skill there still updates", () => {
    const home = makeCrewHome();
    const tapDir = makeTempDir();
    const elsewhere = makeTempDir();
    makeSkill(elsewhere, "demo", skillFrontmatter({ name: "demo" }), "Original.\n");
    symlinkSync(join(elsewhere, "demo"), join(tapDir, "demo"));
    expect(run(home, ["tap", "add", tapDir, "mine"]).code).toBe(0);
    expect(run(home, ["install", "mine/demo"]).code).toBe(0);
    makeSkill(elsewhere, "demo", skillFrontmatter({ name: "demo" }), "Edited.\n");

    const r = run(home, ["update", "--json"]);
    expect(r.code).toBe(0);
    expect(outcomes(r)).toEqual(["demo:updated"]);
    expect(installed()).toContain("Edited.");
  });
});
