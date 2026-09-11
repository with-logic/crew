/**
 * One clone per repository (§6, §16.3).
 *
 * Tap rows are per (url, subpath), so a repo with skills in two
 * subdirectories used to be cloned twice. These tests pin the shared
 * layout: one directory under `repos/` per repository, deleted only
 * when the last tap referencing it goes away, and a one-time migration
 * for homes created before the change.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../src/cli/main.ts";
import { readConfig } from "../../src/config/load.ts";
import { legacyTapPath, paths } from "../../src/core/paths.ts";
import { ensureDir } from "../../src/util/fs.ts";

import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  cloneDirForTap,
  cloneDirs,
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";

/** A repo with two skills in separate subdirectories. */
function twoSubpathRepo(): string {
  const repo = makeTempDir("crew-shared-clone-");
  makeGitRepo(repo);
  for (const name of ["alpha", "beta"]) {
    const dir = join(repo, name);
    mkdirSync(dir);
    makeSkill(dir, name, skillFrontmatter({ name, description: `The ${name} skill` }));
  }
  commitAll(repo, "init");
  return repo;
}

function run(home: string, args: string[]): { code: number; stdout: string } {
  const c = captureStreams();
  const code = runCli(args, { home, streams: c.streams });
  return { code, stdout: c.stdout() };
}

/**
 * A home with no `core` tap, so `cloneDirs` counts only the repository
 * under test rather than also picking up the default tap's clone.
 */
function bareHome(): string {
  const home = makeCrewHome();
  run(home, ["tap", "remove", "core", "--force"]);
  return home;
}

describe("one clone per repository", () => {
  test("C-TAP-17 two subpath taps on one repo share a single clone", () => {
    const home = bareHome();
    const repo = twoSubpathRepo();

    expect(run(home, ["tap", "add", `file://${repo}//alpha`, "alpha-tap"]).code).toBe(0);
    expect(run(home, ["tap", "add", `file://${repo}//beta`, "beta-tap"]).code).toBe(0);

    // Two tap rows, one set of bytes.
    const config = readConfig(home);
    expect(config.taps.filter((t) => t.kind === "git" && t.url === `file://${repo}`)).toHaveLength(
      2,
    );
    expect(cloneDirs(home)).toHaveLength(1);
    expect(cloneDirForTap("alpha-tap", home)).toBe(cloneDirForTap("beta-tap", home)!);
  });

  test("both subpath installs work off the shared clone", () => {
    const home = bareHome();
    const repo = twoSubpathRepo();

    expect(run(home, ["install", `file://${repo}//alpha`, "--yes"]).code).toBe(0);
    expect(run(home, ["install", `file://${repo}//beta`, "--yes"]).code).toBe(0);

    const listed = run(home, ["list", "--json"]);
    const parsed = JSON.parse(listed.stdout) as { installations: { name: string }[] };
    expect(parsed.installations.map((e) => e.name).sort()).toEqual(["alpha", "beta"]);
    expect(cloneDirs(home)).toHaveLength(1);
  });

  test("C-TAP-17b removing one tap keeps the clone the other still needs", () => {
    const home = bareHome();
    const repo = twoSubpathRepo();
    run(home, ["tap", "add", `file://${repo}//alpha`, "alpha-tap"]);
    run(home, ["tap", "add", `file://${repo}//beta`, "beta-tap"]);
    const shared = cloneDirForTap("alpha-tap", home)!;

    expect(run(home, ["tap", "remove", "alpha-tap"]).code).toBe(0);

    expect(readConfig(home).taps.some((t) => t.name === "alpha-tap")).toBe(false);
    expect(existsSync(shared)).toBe(true);
    // The surviving tap still resolves its skills.
    const search = run(home, ["search", "--json", "beta"]);
    const parsed = JSON.parse(search.stdout) as { hits: { name: string }[] };
    expect(parsed.hits.some((h) => h.name === "beta")).toBe(true);
  });

  test("C-TAP-17b removing the last tap on a repo deletes the clone", () => {
    const home = bareHome();
    const repo = twoSubpathRepo();
    run(home, ["tap", "add", `file://${repo}//alpha`, "alpha-tap"]);
    run(home, ["tap", "add", `file://${repo}//beta`, "beta-tap"]);
    const shared = cloneDirForTap("alpha-tap", home)!;

    run(home, ["tap", "remove", "alpha-tap"]);
    expect(existsSync(shared)).toBe(true);
    run(home, ["tap", "remove", "beta-tap"]);
    expect(existsSync(shared)).toBe(false);
  });

  test("C-TAP-17c `crew update` fetches a shared repository once, not once per tap", () => {
    const home = bareHome();
    const repo = twoSubpathRepo();
    run(home, ["install", `file://${repo}//alpha`, "--yes"]);
    run(home, ["tap", "add", `file://${repo}//beta`, "beta-tap"]);

    const r = run(home, ["update", "--json"]);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout) as { tap_rows: { name: string; kind: string }[] };
    // Every tap still gets a row; the second reports the first's result.
    const refreshed = parsed.tap_rows.filter((row) => row.kind === "refreshed");
    expect(refreshed.length).toBeGreaterThanOrEqual(2);
    // Both tap rows resolve to the same directory, so the repo is on
    // disk exactly once regardless of how many taps point at it.
    expect(cloneDirs(home)).toHaveLength(1);
  });

  test("C-TAP-17c a failed fetch is reported for every tap on that repository", () => {
    const home = bareHome();
    const repo = twoSubpathRepo();
    run(home, ["tap", "add", `file://${repo}//alpha`, "alpha-tap"]);
    run(home, ["tap", "add", `file://${repo}//beta`, "beta-tap"]);
    // Remove the upstream and the clone: the fetch now fails, and both
    // tap rows must say so rather than the second silently succeeding.
    rmSync(cloneDirForTap("alpha-tap", home)!, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });

    const r = run(home, ["tap", "update", "--json"]);
    expect(r.code).toBe(1);
    const parsed = JSON.parse(r.stdout) as {
      rows: { name: string; kind: string; error?: { code: string } }[];
    };
    const failed = parsed.rows.filter((row) => row.kind === "failed");
    expect(failed.map((row) => row.name).sort()).toEqual(["alpha-tap", "beta-tap"]);
    expect(failed.every((row) => row.error?.code === "source_unreachable")).toBe(true);
  });

  test("C-TAP-17b auto-tap GC keeps a clone a registered tap still uses", () => {
    const home = bareHome();
    const repo = twoSubpathRepo();
    // An install creates an auto tap; a registered tap over the same
    // repository is added separately.
    expect(run(home, ["install", `file://${repo}//alpha`, "--yes"]).code).toBe(0);
    run(home, ["tap", "add", `file://${repo}//beta`, "beta-tap"]);
    const shared = cloneDirForTap("beta-tap", home)!;
    const autoTap = readConfig(home).taps.find((t) => !t.registered)!;
    expect(cloneDirForTap(autoTap.name, home)).toBe(shared);

    // Uninstalling the only skill collects the auto tap, but its bytes
    // are the registered tap's bytes too.
    expect(run(home, ["uninstall", "alpha"]).code).toBe(0);

    expect(readConfig(home).taps.some((t) => t.name === autoTap.name)).toBe(false);
    expect(existsSync(shared)).toBe(true);
    const search = run(home, ["search", "--json", "beta"]);
    const parsed = JSON.parse(search.stdout) as { hits: { name: string }[] };
    expect(parsed.hits.some((h) => h.name === "beta")).toBe(true);
  });

  test("C-TAP-17b auto-tap GC deletes a clone nothing else references", () => {
    const home = bareHome();
    const repo = twoSubpathRepo();
    expect(run(home, ["install", `file://${repo}//alpha`, "--yes"]).code).toBe(0);
    const autoTap = readConfig(home).taps.find((t) => !t.registered)!;
    const clone = cloneDirForTap(autoTap.name, home)!;
    expect(existsSync(clone)).toBe(true);

    expect(run(home, ["uninstall", "alpha"]).code).toBe(0);

    // Nothing else points at the repository, so the bytes go too.
    expect(readConfig(home).taps.some((t) => t.name === autoTap.name)).toBe(false);
    expect(existsSync(clone)).toBe(false);
  });

  test("C-TAP-17 differing `.git` spellings of one repo resolve to one clone", () => {
    const home = bareHome();
    const repo = twoSubpathRepo();
    run(home, ["tap", "add", `file://${repo}//alpha`, "plain"]);
    run(home, ["tap", "add", `file://${repo}.git//beta`, "dotgit"]);
    expect(cloneDirForTap("plain", home)).toBe(cloneDirForTap("dotgit", home)!);
  });
});

