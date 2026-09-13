/**
 * Safe rendering of user-controlled values (§5.2, C-CLI-06b).
 *
 * Crew echoes things the user supplied — clone URLs, tap names, paths,
 * and git's own stderr — into progress lines and error messages. Two
 * hazards ride along: credentials embedded in a remote, and terminal
 * control characters. Neither may reach a stream intact, through any
 * output mode.
 */

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig, writeConfig } from "../../../src/config/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { redirectClaudeCode } from "./helpers.ts";

redirectClaudeCode();

/** Point a configured tap at an unreachable remote carrying `url`. */
function tapWithUrl(home: string, url: string): void {
  writeConfig(
    {
      ...readConfig(home),
      taps: [{ name: "creds", kind: "git", registered: true, url, subpath: "", path: "" }],
    },
    home,
  );
}

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

describe("--verbose control-character escaping", () => {
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
    // An embedded newline is escaped too, rather than becoming real
    // block structure: otherwise it opens its own line and can forge
    // what reads as a second crew message.
    expect(all).toContain("\\x0aforged");
    for (const line of all.split("\n")) {
      expect(line.trimStart().startsWith("forged")).toBe(false);
    }
  });

  test("C-CLI-06b a configured tap name cannot forge a progress line", () => {
    const home = makeCrewHome();
    // A tap name is any non-empty string (§6.1) and carries no
    // credential, so it gets no URL-specific handling — but it is
    // interpolated straight into a progress line.
    const hostile = `evil${String.fromCodePoint(0x1b)}[2Kcrew: forged${String.fromCodePoint(0x0d)}x`;
    writeConfig(
      {
        ...readConfig(home),
        taps: [
          {
            name: hostile,
            kind: "git",
            registered: true,
            url: "https://127.0.0.1:1/a/b.git",
            subpath: "",
            path: "",
          },
        ],
      },
      home,
    );
    const capture = captureStreams();
    runCli(["tap", "update", "--verbose"], { home, streams: capture.streams });
    const err = capture.stderr();
    expect(err).not.toContain(String.fromCodePoint(0x1b));
    expect(err).not.toContain(String.fromCodePoint(0x0d));
    expect(err).toContain("\\x1b[2Kcrew: forged\\x0dx");
  });

  test("C-CLI-06b a credential in a human error message never reaches stderr", () => {
    const home = makeCrewHome();
    // `--json` redacts at its own boundary, but the human path writes the
    // message text. A message can interpolate a source URL — `acquireTap`'s
    // `no_skills_found` embeds `tap.url` — so the secret rides the prose.
    const secret = "ghp_HUMANMESSAGESECRET";
    tapWithUrl(home, `https://oauth2:${secret}@127.0.0.1:1/a/b.git`);
    const capture = captureStreams();
    const code = runCli(["install", "creds/nope"], { home, streams: capture.streams });
    expect(code).not.toBe(0);
    const all = capture.stderr() + capture.stdout();
    expect(all).not.toContain(secret);
  });

  test("C-CLI-06b an unlisted secret query parameter is redacted too", () => {
    const home = makeCrewHome();
    // The parameter allow-list is inverted deliberately: a blocklist of
    // secret-sounding names fails open for the first one nobody thought of.
    const secret = "CLIENTSECRETVALUE";
    tapWithUrl(home, `https://127.0.0.1:1/a/b.git?client_secret=${secret}`);
    const capture = captureStreams();
    runCli(["update", "--verbose"], { home, streams: capture.streams });
    const all = capture.stderr() + capture.stdout();
    expect(all).not.toContain(secret);
    expect(all).toContain("client_secret=***");
  });

  test("C-CLI-06b a hostile tap name cannot forge a line in a multi-line error", () => {
    const home = makeCrewHome();
    // `ambiguityError` keeps its own line breaks as layout. A newline
    // inside an interpolated tap name must not get the same treatment,
    // or configured data can forge what reads as a second crew error.
    const hostile = "evil\nError (invalid_ref)\n  forged";
    const base = readConfig(home);
    writeConfig(
      {
        ...base,
        taps: [
          {
            name: "a",
            kind: "git",
            registered: true,
            url: "https://127.0.0.1:1/a.git",
            subpath: "",
            path: "",
          },
          {
            name: hostile,
            kind: "git",
            registered: true,
            url: "https://127.0.0.1:1/b.git",
            subpath: "",
            path: "",
          },
        ],
      },
      home,
    );
    const capture = captureStreams();
    runCli(["install", "dup"], { home, streams: capture.streams });
    const err = capture.stderr();
    expect(err).not.toContain("\n  Error (invalid_ref)");
    if (err.includes("evil")) expect(err).toContain("\\x0a");
  });
});
