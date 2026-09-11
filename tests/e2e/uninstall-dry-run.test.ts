/**
 * `crew uninstall --dry-run` (§7.4, C-UNINST-19).
 *
 * A dry run must run every selector and safety check but write
 * nothing: install directories, markers, `state.json`, and auto-tap
 * config all survive untouched.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { codexAdapter } from "../../src/agents/codex.ts";
import { runCli } from "../../src/cli/main.ts";
import { readConfig } from "../../src/config/load.ts";
import { readState } from "../../src/state/load.ts";
import { readJson } from "../../src/util/json.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { makeGitRepo, makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

let ccRoot: string;
let coRoot: string;
let originals: {
  cc: { user: () => string; detect: () => boolean };
  co: { user: () => string; detect: () => boolean };
};

beforeEach(() => {
  ccRoot = makeTempDir("crew-cc-");
  coRoot = makeTempDir("crew-co-");
  originals = {
    cc: { user: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect },
    co: { user: codexAdapter.userPath, detect: codexAdapter.detect },
  };
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccRoot;
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
  (codexAdapter as { userPath: () => string }).userPath = () => coRoot;
  (codexAdapter as { detect: () => boolean }).detect = () => true;
});
afterEach(() => {
  (claudeCodeAdapter as { userPath: () => string }).userPath = originals.cc.user;
  (claudeCodeAdapter as { detect: () => boolean }).detect = originals.cc.detect;
  (codexAdapter as { userPath: () => string }).userPath = originals.co.user;
  (codexAdapter as { detect: () => boolean }).detect = originals.co.detect;
});

/** Install `foo` (which depends on `bar`) from a local path source. */
function installFooWithDepBar(home: string): void {
  const src = makeTempDir();
  makeSkill(src, "bar", skillFrontmatter({ name: "bar" }));
  makeSkill(src, "foo", skillFrontmatter({ name: "foo", dependencies: [join(src, "bar")] }));
  runCli(["install", join(src, "foo")], { home, streams: captureStreams().streams });
}

