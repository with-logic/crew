/**
 * Coverage close-out for doctor warnings for orphan store entries, missing targets, and autoupdate drift.
 *
 * Branches the happy-path e2e suites do not reach; each test names the
 * file and line it keeps covered so a regression traces back here.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { resetLaunchctlRunner, setLaunchctlRunner } from "../../../src/autoupdate/launchd.ts";
import {
  resetAutoupdatePlatform,
  setAutoupdatePlatform,
} from "../../../src/autoupdate/scheduler.ts";
import { runCli } from "../../../src/cli/main.ts";
import { writeState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

describe("doctor warnings — orphan store", () => {
  let restore: (() => void) | null = null;
  beforeEach(() => {
    const ccRoot = makeTempDir("crew-cc-");
    const coRoot = makeTempDir("crew-co-");
    const geRoot = makeTempDir("crew-ge-");
    const originals = {
      cc: { u: claudeCodeAdapter.userPath, d: claudeCodeAdapter.detect },
      co: { u: codexAdapter.userPath, d: codexAdapter.detect },
      ge: { u: geminiCliAdapter.userPath, d: geminiCliAdapter.detect },
    };
    (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccRoot;
    (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
    (codexAdapter as { userPath: () => string }).userPath = () => coRoot;
    (codexAdapter as { detect: () => boolean }).detect = () => true;
    (geminiCliAdapter as { userPath: () => string }).userPath = () => geRoot;
    (geminiCliAdapter as { detect: () => boolean }).detect = () => true;
    restore = () => {
      (claudeCodeAdapter as { userPath: () => string }).userPath = originals.cc.u;
      (claudeCodeAdapter as { detect: () => boolean }).detect = originals.cc.d;
      (codexAdapter as { userPath: () => string }).userPath = originals.co.u;
      (codexAdapter as { detect: () => boolean }).detect = originals.co.d;
      (geminiCliAdapter as { userPath: () => string }).userPath = originals.ge.u;
      (geminiCliAdapter as { detect: () => boolean }).detect = originals.ge.d;
    };
  });
  afterEach(() => {
    if (restore) {
      restore();
    }
    restore = null;
  });

  test("doctor flags orphan store entries", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", join(src, "demo")], { home, streams: captureStreams().streams });
    // Inject an orphan entry.
    mkdirSync(join(home, "store", "ghost@12345678"), { recursive: true });
    writeFileSync(join(home, "store", "ghost@12345678", "file"), "x");
    const c = captureStreams();
    runCli(["doctor"], { home, streams: c.streams });
    expect(c.stdout()).toContain("cached skill is no longer referenced");
  });

  test("doctor clusters repeated findings and shows an `...and N more` line", () => {
    const home = makeCrewHome();
    // Inject five orphan store entries so the cluster exceeds the
    // renderer's show-first-three cap and surfaces the summary line.
    for (const n of ["a", "b", "c", "d", "e"]) {
      mkdirSync(join(home, "store", `orphan-${n}@deadbeef`), { recursive: true });
      writeFileSync(join(home, "store", `orphan-${n}@deadbeef`, "file"), "x");
    }
    const c = captureStreams();
    runCli(["doctor"], { home, streams: c.streams });
    expect(c.stdout()).toContain("(5)");
    expect(c.stdout()).toContain("...and 2 more");
  });

  test("doctor flags state without marker", () => {
    const home = makeCrewHome();
    // Insert a state entry pointing at a non-existent install.
    writeState(
      {
        schema_version: 1,
        installations: [
          {
            name: "ghost",
            source: { tap: "core", path: "ghost" },
            ref: null,
            resolved_sha: null,
            content_hash: "sha256:00",
            scope: "user",
            installed_at: "2026-04-18T00:00:00Z",
            agents: ["claude-code"],
            pinned: false,
            explicit: true,
            required_by: [],
          },
        ],
      },
      home,
    );
    const c = captureStreams();
    const code = runCli(["doctor"], { home, streams: c.streams });
    expect(code).toBe(1);
    expect(c.stdout()).toContain("isn't on disk");
  });

  test("doctor with config_invalid reports", () => {
    const home = makeCrewHome();
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, "config.yaml"), "taps:\n\tbad-tab");
    const c = captureStreams();
    const code = runCli(["doctor"], { home, streams: c.streams });
    expect(code).toBe(1);
    expect(c.stdout()).toContain("couldn't be parsed");
  });

  test("doctor flags autoupdate drift", () => {
    const home = makeCrewHome();
    // Enable in config without touching launchctl.
    const { writeConfig, readConfig } =
      require("../../../src/config/load.ts") as typeof import("../../../src/config/load.ts");
    const cfg = readConfig(home);
    writeConfig({ ...cfg, autoupdate: { enabled: true, interval_seconds: 60 } }, home);
    setAutoupdatePlatform("darwin");
    setLaunchctlRunner(() => false); // not loaded
    try {
      const c = captureStreams();
      runCli(["doctor"], { home, streams: c.streams });
      expect(c.stdout()).toContain("background updater isn't loaded");
    } finally {
      resetAutoupdatePlatform();
      resetLaunchctlRunner();
    }
  });

  test("doctor flags autoupdate unexpectedly loaded", () => {
    const home = makeCrewHome();
    setAutoupdatePlatform("darwin");
    setLaunchctlRunner(() => true); // loaded
    try {
      const c = captureStreams();
      runCli(["doctor"], { home, streams: c.streams });
      expect(c.stdout()).toContain("still loaded");
    } finally {
      resetAutoupdatePlatform();
      resetLaunchctlRunner();
    }
  });
});
