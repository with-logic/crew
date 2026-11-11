/**
 * `crew install --dry-run` leaves the store untouched (§5.2, C-INST-15a).
 *
 * Resolution stages each candidate to learn its content hash; on a dry
 * run that staging must not land under `<CREW_HOME>/store`.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { paths } from "../../../src/core/paths.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

/** Every path under `root` (files with their bytes), or `[]` when `root` is absent. */
function snapshot(root: string): [string, string][] {
  if (!existsSync(root)) return [];
  const names = readdirSync(root, { recursive: true }) as string[];
  return names.sort().map((name) => {
    const path = join(root, name);
    return [name, statSync(path).isFile() ? readFileSync(path, "hex") : "<dir>"];
  });
}

interface InstallJson {
  readonly dry_run: boolean;
  readonly records: { readonly name: string; readonly anySuccess: boolean }[];
}

function dryRun(home: string, ...args: string[]): { code: number; json: InstallJson } {
  const capture = captureStreams();
  const code = runCli(["install", "--dry-run", "--json", ...args], {
    home,
    streams: capture.streams,
  });
  return { code, json: JSON.parse(capture.stdout()) as InstallJson };
}

function gitRepoWithAlpha(): string {
  const repo = makeTempDir("crew-dry-store-");
  makeGitRepo(repo);
  makeSkill(repo, "alpha", skillFrontmatter({ name: "alpha" }), "body v1\n");
  commitAll(repo, "v1");
  return repo;
}

describe("C-INST-15a install --dry-run writes no store entry", () => {
  test("git source: an empty store stays empty and no scratch copy is left behind", () => {
    const home = makeCrewHome();
    const repo = gitRepoWithAlpha();

    const { code, json } = dryRun(home, `file://${repo}`);

    expect(code).toBe(0);
    expect(json.dry_run).toBe(true);
    expect(json.records.map((r) => [r.name, r.anySuccess])).toEqual([["alpha", true]]);
    expect(snapshot(paths(home).storeDir)).toEqual([]);
    expect(snapshot(paths(home).cacheDir)).toEqual([]);
  });

  test("git source: existing entries are reused unmodified and none are added", () => {
    const home = makeCrewHome();
    const repo = gitRepoWithAlpha();
    const project = makeTempDir("crew-dry-store-proj-");
    const installed = runCli(["install", "--scope", "project", `file://${repo}`], {
      home,
      cwd: project,
      streams: captureStreams().streams,
    });
    expect(installed).toBe(0);
    const before = snapshot(paths(home).storeDir);
    expect(before.length).toBeGreaterThan(0);

    // Same commit: the published entry is reused, which writes nothing.
    expect(dryRun(home, "--scope", "project", "--force", `file://${repo}`).code).toBe(0);
    expect(snapshot(paths(home).storeDir)).toEqual(before);

    // A second git source would need a new entry beside the published one.
    const other = makeTempDir("crew-dry-store-other-");
    makeGitRepo(other);
    makeSkill(other, "beta", skillFrontmatter({ name: "beta" }));
    commitAll(other, "beta");
    const { code, json } = dryRun(home, `file://${repo}`, `file://${other}`);

    expect(code).toBe(0);
    expect(json.records.map((r) => r.name).sort()).toEqual(["alpha", "beta"]);
    expect(snapshot(paths(home).storeDir)).toEqual(before);
  });

  test("path source: a skill and its sibling dependency leave the store empty", () => {
    const home = makeCrewHome();
    const src = makeTempDir("crew-dry-store-path-");
    makeSkill(src, "dep", skillFrontmatter({ name: "dep" }));
    const root = makeSkill(src, "root", skillFrontmatter({ name: "root", dependencies: ["dep"] }));

    const { code, json } = dryRun(home, root);

    expect(code).toBe(0);
    expect(json.records.map((r) => r.name).sort()).toEqual(["dep", "root"]);
    expect(snapshot(paths(home).storeDir)).toEqual([]);
    expect(snapshot(paths(home).cacheDir)).toEqual([]);
  });

  test("a dry run that fails after staging still leaves the store empty", () => {
    const home = makeCrewHome();
    const src = makeTempDir("crew-dry-store-fail-");
    const good = makeSkill(src, "good", skillFrontmatter({ name: "good" }));
    const capture = captureStreams();

    const code = runCli(["install", "--dry-run", good, join(src, "missing")], {
      home,
      streams: capture.streams,
    });

    expect(code).not.toBe(0);
    expect(snapshot(paths(home).storeDir)).toEqual([]);
    expect(snapshot(paths(home).cacheDir)).toEqual([]);
  });
});
