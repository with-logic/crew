/**
 * `crew agents enable|disable --dry-run` (§7.2, C-AGENT-09). Each test
 * asserts the preview is reported AND that config is untouched.
 */

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig } from "../../../src/config/load.ts";
import { paths } from "../../../src/core/paths.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { readOrNull } from "./helpers.ts";

describe("C-AGENT-09 agents enable/disable --dry-run", () => {
  test("enable reports the change and leaves config untouched", () => {
    const home = makeCrewHome();
    const before = readOrNull(paths(home).configFile);
    const c = captureStreams();
    const code = runCli(["agents", "enable", "codex", "--dry-run"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("Would enable codex");
    expect(c.stdout()).toContain("dry run");
    expect(readOrNull(paths(home).configFile)).toBe(before);
    expect(readConfig(home).forced_agents).toEqual([]);
  });

  test("disable reports the change, --json carries dry_run, nothing written", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["agents", "disable", "codex", "--dry-run", "--json"], {
      home,
      streams: c.streams,
    });
    expect(code).toBe(0);
    expect(JSON.parse(c.stdout())).toEqual({ name: "codex", mode: "disable", dry_run: true });
    expect(readConfig(home).disabled_agents).toEqual([]);
  });

  test("unknown agent is still a usage error on a dry run", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["agents", "enable", "no-such", "--dry-run"], { home, streams: c.streams });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("unknown agent");
  });

  test("a dry run against a fresh home writes no state file", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    runCli(["agents", "enable", "codex", "--dry-run"], { home, streams: c.streams });
    // A preview must not take the mutating state lock: acquiring it
    // creates `state.json` on a fresh home, so a read-only command
    // would leave state behind that it never meant to write.
    expect(existsSync(paths(home).stateFile)).toBe(false);
  });

  test("a real enable reports dry_run: false in JSON", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    runCli(["agents", "enable", "codex", "--json"], { home, streams: c.streams });
    expect(JSON.parse(c.stdout())).toEqual({ name: "codex", mode: "enable", dry_run: false });
    expect(readConfig(home).forced_agents).toEqual(["codex"]);
  });
});
