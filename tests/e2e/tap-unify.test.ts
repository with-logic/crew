/**
 * Conformance tests for the tap/bundle unification (§16.4 and §16.5).
 *
 * Covers:
 *   - C-TAP-18: `crew install <tap-name>` installs every skill the tap
 *     exposes; state entries attribute to that tap with explicit=true.
 *   - C-TAP-19: the tap-vs-skill collision prompt — default, [n],
 *     --yes bypass, and non-TTY abort.
 *   - C-TAP-20: `crew install <git-url>` creates an auto tap (kind: git,
 *     registered: false) when no configured tap matches the URL.
 *   - C-TAP-21: path-kind tap — `crew tap add <local-path>` creates a
 *     path tap whose skills are installable by bare name, with no clone.
 *   - C-TAP-22: auto-tap is promoted to registered when the user runs
 *     `crew tap add <same-url>` (idempotent, no re-clone).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { codexAdapter } from "../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../src/agents/gemini-cli.ts";
import { runCli } from "../../src/cli/main.ts";
import type { PromptFn } from "../../src/cli/prompt.ts";
import { readConfig } from "../../src/config/load.ts";
import { tapPath } from "../../src/core/paths.ts";
import { readState } from "../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";

let originals: {
  cc: { user: () => string; detect: () => boolean };
  co: { user: () => string; detect: () => boolean };
  ge: { user: () => string; detect: () => boolean };
};

beforeEach(() => {
  const ccRoot = makeTempDir("crew-cc-");
  const coRoot = makeTempDir("crew-co-");
  const geRoot = makeTempDir("crew-ge-");
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

/** Always-"yes" prompt stub: matches the default behavior on enter. */
const alwaysYes: PromptFn = () => "yes";

/** Build a multi-skill git repo that will be added as a tap. */
function buildTapRepo(prefix: string, names: readonly string[]): string {
  const repo = makeTempDir(prefix);
  makeGitRepo(repo);
  for (const n of names) {
    makeSkill(repo, n, skillFrontmatter({ name: n, description: `${n} skill` }));
  }
  commitAll(repo, "initial");
  return repo;
}

describe("C-TAP-18 `crew install <tap-name>`", () => {
  test("installs every skill in the tap, attributing to <tap-name>", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repo = buildTapRepo("crew-tapinst-", ["alpha", "beta", "gamma"]);
    runCli(["tap", "add", `file://${repo}`, "teamtap"], {
      home,
      streams: captureStreams().streams,
    });
    const code = runCli(["install", "teamtap"], {
      home,
      streams: captureStreams().streams,
      prompt: alwaysYes,
    });
    expect(code).toBe(0);
    const state = readState(home);
    const byName = new Map(state.installations.map((e) => [e.name, e]));
    expect(byName.size).toBe(3);
    for (const name of ["alpha", "beta", "gamma"]) {
      const entry = byName.get(name)!;
      expect(entry.source.tap).toBe("teamtap");
      expect(entry.explicit).toBe(true);
    }
  });
});