describe("crew uninstall --dry-run", () => {
  test("C-UNINST-19 leaves install dirs, markers, and state untouched", () => {
    const home = makeCrewHome();
    installFooWithDepBar(home);
    const stateBefore = JSON.stringify(readState(home));
    const markerBefore = JSON.stringify(readJson(join(ccRoot, "foo", ".crew.json")));

    const out = captureStreams();
    const code = runCli(["uninstall", "--dry-run", "foo"], { home, streams: out.streams });

    expect(code).toBe(0);
    expect(out.stdout()).toContain("Uninstalling foo (dry run)");
    expect(out.stdout()).toContain("[ok] claude-code");
    expect(out.stdout()).toContain("[ok] codex");
    expect(out.stdout()).toContain("would remove from 2 agents");
    expect(existsSync(join(ccRoot, "foo", "SKILL.md"))).toBe(true);
    expect(existsSync(join(coRoot, "foo", "SKILL.md"))).toBe(true);
    expect(JSON.stringify(readJson(join(ccRoot, "foo", ".crew.json")))).toBe(markerBefore);
    expect(JSON.stringify(readState(home))).toBe(stateBefore);
  });

  test("C-UNINST-19 --prune --dry-run lists the orphan without removing it", () => {
    const home = makeCrewHome();
    installFooWithDepBar(home);

    const out = captureStreams();
    const code = runCli(["uninstall", "--dry-run", "--prune", "foo"], {
      home,
      streams: out.streams,
    });

    expect(code).toBe(0);
    expect(out.stdout()).toContain("Pruned 1 dependency (dry run)");
    expect(out.stdout()).toContain("would prune 1 dependency");
    expect(existsSync(join(ccRoot, "bar", "SKILL.md"))).toBe(true);
    expect(
      readState(home)
        .installations.map((e) => e.name)
        .sort(),
    ).toEqual(["bar", "foo"]);
  });

  test("C-UNINST-19 --json carries dry_run and a real run carries false", () => {
    const home = makeCrewHome();
    installFooWithDepBar(home);

    const dry = captureStreams();
    runCli(["uninstall", "--dry-run", "--json", "foo"], { home, streams: dry.streams });
    const dryPayload = JSON.parse(dry.stdout()) as { dry_run: boolean; records: unknown[] };
    expect(dryPayload.dry_run).toBe(true);
    expect(dryPayload.records).toHaveLength(1);
    expect(readState(home).installations.some((e) => e.name === "foo")).toBe(true);

    const real = captureStreams();
    runCli(["uninstall", "--json", "foo"], { home, streams: real.streams });
    expect((JSON.parse(real.stdout()) as { dry_run: boolean }).dry_run).toBe(false);
    expect(readState(home).installations.some((e) => e.name === "foo")).toBe(false);
  });

  test("C-UNINST-19 --agent --dry-run leaves the marker's agent list intact", () => {
    const home = makeCrewHome();
    // Point both adapters at one directory so they share a dest and the
    // partial removal takes the "detached" (marker rewrite) branch.
    (codexAdapter as { userPath: () => string }).userPath = () => ccRoot;
    installFooWithDepBar(home);
    const marker = readJson<{ agents: string[] }>(join(ccRoot, "foo", ".crew.json"));
    expect(marker.agents.sort()).toEqual(["claude-code", "codex"]);

    const out = captureStreams();
    const code = runCli(["uninstall", "--dry-run", "--agent", "codex", "foo"], {
      home,
      streams: out.streams,
    });

    expect(code).toBe(0);
    expect(out.stdout()).toContain("(kept elsewhere)");
    const after = readJson<{ agents: string[] }>(join(ccRoot, "foo", ".crew.json"));
    expect(after.agents.sort()).toEqual(["claude-code", "codex"]);
    const entry = readState(home).installations.find((e) => e.name === "foo");
    expect([...(entry?.agents ?? [])].sort()).toEqual(["claude-code", "codex"]);
  });

  test("C-UNINST-19 safety checks still abort, and --force --dry-run removes nothing", () => {
    const home = makeCrewHome();
    installFooWithDepBar(home);
    // Drop the marker so the dest looks untracked.
    rmSync(join(ccRoot, "foo", ".crew.json"));

    const abort = captureStreams();
    runCli(["uninstall", "--dry-run", "foo"], { home, streams: abort.streams });
    expect(abort.stdout()).toContain("something else owns that folder");
    expect(existsSync(join(ccRoot, "foo", "SKILL.md"))).toBe(true);

    // A wrong-name marker takes the inconsistent_marker branch.
    mkdirSync(join(ccRoot, "foo"), { recursive: true });
    writeFileSync(join(ccRoot, "foo", ".crew.json"), JSON.stringify({ name: "other" }));
    const forced = captureStreams();
    const code = runCli(["uninstall", "--dry-run", "--force", "foo"], {
      home,
      streams: forced.streams,
    });
    expect(code).toBe(0);
    expect(existsSync(join(ccRoot, "foo", "SKILL.md"))).toBe(true);
    expect(existsSync(join(coRoot, "foo", "SKILL.md"))).toBe(true);
    expect(readState(home).installations.some((e) => e.name === "foo")).toBe(true);
  });

  test("C-UNINST-19 a dry run never garbage-collects the backing auto tap", () => {
    const home = makeCrewHome();
    const repo = makeTempDir("crew-repo-");
    makeSkill(repo, "solo", skillFrontmatter({ name: "solo" }));
    makeGitRepo(repo);
    expect(runCli(["install", `file://${repo}`], { home, streams: captureStreams().streams })).toBe(
      0,
    );
    const tapsBefore = readConfig(home).taps.map((t) => t.name);
    expect(tapsBefore.length).toBeGreaterThan(1);

    const code = runCli(["uninstall", "--dry-run", "solo"], {
      home,
      streams: captureStreams().streams,
    });

    expect(code).toBe(0);
    expect(readConfig(home).taps.map((t) => t.name)).toEqual(tapsBefore);
  });
});
