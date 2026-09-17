/**
 * Safety checks under `crew uninstall --dry-run` (§7.4, C-UNINST-19).
 *
 * A dry run aborts exactly as a real run would, and `--force` — which
 * on a real run reaches the `rmrf` in the `untracked_directory` and
 * `inconsistent_marker` branches — still writes nothing.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { ccRoot, coRoot, installFooWithDepBar, useRedirectedAdapters } from "./helpers.ts";

useRedirectedAdapters();

describe("crew uninstall --dry-run safety checks", () => {
  test("C-UNINST-19 an untracked dest aborts the dry run with exit 1", () => {
    const home = makeCrewHome();
    installFooWithDepBar(home);
    // Drop the marker so the dest looks untracked.
    rmSync(join(ccRoot, "foo", ".crew.json"));

    const abort = captureStreams();
    const code = runCli(["uninstall", "--dry-run", "foo"], { home, streams: abort.streams });

    expect(code).toBe(1);
    expect(abort.stdout()).toContain("something else owns that folder");
    expect(existsSync(join(ccRoot, "foo", "SKILL.md"))).toBe(true);
  });

  test("C-UNINST-19 --force --dry-run leaves an untracked dest in place", () => {
    const home = makeCrewHome();
    installFooWithDepBar(home);
    // No marker and a sentinel file: forcing must take the
    // `untracked_directory` branch, which is the one that would rmrf.
    rmSync(join(ccRoot, "foo", ".crew.json"));
    const sentinel = join(ccRoot, "foo", "sentinel.txt");
    writeFileSync(sentinel, "keep me");

    const forced = captureStreams();
    const code = runCli(["uninstall", "--dry-run", "--force", "foo"], {
      home,
      streams: forced.streams,
    });

    expect(code).toBe(0);
    expect(existsSync(join(ccRoot, "foo"))).toBe(true);
    expect(existsSync(sentinel)).toBe(true);
    expect(existsSync(join(ccRoot, "foo", "SKILL.md"))).toBe(true);
    expect(existsSync(join(coRoot, "foo", "SKILL.md"))).toBe(true);
    expect(readState(home).installations.some((e) => e.name === "foo")).toBe(true);
  });

  test("C-UNINST-19 --force --dry-run leaves a mismatched marker in place", () => {
    const home = makeCrewHome();
    installFooWithDepBar(home);
    // A wrong-name marker takes the inconsistent_marker branch, which
    // also ends in an rmrf on a real forced run.
    const markerFile = join(ccRoot, "foo", ".crew.json");
    mkdirSync(join(ccRoot, "foo"), { recursive: true });
    writeFileSync(markerFile, JSON.stringify({ name: "other" }));
    const markerBefore = readFileSync(markerFile);

    const forced = captureStreams();
    const code = runCli(["uninstall", "--dry-run", "--force", "foo"], {
      home,
      streams: forced.streams,
    });

    expect(code).toBe(0);
    expect(existsSync(join(ccRoot, "foo", "SKILL.md"))).toBe(true);
    expect(readFileSync(markerFile).equals(markerBefore)).toBe(true);
    expect(readState(home).installations.some((e) => e.name === "foo")).toBe(true);
  });

  test("C-UNINST-19b an agent whose removal aborts is still reported as retained", () => {
    const home = makeCrewHome();
    installFooWithDepBar(home);
    // Codex is the only agent asked for, and its dest is untracked, so
    // its removal aborts and its bytes stay. Retention follows the
    // outcome, not the request: omitting it would tell the user the
    // skill is gone from codex when it is not.
    rmSync(join(coRoot, "foo", ".crew.json"));

    const out = captureStreams();
    const code = runCli(["uninstall", "--dry-run", "--json", "--agent", "codex", "foo"], {
      home,
      streams: out.streams,
    });

    expect(code).toBe(1);
    const payload = JSON.parse(out.stdout()) as {
      readonly records: readonly {
        readonly failures: readonly { readonly agent: string }[];
        readonly remainingAgents?: readonly string[];
      }[];
    };
    expect(payload.records[0]?.failures.map((f) => f.agent)).toEqual(["codex"]);
    expect([...(payload.records[0]?.remainingAgents ?? [])]).toEqual(["claude-code", "codex"]);
  });
});