describe("C-TAP-19 tap/skill collision prompt", () => {
  /** Build two taps so `colliding` is both a tap name AND a skill in the other tap. */
  function buildCollision(home: string): { tapRepo: string; otherRepo: string } {
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const tapRepo = buildTapRepo("crew-col-tap-", ["inner"]);
    // Other tap contains a skill literally named "colliding".
    const otherRepo = buildTapRepo("crew-col-other-", ["colliding"]);
    runCli(["tap", "add", `file://${tapRepo}`, "colliding"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "add", `file://${otherRepo}`, "helpers"], {
      home,
      streams: captureStreams().streams,
    });
    return { tapRepo, otherRepo };
  }

  test("prompt defaults to tap on enter (Y)", () => {
    const home = makeCrewHome();
    buildCollision(home);
    // prompt returns "yes" → install the tap.
    const code = runCli(["install", "colliding"], {
      home,
      streams: captureStreams().streams,
      prompt: () => "yes",
    });
    expect(code).toBe(0);
    const state = readState(home);
    // Should have installed the single "inner" skill from tap "colliding".
    const names = state.installations.map((e) => e.name).sort();
    expect(names).toEqual(["inner"]);
    expect(state.installations[0]!.source.tap).toBe("colliding");
  });

  test("prompt with [n] installs the qualified skill from the other tap", () => {
    const home = makeCrewHome();
    buildCollision(home);
    const code = runCli(["install", "colliding"], {
      home,
      streams: captureStreams().streams,
      prompt: () => "no",
    });
    expect(code).toBe(0);
    const state = readState(home);
    const names = state.installations.map((e) => e.name).sort();
    expect(names).toEqual(["colliding"]);
    expect(state.installations[0]!.source.tap).toBe("helpers");
  });

  test("--yes skips the prompt and installs the tap", () => {
    const home = makeCrewHome();
    buildCollision(home);
    let promptCalls = 0;
    const code = runCli(["install", "colliding", "--yes"], {
      home,
      streams: captureStreams().streams,
      prompt: () => {
        promptCalls++;
        return "yes";
      },
    });
    expect(code).toBe(0);
    expect(promptCalls).toBe(0);
    const state = readState(home);
    expect(state.installations.map((e) => e.name).sort()).toEqual(["inner"]);
  });

  test("non-TTY (prompt returns abort) is a usage_error", () => {
    const home = makeCrewHome();
    buildCollision(home);
    const c = captureStreams();
    const code = runCli(["install", "colliding"], {
      home,
      streams: c.streams,
      prompt: () => "abort",
    });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("--yes");
    expect(c.stderr()).toContain("helpers/colliding");
  });

  test("collision prompt triggers when the OTHER tap is a path tap", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    // `colliding` is a tap name.
    const tapRepo = buildTapRepo("crew-col-pt-", ["any"]);
    runCli(["tap", "add", `file://${tapRepo}`, "colliding"], {
      home,
      streams: captureStreams().streams,
    });
    // And `colliding` is a skill in a PATH tap.
    const pathRoot = makeTempDir("crew-col-pathtap-");
    makeSkill(pathRoot, "colliding", skillFrontmatter({ name: "colliding" }));
    runCli(["tap", "add", pathRoot, "helpers"], {
      home,
      streams: captureStreams().streams,
    });
    const code = runCli(["install", "colliding"], {
      home,
      streams: captureStreams().streams,
      prompt: () => "no",
    });
    expect(code).toBe(0);
    const state = readState(home);
    expect(state.installations[0]!.source.tap).toBe("helpers");
  });

  test("an unreachable tap is silently skipped during collision detection", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const tapRepo = buildTapRepo("crew-col-unreach-", ["widget"]);
    runCli(["tap", "add", `file://${tapRepo}`, "widget"], {
      home,
      streams: captureStreams().streams,
    });
    // Inject an unreachable tap directly into config — first use will
    // try to clone and fail. Collision detection should skip it.
    const { readConfig, writeConfig } =
      require("../../src/config/load.ts") as typeof import("../../src/config/load.ts");
    const cfg = readConfig(home);
    writeConfig(
      {
        ...cfg,
        taps: [
          ...cfg.taps,
          {
            name: "offline",
            kind: "git" as const,
            registered: true,
            url: "file:///crew-missing-collision-target",
            subpath: "",
            path: "",
          },
        ],
      },
      home,
    );
    // Only the `widget` tap exists + one skill `widget` in that tap;
    // the offline tap can't be read so no cross-tap collision fires.
    // Prompt should NOT be invoked; tap-only install proceeds.
    let promptCalls = 0;
    const code = runCli(["install", "widget"], {
      home,
      streams: captureStreams().streams,
      prompt: () => {
        promptCalls++;
        return "yes";
      },
    });
    expect(code).toBe(0);
    expect(promptCalls).toBe(0);
  });

  test("no prompt when the tap name isn't also a skill in some other tap", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repo = buildTapRepo("crew-no-col-", ["alpha", "beta"]);
    runCli(["tap", "add", `file://${repo}`, "solo"], {
      home,
      streams: captureStreams().streams,
    });
    let promptCalls = 0;
    const code = runCli(["install", "solo"], {
      home,
      streams: captureStreams().streams,
      prompt: () => {
        promptCalls++;
        return "yes";
      },
    });
    expect(code).toBe(0);
    expect(promptCalls).toBe(0);
  });
});

