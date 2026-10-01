/**
 * What `crew uninstall --dry-run` reports (§7.4, C-UNINST-19/19b).
 *
 * §7.4 makes "would be removed", "would be retained", and "would
 * abort" three separate output obligations. These cover the first two
 * plus the `--json` contract; `./safety.test.ts` covers the third.
 */

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import type { UninstallRecord } from "../../../src/commands/uninstall/core.ts";
import type { Marker } from "../../../src/core/types.ts";
import { readState } from "../../../src/state/load.ts";
import { readJson } from "../../../src/util/json.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { ccRoot, installFooWithDepBar, shareOneDest, useRedirectedAdapters } from "./helpers.ts";

useRedirectedAdapters();

/**
 * Derived from the production record so a schema change breaks this
 * file at compile time instead of silently asserting a shape the
 * command no longer emits.
 */
interface UninstallJson {
  readonly dry_run: boolean;
  readonly records: readonly Pick<UninstallRecord, "name" | "removedFrom" | "remainingAgents">[];
}

describe("crew uninstall --dry-run reporting", () => {
  test("C-UNINST-19 --prune --dry-run lists the orphan without removing it", () => {
    const home = makeCrewHome();
    installFooWithDepBar(home);

    const out = captureStreams();
    const code = runCli(["uninstall", "--dry-run", "--prune", "foo"], {
      home,
      streams: out.streams,
    });

    expect(code).toBe(0);
    expect(out.stdout()).toContain("Would prune 1 dependency");
    expect(out.stdout()).not.toContain("Pruned 1 dependency");
    expect(out.stdout()).toContain("would prune 1 dependency");
    expect(existsSync(join(ccRoot, "bar", "SKILL.md"))).toBe(true);
    expect(
      readState(home)
        .installations.map((e) => e.name)
        .sort(),
    ).toEqual(["bar", "foo"]);
  });

  test("C-UNINST-19 --json carries dry_run and a real run carries false", () => {
    const home = makeCrewHome();
    installFooWithDepBar(home);

    const dry = captureStreams();
    runCli(["uninstall", "--dry-run", "--json", "foo"], { home, streams: dry.streams });
    const dryPayload = JSON.parse(dry.stdout()) as UninstallJson;
    expect(dryPayload.dry_run).toBe(true);
    expect(dryPayload.records).toHaveLength(1);
    expect(readState(home).installations.some((e) => e.name === "foo")).toBe(true);

    const real = captureStreams();
    runCli(["uninstall", "--json", "foo"], { home, streams: real.streams });
    expect((JSON.parse(real.stdout()) as UninstallJson).dry_run).toBe(false);
    expect(readState(home).installations.some((e) => e.name === "foo")).toBe(false);
  });

  test("C-UNINST-19b --agent --dry-run names the agents it would retain", () => {
    const home = makeCrewHome();
    // Point both adapters at one directory so they share a dest and the
    // partial removal takes the "detached" (marker rewrite) branch.
    shareOneDest();
    installFooWithDepBar(home);
    const marker = readJson<Marker>(join(ccRoot, "foo", ".crew.json"));
    expect([...(marker.agents ?? [])].sort()).toEqual(["claude-code", "codex"]);

    const out = captureStreams();
    const code = runCli(["uninstall", "--dry-run", "--agent", "codex", "foo"], {
      home,
      streams: out.streams,
    });

    expect(code).toBe(0);
    // §7.4 requires the retained agents be named, not just counted.
    expect(out.stdout()).toContain("claude-code (would keep)");
    expect(out.stdout()).toContain("(kept elsewhere)");
    const after = readJson<Marker>(join(ccRoot, "foo", ".crew.json"));
    expect([...(after.agents ?? [])].sort()).toEqual(["claude-code", "codex"]);
    const entry = readState(home).installations.find((e) => e.name === "foo");
    expect([...(entry?.agents ?? [])].sort()).toEqual(["claude-code", "codex"]);
  });

  test("C-UNINST-19b --json reports the exact retained agents, preview and real alike", () => {
    const home = makeCrewHome();
    shareOneDest();
    installFooWithDepBar(home);

    const dry = captureStreams();
    runCli(["uninstall", "--dry-run", "--json", "--agent", "codex", "foo"], {
      home,
      streams: dry.streams,
    });
    const preview = JSON.parse(dry.stdout()) as UninstallJson;
    expect(preview.records[0]?.removedFrom).toEqual(["codex"]);
    expect(preview.records[0]?.remainingAgents).toEqual(["claude-code"]);

    // The preview must match what a real run then reports, or the
    // dry run is lying about where the skill survives.
    const real = captureStreams();
    runCli(["uninstall", "--json", "--agent", "codex", "foo"], { home, streams: real.streams });
    const actual = JSON.parse(real.stdout()) as UninstallJson;
    expect(actual.records[0]?.remainingAgents).toEqual(["claude-code"]);
    expect(actual.dry_run).toBe(false);
    const entry = readState(home).installations.find((e) => e.name === "foo");
    expect([...(entry?.agents ?? [])]).toEqual(["claude-code"]);
  });
});
