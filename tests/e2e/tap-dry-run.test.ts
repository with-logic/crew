/**
 * `--dry-run` on `crew tap add`, `crew tap remove`, and `crew tap update`
 * (§16.3, C-TAP-16b). Every case asserts the preview ran the same
 * validation as the real command and that nothing on disk changed:
 * no clone created or deleted, config.yaml untouched, no fetch.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../src/cli/main.ts";
import { readConfig } from "../../src/config/load.ts";
import { paths, tapPath } from "../../src/core/paths.ts";
import { runGit } from "../../src/git/exec.ts";
import { readState } from "../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";

function buildTapRepo(prefix: string): string {
  const repo = makeTempDir(prefix);
  makeGitRepo(repo);
  makeSkill(repo, "alpha", skillFrontmatter({ name: "alpha", description: "An alpha skill" }));
  commitAll(repo, "init");
  return repo;
}

/** Raw config.yaml, or "" when nothing has been written yet (fresh home). */
function configBytes(home: string): string {
  const file = paths(home).configFile;
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

function run(home: string, argv: string[]) {
  const c = captureStreams();
  const code = runCli(argv, { home, streams: c.streams });
  return { code, stdout: c.stdout(), stderr: c.stderr() };
}

describe("C-TAP-16b tap add --dry-run", () => {
  test("new git tap: reports, does not clone, does not write config", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo("crew-dry-add-");
    const before = configBytes(home);
    const r = run(home, ["tap", "add", "--dry-run", `file://${repo}`, "mytap"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Would add tap mytap");
    expect(r.stdout).toContain("(dry run)");
    expect(existsSync(tapPath("mytap", home))).toBe(false);
    expect(configBytes(home)).toBe(before);
    expect(readConfig(home).taps.some((t) => t.name === "mytap")).toBe(false);
  });

  test("JSON carries dry_run: true", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo("crew-dry-add-json-");
    const r = run(home, ["tap", "add", "--dry-run", "--json", `file://${repo}`, "mytap"]);
    expect(r.code).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.dry_run).toBe(true);
    expect(json.name).toBe("mytap");
    expect(json.kind).toBe("git");
  });

  test("shorthand `crew tap <url> --dry-run` previews too", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo("crew-dry-add-short-");
    const r = run(home, ["tap", `file://${repo}`, "--dry-run"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Would add tap");
    expect(readConfig(home).taps).toHaveLength(1);
  });

  test("already-registered same target reports the no-op", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo("crew-dry-add-noop-");
    run(home, ["tap", "add", `file://${repo}`, "mytap"]);
    const before = configBytes(home);
    const r = run(home, ["tap", "add", "--dry-run", "--json", `file://${repo}`]);
    expect(r.code).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.already).toBe(true);
    expect(json.dry_run).toBe(true);
    expect(configBytes(home)).toBe(before);
  });

  test("auto tap would be promoted; registered flag and state stay put", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo("crew-dry-add-promote-");
    run(home, ["install", `file://${repo}`, "--yes"]);
    const auto = readConfig(home).taps.find((t) => t.url === `file://${repo}`)!;
    expect(auto.registered).toBe(false);
    const before = configBytes(home);
    const r = run(home, ["tap", "add", "--dry-run", `file://${repo}`, "teamtap"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Would promote teamtap");
    expect(configBytes(home)).toBe(before);
    expect(readState(home).installations[0]!.source.tap).toBe(auto.name);
    expect(existsSync(tapPath("teamtap", home))).toBe(false);
  });

  test("--recursive on a registered tap would upgrade discovery, but doesn't", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo("crew-dry-add-upgrade-");
    run(home, ["tap", "add", `file://${repo}`, "mytap"]);
    const r = run(home, ["tap", "add", "--dry-run", "--recursive", "--json", `file://${repo}`]);
    expect(r.code).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.updated).toBe(true);
    expect(json.dry_run).toBe(true);
    expect(readConfig(home).taps.find((t) => t.name === "mytap")!.discovery).toBeUndefined();
  });

  test("path tap previews, and a missing directory is still a usage_error", () => {
    const home = makeCrewHome();
    const dir = makeTempDir("crew-dry-add-path-");
    makeSkill(dir, "beta", skillFrontmatter({ name: "beta" }));
    const ok = run(home, ["tap", "add", "--dry-run", dir, "local"]);
    expect(ok.code).toBe(0);
    expect(ok.stdout).toContain("Would add tap local");
    expect(readConfig(home).taps.some((t) => t.name === "local")).toBe(false);

    const missing = run(home, ["tap", "add", "--dry-run", join(dir, "nope"), "local"]);
    expect(missing.code).toBe(4);
    expect(missing.stderr).toContain("isn't a directory");
  });

  test("same name, different target is still a usage_error", () => {
    const home = makeCrewHome();
    const repoA = buildTapRepo("crew-dry-add-a-");
    const repoB = buildTapRepo("crew-dry-add-b-");
    run(home, ["tap", "add", `file://${repoA}`, "mytap"]);
    const r = run(home, ["tap", "add", "--dry-run", `file://${repoB}`, "mytap"]);
    expect(r.code).toBe(4);
    expect(r.stderr).toContain("already configured");
  });
});