describe("C-TAP-19b tap/skill collision — numbered menu for 2+ other taps", () => {
  /**
   * Build three taps such that `colliding` is a tap name AND a skill
   * inside two other taps ("helpers-a" and "helpers-b"). Returns the
   * paths for assertions.
   */
  function buildMultiCollision(home: string): void {
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const tapRepo = buildTapRepo("crew-mcol-tap-", ["inner"]);
    const otherA = buildTapRepo("crew-mcol-a-", ["colliding"]);
    const otherB = buildTapRepo("crew-mcol-b-", ["colliding"]);
    runCli(["tap", "add", `file://${tapRepo}`, "colliding"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "add", `file://${otherA}`, "helpers-a"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "add", `file://${otherB}`, "helpers-b"], {
      home,
      streams: captureStreams().streams,
    });
  }

  test("default (choice 0) installs the tap", () => {
    const home = makeCrewHome();
    buildMultiCollision(home);
    const code = runCli(["install", "colliding"], {
      home,
      streams: captureStreams().streams,
      promptChoice: () => ({ kind: "choice", index: 0 }),
    });
    expect(code).toBe(0);
    const state = readState(home);
    expect(state.installations.map((e) => e.name).sort()).toEqual(["inner"]);
    expect(state.installations[0]!.source.tap).toBe("colliding");
  });

  test("choice 1 installs the skill from the first other tap", () => {
    const home = makeCrewHome();
    buildMultiCollision(home);
    const code = runCli(["install", "colliding"], {
      home,
      streams: captureStreams().streams,
      promptChoice: () => ({ kind: "choice", index: 1 }),
    });
    expect(code).toBe(0);
    const state = readState(home);
    expect(state.installations[0]!.source.tap).toBe("helpers-a");
  });

  test("choice 2 installs the skill from the second other tap", () => {
    const home = makeCrewHome();
    buildMultiCollision(home);
    const code = runCli(["install", "colliding"], {
      home,
      streams: captureStreams().streams,
      promptChoice: () => ({ kind: "choice", index: 2 }),
    });
    expect(code).toBe(0);
    const state = readState(home);
    expect(state.installations[0]!.source.tap).toBe("helpers-b");
  });

  test("prompt message lists the tap and every qualified alternative", () => {
    const home = makeCrewHome();
    buildMultiCollision(home);
    let seen = "";
    runCli(["install", "colliding"], {
      home,
      streams: captureStreams().streams,
      promptChoice: (message) => {
        seen = message;
        return { kind: "choice", index: 0 };
      },
    });
    expect(seen).toContain("2 other taps");
    expect(seen).toContain("[1] install tap `colliding`");
    expect(seen).toContain("[2] install skill `helpers-a/colliding`");
    expect(seen).toContain("[3] install skill `helpers-b/colliding`");
    expect(seen).toContain("Choice [1-3, default 1]:");
  });

  test("--yes skips the menu and installs the tap", () => {
    const home = makeCrewHome();
    buildMultiCollision(home);
    let calls = 0;
    const code = runCli(["install", "colliding", "--yes"], {
      home,
      streams: captureStreams().streams,
      promptChoice: () => {
        calls++;
        return { kind: "choice", index: 0 };
      },
    });
    expect(code).toBe(0);
    expect(calls).toBe(0);
    const state = readState(home);
    expect(state.installations[0]!.source.tap).toBe("colliding");
  });

  test("non-TTY (abort) is a usage_error listing every qualified candidate", () => {
    const home = makeCrewHome();
    buildMultiCollision(home);
    const c = captureStreams();
    const code = runCli(["install", "colliding"], {
      home,
      streams: c.streams,
      promptChoice: () => "abort",
    });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("--yes");
    expect(c.stderr()).toContain("helpers-a/colliding");
    expect(c.stderr()).toContain("helpers-b/colliding");
  });
});

