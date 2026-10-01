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
import { redirectClaudeCode, tapWithUrl, useLocalCloneFailures } from "./helpers.ts";

redirectClaudeCode();
useLocalCloneFailures();

describe("--verbose credential redaction", () => {
  test("C-CLI-06b a credential in a direct install url never reaches stderr", () => {
    const home = makeCrewHome();
    // The seam preserves this HTTP input in progress and error metadata,
    // while delegating the clone to a missing local repository.
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
      // HTTP references drop queries (§8.2), so use a stored tap URL to
      // exercise the remote that git actually receives, without parsing it.
      tapWithUrl(home, `https://127.0.0.1:1/a/b.git?token=${secret}`);
      const args = ["tap", "update", "creds", "--verbose", ...(json ? ["--json"] : [])];
      const code = runCli(args, { home, streams: capture.streams });
      expect(code).not.toBe(0);
      const all = capture.stdout() + capture.stderr();
      expect(all).not.toContain(secret);
      expect(all).toContain("token=***");
    }
  });
  test("C-CLI-06b malformed credential URLs fail closed in progress and clone errors", () => {
    for (const json of [false, true]) {
      const home = makeCrewHome();
      const secret = "MALFORMEDSECRETVALUE";
      tapWithUrl(home, `https://user:${secret}@127.0.0.1:99999/repo.git?client_secret=${secret}`);
      const capture = captureStreams();
      const code = runCli(["tap", "update", "--verbose", ...(json ? ["--json"] : []), "creds"], {
        home,
        streams: capture.streams,
      });
      expect(code).not.toBe(0);
      const all = capture.stdout() + capture.stderr();
      expect(all).not.toContain(secret);
      expect(all).toContain("refreshing tap creds from ***");
      expect(all).toContain("source_unreachable");
      if (json) expect(JSON.parse(capture.stdout()).rows[0].error.code).toBe("source_unreachable");
    }
  });
});
