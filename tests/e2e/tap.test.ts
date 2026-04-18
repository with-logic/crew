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
import { commitAll, makeGitRepo, makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

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
    const code = runCli(["tap", "add", "--yes", url, "mytap"], { home, streams: captureStreams().streams });
    expect(code).toBe(0);
    expect(existsSync(join(tapPath("mytap", home), ".git"))).toBe(true);
  });

  test("C-TAP-02 add with explicit name", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    runCli(["tap", "add", "--yes", `file://${repo}`, "custom-name"], { home, streams: captureStreams().streams });
    expect(readConfig(home).taps.some((t) => t.name === "custom-name")).toBe(true);
  });

  test("C-TAP-03 remove deletes", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    runCli(["tap", "add", "--yes", `file://${repo}`, "mytap"], { home, streams: captureStreams().streams });
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

  test("tap add without --yes fails", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    const code = runCli(["tap", "add", `file://${repo}`, "mytap"], { home, streams: captureStreams().streams });
    expect(code).toBe(4);
  });

  test("tap add with invalid name fails", () => {
    const home = makeCrewHome();
    const code = runCli(["tap", "add", "--yes", "file:///tmp/x", "Bad-Name"], { home, streams: captureStreams().streams });
    expect(code).toBe(4);
  });

  test("tap add duplicate name fails", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    runCli(["tap", "add", "--yes", `file://${repo}`, "mytap"], { home, streams: captureStreams().streams });
    const code = runCli(["tap", "add", "--yes", `file://${repo}`, "mytap"], { home, streams: captureStreams().streams });
    expect(code).toBe(4);
  });

  test("tap remove nonexistent fails", () => {
    const home = makeCrewHome();
    const code = runCli(["tap", "remove", "ghost"], { home, streams: captureStreams().streams });
    expect(code).toBe(4);
  });

  test("C-TAP-07 search matches by description", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    runCli(["tap", "add", "--yes", `file://${repo}`, "mytap"], { home, streams: captureStreams().streams });
    const c = captureStreams();
    runCli(["search", "alpha"], { home, streams: c.streams });
    expect(c.stdout()).toContain("alpha");
  });

  test("C-TAP-08 search --json", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    runCli(["tap", "add", "--yes", `file://${repo}`, "mytap"], { home, streams: captureStreams().streams });
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
