/**
 * `crew tap list` / `crew tap remove` / unknown subcommands, plus C-TAP-07
 * and C-TAP-08 search through an added tap (§16).
 */

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig } from "../../../src/config/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { cloneDirs, makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { buildTapRepo } from "./helpers.ts";

describe("crew tap", () => {
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
    // The repository's shared clone goes with the last tap referencing it.
    expect(cloneDirs(home)).toEqual([]);
  });

  test("C-TAP-04 list reports every tap", () => {
    const home = makeCrewHome();
    const capture = captureStreams();
    runCli(["tap", "list"], { home, streams: capture.streams });
    expect(capture.stdout()).toContain("core");
  });

  test("tap subcommands reject --recursive outside tap add", () => {
    const home = makeCrewHome();
    const capture = captureStreams();
    const code = runCli(["tap", "list", "--recursive"], { home, streams: capture.streams });
    expect(code).toBe(4);
    expect(capture.stderr()).toContain("only applies to `crew tap add`");
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

  test("C-TAP-11 `crew tap <unknown-word>` is a usage error pointing at help", () => {
    // Not a subcommand and not a git source — crew errors with a
    // message that names the bad input and points at `crew help tap`.
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["tap", "listt"], { home, streams: c.streams });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("listt");
    expect(c.stderr()).toContain("crew help tap");
  });

  test("`crew tap <unparseable>` errors with a help pointer", () => {
    // Input that makes `parseRef` throw — covers the catch branch of
    // the shorthand's `looksLikeGitSource` guard.
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["tap", "not_a_valid_name"], { home, streams: c.streams });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("crew help tap");
  });

  test("tap add with a bare-name source is a usage error (not a source)", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    // `my-skills` parses as a tap reference, not a git URL or path —
    // `crew tap add` requires a source.
    const code = runCli(["tap", "add", "my-skills"], { home, streams: c.streams });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("not a source");
  });

  test("tap list with no taps shows a welcoming empty state", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const c = captureStreams();
    const code = runCli(["tap", "list"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("No taps configured");
  });

  test("tap remove of a path tap notes the folder wasn't touched", () => {
    const home = makeCrewHome();
    const root = makeTempDir("crew-pathtap-removal-");
    makeSkill(root, "inside", skillFrontmatter({ name: "inside" }));
    runCli(["tap", "add", root, "pathtap"], { home, streams: captureStreams().streams });
    const c = captureStreams();
    const code = runCli(["tap", "remove", "pathtap"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("local folder itself wasn't touched");
    // The folder on disk is intact.
    expect(existsSync(root)).toBe(true);
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

  test("unknown tap subcommand is a usage error pointing at help", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["tap", "frob"], { home, streams: c.streams });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("frob");
    expect(c.stderr()).toContain("crew help tap");
  });

  test("bare `crew tap` shows the help page", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["tap"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("crew tap");
    expect(c.stdout()).toContain("USAGE");
  });

  test("search without query lists every available skill", () => {
    const home = makeCrewHome();
    const code = runCli(["search"], { home, streams: captureStreams().streams });
    expect(code).toBe(0);
  });
});
