/**
 * Empty-result wording for a scoped `crew search --tap <name>` (§16.6),
 * plus the flag-uniqueness rule and its error formatting (§5.2,
 * C-CLI-08a / C-CLI-08c).
 *
 * A user who scoped to a tap they already configured must not be told
 * "no skills in any tap you've added" or invited to add one — the
 * message has to name the tap they asked about and point at the
 * unscoped search instead.
 */

import { describe, expect, test } from "bun:test";
import { runCli } from "../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { commitAll, makeGitRepo, makeTempDir } from "../helpers/fixtures.ts";

/** Fresh home whose only tap is a real but skill-less local repo. */
function homeWithEmptyTap(): string {
  const home = makeCrewHome();
  const quiet = () => captureStreams().streams;
  runCli(["tap", "remove", "core", "--force"], { home, streams: quiet() });
  const repo = makeTempDir("crew-ste-");
  makeGitRepo(repo);
  commitAll(repo, "init");
  runCli(["tap", "add", `file://${repo}`, "empty-tap"], { home, streams: quiet() });
  return home;
}

describe("crew search --tap empty results", () => {
  test("C-TAP-23a a scoped catalog names the tap instead of suggesting a new one", () => {
    const home = homeWithEmptyTap();
    const c = captureStreams();

    expect(runCli(["search", "--tap", "empty-tap"], { home, streams: c.streams })).toBe(0);

    const out = c.stdout();
    expect(out).toContain("No skills in `empty-tap`.");
    // The user already has this tap; telling them to add one is wrong.
    expect(out).not.toContain("crew tap add");
    expect(out).not.toContain("any tap you've added.");
    expect(out).toContain("crew search");
  });

  test("C-TAP-23a a scoped query names the tap it searched", () => {
    const home = homeWithEmptyTap();
    const c = captureStreams();

    expect(runCli(["search", "--tap", "empty-tap", "python"], { home, streams: c.streams })).toBe(
      0,
    );

    const out = c.stdout();
    expect(out).toContain('No skills match "python" in `empty-tap`.');
    expect(out).not.toContain("crew tap add");
    expect(out).toContain("crew search python");
  });

  test("C-TAP-23a an unscoped empty catalog still suggests adding a tap", () => {
    const home = homeWithEmptyTap();
    const c = captureStreams();

    expect(runCli(["search"], { home, streams: c.streams })).toBe(0);

    const out = c.stdout();
    expect(out).toContain("No skills in any tap you've added.");
    expect(out).toContain("crew tap add");
  });
});

describe("flag uniqueness (§5.2)", () => {
  test("C-TAP-23a a repeated --tap is rejected rather than silently ignored", () => {
    const home = makeCrewHome();
    const c = captureStreams();

    const code = runCli(["search", "--tap", "a", "--tap", "b"], { home, streams: c.streams });

    expect(code).toBe(4);
    expect(c.stderr()).toContain("`--tap` was given more than once");
    // The pre-fix behavior searched every tap and reported success.
    expect(c.stdout()).not.toContain('"hits"');
  });

  test("C-CLI-08c a parse-stage failure honors --json", () => {
    const home = makeCrewHome();
    const c = captureStreams();

    const code = runCli(["search", "--json", "--tap", "a", "--tap", "b"], {
      home,
      streams: c.streams,
    });

    expect(code).toBe(4);
    // A script piping stdout must get the structured payload, not a
    // human-formatted message on stderr it cannot parse.
    const payload = JSON.parse(c.stdout()) as { error: { name: string; details: unknown } };
    expect(payload.error.name).toBe("usage_error");
    expect(payload.error.details).toEqual({ flag: "tap" });
    expect(c.stderr()).toBe("");
  });

  test("C-CLI-08c --json=false on a parse failure keeps human output", () => {
    const home = makeCrewHome();
    const c = captureStreams();

    const code = runCli(["search", "--json", "--json=false", "--tap", "a", "--tap", "b"], {
      home,
      streams: c.streams,
    });

    expect(code).toBe(4);
    expect(c.stdout()).toBe("");
    expect(c.stderr()).toContain("was given more than once");
  });

  // yargs accepts a space-separated boolean value, so `--json false` really
  // does mean "no JSON". Reading it as a bare `--json` would hand a parse
  // error to stdout as a structured payload the user never asked for.
  test("C-CLI-08c --json false on a parse failure keeps human output", () => {
    const home = makeCrewHome();
    const c = captureStreams();

    const code = runCli(["search", "--json", "false", "--tap", "a", "--tap", "b"], {
      home,
      streams: c.streams,
    });

    expect(code).toBe(4);
    expect(c.stdout()).toBe("");
    expect(c.stderr()).toContain("was given more than once");
  });
});