describe("C-TAP-20 auto-tap creation on `crew install <git-url>`", () => {
  test("creates a kind:git, registered:false tap", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo("crew-auto-", ["widget"]);
    const code = runCli(["install", `file://${repo}`], {
      home,
      streams: captureStreams().streams,
      prompt: alwaysYes,
    });
    expect(code).toBe(0);
    const config = readConfig(home);
    // Find the auto tap — one whose url matches the repo.
    const auto = config.taps.find((t) => t.kind === "git" && t.url === `file://${repo}`);
    expect(auto).toBeDefined();
    expect(auto!.registered).toBe(false);
    const state = readState(home);
    expect(state.installations[0]!.source.tap).toBe(auto!.name);
  });

  test("auto-tap derivation preserves leading digits", () => {
    const { deriveAutoTapName } =
      require("../../src/install/tap-naming.ts") as typeof import("../../src/install/tap-naming.ts");
    expect(deriveAutoTapName("gh:foo/3d-skills", "")).toBe("3d-skills");
  });

  test("auto-tap suffix keeps incrementing past -2 when multiple names are taken", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo("crew-triple-", ["x"]);
    const { deriveAutoTapName } =
      require("../../src/install/tap-naming.ts") as typeof import("../../src/install/tap-naming.ts");
    const derived = deriveAutoTapName(`file://${repo}`, "");
    const altA = buildTapRepo("crew-triple-alt-a-", ["a"]);
    const altB = buildTapRepo("crew-triple-alt-b-", ["b"]);
    // Claim both `derived` and `<derived>-2` with unrelated repos.
    runCli(["tap", "add", `file://${altA}`, derived], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "add", `file://${altB}`, `${derived}-2`], {
      home,
      streams: captureStreams().streams,
    });
    const code = runCli(["install", `file://${repo}`], {
      home,
      streams: captureStreams().streams,
      prompt: alwaysYes,
    });
    expect(code).toBe(0);
    const tap = readConfig(home).taps.find((t) => t.kind === "git" && t.url === `file://${repo}`)!;
    expect(tap.name).toBe(`${derived}-3`);
  });

  test("auto-tap name is suffixed -2 when the derived name collides", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo("crew-auto-collide-", ["item"]);
    const { deriveAutoTapName } =
      require("../../src/install/tap-naming.ts") as typeof import("../../src/install/tap-naming.ts");
    // What name would auto-tap derivation pick? Claim it first under a
    // DIFFERENT (but cloneable) repo so auto creation must suffix.
    const derived = deriveAutoTapName(`file://${repo}`, "");
    const otherRepo = buildTapRepo("crew-auto-collide-alt-", ["other"]);
    runCli(["tap", "add", `file://${otherRepo}`, derived], {
      home,
      streams: captureStreams().streams,
    });
    // Now install the target URL — its derived name is taken by a tap
    // with a different URL, so auto-tap creation must suffix to -2.
    const code = runCli(["install", `file://${repo}`], {
      home,
      streams: captureStreams().streams,
      prompt: alwaysYes,
    });
    expect(code).toBe(0);
    const config = readConfig(home);
    const bTaps = config.taps.filter((t) => t.kind === "git" && t.url === `file://${repo}`);
    expect(bTaps).toHaveLength(1);
    expect(bTaps[0]!.registered).toBe(false);
    expect(bTaps[0]!.name).toBe(`${derived}-2`);
  });
});

