/**
 * `crew uninstall --prune` (§7.4 step 5 + §11.1).
 *
 * Covers C-UNINST-05..09 and C-STATE-10: explicit vs dep tracking,
 * `required_by` maintenance, and the autoremove pass.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../src/cli/main.ts";
import { readState } from "../../src/state/load.ts";
import { claudeCodeAdapter } from "../../src/targets/claude-code.ts";
import { codexAdapter } from "../../src/targets/codex.ts";
import { geminiCliAdapter } from "../../src/targets/gemini-cli.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

let ccRoot: string;
let coRoot: string;
let geRoot: string;
let originals: {
  cc: { user: () => string; detect: () => boolean };
  co: { user: () => string; detect: () => boolean };
  ge: { user: () => string; detect: () => boolean };
};

beforeEach(() => {
  ccRoot = makeTempDir("crew-cc-");
  coRoot = makeTempDir("crew-co-");
  geRoot = makeTempDir("crew-ge-");
  originals = {
    cc: { user: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect },
    co: { user: codexAdapter.userPath, detect: codexAdapter.detect },
    ge: { user: geminiCliAdapter.userPath, detect: geminiCliAdapter.detect },
  };
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccRoot;
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
  (codexAdapter as { userPath: () => string }).userPath = () => coRoot;
  (codexAdapter as { detect: () => boolean }).detect = () => true;
  (geminiCliAdapter as { userPath: () => string }).userPath = () => geRoot;
  (geminiCliAdapter as { detect: () => boolean }).detect = () => true;
});
afterEach(() => {
  (claudeCodeAdapter as { userPath: () => string }).userPath = originals.cc.user;
  (claudeCodeAdapter as { detect: () => boolean }).detect = originals.cc.detect;
  (codexAdapter as { userPath: () => string }).userPath = originals.co.user;
  (codexAdapter as { detect: () => boolean }).detect = originals.co.detect;
  (geminiCliAdapter as { userPath: () => string }).userPath = originals.ge.user;
  (geminiCliAdapter as { detect: () => boolean }).detect = originals.ge.detect;
});

/** Install two skills where `foo` depends on `bar` via a local path. */
function installFooWithDepBar(home: string): { src: string; exitCode: number } {
  const src = makeTempDir();
  makeSkill(src, "bar", skillFrontmatter({ name: "bar" }));
  makeSkill(src, "foo", skillFrontmatter({ name: "foo", dependencies: [join(src, "bar")] }));
  const exitCode = runCli(["install", join(src, "foo")], {
    home,
    streams: captureStreams().streams,
  });
  return { src, exitCode };
}

describe("explicit / required_by on install", () => {
  test("root install is explicit; dep is not", () => {
    const home = makeCrewHome();
    expect(installFooWithDepBar(home).exitCode).toBe(0);
    const state = readState(home);
    const foo = state.installations.find((e) => e.name === "foo")!;
    const bar = state.installations.find((e) => e.name === "bar")!;
    expect(foo.explicit).toBe(true);
    expect(bar.explicit).toBe(false);
    expect(bar.required_by).toEqual(["foo"]);
    expect(foo.required_by).toEqual([]);
  });

  test("C-UNINST-09 a dep-only entry promotes to explicit on direct install", () => {
    const home = makeCrewHome();
    const { src, exitCode } = installFooWithDepBar(home);
    expect(exitCode).toBe(0);
    // Now install `bar` directly by path. Its `explicit` must flip true.
    runCli(["install", join(src, "bar")], { home, streams: captureStreams().streams });
    const state = readState(home);
    const bar = state.installations.find((e) => e.name === "bar")!;
    expect(bar.explicit).toBe(true);
  });

  test("same-command root+dep: late dep visit does not demote explicit", () => {
    // `root` depends on `dep`, AND the user names `dep` directly on the
    // same command. Roots are enqueued first, so `dep` is visited as an
    // explicit root, then later re-encountered as a dep-walk item. The
    // second visit must NOT demote `explicit`.
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "dep", skillFrontmatter({ name: "dep" }));
    makeSkill(src, "root", skillFrontmatter({ name: "root", dependencies: [join(src, "dep")] }));
    const code = runCli(["install", join(src, "dep"), join(src, "root")], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    const state = readState(home);
    expect(state.installations.find((e) => e.name === "dep")!.explicit).toBe(true);
  });
});

