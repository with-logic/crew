/**
 * `crew tap add --dry-run` (§16.3, C-TAP-16b). Every case asserts the
 * preview ran the same *config-level* validation as the real command —
 * name shape, same-name collision, path-target existence — and that
 * nothing on disk changed: no clone created, config.yaml untouched, and
 * any installed-skill marker left byte-identical.
 *
 * A preview deliberately stops short of the clone, so it cannot detect
 * an unreachable or non-existent remote the way a real add does. That
 * is the one validation the two do not share.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { readConfig } from "../../../src/config/load.ts";
import { tapPath } from "../../../src/core/paths.ts";
import { readState } from "../../../src/state/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { buildTapRepo, configBytes, markerBytes, run } from "./helpers.ts";

const originals = {
  userPath: claudeCodeAdapter.userPath,
  detect: claudeCodeAdapter.detect,
};
let ccUser: string;

beforeEach(() => {
  ccUser = makeTempDir("crew-cc-user-");
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccUser;
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
});

afterEach(() => {
  (claudeCodeAdapter as { userPath: () => string }).userPath = originals.userPath;
  (claudeCodeAdapter as { detect: () => boolean }).detect = originals.detect;
});

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

  test("auto tap would be promoted; registered flag, state, and marker stay put", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo("crew-dry-add-promote-");
    run(home, ["install", `file://${repo}`, "--yes"]);
    const auto = readConfig(home).taps.find((t) => t.url === `file://${repo}`)!;
    expect(auto.registered).toBe(false);
    const before = configBytes(home);
    // Promotion rewrites markers on a real run, so the preview must not.
    const markerBefore = markerBytes(join(ccUser, "alpha"));

    const r = run(home, ["tap", "add", "--dry-run", `file://${repo}`, "teamtap"]);

    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Would promote teamtap");
    expect(configBytes(home)).toBe(before);
    expect(readState(home).installations[0]!.source.tap).toBe(auto.name);
    expect(existsSync(tapPath("teamtap", home))).toBe(false);
    expect(markerBytes(join(ccUser, "alpha"))).toBe(markerBefore);
  });

  test("--recursive on a registered tap would upgrade discovery, but doesn't", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo("crew-dry-add-upgrade-");
    run(home, ["tap", "add", `file://${repo}`, "mytap"]);
    run(home, ["install", "mytap/alpha"]);
    // A real `--recursive` upgrade rewrites every installed marker's
    // discovery mode, so the preview must leave the bytes identical.
    const markerBefore = markerBytes(join(ccUser, "alpha"));

    const r = run(home, ["tap", "add", "--dry-run", "--recursive", "--json", `file://${repo}`]);

    expect(r.code).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.updated).toBe(true);
    expect(json.dry_run).toBe(true);
    expect(readConfig(home).taps.find((t) => t.name === "mytap")!.discovery).toBeUndefined();
    expect(markerBytes(join(ccUser, "alpha"))).toBe(markerBefore);
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
