/**
 * Safe rendering of user-controlled values (§5.2, C-CLI-06b).
 *
 * Crew echoes things the user supplied — clone URLs, tap names, paths,
 * and git's own stderr — into progress lines and error messages. Two
 * hazards ride along: credentials embedded in a remote, and terminal
 * control characters. Neither may reach a stream intact, through any
 * output mode. This file covers credentials; control characters are
 * `./control-chars.test.ts`.
 */

import { describe, expect, test } from "bun:test";
import { runCli } from "../../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { redirectClaudeCode, tapWithUrl } from "./helpers.ts";

redirectClaudeCode();

describe("--verbose credential redaction", () => {
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
    tapWithUrl(home, `https://user:${secret}@127.0.0.1:1/a/b.git`);
    const capture = captureStreams();
    runCli(["update", "--verbose"], { home, streams: capture.streams });
    const all = capture.stderr() + capture.stdout();
    expect(all).not.toContain(secret);
    expect(all).toContain("refreshing tap creds from https://user:***@127.0.0.1:1/a/b.git");
  });

  test("C-CLI-06b a failed clone keeps a password out of --json details", () => {
    const home = makeCrewHome();
    // The message redacts the URL it renders itself, but the error also
    // carries structured `details` and quotes git's stderr — which
    // repeats the remote verbatim. Both are printed by `--json`.
    const secret = "ghp_JSONDETAILSECRET";
    const capture = captureStreams();
    const code = runCli(
      ["install", "--verbose", "--json", `https://oauth2:${secret}@127.0.0.1:1/a/b.git`],
      { home, streams: capture.streams },
    );
    expect(code).not.toBe(0);
    const all = capture.stdout() + capture.stderr();
    expect(all).not.toContain(secret);
    const payload = JSON.parse(capture.stdout());
    expect(payload.error.name).toBe("source_unreachable");
    expect(payload.error.details.url).toContain("***");
  });

  test("C-CLI-06b a failed clone keeps a token query parameter out of every stream", () => {
    const home = makeCrewHome();
    // `?token=` is the shape git echoes back in its own stderr, so it
    // escapes through the quoted diagnostic even when our own rendering
    // of the URL is already redacted.
    const secret = "tkn_QUERYPARAMSECRET";
    for (const json of [true, false]) {
      const capture = captureStreams();
      const args = json
        ? ["install", "--verbose", "--json", `https://127.0.0.1:1/a/b.git?token=${secret}`]
        : ["install", "--verbose", `https://127.0.0.1:1/a/b.git?token=${secret}`];
      const code = runCli(args, { home, streams: capture.streams });
      expect(code).not.toBe(0);
      const all = capture.stdout() + capture.stderr();
      expect(all).not.toContain(secret);
      expect(all).toContain("token=***");
    }
  });
});
