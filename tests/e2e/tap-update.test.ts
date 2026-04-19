/**
 * Tests for `crew tap update` and the fetch-policy rule (§16.4).
 *
 * The rule: read-only commands (`search`, bare-name `install`, `info`,
 * `list`) never run `git fetch`. Only `crew update`, `crew tap update`,
 * `crew tap add`, and `crew install <git-url>` fetch. Enforcing this
 * is what makes `crew search` fast.
 *
 * Strategy: clone a tap with one commit. Add more commits upstream.
 * Run a read-only command. Assert the local clone's HEAD did NOT move
 * (proving no fetch happened). Then run `crew tap update` and assert
 * HEAD moved to the new upstream tip.
 */

import { describe, expect, test } from "bun:test";
import { runCli } from "../../src/cli/main.ts";
import { readConfig } from "../../src/config/load.ts";
import { tapPath } from "../../src/core/paths.ts";
import { runGit } from "../../src/git/exec.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";

/** Read the current detached HEAD SHA of a clone. */
function headSha(clonePath: string): string {
  return runGit(["rev-parse", "HEAD"], { cwd: clonePath }).stdout.trim();
}

describe("tap update + fetch policy", () => {
  function buildTap(prefix: string, skills: readonly { name: string; desc: string }[]): string {
    const repo = makeTempDir(prefix);
    makeGitRepo(repo);
    for (const s of skills) {
      makeSkill(repo, s.name, skillFrontmatter({ name: s.name, description: s.desc }));
    }
    commitAll(repo, "init");
    return repo;
  }

  test("C-TAP-17 search does NOT fetch; HEAD stays put even after upstream moves", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repo = buildTap("crew-nofetch-", [{ name: "alpha", desc: "first" }]);
    runCli(["tap", "add", `file://${repo}`, "local"], {
      home,
      streams: captureStreams().streams,
    });
    const shaBefore = headSha(tapPath("local", home));

    // Upstream adds a new skill + commit.
    makeSkill(repo, "beta", skillFrontmatter({ name: "beta", description: "added after add" }));
    commitAll(repo, "add beta");

    // Run search. This MUST NOT fetch; HEAD should not move.
    runCli(["search", "alpha"], { home, streams: captureStreams().streams });
    expect(headSha(tapPath("local", home))).toBe(shaBefore);

    // Same invariant for bare-name install.
    runCli(["install", "alpha"], { home, streams: captureStreams().streams });
    expect(headSha(tapPath("local", home))).toBe(shaBefore);
  });

  test("C-TAP-16 `crew tap update` fetches and fast-forwards every configured tap", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repoA = buildTap("crew-tapupd-a-", [{ name: "alpha", desc: "a test skill" }]);
    const repoB = buildTap("crew-tapupd-b-", [{ name: "beta", desc: "a test skill" }]);
    runCli(["tap", "add", `file://${repoA}`, "tap-a"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "add", `file://${repoB}`, "tap-b"], {
      home,
      streams: captureStreams().streams,
    });
    const shaAStart = headSha(tapPath("tap-a", home));
    const shaBStart = headSha(tapPath("tap-b", home));

    // Upstream changes on both.
    makeSkill(repoA, "new-a", skillFrontmatter({ name: "new-a", description: "a new skill" }));
    commitAll(repoA, "add new-a");
    makeSkill(repoB, "new-b", skillFrontmatter({ name: "new-b", description: "a new skill" }));
    commitAll(repoB, "add new-b");

    const c = captureStreams();
    const code = runCli(["tap", "update"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("tap-a: refreshed");
    expect(c.stdout()).toContain("tap-b: refreshed");
    // Both clones moved to their new tips.
    expect(headSha(tapPath("tap-a", home))).not.toBe(shaAStart);
    expect(headSha(tapPath("tap-b", home))).not.toBe(shaBStart);
  });

  test("C-TAP-16 `crew tap update <name>` restricts to the named tap", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repoA = buildTap("crew-tapupd-one-a-", [{ name: "a", desc: "a test skill" }]);
    const repoB = buildTap("crew-tapupd-one-b-", [{ name: "b", desc: "a test skill" }]);
    runCli(["tap", "add", `file://${repoA}`, "tap-a"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "add", `file://${repoB}`, "tap-b"], {
      home,
      streams: captureStreams().streams,
    });
    const shaAStart = headSha(tapPath("tap-a", home));
    const shaBStart = headSha(tapPath("tap-b", home));

    commitAll(repoA, "noop A");
    commitAll(repoB, "noop B");

    runCli(["tap", "update", "tap-a"], { home, streams: captureStreams().streams });
    // Only tap-a advanced.
    expect(headSha(tapPath("tap-a", home))).not.toBe(shaAStart);
    expect(headSha(tapPath("tap-b", home))).toBe(shaBStart);
  });

  test("C-TAP-16 `crew tap update <unknown>` is a usage error", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["tap", "update", "no-such-tap"], { home, streams: c.streams });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("no tap named");
  });

  test("`crew tap update` exits 1 when any tap fails", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    // Add a tap with a fine URL, then rewrite its remote to an unreachable one
    // by manipulating config directly — simpler than setting up two real
    // flaky remotes.
    const repo = buildTap("crew-tapupd-fail-", [{ name: "x", desc: "a test skill" }]);
    runCli(["tap", "add", `file://${repo}`, "tap-ok"], {
      home,
      streams: captureStreams().streams,
    });
    // Write a second tap by editing config.yaml directly: URL points at a
    // nonexistent file:// repo, so fetch will fail.
    const cfg = readConfig(home);
    const { writeConfig } =
      require("../../src/config/load.ts") as typeof import("../../src/config/load.ts");
    const broken = {
      ...cfg,
      taps: [...cfg.taps, { name: "tap-broken", url: "file:///does/not/exist/crew-broken" }],
    };
    writeConfig(broken, home);
    // The broken tap has no clone dir on disk; `ensureRepo` will try to
    // clone it and fail.
    const c = captureStreams();
    const code = runCli(["tap", "update"], { home, streams: c.streams });
    expect(code).toBe(1);
    expect(c.stdout()).toContain("tap-ok: refreshed");
    expect(c.stdout()).toContain("tap-broken: FAILED");
  });

  test("search warns + skips a never-cloned unreachable tap (exit 0)", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    // Add a reachable tap the normal way.
    const repo = buildTap("crew-search-offline-", [{ name: "findable", desc: "a test skill" }]);
    runCli(["tap", "add", `file://${repo}`, "good-tap"], {
      home,
      streams: captureStreams().streams,
    });
    // Inject a never-cloned, unreachable tap into config (skips the
    // `tap add` clone that would otherwise fail up front).
    const cfg = readConfig(home);
    const { writeConfig } =
      require("../../src/config/load.ts") as typeof import("../../src/config/load.ts");
    writeConfig(
      {
        ...cfg,
        taps: [...cfg.taps, { name: "offline", url: "file:///crew-missing-tap-target" }],
      },
      home,
    );

    const c = captureStreams();
    const code = runCli(["search", "findable"], { home, streams: c.streams });
    expect(code).toBe(0);
    // The reachable tap's hit is present.
    expect(c.stdout()).toContain("findable");
    // The offline tap produced a warning on stderr.
    expect(c.stderr()).toContain("tap `offline`");
    expect(c.stderr()).toContain("crew tap update offline");
  });

  test("install by bare name also warns + skips an offline never-cloned tap", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repo = buildTap("crew-install-offline-", [{ name: "findable", desc: "a test skill" }]);
    runCli(["tap", "add", `file://${repo}`, "good-tap"], {
      home,
      streams: captureStreams().streams,
    });
    const cfg = readConfig(home);
    const { writeConfig } =
      require("../../src/config/load.ts") as typeof import("../../src/config/load.ts");
    writeConfig(
      {
        ...cfg,
        taps: [...cfg.taps, { name: "offline", url: "file:///crew-missing-install-target" }],
      },
      home,
    );
    const c = captureStreams();
    const code = runCli(["install", "findable"], { home, streams: c.streams });
    // The offline tap's failure is silently skipped; the reachable tap
    // provides `findable` and the install succeeds.
    expect(code).toBe(0);
  });
});
