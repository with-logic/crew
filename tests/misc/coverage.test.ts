/**
 * Additional tests for code paths not exercised elsewhere.
 * - cache clean
 * - help per-command
 * - error paths in CrewError / exit codes
 * - path utilities (isOnPath)
 * - copy util (symlinks)
 * - classifyRef
 * - cli dispatcher
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { codexAdapter } from "../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../src/agents/gemini-cli.ts";
import { isOnPath } from "../../src/agents/path.ts";
import { runCli } from "../../src/cli/main.ts";
import { CrewError, fail } from "../../src/core/errors.ts";
import { runGit } from "../../src/git/exec.ts";
import { classifyRef, initRepo } from "../../src/git/repo.ts";
import { copyTree } from "../../src/util/copy.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";

let restore: (() => void) | null = null;
let ccRoot: string;
function setupTargets() {
  const co = makeTempDir("crew-co-");
  const ge = makeTempDir("crew-ge-");
  ccRoot = makeTempDir("crew-cc-");
  const originals = {
    cc: { u: claudeCodeAdapter.userPath, d: claudeCodeAdapter.detect },
    co: { u: codexAdapter.userPath, d: codexAdapter.detect },
    ge: { u: geminiCliAdapter.userPath, d: geminiCliAdapter.detect },
  };
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccRoot;
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
  (codexAdapter as { userPath: () => string }).userPath = () => co;
  (codexAdapter as { detect: () => boolean }).detect = () => true;
  (geminiCliAdapter as { userPath: () => string }).userPath = () => ge;
  (geminiCliAdapter as { detect: () => boolean }).detect = () => true;
  restore = () => {
    (claudeCodeAdapter as { userPath: () => string }).userPath = originals.cc.u;
    (claudeCodeAdapter as { detect: () => boolean }).detect = originals.cc.d;
    (codexAdapter as { userPath: () => string }).userPath = originals.co.u;
    (codexAdapter as { detect: () => boolean }).detect = originals.co.d;
    (geminiCliAdapter as { userPath: () => string }).userPath = originals.ge.u;
    (geminiCliAdapter as { detect: () => boolean }).detect = originals.ge.d;
  };
}

beforeEach(() => setupTargets());
afterEach(() => {
  if (restore) {
    restore();
  }
  restore = null;
});

describe("cache clean", () => {
  test("empty cache succeeds", () => {
    const home = makeCrewHome();
    const code = runCli(["cache", "clean"], { home, streams: captureStreams().streams });
    expect(code).toBe(0);
  });

  test("cache clean removes unreferenced store entries and reports what it freed", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", join(src, "demo")], { home, streams: captureStreams().streams });
    // Manually create an orphan store entry with measurable content.
    mkdirSync(join(home, "store", "ghost@00000000"), { recursive: true });
    writeFileSync(join(home, "store", "ghost@00000000", "file.txt"), "x".repeat(4096));
    const c = captureStreams();
    const code = runCli(["cache", "clean"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(existsSync(join(home, "store", "ghost@00000000"))).toBe(false);
    // Output names what was cleaned.
    expect(c.stdout()).toContain("Cache cleaned");
    expect(c.stdout()).toContain("orphan");
  });

  test("cache clean on a fresh home says nothing to clean", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    runCli(["cache", "clean"], { home, streams: c.streams });
    expect(c.stdout()).toContain("Nothing to clean");
  });

  test("unknown cache subcommand is a usage error pointing at help", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["cache", "list"], { home, streams: c.streams });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("list");
    expect(c.stderr()).toContain("crew help cache");
  });

  test("bare `crew cache` shows the help page", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["cache"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("crew cache");
  });
});

describe("help command", () => {
  test("help <command> prints per-command lines", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["help", "install"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("crew install");
  });

  test("help <unknown> falls back to overview", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    runCli(["help", "frobnicate"], { home, streams: c.streams });
    expect(c.stdout()).toContain("crew ");
  });

  test("help --json on overview", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    runCli(["help", "--json"], { home, streams: c.streams });
    // Overview has no structured json field; should still emit valid JSON.
    expect(() => JSON.parse(c.stdout())).not.toThrow();
  });
});

describe("targets subcommands", () => {
  test("targets enable/disable cycle", () => {
    const home = makeCrewHome();
    runCli(["agents", "disable", "claude-code"], { home, streams: captureStreams().streams });
    runCli(["agents", "enable", "claude-code"], { home, streams: captureStreams().streams });
    const c = captureStreams();
    runCli(["agents", "--json"], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout());
    expect(parsed.agents.find((t: { name: string }) => t.name === "claude-code").forced).toBe(true);
  });

  test("unknown agent errors", () => {
    const home = makeCrewHome();
    const code = runCli(["agents", "enable", "no-such"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(4);
  });

  test("unknown agents subcommand is a usage error pointing at help", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["agents", "frob"], { home, streams: c.streams });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("frob");
    expect(c.stderr()).toContain("crew help agents");
  });
});

describe("CrewError", () => {
  test("fail throws with code", () => {
    expect(() => fail("invalid_ref", "bad")).toThrow(CrewError);
  });
  test("exitCode mapping", () => {
    const err = new CrewError("state_locked", "x");
    expect(err.exitCode).toBe(7);
  });
});

describe("isOnPath", () => {
  test("bun is on PATH", () => {
    expect(isOnPath("bun")).toBe(true);
  });
  test("nonexistent is not", () => {
    expect(isOnPath("this-binary-does-not-exist-xyz")).toBe(false);
  });
  test("empty PATH returns false", () => {
    const prev = process.env["PATH"];
    process.env["PATH"] = "";
    try {
      expect(isOnPath("bun")).toBe(false);
    } finally {
      process.env["PATH"] = prev;
    }
  });
});

describe("copyTree", () => {
  test("preserves symlinks", () => {
    const src = makeTempDir();
    const dest = makeTempDir();
    writeFileSync(join(src, "real.txt"), "hi");
    symlinkSync("real.txt", join(src, "link"));
    copyTree(src, join(dest, "sub"));
    const { lstatSync } = require("node:fs");
    const st = lstatSync(join(dest, "sub", "link"));
    expect(st.isSymbolicLink()).toBe(true);
  });

  test("strips root .crew.json", () => {
    const src = makeTempDir();
    const dest = makeTempDir();
    writeFileSync(join(src, ".crew.json"), "{}");
    writeFileSync(join(src, "other.txt"), "x");
    copyTree(src, join(dest, "sub"));
    expect(existsSync(join(dest, "sub", ".crew.json"))).toBe(false);
    expect(existsSync(join(dest, "sub", "other.txt"))).toBe(true);
  });

  test("copies nested dirs", () => {
    const src = makeTempDir();
    const dest = makeTempDir();
    mkdirSync(join(src, "a", "b"), { recursive: true });
    writeFileSync(join(src, "a", "b", "c.txt"), "nested");
    copyTree(src, dest);
    expect(existsSync(join(dest, "a", "b", "c.txt"))).toBe(true);
  });

  test("chmod bits not preserved but copy succeeds", () => {
    const src = makeTempDir();
    const dest = makeTempDir();
    const f = join(src, "script.sh");
    writeFileSync(f, "#!/bin/sh\n");
    chmodSync(f, 0o755);
    copyTree(src, dest);
    expect(existsSync(join(dest, "script.sh"))).toBe(true);
  });
});

describe("git classifyRef", () => {
  test("40-char hex is sha", () => {
    const repo = makeTempDir();
    initRepo(repo);
    writeFileSync(join(repo, "README.md"), "hello");
    runGit(["add", "."], { cwd: repo });
    runGit(["commit", "--quiet", "-m", "init", "--allow-empty"], { cwd: repo });
    const sha = runGit(["rev-parse", "HEAD"], { cwd: repo }).stdout.trim();
    expect(classifyRef(repo, sha)).toBe("sha");
  });

  test("tag is tag", () => {
    const repo = makeTempDir();
    makeGitRepo(repo);
    commitAll(repo, "init");
    runGit(["-c", "tag.gpgSign=false", "-c", "tag.forceSignAnnotated=false", "tag", "v1"], {
      cwd: repo,
    });
    expect(classifyRef(repo, "v1")).toBe("tag");
  });

  test("branch is branch", () => {
    const repo = makeTempDir();
    makeGitRepo(repo);
    commitAll(repo, "init");
    expect(classifyRef(repo, "main")).toBe("branch");
  });

  test("null is branch", () => {
    const repo = makeTempDir();
    makeGitRepo(repo);
    commitAll(repo, "init");
    expect(classifyRef(repo, null)).toBe("branch");
  });

  test("nonexistent is unknown", () => {
    const repo = makeTempDir();
    makeGitRepo(repo);
    commitAll(repo, "init");
    expect(classifyRef(repo, "no-such-ref")).toBe("unknown");
  });
});

describe("list --json + install --json", () => {
  test("list --json empty", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    runCli(["list", "--json"], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout());
    expect(parsed.installations).toEqual([]);
  });

  test("install --json", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    const c = captureStreams();
    runCli(["install", "--json", join(src, "demo")], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout());
    expect(parsed.records[0].name).toBe("demo");
  });
});

describe("install edge: zero refs", () => {
  test("install with no args errors", () => {
    const home = makeCrewHome();
    const code = runCli(["install"], { home, streams: captureStreams().streams });
    expect(code).toBe(4);
  });
});

describe("uninstall edge: multiple scopes", () => {
  test("uninstall removes all scopes", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    const projCwd = makeTempDir("crew-proj-");
    runCli(["install", skill], { home, streams: captureStreams().streams });
    runCli(["install", "--scope", "project", skill], {
      home,
      cwd: projCwd,
      streams: captureStreams().streams,
    });
    const code = runCli(["uninstall", "demo"], {
      home,
      cwd: projCwd,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
  });
});

describe("flags parser", () => {
  test("--flag=value form", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    const code = runCli(["install", "--scope=user", skill], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
  });

  test("--scope invalid value", () => {
    const home = makeCrewHome();
    const code = runCli(["install", "--scope", "other", "foo"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(4);
  });

  test("-- terminator", () => {
    const home = makeCrewHome();
    const code = runCli(["install", "--", "--weird-name"], {
      home,
      streams: captureStreams().streams,
    });
    // This parses as a single ref that can't be found; exit 4 (invalid_ref) or 1.
    expect([1, 4, 5]).toContain(code);
  });

  test("--flag requiring value but missing", () => {
    const home = makeCrewHome();
    const code = runCli(["install", "--agent"], { home, streams: captureStreams().streams });
    expect(code).toBe(4);
  });

  test("boolean flag with = fails", () => {
    const home = makeCrewHome();
    const code = runCli(["install", "--dry-run=true"], { home, streams: captureStreams().streams });
    expect(code).toBe(4);
  });

  test("short flag rejected", () => {
    const home = makeCrewHome();
    const code = runCli(["install", "-q", "foo"], { home, streams: captureStreams().streams });
    expect(code).toBe(4);
  });

  test("--target multiple", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    const code = runCli(["install", "--agent", "claude-code", "--agent", "codex", skill], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
  });
});

describe("install dependency: qualified refs", () => {
  test("qualified dependency (git URL) resolves", () => {
    const home = makeCrewHome();
    // Build a local git repo that hosts a dep skill.
    const depRepo = makeTempDir();
    makeGitRepo(depRepo);
    makeSkill(depRepo, "dep", skillFrontmatter({ name: "dep" }));
    commitAll(depRepo, "init");

    const parentDir = makeTempDir();
    makeSkill(
      parentDir,
      "root",
      skillFrontmatter({
        name: "root",
        dependencies: [`file://${depRepo}//dep`],
      }),
    );
    const code = runCli(["install", join(parentDir, "root")], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    expect(existsSync(join(ccRoot, "dep"))).toBe(true);
  });
});

describe("error output non-json mode", () => {
  test("CrewError writes to stderr", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    runCli(["uninstall", "ghost"], { home, streams: c.streams });
    // Error message names the skill and points the user toward a remedy.
    expect(c.stderr()).toContain("ghost");
    expect(c.stderr()).toContain("crew list");
  });

  test("error renderer appends a remedy hint line for known codes", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    // `crew install` with no args → `usage_error`, which has a remedy hint.
    runCli(["install"], { home, streams: c.streams });
    expect(c.stderr()).toContain("error:");
    // The `→` prefix is how remedy hints are rendered.
    expect(c.stderr()).toContain("→");
    expect(c.stderr()).toContain("crew help");
  });

  test("tap add with no URL surfaces a friendly usage hint", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["tap", "add"], { home, streams: c.streams });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("crew tap add");
  });

  test("tap remove with no name surfaces a friendly usage hint", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["tap", "remove"], { home, streams: c.streams });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("crew tap remove");
  });

  test("targets enable/disable with no name surfaces a friendly usage hint", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["agents", "enable"], { home, streams: c.streams });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("crew agents enable");
  });
});
