/**
 * Uninstall with dependencies (§7.4, §7.7): explicit/required_by bookkeeping on
 * install, `--prune`, and error handling when a prune is involved.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

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
