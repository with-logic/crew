/**
 * Tests that keep help output useful over time.
 *
 * These assert the *shape* of help (sections present, examples present,
 * every command gets per-command help) rather than exact wording —
 * wording should be free to improve without breaking tests, but a
 * missing EXAMPLES section for a whole command shouldn't slip through.
 */

import { describe, expect, test } from "bun:test";
import { runCli } from "../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";

const EVERY_COMMAND = [
  "install",
  "uninstall",
  "update",
  "list",
  "info",
  "search",
  "tap",
  "targets",
  "autoupdate",
  "doctor",
  "cache",
  "help",
  "version",
];

describe("help overview", () => {
  test("C-CLI-02 + C-CLI-09 + C-CLI-11 bare `crew` shows overview with getting-started and command groups", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli([], { home, streams: c.streams });
    expect(code).toBe(0);
    const out = c.stdout();
    expect(out).toContain("package manager for Agent Skills");
    expect(out).toContain("GETTING STARTED");
    expect(out).toContain("COMMANDS");
    expect(out).toContain("Managing skills");
    expect(out).toContain("Discovery");
    expect(out).toContain("Agents & automation");
    expect(out).toContain("Housekeeping");
  });

  test("C-CLI-09 `crew help` matches bare output", () => {
    const home = makeCrewHome();
    const bare = captureStreams();
    runCli([], { home, streams: bare.streams });
    const help = captureStreams();
    runCli(["help"], { home, streams: help.streams });
    expect(help.stdout()).toBe(bare.stdout());
  });

  test("C-CLI-11 overview lists every command", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    runCli(["help"], { home, streams: c.streams });
    const out = c.stdout();
    for (const cmd of EVERY_COMMAND) {
      expect(out).toContain(cmd);
    }
  });

  test("C-CLI-13 overview --json emits a structured command list", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    runCli(["help", "--json"], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout()) as { commands: { name: string }[] };
    const names = parsed.commands.map((cmd) => cmd.name);
    for (const cmd of EVERY_COMMAND) {
      expect(names).toContain(cmd);
    }
  });
});

describe("per-command help", () => {
  test("C-CLI-03 + C-CLI-12 every command has detailed help with USAGE", () => {
    const home = makeCrewHome();
    for (const cmd of EVERY_COMMAND) {
      const c = captureStreams();
      const code = runCli(["help", cmd], { home, streams: c.streams });
      expect(code).toBe(0);
      const out = c.stdout();
      expect(out).toContain(`crew ${cmd}`);
      expect(out).toContain("USAGE");
    }
  });

  test("C-CLI-12 commands that take flags or args document at least one example", () => {
    const home = makeCrewHome();
    // `version` has no examples (it does one thing with no args) — that's fine.
    const commandsExpectedToHaveExamples = EVERY_COMMAND.filter((c) => c !== "version");
    for (const cmd of commandsExpectedToHaveExamples) {
      const c = captureStreams();
      runCli(["help", cmd], { home, streams: c.streams });
      expect(c.stdout()).toContain("EXAMPLES");
    }
  });

  test("C-CLI-10 help for unknown command falls back to overview", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["help", "frobnicate"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("COMMANDS");
  });

  test("C-CLI-14 help <command> --json returns the structured help record", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    runCli(["help", "install", "--json"], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout()) as {
      name: string;
      synopsis: string;
      summary: string[];
      examples?: { command: string; description: string }[];
    };
    expect(parsed.name).toBe("install");
    expect(parsed.synopsis).toContain("crew install");
    expect(parsed.examples?.length).toBeGreaterThan(0);
  });

  test("examples look like real commands (start with `crew `)", () => {
    const home = makeCrewHome();
    for (const cmd of EVERY_COMMAND) {
      if (cmd === "version") {
        continue;
      }
      const c = captureStreams();
      runCli(["help", cmd, "--json"], { home, streams: c.streams });
      const parsed = JSON.parse(c.stdout()) as { examples?: { command: string }[] };
      for (const e of parsed.examples ?? []) {
        expect(e.command.startsWith("crew ")).toBe(true);
      }
    }
  });
});