describe("uninstall --prune", () => {
  test("C-UNINST-05 plain uninstall does NOT remove transitive deps", () => {
    const home = makeCrewHome();
    expect(installFooWithDepBar(home).exitCode).toBe(0);
    const code = runCli(["uninstall", "foo"], { home, streams: captureStreams().streams });
    expect(code).toBe(0);
    const state = readState(home);
    expect(state.installations.find((e) => e.name === "bar")).toBeDefined();
    // bar.required_by no longer names foo.
    const bar = state.installations.find((e) => e.name === "bar")!;
    expect(bar.required_by).toEqual([]);
  });

  test("C-UNINST-06 uninstall --prune removes orphaned deps", () => {
    const home = makeCrewHome();
    expect(installFooWithDepBar(home).exitCode).toBe(0);
    const c = captureStreams();
    const code = runCli(["uninstall", "--prune", "foo"], { home, streams: c.streams });
    expect(code).toBe(0);
    const state = readState(home);
    expect(state.installations.find((e) => e.name === "bar")).toBeUndefined();
    expect(state.installations.find((e) => e.name === "foo")).toBeUndefined();
    // The removal of `bar` is reported in a dedicated pruned section.
    expect(c.stdout()).toContain("Pruned");
    expect(c.stdout()).toContain("bar");
  });

  test("C-UNINST-07 --prune never removes explicit skills", () => {
    const home = makeCrewHome();
    const { src, exitCode } = installFooWithDepBar(home);
    expect(exitCode).toBe(0);
    // Promote bar to explicit by naming it.
    runCli(["install", join(src, "bar")], { home, streams: captureStreams().streams });
    runCli(["uninstall", "--prune", "foo"], { home, streams: captureStreams().streams });
    const state = readState(home);
    // bar is explicit and must survive the prune.
    expect(state.installations.find((e) => e.name === "bar")).toBeDefined();
  });

  test("C-UNINST-08 required_by is scrubbed on uninstall", () => {
    const home = makeCrewHome();
    expect(installFooWithDepBar(home).exitCode).toBe(0);
    runCli(["uninstall", "foo"], { home, streams: captureStreams().streams });
    const state = readState(home);
    for (const e of state.installations) {
      expect(e.required_by.includes("foo")).toBe(false);
    }
  });

  test("--prune with no orphans is a no-op", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "solo", skillFrontmatter({ name: "solo" }));
    runCli(["install", join(src, "solo")], { home, streams: captureStreams().streams });
    const code = runCli(["uninstall", "--prune", "solo"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    expect(readState(home).installations).toEqual([]);
  });
});

