/**
 * Credentials in a tap URL must never reach output (§13, §16.3).
 *
 * Crew accepts and stores `https://user:token@host/o/r` verbatim so a private
 * repo still clones, which means every outward-facing surface has to redact:
 * `tap list`, `tap update`, `tap add` success and collision output, the
 * pinned-tap usage error, and a failed clone — whose own stderr repeats the
 * remote. Each is asserted in human form and, where the command emits one, in
 * the `--json` payload too.
 */

import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../src/cli/main.ts";
import { paths } from "../../src/core/paths.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";

const SECRET = "s3cr3tT0k3n";
const AUTHED_URL = `https://user:${SECRET}@example.invalid/acme/skills.git`;

/**
 * Write a config holding a credential-bearing tap directly, so the read-only
 * surfaces render one without needing a reachable remote.
 */
function homeWithAuthedTap(): string {
  const home = makeCrewHome();
  const config = [
    "taps:",
    "  - name: acme",
    "    kind: git",
    "    registered: true",
    `    url: "${AUTHED_URL}"`,
    '    subpath: ""',
    '    path: ""',
    "disabled_agents: []",
    "forced_agents: []",
    "autoupdate:",
    "  enabled: false",
    "  interval_seconds: 14400",
    "",
  ].join("\n");
  writeFileSync(join(paths(home).configFile), config);
  return home;
}

describe("tap credentials never reach output", () => {
  test("C-TAP-26 tap list redacts in human and JSON output", () => {
    const home = homeWithAuthedTap();

    const human = captureStreams();
    expect(runCli(["tap", "list"], { home, streams: human.streams })).toBe(0);
    expect(human.stdout()).not.toContain(SECRET);
    expect(human.stdout()).toContain("***@example.invalid");

    const json = captureStreams();
    expect(runCli(["tap", "list", "--json"], { home, streams: json.streams })).toBe(0);
    expect(json.stdout()).not.toContain(SECRET);
    expect(json.stdout()).toContain("***@example.invalid");
  });

  test("C-TAP-26 tap add no-op output redacts the configured target", () => {
    const home = homeWithAuthedTap();
    const c = captureStreams();
    expect(runCli(["tap", "add", AUTHED_URL, "acme"], { home, streams: c.streams })).toBe(0);
    expect(c.stdout()).not.toContain(SECRET);
    expect(c.stdout()).toContain("***@example.invalid");
  });

  test("C-TAP-26 the name-collision remedy does not hand back a secret", () => {
    const home = homeWithAuthedTap();
    const other = `https://user:${SECRET}@example.invalid/other/repo.git`;
    const c = captureStreams();
    // The message embeds a runnable `crew tap add …` command, so an
    // unredacted remedy would publish the credential twice over.
    expect(runCli(["tap", "add", other, "acme"], { home, streams: c.streams })).toBe(4);
    expect(c.stderr()).not.toContain(SECRET);
    expect(c.stderr()).toContain("***@example.invalid");
  });

  test("C-TAP-26 the pinned-tap error redacts in human and JSON output", () => {
    const home = makeCrewHome();
    const pinned = `${AUTHED_URL}@v1.0`;

    const human = captureStreams();
    expect(runCli(["tap", "add", pinned, "acme"], { home, streams: human.streams })).toBe(4);
    expect(human.stderr()).not.toContain(SECRET);

    const json = captureStreams();
    expect(runCli(["tap", "add", pinned, "acme", "--json"], { home, streams: json.streams })).toBe(
      4,
    );
    expect(json.stdout()).not.toContain(SECRET);
  });

  test("C-TAP-26 a failed clone redacts both the remote and git's own stderr", () => {
    const home = makeCrewHome();
    // A nonexistent file:// path fails instantly and offline, and git echoes
    // the remote back in its stderr — the channel a whole-string URL parse
    // cannot see.
    const missing = `file:///nonexistent-${Date.now()}/repo.git?token=${SECRET}`;

    const human = captureStreams();
    expect(runCli(["tap", "add", missing, "acme"], { home, streams: human.streams })).toBe(5);
    expect(human.stderr()).not.toContain(SECRET);
    expect(human.stderr()).toContain("token=***");

    const json = captureStreams();
    expect(runCli(["tap", "add", missing, "acme", "--json"], { home, streams: json.streams })).toBe(
      5,
    );
    expect(json.stdout()).not.toContain(SECRET);
  });

  test("C-TAP-26 a wrong-shaped authenticated URL is redacted in both modes", () => {
    // Well-formed enough for `new URL`, but `/onlyowner` has no repository
    // segment, so canonicalization rejects it and the reference is echoed
    // back. Unlike the malformed and blob cases, this path reaches the CLI
    // error boundary with a parseable URL still carrying live credentials.
    const raw = `https://user:${SECRET}@github.com/onlyowner`;

    const human = captureStreams();
    expect(runCli(["install", raw], { home: makeCrewHome(), streams: human.streams })).toBe(4);
    expect(human.stderr()).not.toContain(SECRET);
    expect(human.stderr()).toContain("***");

    const json = captureStreams();
    expect(
      runCli(["install", "--json", raw], { home: makeCrewHome(), streams: json.streams }),
    ).toBe(4);
    expect(json.stdout()).not.toContain(SECRET);
  });
});
