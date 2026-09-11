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
    const r = run(["install", "--help", "--json"]);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.out);
    expect(parsed.name).toBe("install");
    expect(Array.isArray(parsed.flags)).toBe(true);
    const overview = JSON.parse(run(["--help", "--json"]).out);
    expect(overview.version).toBe(CREW_VERSION);
  });

  test("C-CLI-10 `--help` on an unknown command falls back to the overview", () => {
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
