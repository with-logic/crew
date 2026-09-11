/**
 * `crew cache clean --dry-run` (§6, C-STATE-13). Reports what a clean
 * would free and deletes nothing.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { paths } from "../../../src/core/paths.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";

describe("C-STATE-13 cache clean --dry-run", () => {
  test("reports what would be freed and deletes nothing", () => {
    const home = makeCrewHome();
    const orphan = join(home, "store", "ghost@00000000");
    mkdirSync(orphan, { recursive: true });
    writeFileSync(join(orphan, "file.txt"), "x".repeat(4096));
    mkdirSync(join(home, "cache"), { recursive: true });
    writeFileSync(join(home, "cache", "blob"), "y".repeat(1024));
    const c = captureStreams();
    const code = runCli(["cache", "clean", "--dry-run"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("Would clean cache (dry run)");
    expect(c.stdout()).toContain("5.0 KB would be freed");
    expect(c.stdout()).toContain("1 orphan");
    expect(existsSync(join(orphan, "file.txt"))).toBe(true);
    expect(existsSync(join(home, "cache", "blob"))).toBe(true);
  });

  test("--json carries the orphan list, byte count, and dry_run", () => {
    const home = makeCrewHome();
    mkdirSync(join(home, "store", "ghost@00000000"), { recursive: true });
    writeFileSync(join(home, "store", "ghost@00000000", "f"), "abc");
    const c = captureStreams();
    runCli(["cache", "clean", "--dry-run", "--json"], { home, streams: c.streams });
    expect(JSON.parse(c.stdout())).toEqual({
      removed_store: ["ghost@00000000"],
      freed_bytes: 3,
      dry_run: true,
    });
    expect(existsSync(join(home, "store", "ghost@00000000", "f"))).toBe(true);
  });

  test("fresh home says nothing to clean and writes no state file", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    runCli(["cache", "clean", "--dry-run"], { home, streams: c.streams });
    expect(c.stdout()).toContain("Nothing to clean");
    // A preview must not take the mutating state lock, which would
    // create `state.json` as a side effect (the bug fixed in #107/#109).
    expect(existsSync(paths(home).stateFile)).toBe(false);
  });
});