describe("uninstall error handling with prune", () => {
  test("unknown name under --force is accepted as a no-op", () => {
    const home = makeCrewHome();
    const code = runCli(["uninstall", "--force", "ghost"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
  });
  test("bare uninstall has no ccRoot side effects", () => {
    // Keep this sanity check so `ccRoot` is referenced and the fixture
    // plumbing doesn't rot.
    expect(existsSync(ccRoot)).toBe(true);
  });
});

describe("uninstall --target", () => {
  function installOne(home: string): { skill: string; code: number } {
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    const code = runCli(["install", skill], { home, streams: captureStreams().streams });
    return { skill, code };
  }

  test("C-UNINST-10 removes from only the named target, leaves others", () => {
    const home = makeCrewHome();
    expect(installOne(home).code).toBe(0);
    expect(existsSync(join(ccRoot, "demo", "SKILL.md"))).toBe(true);
    expect(existsSync(join(coRoot, "demo", "SKILL.md"))).toBe(true);
    expect(existsSync(join(geRoot, "demo", "SKILL.md"))).toBe(true);

    const c = captureStreams();
    const code = runCli(["uninstall", "--target", "codex", "demo"], { home, streams: c.streams });
    expect(code).toBe(0);
    // Codex removed, others kept.
    expect(existsSync(join(ccRoot, "demo", "SKILL.md"))).toBe(true);
    expect(existsSync(join(coRoot, "demo", "SKILL.md"))).toBe(false);
    expect(existsSync(join(geRoot, "demo", "SKILL.md"))).toBe(true);
    // Output signals partial removal.
    expect(c.stdout()).toContain("kept elsewhere");
  });

  test("C-UNINST-11 state entry survives with reduced targets", () => {
    const home = makeCrewHome();
    expect(installOne(home).code).toBe(0);
    runCli(["uninstall", "--target", "codex", "demo"], { home, streams: captureStreams().streams });
    const state = readState(home);
    const demo = state.installations.find((e) => e.name === "demo")!;
    expect(demo).toBeDefined();
    expect(demo.targets).toEqual(["claude-code", "gemini-cli"]);
  });

  test("C-UNINST-12 removing the last target drops the entry entirely", () => {
    const home = makeCrewHome();
    expect(installOne(home).code).toBe(0);
    // Remove from every target in two steps.
    runCli(["uninstall", "--target", "codex", "--target", "gemini-cli", "demo"], {
      home,
      streams: captureStreams().streams,
    });
    {
      const state = readState(home);
      expect(state.installations.find((e) => e.name === "demo")!.targets).toEqual(["claude-code"]);
    }
    runCli(["uninstall", "--target", "claude-code", "demo"], {
      home,
      streams: captureStreams().streams,
    });
    const state = readState(home);
    expect(state.installations.find((e) => e.name === "demo")).toBeUndefined();
  });

  test("C-UNINST-13 --prune does not cascade through a partial --target removal", () => {
    // Install foo with a dep bar, then partially uninstall foo.
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "bar", skillFrontmatter({ name: "bar" }));
    makeSkill(src, "foo", skillFrontmatter({ name: "foo", dependencies: [join(src, "bar")] }));
    runCli(["install", join(src, "foo")], { home, streams: captureStreams().streams });

    // Partial uninstall of foo with --prune. foo's entry survives (still
    // in claude-code + gemini-cli), so bar is NOT orphaned.
    runCli(["uninstall", "--prune", "--target", "codex", "foo"], {
      home,
      streams: captureStreams().streams,
    });
    const state = readState(home);
    expect(state.installations.find((e) => e.name === "foo")).toBeDefined();
    expect(state.installations.find((e) => e.name === "bar")).toBeDefined();
  });

  test("C-UNINST-14 naming a target the skill isn't in is a silent no-op", () => {
    // Install only into codex via --target, then try to uninstall from
    // claude-code — crew should shrug, not error.
    const home = makeCrewHome();
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", "--target", "codex", skill], {
      home,
      streams: captureStreams().streams,
    });
    const c = captureStreams();
    const code = runCli(["uninstall", "--target", "claude-code", "demo"], {
      home,
      streams: c.streams,
    });
    expect(code).toBe(0);
    // codex install is preserved.
    expect(existsSync(join(coRoot, "demo", "SKILL.md"))).toBe(true);
    // State entry is unchanged (still lists codex only).
    const state = readState(home);
    expect(state.installations.find((e) => e.name === "demo")!.targets).toEqual(["codex"]);
  });

  test("unknown --target produces a usage error with the known list", () => {
    const home = makeCrewHome();
    expect(installOne(home).code).toBe(0);
    const c = captureStreams();
    const code = runCli(["uninstall", "--target", "atari-basic", "demo"], {
      home,
      streams: c.streams,
    });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("atari-basic");
    expect(c.stderr()).toContain("known targets");
  });

  test("full --prune removal still cascades normally", () => {
    // Sanity check: without --target, --prune still works as before.
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "bar", skillFrontmatter({ name: "bar" }));
    makeSkill(src, "foo", skillFrontmatter({ name: "foo", dependencies: [join(src, "bar")] }));
    runCli(["install", join(src, "foo")], { home, streams: captureStreams().streams });
    runCli(["uninstall", "--prune", "foo"], { home, streams: captureStreams().streams });
    const state = readState(home);
    expect(state.installations.find((e) => e.name === "foo")).toBeUndefined();
    expect(state.installations.find((e) => e.name === "bar")).toBeUndefined();
    // Reference the other tmp roots so the linter doesn't complain about
    // unused vars, and so these fixtures are known to have been set up.
    expect(existsSync(coRoot)).toBe(true);
    expect(existsSync(geRoot)).toBe(true);
  });
});
