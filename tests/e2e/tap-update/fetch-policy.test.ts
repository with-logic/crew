/**
 * The fetch-policy rule (§16.4): read-only commands never `git fetch`
 * (C-TAP-17), and a never-cloned unreachable tap is warned about and
 * skipped by `search` and bare-name `install`.
 */

import { describe, expect, test } from "bun:test";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig } from "../../../src/config/load.ts";
import { tapPath } from "../../../src/core/paths.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { commitAll, makeSkill, skillFrontmatter } from "../../helpers/fixtures.ts";
import { buildTap, headSha } from "./helpers.ts";

describe("tap update + fetch policy", () => {
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
      require("../../../src/config/load.ts") as typeof import("../../../src/config/load.ts");
    writeConfig(
      {
        ...cfg,
        taps: [
          ...cfg.taps,
          {
            name: "offline",
            kind: "git" as const,
            registered: true,
            url: "file:///crew-missing-tap-target",
            subpath: "",
            path: "",
          },
        ],
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
      require("../../../src/config/load.ts") as typeof import("../../../src/config/load.ts");
    writeConfig(
      {
        ...cfg,
        taps: [
          ...cfg.taps,
          {
            name: "offline",
            kind: "git" as const,
            registered: true,
            url: "file:///crew-missing-install-target",
            subpath: "",
            path: "",
          },
        ],
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
