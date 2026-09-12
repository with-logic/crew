/**
 * `--help` / `-h` target selection when flags carry values (§5.5).
 *
 * A flag's value is also a non-flag token, so the help target has to come
 * from the parser's positionals rather than a scan for the first word not
 * starting with `-`. These tests pin that: every form must be
 * byte-identical to the canonical `crew help <command>`.
 *
 * Split from `help-flags.test.ts` to stay under the 200-line file cap.
 */

import { describe, expect, test } from "bun:test";
import { runCli } from "../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";

function run(argv: string[]): { code: number; out: string } {
  const home = makeCrewHome();
  const c = captureStreams();
  const code = runCli(argv, { home, streams: c.streams });
  return { code, out: c.stdout() };
}

describe("--help target selection across flag values", () => {
  test("C-CLI-17d a scalar flag's value is not mistaken for the command", () => {
    const canonical = run(["help", "install"]);
    expect(canonical.code).toBe(0);
    expect(canonical.out).toContain("crew install");
    for (const argv of [
      ["--scope", "project", "install", "--help"],
      ["--scope", "project", "install", "-h"],
      ["install", "--scope", "project", "--help"],
      ["--from-git", "gh:acme/skills", "install", "--help"],
    ]) {
      const r = run(argv);
      expect(r.code).toBe(0);
      expect(r.out).toBe(canonical.out);
    }
  });

  test("C-CLI-17d a repeatable flag's values are not mistaken for the command", () => {
    const canonical = run(["help", "install"]);
    for (const argv of [
      ["--agent", "codex", "install", "--help"],
      ["--agent", "codex", "--agent", "claude-code", "install", "-h"],
      ["install", "--agent", "codex", "--help"],
    ]) {
      const r = run(argv);
      expect(r.code).toBe(0);
      expect(r.out).toBe(canonical.out);
    }
  });

  test("C-CLI-17d a spaced boolean value is not mistaken for the command", () => {
    // `--json true|false` is the spaced spelling yargs accepts. The value
    // must be consumed by the flag AND still control the output mode.
    const humanCanonical = run(["help", "install", "--json", "false"]);
    expect(humanCanonical.out).toContain("crew install");
    for (const argv of [
      ["--help", "--json", "false", "install"],
      ["-h", "--json", "false", "install"],
      ["install", "--help", "--json", "false"],
    ]) {
      expect(run(argv).out).toBe(humanCanonical.out);
    }

    const jsonCanonical = run(["help", "install", "--json", "true"]);
    expect(JSON.parse(jsonCanonical.out).name).toBe("install");
    for (const argv of [
      ["--help", "--json", "true", "install"],
      ["-h", "--json", "true", "install"],
    ]) {
      expect(run(argv).out).toBe(jsonCanonical.out);
    }
  });

  test("C-CLI-17d a subcommand-scoped flag's value is not mistaken for the command", () => {
    // `--interval` and `--prune` live in the per-command tables, so the
    // rewrite re-parses once the command is known.
    const autoupdate = run(["help", "autoupdate"]);
    expect(autoupdate.out).toContain("crew autoupdate");
    expect(run(["autoupdate", "enable", "--interval", "4h", "--help"]).out).toBe(autoupdate.out);

    const uninstall = run(["help", "uninstall"]);
    expect(uninstall.out).toContain("crew uninstall");
    expect(run(["uninstall", "--prune", "foo", "--help"]).out).toBe(uninstall.out);
  });
});
