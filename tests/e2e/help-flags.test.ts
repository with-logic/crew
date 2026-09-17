/**
 * Conventional `--help` / `-h` and `--version` / `-v` / `-V` flag
 * forms (§5.5). They are argv rewrites onto `help` and `version`, so
 * the tests assert equivalence with the canonical commands rather than
 * exact wording.
 */

import { describe, expect, test } from "bun:test";
import { runCli } from "../../src/cli/main.ts";
import { CREW_VERSION } from "../../src/core/version.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";

function run(argv: string[]): { code: number; out: string; err: string } {
  const home = makeCrewHome();
  const c = captureStreams();
  const code = runCli(argv, { home, streams: c.streams });
  return { code, out: c.stdout(), err: c.stderr() };
}

describe("--help / -h", () => {
  test("C-CLI-15 `crew --help` and `crew -h` match `crew help`", () => {
    const canonical = run(["help"]);
    expect(canonical.code).toBe(0);
    for (const argv of [["--help"], ["-h"], ["help", "--help"]]) {
      const r = run(argv);
      expect(r.code).toBe(0);
      expect(r.out).toBe(canonical.out);
    }
  });

  test("C-CLI-15 `crew <command> --help` and `-h` match `crew help <command>`", () => {
    const canonical = run(["help", "install"]);
    expect(canonical.out).toContain("USAGE");
    for (const argv of [
      ["install", "--help"],
      ["install", "-h"],
      ["--help", "install"],
      ["install", "--dry-run", "some-skill", "--help"],
      ["help", "install", "--help"],
    ]) {
      const r = run(argv);
      expect(r.code).toBe(0);
      expect(r.out).toBe(canonical.out);
      expect(r.err).toBe("");
    }
  });

  test("C-CLI-15 subcommand words are ignored: `crew tap remove --help` shows the tap page", () => {
    const canonical = run(["help", "tap"]);
    const r = run(["tap", "remove", "--help"]);
    expect(r.code).toBe(0);
    expect(r.out).toBe(canonical.out);
  });

  test("C-CLI-15 `--help --json` emits structured help", () => {
    // Byte-for-byte against the canonical form: asserting a couple of
    // fields would accept truncated JSON.
    const canonicalCommand = run(["help", "install", "--json"]);
    expect(JSON.parse(canonicalCommand.out).name).toBe("install");
    const r = run(["install", "--help", "--json"]);
    expect(r.code).toBe(0);
    expect(r.out).toBe(canonicalCommand.out);

    const canonicalOverview = run(["help", "--json"]);
    expect(JSON.parse(canonicalOverview.out).version).toBe(CREW_VERSION);
    expect(run(["--help", "--json"]).out).toBe(canonicalOverview.out);
  });

  test("C-CLI-15 `--help` on an unknown command falls back to the overview", () => {
    const canonical = run(["help"]);
    const r = run(["frobnicate", "--help"]);
    expect(r.code).toBe(0);
    expect(r.out).toBe(canonical.out);
  });
});

describe("--version / -v / -V", () => {
  test("C-CLI-16 version flag forms match `crew version`", () => {
    const canonical = run(["version"]);
    expect(canonical.out).toBe(`crew ${CREW_VERSION}\n`);
    for (const argv of [["--version"], ["-v"], ["-V"]]) {
      const r = run(argv);
      expect(r.code).toBe(0);
      expect(r.out).toBe(canonical.out);
    }
  });

  test("C-CLI-16 `crew --version --json` emits {version}", () => {
    const r = run(["--version", "--json"]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toEqual({ version: CREW_VERSION });
  });

  test("C-CLI-17 `-v` after a command name is still an unknown flag", () => {
    const r = run(["install", "-v"]);
    expect(r.code).toBe(4);
    expect(r.err).toContain("usage_error");
  });
});

describe("conventional flag edge cases", () => {
  test("C-CLI-17a every `--json` spelling matches its canonical command", () => {
    // `--json=true` / `--json=false` are valid spellings the rewrite used
    // to drop, so a rewritten form silently disagreed with the canonical one.
    const pairs: [string[], string[]][] = [
      [
        ["help", "--json=true"],
        ["--help", "--json=true"],
      ],
      [
        ["help", "install", "--json=true"],
        ["install", "--help", "--json=true"],
      ],
      [
        ["help", "--json=false"],
        ["--help", "--json=false"],
      ],
      [
        ["version", "--json=true"],
        ["--version", "--json=true"],
      ],
      [
        ["version", "--json=false"],
        ["--version", "--json=false"],
      ],
    ];
    for (const [canonicalArgv, rewrittenArgv] of pairs) {
      const canonical = run(canonicalArgv);
      const rewritten = run(rewrittenArgv);
      expect(rewritten.code).toBe(canonical.code);
      expect(rewritten.out).toBe(canonical.out);
    }
  });

  test("C-CLI-17a a repeated `--json` is rejected identically in rewritten forms", () => {
    // §5.2: only `--agent` repeats. The rewrite must not launder a repeated
    // `--json` into one effective value the canonical command would reject.
    const canonical = run(["help", "--json", "--json=false"]);
    expect(canonical.code).toBe(4);
    expect(canonical.err).toContain("`--json` was given more than once");
    for (const argv of [
      ["--help", "--json", "--json=false"],
      ["--help", "--json=false", "--json"],
      ["--version", "--json", "--json"],
    ]) {
      const rewritten = run(argv);
      expect(rewritten.code).toBe(4);
      expect(rewritten.out).toBe("");
      expect(rewritten.err).toBe(canonical.err);
    }
  });

  test("C-CLI-17b `--help` beats a first-token version flag in either order", () => {
    const overview = run(["help"]);
    for (const argv of [
      ["--version", "--help"],
      ["--help", "--version"],
      ["-v", "-h"],
    ]) {
      const r = run(argv);
      expect(r.code).toBe(0);
      expect(r.out).toBe(overview.out);
    }
  });

  test("C-CLI-17c only a leading `help` token is skipped", () => {
    const canonical = run(["help", "help"]);
    expect(canonical.out).toContain("crew help");
    const r = run(["help", "help", "--help"]);
    expect(r.code).toBe(0);
    expect(r.out).toBe(canonical.out);
  });
});
