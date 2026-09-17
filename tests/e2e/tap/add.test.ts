/**
 * `crew tap add` (§16): cloning, explicit names, the `crew tap <url>`
 * shorthand, idempotence, name collisions, transactional failure, and the
 * rejected `@ref` tail.
 */

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig } from "../../../src/config/load.ts";
import { tapPath } from "../../../src/core/paths.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { buildTapRepo } from "./helpers.ts";

describe("crew tap", () => {
  test("C-TAP-01 add clones the repo", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    const url = `file://${repo}`;
    const code = runCli(["tap", "add", url, "mytap"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    expect(existsSync(join(tapPath("mytap", home), ".git"))).toBe(true);
  });

  test("C-TAP-02 add with explicit name", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    runCli(["tap", "add", `file://${repo}`, "custom-name"], {
      home,
      streams: captureStreams().streams,
    });
    expect(readConfig(home).taps.some((t) => t.name === "custom-name")).toBe(true);
  });

  test("tap add accepts explicit names that start with a digit", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    const code = runCli(["tap", "add", `file://${repo}`, "3d-skills"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    expect(readConfig(home).taps.some((t) => t.name === "3d-skills")).toBe(true);
  });

  test("tap add no longer requires --yes — succeeds without confirmation", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    const code = runCli(["tap", "add", `file://${repo}`, "mytap"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    expect(readConfig(home).taps.some((t) => t.name === "mytap")).toBe(true);
  });

  test("C-TAP-10 `crew tap <git-url>` is shorthand for `crew tap add`", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    // No `add` keyword — the URL is the first positional.
    const code = runCli(["tap", `file://${repo}`, "shortcut-tap"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    expect(readConfig(home).taps.some((t) => t.name === "shortcut-tap")).toBe(true);
  });

  test("tap add with invalid name fails", () => {
    const home = makeCrewHome();
    const code = runCli(["tap", "add", "file:///tmp/x", "Bad-Name"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(4);
  });

  test("tap add is idempotent when name + URL already match", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    runCli(["tap", "add", `file://${repo}`, "mytap"], {
      home,
      streams: captureStreams().streams,
    });
    const c = captureStreams();
    const code = runCli(["tap", "add", `file://${repo}`, "mytap"], {
      home,
      streams: c.streams,
    });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("already set up");
    expect(readConfig(home).taps.filter((t) => t.name === "mytap")).toHaveLength(1);
  });

  test("tap add with same name but different URL fails with a useful remedy", () => {
    const home = makeCrewHome();
    const repoA = buildTapRepo();
    const repoB = buildTapRepo();
    runCli(["tap", "add", `file://${repoA}`, "mytap"], {
      home,
      streams: captureStreams().streams,
    });
    const c = captureStreams();
    const code = runCli(["tap", "add", `file://${repoB}`, "mytap"], {
      home,
      streams: c.streams,
    });
    expect(code).toBe(4);
    // Tells the user where the existing tap points.
    expect(c.stderr()).toContain(`file://${repoA}`);
    // Tells the user exactly how to resolve it — including the URL
    // they just tried, so the suggested command is copy-pasteable.
    expect(c.stderr()).toContain(`crew tap add file://${repoB}`);
    expect(c.stderr()).toContain("<tap-name>");
  });

  test("failed clone leaves NO config entry behind (tap add is transactional)", () => {
    // Regression: earlier versions wrote config first, then cloned —
    // so a typo'd URL would fail the clone but still show up in
    // `crew tap list`. The fix is to clone first.
    const home = makeCrewHome();
    const c = captureStreams();
    // `file://` on a non-existent path makes `git clone` fail cleanly
    // without touching the network.
    const code = runCli(["tap", "add", "file:///definitely/does/not/exist/crew-typo", "typo-tap"], {
      home,
      streams: c.streams,
    });
    expect(code).not.toBe(0);
    // Config must NOT list the failed tap.
    expect(readConfig(home).taps.some((t) => t.name === "typo-tap")).toBe(false);
    // No leftover clone dir either.
    expect(existsSync(tapPath("typo-tap", home))).toBe(false);
  });

  test("a tap with a @ref tail is rejected (taps track default branch)", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    const c = captureStreams();
    const code = runCli(["tap", "add", `file://${repo}@main`, "mytap"], {
      home,
      streams: c.streams,
    });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("taps track the default branch");
  });
});
