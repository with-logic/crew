/**
 * `--verbose` (§5.2, C-CLI-06a): progress lines reach stderr only when
 * the flag is set, never pollute stdout, and never leak into a later
 * run in the same process.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { runCli } from "../../src/cli/main.ts";
import { readConfig, writeConfig } from "../../src/config/load.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { makeGitRepo, makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

let restore: (() => void) | null = null;

beforeEach(() => {
  const ccRoot = makeTempDir("crew-cc-");
  const original = { u: claudeCodeAdapter.userPath, d: claudeCodeAdapter.detect };
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccRoot;
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
  restore = () => {
    (claudeCodeAdapter as { userPath: () => string }).userPath = original.u;
    (claudeCodeAdapter as { detect: () => boolean }).detect = original.d;
  };
});
afterEach(() => {
  restore?.();
  restore = null;
});

function makeRepo(): string {
  const repo = makeTempDir("crew-repo-");
  makeSkill(repo, "demo", skillFrontmatter({ name: "demo" }));
  makeGitRepo(repo);
  return repo;
}

describe("--verbose", () => {
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

  test("C-CLI-06b a credential in a direct install url never reaches stderr", () => {
    const home = makeCrewHome();
    // An unreachable remote: the clone fails, but not before the argv
    // has been handed to the progress sink and the URL echoed in the
    // resulting `source_unreachable` message.
    const secret = "ghp_SUPERSECRETVALUE";
    const capture = captureStreams();
    const code = runCli(["install", "--verbose", `https://oauth2:${secret}@127.0.0.1:1/a/b.git`], {
      home,
      streams: capture.streams,
    });
    expect(code).not.toBe(0);
    const all = capture.stderr() + capture.stdout();
    expect(all).not.toContain(secret);
    expect(all).toContain("https://oauth2:***@127.0.0.1:1/a/b.git");
  });

  test("C-CLI-06b a credential in a configured tap url never reaches stderr", () => {
    const home = makeCrewHome();
    const secret = "glpat_TAPSECRETVALUE";
    writeConfig(
      {
        ...readConfig(home),
        taps: [
          {
            name: "creds",
            kind: "git",
            registered: true,
            url: `https://user:${secret}@127.0.0.1:1/a/b.git`,
            subpath: "",
            path: "",
          },
        ],
      },
      home,
    );
    const capture = captureStreams();
    runCli(["update", "--verbose"], { home, streams: capture.streams });
    const all = capture.stderr() + capture.stdout();
    expect(all).not.toContain(secret);
    expect(all).toContain("refreshing tap creds from https://user:***@127.0.0.1:1/a/b.git");
  });

  test("C-CLI-06b control characters in a path source are escaped, not echoed raw", () => {
    const home = makeCrewHome();
    const parent = makeTempDir("crew-ctl-");
    // A path source reaches the error renderer verbatim — a URL would
    // be percent-encoded by the parser first — so this is where
    // escaping has to hold: otherwise crafted input could recolor
    // output or forge a second line.
    const hostile = `${String.fromCodePoint(0x1b)}[31mx${String.fromCodePoint(0x0a)}forged`;
    const capture = captureStreams();
    const code = runCli(["install", "--verbose", join(parent, hostile)], {
      home,
      streams: capture.streams,
    });
    expect(code).not.toBe(0);
    const all = capture.stderr() + capture.stdout();
    // The ESC is escaped rather than emitted, so it cannot recolor or
    // reposition the terminal.
    expect(all).toContain("\\x1b[31mx");
    expect(all).not.toContain(String.fromCodePoint(0x1b));
    // The embedded newline survives as block structure, but every
    // continuation line is indented, so it cannot forge an unindented
    // line of crew's own output.
    for (const line of all.split("\n")) {
      expect(line.startsWith("forged")).toBe(false);
    }
  });

  test("C-CLI-06a a nested runCli neither steals nor silences the outer sink", () => {
    const home = makeCrewHome();
    const innerHome = makeCrewHome();
    const repo = makeRepo();
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
          runCli(["list"], { home: innerHome, streams: innerCapture.streams });
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
