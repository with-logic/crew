/**
 * `crew uninstall --dry-run` writes nothing (§5.2, §7.4).
 *
 * A preview that mutates is worse than no preview: before this was
 * fixed, the command kept the skill's bytes but still wrote state and
 * ran the auto-tap GC, so a dry run dropped the entry, deleted the
 * backing tap from config, and removed its clone — orphaning an install
 * the user was only asking about.
 *
 * The tap-scoped variant is covered in `tap-remove-guard/uninstall.test.ts`;
 * this pins the direct command.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { runCli } from "../../src/cli/main.ts";
import { paths } from "../../src/core/paths.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";

let ccRoot: string;
let restore: (() => void) | null = null;

beforeEach(() => {
  ccRoot = makeTempDir("crew-cc-");
  const originals = { u: claudeCodeAdapter.userPath, d: claudeCodeAdapter.detect };
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccRoot;
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
  restore = () => {
    (claudeCodeAdapter as { userPath: () => string }).userPath = originals.u;
    (claudeCodeAdapter as { detect: () => boolean }).detect = originals.d;
  };
});
afterEach(() => {
  if (restore) restore();
  restore = null;
});

function run(home: string, argv: string[]) {
  const c = captureStreams();
  const code = runCli(argv, { home, streams: c.streams });
  return { code, stdout: c.stdout(), stderr: c.stderr() };
}

/** Install one skill from a local repo, creating an auto tap for it. */
function installDemo(home: string): void {
  const repo = makeTempDir("crew-dryrun-repo-");
  makeGitRepo(repo);
  makeSkill(repo, "demo", skillFrontmatter({ name: "demo", description: "A demo skill" }));
  commitAll(repo, "init");
  if (run(home, ["install", `file://${repo}`, "--agent", "claude-code"]).code !== 0) {
    throw new Error("setup install failed");
  }
}

describe("C-UNINST-19c uninstall --dry-run writes nothing", () => {
  test("state, config, and the backing clone all survive the preview", () => {
    const home = makeCrewHome();
    installDemo(home);
    const p = paths(home);
    const stateBefore = readFileSync(p.stateFile, "utf8");
    const configBefore = readFileSync(p.configFile, "utf8");
    const markerBefore = readFileSync(join(ccRoot, "demo", ".crew.json"), "utf8");
    // The auto tap's clone directory, whichever name was derived for it.
    const tapDirBefore = existsSync(p.tapsDir);

    const r = run(home, ["uninstall", "--dry-run", "demo"]);

    expect(r.code).toBe(0);
    // Bytes and marker untouched.
    expect(existsSync(join(ccRoot, "demo", "SKILL.md"))).toBe(true);
    expect(readFileSync(join(ccRoot, "demo", ".crew.json"), "utf8")).toBe(markerBefore);
    // State and config byte-identical: no simulated removal persisted,
    // and the auto-tap GC did not drop the tap row.
    expect(readFileSync(p.stateFile, "utf8")).toBe(stateBefore);
    expect(readFileSync(p.configFile, "utf8")).toBe(configBefore);
    // The clone the preview claims to keep is still there.
    expect(existsSync(p.tapsDir)).toBe(tapDirBefore);
  });

  test("a real uninstall still removes everything the preview described", () => {
    const home = makeCrewHome();
    installDemo(home);

    const preview = run(home, ["uninstall", "--dry-run", "demo"]);
    const real = run(home, ["uninstall", "demo"]);

    expect(preview.code).toBe(0);
    expect(real.code).toBe(0);
    expect(existsSync(join(ccRoot, "demo"))).toBe(false);
  });
});

/**
 * `--force` converts three §7.4 safety aborts into deletions. Each has
 * its own `if (!input.dryRun)` guard in `src/agents/uninstall.ts`, so
 * each needs its own preview test — the un-forced paths throw before
 * reaching the guard and therefore prove nothing about it.
 */
describe("C-UNINST-19c forced uninstall --dry-run deletes nothing", () => {
  test("an untracked directory survives a forced preview", () => {
    const home = makeCrewHome();
    installDemo(home);
    // No marker: a forced real run would rmrf the whole directory.
    rmSync(join(ccRoot, "demo", ".crew.json"));

    const r = run(home, ["uninstall", "--dry-run", "--force", "demo"]);

    expect(r.code).toBe(0);
    expect(existsSync(join(ccRoot, "demo", "SKILL.md"))).toBe(true);

    // The real forced run does delete it, so the preview described work.
    expect(run(home, ["uninstall", "--force", "demo"]).code).toBe(0);
    expect(existsSync(join(ccRoot, "demo"))).toBe(false);
  });

  test("an inconsistent marker survives a forced preview", () => {
    const home = makeCrewHome();
    installDemo(home);
    // Marker names a different skill than the directory it sits in.
    const markerPath = join(ccRoot, "demo", ".crew.json");
    const marker = JSON.parse(readFileSync(markerPath, "utf8")) as { name: string };
    writeFileSync(markerPath, JSON.stringify({ ...marker, name: "something-else" }, null, 2));

    const r = run(home, ["uninstall", "--dry-run", "--force", "demo"]);

    expect(r.code).toBe(0);
    expect(existsSync(join(ccRoot, "demo", "SKILL.md"))).toBe(true);
    // The mismatched marker is left exactly as-is, not rewritten.
    expect((JSON.parse(readFileSync(markerPath, "utf8")) as { name: string }).name).toBe(
      "something-else",
    );

    expect(run(home, ["uninstall", "--force", "demo"]).code).toBe(0);
    expect(existsSync(join(ccRoot, "demo"))).toBe(false);
  });

  test("a marker shared with another agent is not rewritten by a preview", () => {
    const home = makeCrewHome();
    installDemo(home);
    // A second owner in the marker means removing claude-code detaches
    // rather than deletes — the `writeJson` branch, not the `rmrf` one.
    const markerPath = join(ccRoot, "demo", ".crew.json");
    const marker = JSON.parse(readFileSync(markerPath, "utf8")) as { agents: string[] };
    const shared = { ...marker, agents: [...marker.agents, "codex"].sort() };
    writeFileSync(markerPath, JSON.stringify(shared, null, 2));
    const markerBefore = readFileSync(markerPath, "utf8");

    const r = run(home, ["uninstall", "--dry-run", "--force", "--agent", "claude-code", "demo"]);

    expect(r.code).toBe(0);
    // Bytes stay (another agent owns them) AND the marker is byte-identical.
    expect(existsSync(join(ccRoot, "demo", "SKILL.md"))).toBe(true);
    expect(readFileSync(markerPath, "utf8")).toBe(markerBefore);

    // The real run rewrites ownership without deleting the shared bytes.
    expect(run(home, ["uninstall", "--force", "--agent", "claude-code", "demo"]).code).toBe(0);
    expect(existsSync(join(ccRoot, "demo", "SKILL.md"))).toBe(true);
    expect((JSON.parse(readFileSync(markerPath, "utf8")) as { agents: string[] }).agents).toEqual([
      "codex",
    ]);
  });
});
