/**
 * Path-kind taps and recursive discovery (§16.4, C-TAP-22b): local
 * directories as taps, `--recursive` upgrades, and `crew info` resolution
 * through the tap index.
 */

import { describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig } from "../../../src/config/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

describe("crew tap", () => {
  test("`crew tap add <local-path>` against a non-existent path fails", () => {
    // Path-kind taps are now valid — but only if the directory exists.
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["tap", "add", "/definitely/does/not/exist/crew-x"], {
      home,
      streams: c.streams,
    });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("isn't a directory");
  });

  test("`crew tap add <existing-local-path>` creates a path-kind tap", () => {
    const home = makeCrewHome();
    const dir = makeTempDir("crew-path-tap-");
    makeSkill(dir, "alpha", skillFrontmatter({ name: "alpha", description: "from a path tap" }));
    const code = runCli(["tap", "add", dir, "local"], { home, streams: captureStreams().streams });
    expect(code).toBe(0);
    const tap = readConfig(home).taps.find((t) => t.name === "local")!;
    expect(tap.kind).toBe("path");
    expect(tap.path).toBe(dir);
    expect(tap.registered).toBe(true);
  });

  test("C-TAP-22b tap add --recursive makes nested skills searchable", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const dir = makeTempDir("crew-recursive-path-tap-");
    const nested = join(dir, "products", "firebase");
    mkdirSync(nested, { recursive: true });
    makeSkill(nested, "data-connect", skillFrontmatter({ name: "data-connect" }));

    const code = runCli(["tap", "add", "--recursive", dir, "deep"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    expect(readConfig(home).taps.find((t) => t.name === "deep")!.discovery).toBe("recursive");

    const capture = captureStreams();
    expect(runCli(["search", "data"], { home, streams: capture.streams })).toBe(0);
    expect(capture.stdout()).toContain("data-connect");
  });

  test("info resolves skills discovered through recursive taps", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const dir = makeTempDir("crew-recursive-info-");
    const nested = join(dir, "products", "firebase");
    mkdirSync(nested, { recursive: true });
    makeSkill(nested, "data-connect", skillFrontmatter({ name: "data-connect" }));
    runCli(["tap", "add", "--recursive", dir, "deep"], {
      home,
      streams: captureStreams().streams,
    });

    const bare = captureStreams();
    expect(runCli(["info", "data-connect"], { home, streams: bare.streams })).toBe(0);
    expect(bare.stdout()).toContain("data-connect");

    const qualified = captureStreams();
    expect(runCli(["info", "deep/data-connect"], { home, streams: qualified.streams })).toBe(0);
    expect(qualified.stdout()).toContain("data-connect");
  });

  test("info resolves namespace candidates through the tap index", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const dir = makeTempDir("crew-info-namespace-");
    const namespace = join(dir, "skills", "finance");
    mkdirSync(namespace, { recursive: true });
    makeSkill(namespace, "budget-review", skillFrontmatter({ name: "budget-review" }));
    runCli(["tap", "add", dir, "team"], { home, streams: captureStreams().streams });

    const capture = captureStreams();
    expect(runCli(["info", "finance"], { home, streams: capture.streams })).toBe(0);
    expect(capture.stdout()).toContain("budget-review");
  });

  test("info prefers a bare tap-name match over same-named skills in other taps", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const tapDir = makeTempDir("crew-info-tap-name-");
    makeSkill(tapDir, "inner", skillFrontmatter({ name: "inner" }));
    const helperDir = makeTempDir("crew-info-skill-name-");
    makeSkill(helperDir, "team", skillFrontmatter({ name: "team" }));
    runCli(["tap", "add", tapDir, "team"], { home, streams: captureStreams().streams });
    runCli(["tap", "add", helperDir, "helpers"], { home, streams: captureStreams().streams });

    const capture = captureStreams();
    expect(runCli(["info", "team"], { home, streams: capture.streams })).toBe(0);
    expect(capture.stdout()).toContain("inner");
  });

  test("tap add --recursive upgrades an existing registered tap", () => {
    const home = makeCrewHome();
    const dir = makeTempDir("crew-recursive-upgrade-");
    makeSkill(dir, "alpha", skillFrontmatter({ name: "alpha" }));
    expect(runCli(["tap", "add", dir, "local"], { home, streams: captureStreams().streams })).toBe(
      0,
    );

    const capture = captureStreams();
    expect(
      runCli(["tap", "add", "--recursive", "--json", dir, "local"], {
        home,
        streams: capture.streams,
      }),
    ).toBe(0);
    const output = JSON.parse(capture.stdout()) as { updated: boolean; discovery: string };
    expect(output.updated).toBe(true);
    expect(output.discovery).toBe("recursive");
    expect(readConfig(home).taps.find((t) => t.name === "local")!.discovery).toBe("recursive");
  });
});
