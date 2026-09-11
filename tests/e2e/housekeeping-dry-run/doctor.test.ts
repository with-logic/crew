/**
 * `crew doctor --repair --dry-run` (§11.2, C-STATE-12). The preview
 * must name only findings a repair can actually fix, and must leave
 * state, config, and the store byte-identical.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { resetLaunchctlRunner, setLaunchctlRunner } from "../../../src/autoupdate/launchd.ts";
import {
  resetAutoupdatePlatform,
  setAutoupdatePlatform,
} from "../../../src/autoupdate/scheduler.ts";
import { runCli } from "../../../src/cli/main.ts";
import { paths } from "../../../src/core/paths.ts";
import { readState, writeState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { readOrNull } from "./helpers.ts";

/** State, config, and the full store listing — the C-STATE-12 promise. */
function snapshot(home: string): Record<string, string | null> {
  const out: Record<string, string | null> = {
    state: readOrNull(paths(home).stateFile),
    config: readOrNull(paths(home).configFile),
  };
  const store = join(home, "store");
  if (existsSync(store)) {
    for (const entry of new Bun.Glob("**/*").scanSync({ cwd: store, onlyFiles: true })) {
      out[`store/${entry}`] = readFileSync(join(store, entry), "utf8");
    }
  }
  return out;
}

let restoreAdapter: (() => void) | null = null;

beforeEach(() => {
  // Doctor asks the platform scheduler whether autoupdate is loaded;
  // pin it to "not loaded" so the dev machine's real launchd state
  // can't leak an extra finding into these assertions.
  setAutoupdatePlatform("darwin");
  setLaunchctlRunner(() => false);
  const root = makeTempDir("crew-cc-");
  const original = { u: claudeCodeAdapter.userPath, d: claudeCodeAdapter.detect };
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => root;
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
  restoreAdapter = () => {
    (claudeCodeAdapter as { userPath: () => string }).userPath = original.u;
    (claudeCodeAdapter as { detect: () => boolean }).detect = original.d;
  };
});

afterEach(() => {
  resetAutoupdatePlatform();
  resetLaunchctlRunner();
  if (restoreAdapter) restoreAdapter();
  restoreAdapter = null;
});

describe("C-STATE-12 doctor --repair --dry-run", () => {
  test("lists what a repair would address and changes nothing", () => {
    const home = makeCrewHome();
    const orphan = join(home, "store", "ghost@00000000");
    mkdirSync(orphan, { recursive: true });
    writeFileSync(join(orphan, "f"), "abc");
    const c = captureStreams();
    const code = runCli(["doctor", "--repair", "--dry-run"], { home, streams: c.streams });
    // An orphan store entry is a warning, not an error, so exit 0 —
    // and nothing was repaired, so the orphan is still there.
    expect(code).toBe(0);
    expect(c.stdout()).toContain("would address 1 finding");
    expect(c.stdout()).toContain("Nothing was changed");
    expect(c.stdout()).not.toContain("Repaired what was fixable");
    expect(existsSync(join(orphan, "f"))).toBe(true);
    // The real repair removes it.
    runCli(["doctor", "--repair"], { home, streams: captureStreams().streams });
    expect(existsSync(orphan)).toBe(false);
  });

  test("state, config, and store are byte-identical after a dry run", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", join(src, "demo")], { home, streams: captureStreams().streams });
    // Drop the state entry so the marker on disk is orphaned: repair
    // would rebuild state AND reconstruct the tap from the marker.
    writeState({ schema_version: 1, installations: [] }, home);
    mkdirSync(join(home, "store", "ghost@00000000"), { recursive: true });
    writeFileSync(join(home, "store", "ghost@00000000", "f"), "abc");

    const before = snapshot(home);
    const c = captureStreams();
    runCli(["doctor", "--repair", "--dry-run"], { home, streams: c.streams });
    expect(c.stdout()).toContain("Nothing was changed");
    expect(snapshot(home)).toEqual(before);

    // The real repair rebuilds state from the marker, proving the dry
    // run had genuine work available to skip.
    runCli(["doctor", "--repair"], { home, streams: captureStreams().streams });
    expect(readState(home).installations.map((e) => e.name)).toEqual(["demo"]);
  });

  test("C-STATE-12a a non-repairable finding is excluded from the preview count", () => {
    const home = makeCrewHome();
    const project = makeTempDir("crew-proj-");
    // Point state at a project root that doesn't exist, with no marker
    // and no store entry, so `missing_project_root` is the ONLY finding
    // besides the marker drift the root's absence implies. §11.2 leaves
    // a vanished project to the user, so repair can never fix it.
    rmSync(project, { recursive: true, force: true });
    writeState(
      {
        schema_version: 1,
        installations: [
          {
            name: "demo",
            source: { tap: "core", path: "demo" },
            ref: null,
            resolved_sha: null,
            content_hash: "sha256:0",
            scope: "project",
            installed_at: "2026-01-01T00:00:00Z",
            agents: [],
            pinned: false,
            explicit: true,
            project_root: project,
            required_by: [],
          },
        ],
      },
      home,
    );

    const c = captureStreams();
    runCli(["doctor", "--repair", "--dry-run"], { home, streams: c.streams });
    expect(c.stdout()).toContain("a project folder is missing");
    expect(c.stdout()).toContain("would address 0 findings");
  });

  test("C-STATE-12a a real repair reports only what it addressed and leaves the rest", () => {
    const home = makeCrewHome();
    const project = makeTempDir("crew-proj-");
    rmSync(project, { recursive: true, force: true });
    writeState(
      {
        schema_version: 1,
        installations: [
          {
            name: "demo",
            source: { tap: "core", path: "demo" },
            ref: null,
            resolved_sha: null,
            content_hash: "sha256:0",
            scope: "project",
            installed_at: "2026-01-01T00:00:00Z",
            agents: [],
            pinned: false,
            explicit: true,
            project_root: project,
            required_by: [],
          },
        ],
      },
      home,
    );
    mkdirSync(join(home, "store", "ghost@00000000"), { recursive: true });
    writeFileSync(join(home, "store", "ghost@00000000", "f"), "abc");

    const c = captureStreams();
    const code = runCli(["doctor", "--repair"], { home, streams: c.streams });
    expect(code).toBe(0);
    // The orphan store entry is gone; the missing project root isn't,
    // and the summary says so instead of claiming both were addressed.
    expect(existsSync(join(home, "store", "ghost@00000000"))).toBe(false);
    expect(c.stdout()).toContain("1 finding addressed");
    expect(c.stdout()).toContain("1 finding left for you");
  });

  test("--json carries dry_run and the findings", () => {
    const home = makeCrewHome();
    mkdirSync(join(home, "store", "ghost@00000000"), { recursive: true });
    const c = captureStreams();
    runCli(["doctor", "--repair", "--dry-run", "--json"], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout());
    expect(parsed.dry_run).toBe(true);
    expect(parsed.findings.some((f: { code: string }) => f.code === "orphan_store_entry")).toBe(
      true,
    );
    expect(existsSync(join(home, "store", "ghost@00000000"))).toBe(true);
  });

  test("--dry-run without --repair is a plain check", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["doctor", "--dry-run", "--json"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(JSON.parse(c.stdout())).toEqual({ findings: [], dry_run: false });
  });
});