describe("C-TAP-21 path-kind tap", () => {
  test("`crew tap add <local-path>` creates a path tap with no clone", () => {
    const home = makeCrewHome();
    const root = makeTempDir("crew-pathtap-");
    makeSkill(root, "hello", skillFrontmatter({ name: "hello", description: "a skill" }));
    const code = runCli(["tap", "add", root, "localtap"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    const config = readConfig(home);
    const tap = config.taps.find((t) => t.name === "localtap")!;
    expect(tap.kind).toBe("path");
    expect(tap.path).toBe(root);
    // No clone directory should exist under ~/.crew/taps.
    expect(existsSync(tapPath("localtap", home))).toBe(false);
  });

  test("`crew tap add <same-path>` against an existing path tap is idempotent", () => {
    const home = makeCrewHome();
    const root = makeTempDir("crew-pathtap-idem-");
    makeSkill(root, "x", skillFrontmatter({ name: "x" }));
    runCli(["tap", "add", root, "mytap"], { home, streams: captureStreams().streams });
    const before = readConfig(home);
    const code = runCli(["tap", "add", root, "mytap"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    const after = readConfig(home);
    expect(after.taps.filter((t) => t.path === root)).toHaveLength(1);
    expect(after.taps).toHaveLength(before.taps.length);
  });

  test("bare-name install resolves through a path tap", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const root = makeTempDir("crew-pathtap-inst-");
    makeSkill(root, "hello", skillFrontmatter({ name: "hello", description: "a skill" }));
    runCli(["tap", "add", root, "localtap"], { home, streams: captureStreams().streams });
    const code = runCli(["install", "hello"], {
      home,
      streams: captureStreams().streams,
      prompt: alwaysYes,
    });
    expect(code).toBe(0);
    const state = readState(home);
    expect(state.installations[0]!.source.tap).toBe("localtap");
  });
});

describe("C-TAP-22 auto→registered promotion", () => {
  test("`crew tap add <same-url>` against an auto tap flips registered:true", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo("crew-promote-", ["widget"]);
    // Create an auto tap by installing the URL.
    runCli(["install", `file://${repo}`], {
      home,
      streams: captureStreams().streams,
      prompt: alwaysYes,
    });
    const before = readConfig(home);
    const auto = before.taps.find((t) => t.kind === "git" && t.url === `file://${repo}`)!;
    expect(auto.registered).toBe(false);
    // Promote by re-adding with the SAME URL; give it a concrete name.
    const code = runCli(["tap", "add", `file://${repo}`, "teamtap"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    const after = readConfig(home);
    const tap = after.taps.find((t) => t.kind === "git" && t.url === `file://${repo}`)!;
    expect(tap.registered).toBe(true);
    expect(tap.name).toBe("teamtap");
    // The state entry's source.tap was rewritten to the new name.
    const state = readState(home);
    expect(state.installations[0]!.source.tap).toBe("teamtap");
  });

  test("promotion rewrites markers for project-scope installs too", () => {
    const home = makeCrewHome();
    const projectRoot = makeTempDir("crew-proj-");
    const repo = buildTapRepo("crew-promote-proj-", ["pwidget"]);
    // Auto-create a tap by installing at project scope.
    runCli(["install", `file://${repo}`, "--scope", "project"], {
      home,
      cwd: projectRoot,
      streams: captureStreams().streams,
      prompt: alwaysYes,
    });
    // Promote + rename.
    runCli(["tap", "add", `file://${repo}`, "projtap"], {
      home,
      cwd: projectRoot,
      streams: captureStreams().streams,
    });
    const state = readState(home);
    // Only project-scope entries here; source.tap is rewritten.
    expect(state.installations[0]!.scope).toBe("project");
    expect(state.installations[0]!.source.tap).toBe("projtap");
  });

  test("promotion leaves OTHER taps' state entries untouched", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    // Two separate taps; install one skill from each so state has
    // entries across both tap names.
    const repoA = buildTapRepo("crew-prom-a-", ["alpha"]);
    const repoB = buildTapRepo("crew-prom-b-", ["beta"]);
    runCli(["tap", "add", `file://${repoA}`, "stable"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["install", "alpha"], {
      home,
      streams: captureStreams().streams,
      prompt: alwaysYes,
    });
    // Install from repoB as an auto tap, then promote-rename it.
    runCli(["install", `file://${repoB}`], {
      home,
      streams: captureStreams().streams,
      prompt: alwaysYes,
    });
    const autoName = readConfig(home).taps.find(
      (t) => t.kind === "git" && t.url === `file://${repoB}`,
    )!.name;
    runCli(["tap", "add", `file://${repoB}`, "renamed"], {
      home,
      streams: captureStreams().streams,
    });
    const state = readState(home);
    const byName = new Map(state.installations.map((e) => [e.name, e]));
    // Alpha's source.tap is unaffected by B's rename.
    expect(byName.get("alpha")!.source.tap).toBe("stable");
    // Beta's source.tap was rewritten.
    expect(byName.get("beta")!.source.tap).toBe("renamed");
    expect(autoName).not.toBe("renamed"); // sanity: rename actually happened
  });
});
