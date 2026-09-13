/**
 * `crew cache clean --dry-run` (§6, C-STATE-13). Reports what a clean
 * would free and deletes nothing.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { paths } from "../../../src/core/paths.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

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

  test("a referenced store entry is excluded from the preview", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", join(src, "demo")], { home, streams: captureStreams().streams });
    // The live entry `install` just staged, plus an orphan alongside it.
    // A path source has no resolved SHA, so its store entry is keyed by
    // the first 8 chars of the content hash (`shortShaFor`).
    const live = readState(home).installations[0]!;
    const liveDir = `${live.name}@${live.content_hash.slice("sha256:".length, "sha256:".length + 8)}`;
    const orphan = join(home, "store", "ghost@00000000");
    mkdirSync(orphan, { recursive: true });
    writeFileSync(join(orphan, "f"), "abc");

    const c = captureStreams();
    runCli(["cache", "clean", "--dry-run", "--json"], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout());

    // Only the orphan is offered up, and its 3 bytes are the only ones
    // counted — a referenced entry is never proposed for deletion.
    expect(parsed.removed_store).toEqual(["ghost@00000000"]);
    expect(parsed.removed_store).not.toContain(liveDir);
    expect(parsed.freed_bytes).toBe(3);
    expect(existsSync(join(home, "store", liveDir))).toBe(true);
  });

  test("fresh home says nothing to clean and writes no state file", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    runCli(["cache", "clean", "--dry-run"], { home, streams: c.streams });
    expect(c.stdout()).toContain("Nothing to clean");
    // A preview must not take the mutating state lock: acquiring it
    // creates `state.json` on a fresh home, so a read-only command
    // would leave state behind that it never meant to write.
    expect(existsSync(paths(home).stateFile)).toBe(false);
  });
});
