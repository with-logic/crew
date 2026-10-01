/**
 * Control-character escaping for user-controlled values (§5.2, C-CLI-06b).
 *
 * Crew echoes user-supplied paths, tap names, and the version control
 * tool's own stderr into progress lines and error messages. A crafted
 * C0/C1 sequence must never reach a stream intact — it could recolor
 * output or forge a second `crew: ...` line. Credential redaction is
 * `./safety.test.ts`.
 */

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig, writeConfig } from "../../../src/config/load.ts";
import { tapPath } from "../../../src/core/paths.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeGitRepo, makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { redirectClaudeCode, tapWithUrl } from "./helpers.ts";

redirectClaudeCode();

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
    const clone = tapPath("creds", home);
    makeSkill(clone, "demo", skillFrontmatter({ name: "demo" }));
    makeGitRepo(clone);
    const config = readConfig(home);
    writeConfig({ ...config, taps: config.taps.map((t) => ({ ...t, subpath: "missing" })) }, home);
    const capture = captureStreams();
    const code = runCli(["install", "creds"], { home, streams: capture.streams });
    expect(code).not.toBe(0);
    const all = capture.stderr() + capture.stdout();
    expect(all).not.toContain(secret);
    expect(all).toContain("no_skills_found");
    expect(all).toContain("https://oauth2:***@127.0.0.1:1/a/b.git");
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
    const a = makeTempDir();
    const b = makeTempDir();
    makeSkill(a, "dup", skillFrontmatter({ name: "dup" }));
    makeSkill(b, "dup", skillFrontmatter({ name: "dup" }));
    writeConfig(
      {
        ...base,
        taps: [
          {
            name: "a",
            kind: "path",
            registered: true,
            url: "",
            subpath: "",
            path: a,
          },
          {
            name: hostile,
            kind: "path",
            registered: true,
            url: "",
            subpath: "",
            path: b,
          },
        ],
      },
      home,
    );
    const capture = captureStreams();
    let menu = "";
    const code = runCli(["install", "dup"], {
      home,
      streams: capture.streams,
      promptChoice: (message) => {
        menu = message;
        return "abort";
      },
    });
    expect(code).toBe(4);
    expect(menu).toContain("evil\\x0aError (invalid_ref)\\x0a  forged");
    expect(menu).not.toContain(hostile);
    const err = capture.stderr();
    expect(err).not.toContain("\n  Error (invalid_ref)");
    expect(err).toContain("ambiguous_reference");
    expect(err).toContain("evil\\x0aError (invalid_ref)\\x0a  forged");
  });
});
