/**
 * Unit coverage for the per-run tap scan cache (§10.1.1).
 *
 * The cache memoises acquisition, child walks, and per-child validation
 * so overlapping `(tap, scope, project_root)` groups scan a tap once.
 * These tests pin the part that is easy to get wrong: which failures are
 * the skill author's fault and which are the local filesystem's.
 */

import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CrewError } from "../../src/core/errors.ts";
import { makeTapScanCache } from "../../src/install/tap-reexpand/scan-cache.ts";
import { makeTempDir } from "../helpers/fixtures.ts";

describe("tap scan cache validation", () => {
  test("a spec violation is returned as a CrewError, not thrown", () => {
    const dir = makeTempDir("crew-scan-invalid-");
    // Valid YAML, but `description` is required by §9 step 4.
    writeFileSync(join(dir, "SKILL.md"), "---\nname: demo\n---\nbody\n");

    const err = makeTapScanCache().validate(dir);

    expect(err).toBeInstanceOf(CrewError);
    expect(err?.code).toBe("invalid_skill");
  });

  test("a valid skill validates to null", () => {
    const dir = makeTempDir("crew-scan-valid-");
    writeFileSync(join(dir, "SKILL.md"), "---\nname: demo\ndescription: ok\n---\nbody\n");

    expect(makeTapScanCache().validate(dir)).toBeNull();
  });

  test("an I/O failure rethrows instead of blaming the skill", () => {
    const dir = makeTempDir("crew-scan-eisdir-");
    // `SKILL.md` exists — so the "no SKILL.md" guard passes — but it is a
    // directory, so reading it raises a raw EISDIR `Error`. Reporting that
    // as `invalid_skill` would blame the author for a local filesystem
    // problem, so it must escape as-is for the run to handle.
    mkdirSync(join(dir, "SKILL.md"));

    let thrown: unknown;
    try {
      makeTapScanCache().validate(dir);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(CrewError);
    expect((thrown as NodeJS.ErrnoException).code).toBe("EISDIR");
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
