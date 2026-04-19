/**
 * Tap management tests (crew tap add/list/remove) via file:// URLs.
 */

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../src/cli/main.ts";
import { readConfig } from "../../src/config/load.ts";
import { tapPath } from "../../src/core/paths.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";

describe("crew tap", () => {
  function buildTapRepo(): string {
    const repo = makeTempDir("crew-tap-repo-");
    makeGitRepo(repo);
    makeSkill(repo, "alpha", skillFrontmatter({ name: "alpha", description: "An alpha skill" }));
    makeSkill(repo, "beta", skillFrontmatter({ name: "beta", description: "A beta skill" }));
    commitAll(repo, "init");
    return repo;
  }

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

  test("C-TAP-03 remove deletes", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    runCli(["tap", "add", `file://${repo}`, "mytap"], {
      home,
      streams: captureStreams().streams,
    });
    const code = runCli(["tap", "remove", "mytap"], { home, streams: captureStreams().streams });
    expect(code).toBe(0);
    expect(readConfig(home).taps.some((t) => t.name === "mytap")).toBe(false);
    expect(existsSync(tapPath("mytap", home))).toBe(false);
  });

  test("C-TAP-04 list reports every tap", () => {
    const home = makeCrewHome();
    const capture = captureStreams();
    runCli(["tap", "list"], { home, streams: capture.streams });
    expect(capture.stdout()).toContain("core");
  });

  test("C-TAP-05 core tap present by default", () => {
    const home = makeCrewHome();
    expect(readConfig(home).taps[0]!.name).toBe("core");
  });

  test("C-TAP-06 remove core is refused without --force", () => {
    const home = makeCrewHome();
    const code = runCli(["tap", "remove", "core"], { home, streams: captureStreams().streams });
    expect(code).toBe(4);
    expect(readConfig(home).taps[0]!.name).toBe("core");
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

  test("C-TAP-11 `crew tap <unknown-word>` is a usage error", () => {
    // Not a subcommand and not a git source — must NOT be silently
    // treated as a tap.
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["tap", "listt"], { home, streams: c.streams });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("crew tap");
  });

  test("`crew tap <unparseable>` falls through to usage error", () => {
    // Input that makes `parseRef` throw — covers the catch branch of
    // the shorthand's `looksLikeGitSource` guard.
    const home = makeCrewHome();
    const c = captureStreams();
    // Uppercase fails the tap-name regex and isn't git-shaped.
    const code = runCli(["tap", "NotAValidName"], { home, streams: c.streams });
    expect(code).toBe(4);
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
    expect(c.stdout()).toContain("already configured");
    expect(c.stdout()).toContain("nothing to do");
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

  test("tap remove nonexistent fails", () => {
    const home = makeCrewHome();
    const code = runCli(["tap", "remove", "ghost"], { home, streams: captureStreams().streams });
    expect(code).toBe(4);
  });

  test("C-TAP-07 search matches by description", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    runCli(["tap", "add", `file://${repo}`, "mytap"], {
      home,
      streams: captureStreams().streams,
    });
    const c = captureStreams();
    runCli(["search", "alpha"], { home, streams: c.streams });
    expect(c.stdout()).toContain("alpha");
  });

  test("C-TAP-08 search --json", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    runCli(["tap", "add", `file://${repo}`, "mytap"], {
      home,
      streams: captureStreams().streams,
    });
    const c = captureStreams();
    runCli(["search", "--json", "alpha"], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout());
    expect(parsed.hits.length).toBeGreaterThanOrEqual(1);
  });

  test("crew tap list --json", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    runCli(["tap", "list", "--json"], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout());
    expect(parsed.taps[0].name).toBe("core");
  });

  test("unknown tap subcommand", () => {
    const home = makeCrewHome();
    const code = runCli(["tap", "frob"], { home, streams: captureStreams().streams });
    expect(code).toBe(4);
  });

  test("search without query fails", () => {
    const home = makeCrewHome();
    const code = runCli(["search"], { home, streams: captureStreams().streams });
    expect(code).toBe(4);
  });
});
