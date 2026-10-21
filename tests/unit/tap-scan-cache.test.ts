/**
 * Unit coverage for the per-run tap scan cache (§10.1.1).
 *
 * The cache memoises acquisition, child walks, and per-child validation
 * so overlapping `(tap, scope, project_root)` groups scan a tap once.
 * These tests pin the part that is easy to get wrong: which failures are
 * the skill author's fault and which are the local filesystem's.
 */

import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CrewError } from "../../src/core/errors.ts";
import { makeTapScanCache } from "../../src/install/tap-reexpand/scan-cache.ts";
import { makeTempDir } from "../helpers/fixtures.ts";

describe("tap scan cache validation", () => {
  test("a spec violation is returned as a CrewError, not thrown", () => {
    const dir = makeTempDir("crew-scan-invalid-");
    // Valid YAML, but `description` is required by §9 step 4.
    writeFileSync(join(dir, "SKILL.md"), "---\nname: demo\n---\nbody\n");

    const cache = makeTapScanCache();
    const err = cache.validate(dir);

    expect(err).toBeInstanceOf(CrewError);
    expect(err?.code).toBe("invalid_skill");
    writeFileSync(join(dir, "SKILL.md"), "---\nname: demo\ndescription: ok\n---\nbody\n");
    expect(cache.validate(dir)).toBe(err);
  });

  test("a valid skill validates to null", () => {
    const dir = makeTempDir("crew-scan-valid-");
    writeFileSync(join(dir, "SKILL.md"), "---\nname: demo\ndescription: ok\n---\nbody\n");

    expect(makeTapScanCache().validate(dir)).toBeNull();
  });

  test("a manifest I/O failure returns source_unreachable instead of invalid_skill", () => {
    const dir = makeTempDir("crew-scan-eisdir-");
    // `SKILL.md` exists — so the "no SKILL.md" guard passes — but it is a
    // directory. The read boundary maps EISDIR to an operational error
    // before frontmatter validation; the cache must retain that code.
    mkdirSync(join(dir, "SKILL.md"));

    const cache = makeTapScanCache();
    const error = cache.validate(dir);
    expect(error).toBeInstanceOf(CrewError);
    expect(error?.code).toBe("source_unreachable");
    expect(error?.message).toContain("EISDIR");
    expect(error?.details["path"]).toBe(join(dir, "SKILL.md"));
    rmSync(join(dir, "SKILL.md"), { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), "---\nname: demo\ndescription: ok\n---\nbody\n");
    expect(cache.validate(dir)).toBe(error);
  });

  test("native errors traversing a manifest parent propagate without being cached", () => {
    const dir = makeTempDir("crew-scan-parent-loop-");
    const skillDir = join(dir, "loop");
    symlinkSync("loop", skillDir);
    const cache = makeTapScanCache();

    expect(() => cache.validate(skillDir)).toThrow(expect.objectContaining({ code: "ELOOP" }));

    rmSync(skillDir);
    mkdirSync(skillDir);
    writeFileSync(join(skillDir, "SKILL.md"), "---\nname: demo\ndescription: ok\n---\nbody\n");
    expect(cache.validate(skillDir)).toBeNull();
  });

  test("validation is memoised per directory", () => {
    const dir = makeTempDir("crew-scan-memo-");
    writeFileSync(join(dir, "SKILL.md"), "---\nname: demo\ndescription: ok\n---\nbody\n");
    const cache = makeTapScanCache();

    expect(cache.validate(dir)).toBeNull();
    // Corrupting the file after the first call must not change the answer:
    // a second scan of the same child in the same run reuses the verdict.
    writeFileSync(join(dir, "SKILL.md"), "not frontmatter at all");

    expect(cache.validate(dir)).toBeNull();
  });
});
