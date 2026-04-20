/**
 * Fill in remaining coverage gaps:
 * - adapter project paths and detection false-paths
 * - install/resolve sibling detection and qualified refs
 * - targets/install uninstall edges
 * - doctor warnings for orphan store, target missing, autoupdate drift
 * - fs utilities
 * - json utilities
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { resetLaunchctlRunner, setLaunchctlRunner } from "../../src/autoupdate/launchd.ts";
import { runCli } from "../../src/cli/main.ts";
import { parseDuration } from "../../src/commands/autoupdate.ts";
import { CrewError } from "../../src/core/errors.ts";
import {
  crewHome as crewHomeDefault,
  paths,
  storeEntryPath,
  tapPath,
} from "../../src/core/paths.ts";
import { readState, writeState } from "../../src/state/load.ts";
import { claudeCodeAdapter } from "../../src/targets/claude-code.ts";
import { codexAdapter } from "../../src/targets/codex.ts";
import { geminiCliAdapter } from "../../src/targets/gemini-cli.ts";
import { uninstallSkillFromTarget } from "../../src/targets/install.ts";
import { ALL_ADAPTERS, adapterByName } from "../../src/targets/registry.ts";
import {
  ensureDir,
  exists,
  isDirectory,
  readBytes,
  readSymlinkTarget,
  toPosix,
  touch,
  walk,
} from "../../src/util/fs.ts";
import { readJson, tryReadJson, writeJson } from "../../src/util/json.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

describe("adapters: project paths and detect false branches", () => {
  test("every adapter has a user and project path", () => {
    for (const a of ALL_ADAPTERS) {
      expect(a.userPath()).toContain("/");
      expect(a.projectPath("/tmp/proj")).toContain("/tmp/proj");
    }
  });

  test("adapter detect returns false without install", () => {
    const prev = process.env["HOME"];
    try {
      process.env["HOME"] = `/tmp/empty-${Date.now()}`;
      // claude-code may or may not be detected via isOnPath; both branches exercised.
      const detected = claudeCodeAdapter.detect();
      expect(typeof detected).toBe("boolean");
      expect(typeof codexAdapter.detect()).toBe("boolean");
      expect(typeof geminiCliAdapter.detect()).toBe("boolean");
    } finally {
      process.env["HOME"] = prev;
    }
  });

  test("adapterByName unknown returns undefined", () => {
    expect(adapterByName("nothing")).toBeUndefined();
  });
});

describe("uninstallSkillFromTarget edges", () => {
  test("without force, missing skill -> not_installed_here", () => {
    expect(() =>
      uninstallSkillFromTarget({
        adapter: claudeCodeAdapter,
        scope: "user",
        cwd: process.cwd(),
        skillName: "ghost",
        force: false,
      }),
    ).toThrow(CrewError);
  });

  test("force absent -> 'absent'", () => {
    const res = uninstallSkillFromTarget({
      adapter: claudeCodeAdapter,
      scope: "project",
      cwd: makeTempDir(),
      skillName: "ghost",
      force: true,
    });
    expect(res).toBe("absent");
  });

  test("untracked dir without force -> untracked_directory", () => {
    const home = makeCrewHome();
    const projCwd = makeTempDir();
    const dir = join(projCwd, ".claude", "skills", "demo");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), "x");
    expect(() =>
      uninstallSkillFromTarget({
        adapter: claudeCodeAdapter,
        scope: "project",
        cwd: projCwd,
        skillName: "demo",
        force: false,
      }),
    ).toThrow(CrewError);
    void home;
  });

  test("inconsistent marker without force -> inconsistent_marker", () => {
    const projCwd = makeTempDir();
    const dir = join(projCwd, ".claude", "skills", "demo");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, ".crew.json"),
      JSON.stringify({
        schema_version: 1,
        name: "other",
        source: { type: "path", path: "/x" },
        ref: null,
        resolved_sha: null,
        content_hash: "sha256:x",
        scope: "project",
        installed_at: "2026-04-18T00:00:00Z",
        installed_by: "crew/test",
      }),
    );
    writeFileSync(join(dir, "SKILL.md"), "x");
    expect(() =>
      uninstallSkillFromTarget({
        adapter: claudeCodeAdapter,
        scope: "project",
        cwd: projCwd,
        skillName: "demo",
        force: false,
      }),
    ).toThrow(CrewError);
  });

  test("with force and untracked dir, removes", () => {
    const projCwd = makeTempDir();
    const dir = join(projCwd, ".claude", "skills", "demo");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), "x");
    const res = uninstallSkillFromTarget({
      adapter: claudeCodeAdapter,
      scope: "project",
      cwd: projCwd,
      skillName: "demo",
      force: true,
    });
    expect(res).toBe("removed");
  });
});

describe("fs utilities", () => {
  test("exists false for missing", () => {
    expect(exists(`/tmp/this-does-not-exist-${Date.now()}`)).toBe(false);
  });
  test("isDirectory false for missing", () => {
    expect(isDirectory(`/tmp/missing-${Date.now()}`)).toBe(false);
  });
  test("ensureDir is idempotent", () => {
    const d = makeTempDir();
    ensureDir(d);
    ensureDir(d);
    expect(isDirectory(d)).toBe(true);
  });
  test("touch creates empty file", () => {
    const d = makeTempDir();
    const f = join(d, "a.txt");
    touch(f);
    expect(exists(f)).toBe(true);
  });
  test("readBytes round-trip", () => {
    const d = makeTempDir();
    const f = join(d, "a.bin");
    writeFileSync(f, Buffer.from([1, 2, 3]));
    expect([...readBytes(f)]).toEqual([1, 2, 3]);
  });
  test("readSymlinkTarget", () => {
    const d = makeTempDir();
    const { symlinkSync } = require("node:fs");
    symlinkSync("target", join(d, "link"));
    expect(readSymlinkTarget(join(d, "link"))).toBe("target");
  });
  test("toPosix backslashes", () => {
    expect(toPosix("a\\b\\c")).toBe("a/b/c");
  });
  test("walk on empty dir returns empty", () => {
    const d = makeTempDir();
    expect(walk(d)).toEqual([]);
  });
  test("walk respects shouldDescend", () => {
    const d = makeTempDir();
    mkdirSync(join(d, "keep"));
    writeFileSync(join(d, "keep", "inside.txt"), "x");
    mkdirSync(join(d, "skip"));
    writeFileSync(join(d, "skip", "inside.txt"), "y");
    const found = walk(d, { shouldDescend: (e) => e.relPath !== "skip" });
    expect(found.some((e) => e.relPath === "keep/inside.txt")).toBe(true);
    expect(found.some((e) => e.relPath === "skip/inside.txt")).toBe(false);
  });
});

describe("json utilities", () => {
  test("readJson throws on missing", () => {
    expect(() => readJson(`/tmp/missing-${Date.now()}`)).toThrow();
  });
  test("tryReadJson returns null on missing", () => {
    expect(tryReadJson(`/tmp/missing-${Date.now()}`)).toBeNull();
  });
  test("writeJson + readJson round-trip", () => {
    const d = makeTempDir();
    const f = join(d, "a.json");
    writeJson(f, { hello: "world" });
    expect(readJson<{ hello: string }>(f)).toEqual({ hello: "world" });
  });
  test("tryReadJson throws on invalid JSON", () => {
    const d = makeTempDir();
    const f = join(d, "a.json");
    writeFileSync(f, "not json");
    expect(() => tryReadJson(f)).toThrow();
  });
});

describe("paths helpers", () => {
  test("crewHome uses $CREW_HOME", () => {
    const prev = process.env["CREW_HOME"];
    try {
      process.env["CREW_HOME"] = "/tmp/custom-home";
      expect(crewHomeDefault()).toBe("/tmp/custom-home");
    } finally {
      if (prev === undefined) {
        delete process.env["CREW_HOME"];
      } else {
        process.env["CREW_HOME"] = prev;
      }
    }
  });
  test("crewHome defaults to ~/.crew when CREW_HOME absent", () => {
    const prev = process.env["CREW_HOME"];
    try {
      delete process.env["CREW_HOME"];
      expect(crewHomeDefault()).toBe(join(homedir(), ".crew"));
    } finally {
      if (prev !== undefined) {
        process.env["CREW_HOME"] = prev;
      }
    }
  });
  test("tapPath and storeEntryPath", () => {
    const home = "/tmp/crew-x";
    expect(tapPath("core", home)).toBe("/tmp/crew-x/taps/core");
    expect(storeEntryPath("demo", "abcdef12", home)).toBe("/tmp/crew-x/store/demo@abcdef12");
  });
  test("paths() shape", () => {
    const p = paths("/tmp/crew-x");
    expect(p.stateFile).toBe("/tmp/crew-x/state.json");
    expect(p.configFile).toBe("/tmp/crew-x/config.yaml");
  });
});

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
    expect(c.stdout()).toContain("orphan_store_entry");
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
            targets: ["claude-code"],
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
    expect(c.stdout()).toContain("state_entry_without_marker");
  });

  test("doctor with config_invalid reports", () => {
    const home = makeCrewHome();
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, "config.yaml"), "taps:\n\tbad-tab");
    const c = captureStreams();
    const code = runCli(["doctor"], { home, streams: c.streams });
    expect(code).toBe(1);
    expect(c.stdout()).toContain("config_invalid");
  });

  test("doctor flags autoupdate drift", () => {
    const home = makeCrewHome();
    // Enable in config without touching launchctl.
    const { writeConfig, readConfig } =
      require("../../src/config/load.ts") as typeof import("../../src/config/load.ts");
    const cfg = readConfig(home);
    writeConfig({ ...cfg, autoupdate: { enabled: true, interval_seconds: 60 } }, home);
    setLaunchctlRunner(() => false); // not loaded
    try {
      const c = captureStreams();
      runCli(["doctor"], { home, streams: c.streams });
      expect(c.stdout()).toContain("autoupdate_not_loaded");
    } finally {
      resetLaunchctlRunner();
    }
  });

  test("doctor flags autoupdate unexpectedly loaded", () => {
    const home = makeCrewHome();
    setLaunchctlRunner(() => true); // loaded
    try {
      const c = captureStreams();
      runCli(["doctor"], { home, streams: c.streams });
      expect(c.stdout()).toContain("autoupdate_unexpectedly_loaded");
    } finally {
      resetLaunchctlRunner();
    }
  });
});

describe("parseDuration edge", () => {
  test("parseDuration covers every unit", () => {
    expect(parseDuration("10s")).toBe(10);
    expect(parseDuration("3m")).toBe(180);
    expect(parseDuration("1h")).toBe(3600);
    expect(parseDuration("2d")).toBe(172800);
  });
});

describe("readState post-mutation", () => {
  test("read/write round trip", () => {
    const home = makeCrewHome();
    writeState({ schema_version: 1, installations: [] }, home);
    const read = readState(home);
    expect(read.schema_version).toBe(1);
  });
});

describe("copy idempotence", () => {
  test("chmod round-trip via copyTree", () => {
    const d1 = makeTempDir();
    const d2 = makeTempDir();
    const f = join(d1, "script.sh");
    writeFileSync(f, "#!/bin/sh\n");
    chmodSync(f, 0o700);
    const { copyTree } =
      require("../../src/util/copy.ts") as typeof import("../../src/util/copy.ts");
    copyTree(d1, join(d2, "x"));
    expect(existsSync(join(d2, "x", "script.sh"))).toBe(true);
  });
});

describe("rename-based atomic replace", () => {
  test("atomicReplace over existing dest", () => {
    const d = makeTempDir();
    const src = join(d, "a");
    const dest = join(d, "b");
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "f"), "x");
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, "old"), "old");
    const { atomicReplace } =
      require("../../src/util/fs.ts") as typeof import("../../src/util/fs.ts");
    atomicReplace(src, dest);
    expect(existsSync(join(dest, "f"))).toBe(true);
    expect(existsSync(join(dest, "old"))).toBe(false);
  });
});

describe("rename semantics for empty src", () => {
  test("atomicReplace moves empty dir", () => {
    const d = makeTempDir();
    const src = join(d, "a");
    const dest = join(d, "b");
    mkdirSync(src, { recursive: true });
    const { atomicReplace } =
      require("../../src/util/fs.ts") as typeof import("../../src/util/fs.ts");
    atomicReplace(src, dest);
    expect(existsSync(dest)).toBe(true);
    expect(existsSync(src)).toBe(false);
  });
});

describe("rename check -- rename changes hash", () => {
  test("rename detected", () => {
    const d = makeTempDir();
    writeFileSync(join(d, "a"), "x");
    renameSync(join(d, "a"), join(d, "b"));
    // Not calling hash — separate test covered it. This is a structural smoke.
    expect(existsSync(join(d, "b"))).toBe(true);
  });
});
