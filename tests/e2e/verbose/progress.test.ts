/**
 * `--verbose` progress reporting (§5.2, C-CLI-06a): lines reach stderr
 * only when the flag is set, never pollute stdout, and never leak into
 * a later run in the same process.
 */

import { describe, expect, test } from "bun:test";
import { runCli } from "../../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { makeRepo, redirectClaudeCode } from "./helpers.ts";

redirectClaudeCode();

describe("--verbose progress", () => {
  test("C-CLI-06a emits git, staging, and install lines on stderr only", () => {
    const home = makeCrewHome();
    const repo = makeRepo();
    const capture = captureStreams();
    const code = runCli(["install", "--verbose", `file://${repo}`], {
      home,
      streams: capture.streams,
    });
    expect(code).toBe(0);
    const err = capture.stderr();
    expect(err).toContain("crew: $ git clone");
    expect(err).toContain("crew: staging demo@");
    expect(err).toContain("crew: installing demo → ");
    expect(capture.stdout()).not.toContain("crew: ");
  });

  test("C-CLI-06a --json keeps stdout parseable while stderr carries progress", () => {
    const home = makeCrewHome();
    const repo = makeRepo();
    const capture = captureStreams();
    runCli(["install", "--verbose", "--json", `file://${repo}`], {
      home,
      streams: capture.streams,
    });
    expect(JSON.parse(capture.stdout()).records[0].name).toBe("demo");
    expect(capture.stderr()).toContain("crew: $ git");
  });

  test("C-CLI-06a uninstall and reinstall report removal and store reuse", () => {
    const home = makeCrewHome();
    const repo = makeRepo();
    // Each step asserts its exit code: a progress line can be emitted
    // before a later failure, so matching text alone wouldn't prove the
    // command actually succeeded.
    const setup = captureStreams();
    expect(runCli(["install", `file://${repo}`], { home, streams: setup.streams })).toBe(0);
    const rm = captureStreams();
    expect(runCli(["uninstall", "--verbose", "demo"], { home, streams: rm.streams })).toBe(0);
    expect(rm.stderr()).toContain("crew: removing demo from ");
    const again = captureStreams();
    expect(
      runCli(["install", "--verbose", `file://${repo}`], { home, streams: again.streams }),
    ).toBe(0);
    expect(again.stderr()).toContain("crew: reusing store entry demo@");
    const upd = captureStreams();
    expect(runCli(["update", "--verbose"], { home, streams: upd.streams })).toBe(0);
    expect(upd.stderr()).toContain("crew: refreshing tap ");
    expect(upd.stderr()).toContain("crew: $ git fetch");
  });

  test("C-CLI-06a a nested runCli neither steals nor silences the outer sink", () => {
    const home = makeCrewHome();
    const innerHome = makeCrewHome();
    const repo = makeRepo();
    // A distinct skill name: the redirected adapter root is shared across
    // both runs, so two `demo`s would collide and the outer run would
    // report "already installed" instead of emitting its install line.
    const innerRepo = makeRepo("inner");
    const outer = captureStreams();
    const innerCapture = captureStreams();
    let nestedRuns = 0;
    // A stream callback runs mid-command, part-way through the outer
    // run's output — which is how a nested invocation becomes
    // reachable in real use, and the only point where stealing or
    // clearing the sink is observable.
    const nesting = {
      stdout: (s: string) => outer.streams.stdout(s),
      stderr: (s: string) => {
        outer.streams.stderr(s);
        // Nest on the FIRST progress line, so more progress is still
        // to come: that is the only window where a cleared or stolen
        // sink is observable.
        if (nestedRuns === 0 && s.startsWith("crew: ")) {
          nestedRuns++;
          // The inner command must be one that WOULD emit progress if it
          // borrowed the outer sink. `list` emits none, so asserting it
          // produced no progress line could never fail, whatever the sink
          // did — the assertion has to be able to fail to mean anything.
          runCli(["install", `file://${innerRepo}`], {
            home: innerHome,
            streams: innerCapture.streams,
          });
        }
      },
    };
    const code = runCli(["install", "--verbose", `file://${repo}`], {
      home,
      streams: nesting,
    });
    expect(code).toBe(0);
    expect(nestedRuns).toBe(1);
    // The non-verbose inner run must not borrow the outer sink...
    expect(innerCapture.stderr()).not.toContain("crew: ");
    // ...and must not have cleared it: the outer run keeps emitting
    // after the nested call returns.
    expect(outer.stderr()).toContain("crew: installing demo → ");
  });

  test("C-CLI-06a without the flag nothing is emitted, even after a failed verbose run", () => {
    const home = makeCrewHome();
    const failed = captureStreams();
    const code = runCli(["install", "--verbose", `file://${makeTempDir("crew-nope-")}/missing`], {
      home,
      streams: failed.streams,
    });
    expect(code).not.toBe(0);
    expect(failed.stderr()).toContain("crew: $ git clone");

    const repo = makeRepo();
    const quiet = captureStreams();
    runCli(["install", `file://${repo}`], { home, streams: quiet.streams });
    expect(quiet.stderr()).not.toContain("crew: ");
    expect(quiet.stdout()).not.toContain("crew: ");
  });
});