describe("migration from the per-tap-name clone layout", () => {
  test("C-TAP-18 an old-layout clone is moved on the next command and still works", () => {
    const home = bareHome();
    const repo = twoSubpathRepo();
    run(home, ["tap", "add", `file://${repo}//alpha`, "alpha-tap"]);
    const shared = cloneDirForTap("alpha-tap", home)!;

    // Put the home back into the pre-0.11 shape.
    const legacy = legacyTapPath("alpha-tap", home);
    ensureDir(paths(home).tapsDir);
    renameSync(shared, legacy);
    expect(existsSync(shared)).toBe(false);

    const search = run(home, ["search", "--json", "alpha"]);
    expect(search.code).toBe(0);
    const parsed = JSON.parse(search.stdout) as { hits: { name: string }[] };
    expect(parsed.hits.some((h) => h.name === "alpha")).toBe(true);
    // The clone moved rather than being re-cloned, and the old path is gone.
    expect(existsSync(shared)).toBe(true);
    expect(existsSync(legacy)).toBe(false);
  });

  test("C-TAP-18 a redundant old clone is dropped when the shared one already exists", () => {
    const home = bareHome();
    const repo = twoSubpathRepo();
    run(home, ["tap", "add", `file://${repo}//alpha`, "alpha-tap"]);
    run(home, ["tap", "add", `file://${repo}//beta`, "beta-tap"]);
    const shared = cloneDirForTap("alpha-tap", home)!;

    // The old layout gave each tap its own copy of the same repository.
    // Recreate the second copy while the shared clone is already there.
    const legacy = legacyTapPath("beta-tap", home);
    ensureDir(join(legacy, ".git"));
    expect(existsSync(legacy)).toBe(true);

    const search = run(home, ["search", "--json", "beta"]);
    expect(search.code).toBe(0);
    // The duplicate is discarded; the shared clone is untouched.
    expect(existsSync(legacy)).toBe(false);
    expect(existsSync(shared)).toBe(true);
    expect(cloneDirs(home)).toHaveLength(1);
  });
});
