/**
 * C-TAP-16 `crew tap update` (§16.4): fetches and fast-forwards every
 * configured tap or just the named one, and reports failures.
 */

import { describe, expect, test } from "bun:test";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig } from "../../../src/config/load.ts";
import { tapPath } from "../../../src/core/paths.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { commitAll, makeSkill, skillFrontmatter } from "../../helpers/fixtures.ts";
import { buildTap, headSha } from "./helpers.ts";

describe("tap update + fetch policy", () => {
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
    // New tap-update table renders `<name>  refreshed  <url>` per row.
    expect(c.stdout()).toMatch(/tap-a\s+refreshed/);
    expect(c.stdout()).toMatch(/tap-b\s+refreshed/);
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

  test("`crew tap update` with no taps is a clean no-op", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const c = captureStreams();
    const code = runCli(["tap", "update"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("No taps to update");
  });

  test("C-TAP-16 `crew tap update <unknown>` is a usage error", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["tap", "update", "no-such-tap"], { home, streams: c.streams });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("was not found in your list of taps");
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
      require("../../../src/config/load.ts") as typeof import("../../../src/config/load.ts");
    const broken = {
      ...cfg,
      taps: [
        ...cfg.taps,
        {
          name: "tap-broken",
          kind: "git" as const,
          registered: true,
          url: "file:///does/not/exist/crew-broken",
          subpath: "",
          path: "",
        },
      ],
    };
    writeConfig(broken, home);
    // The broken tap has no clone dir on disk; `ensureRepo` will try to
    // clone it and fail.
    const c = captureStreams();
    const code = runCli(["tap", "update"], { home, streams: c.streams });
    expect(code).toBe(1);
    expect(c.stdout()).toMatch(/tap-ok\s+refreshed/);
    expect(c.stdout()).toMatch(/tap-broken\s+failed/);
  });
});