describe("C-TAP-16b tap remove --dry-run", () => {
  test("git tap: reports, keeps the clone and the config row", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo("crew-dry-remove-");
    run(home, ["tap", "add", `file://${repo}`, "mytap"]);
    const before = configBytes(home);
    const r = run(home, ["tap", "remove", "--dry-run", "mytap"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Would remove tap mytap");
    expect(r.stdout).toContain("local clone would be deleted");
    expect(existsSync(join(tapPath("mytap", home), ".git"))).toBe(true);
    expect(configBytes(home)).toBe(before);
  });

  test("untap alias + JSON", () => {
    const home = makeCrewHome();
    const dir = makeTempDir("crew-dry-remove-path-");
    mkdirSync(dir, { recursive: true });
    run(home, ["tap", "add", dir, "local"]);
    const r = run(home, ["untap", "--dry-run", "--json", "local"]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ name: "local", dry_run: true });
    expect(readConfig(home).taps.some((t) => t.name === "local")).toBe(true);
  });

  test("path tap says the folder isn't touched", () => {
    const home = makeCrewHome();
    const dir = makeTempDir("crew-dry-remove-path2-");
    run(home, ["tap", "add", dir, "local"]);
    const r = run(home, ["tap", "remove", "--dry-run", "local"]);
    expect(r.stdout).toContain("wouldn't be touched");
  });

  test("default-tap guard and unknown-name error still fire", () => {
    const home = makeCrewHome();
    expect(run(home, ["tap", "remove", "--dry-run", "core"]).code).toBe(4);
    expect(readConfig(home).taps[0]!.name).toBe("core");
    const unknown = run(home, ["tap", "remove", "--dry-run", "nope"]);
    expect(unknown.code).toBe(4);
    expect(unknown.stderr).toContain("was not found");
  });
});

describe("C-TAP-16b tap update --dry-run", () => {
  test("lists pending git taps and skipped path taps without fetching", () => {
    const home = makeCrewHome();
    run(home, ["tap", "remove", "core", "--force"]);
    const repo = buildTapRepo("crew-dry-update-");
    run(home, ["tap", "add", `file://${repo}`, "remote"]);
    const dir = makeTempDir("crew-dry-update-path-");
    run(home, ["tap", "add", dir, "local"]);
    const clone = tapPath("remote", home);
    const headBefore = runGit(["rev-parse", "HEAD"], { cwd: clone }).stdout.trim();
    makeSkill(repo, "gamma", skillFrontmatter({ name: "gamma" }));
    commitAll(repo, "add gamma");

    const r = run(home, ["tap", "update", "--dry-run"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Would refresh 2 taps");
    expect(r.stdout).toContain("would fetch");
    expect(r.stdout).toContain("skipped");
    expect(r.stdout).toContain("1 would be fetched");
    expect(runGit(["rev-parse", "HEAD"], { cwd: clone }).stdout.trim()).toBe(headBefore);

    const j = run(home, ["tap", "update", "--dry-run", "--json", "remote"]);
    const json = JSON.parse(j.stdout);
    expect(json.dry_run).toBe(true);
    expect(json.rows).toEqual([{ name: "remote", url: `file://${repo}`, kind: "pending" }]);
    expect(runGit(["rev-parse", "HEAD"], { cwd: clone }).stdout.trim()).toBe(headBefore);
  });
});
