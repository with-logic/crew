/**
 * Unit coverage for the per-run tap scan cache (§10.1.1).
 *
 * The cache memoises acquisition, child walks, and per-child validation
 * so overlapping `(tap, scope, project_root)` groups scan a tap once.
 * These tests pin the part that is easy to get wrong: which failures are
 * the skill author's fault and which are the local filesystem's.
 */

import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CrewError } from "../../src/core/errors.ts";
import type { TapConfig } from "../../src/core/types.ts";
import { makeTapScanCache } from "../../src/install/tap-reexpand/scan-cache.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

describe("tap scan cache child discovery", () => {
  test("an unreadable manifest caches the same error only for its tap and root", () => {
    const root = makeTempDir("crew-scan-children-");
    const skill = makeSkill(root, "demo", skillFrontmatter({ name: "demo" }));
    const manifest = join(skill, "SKILL.md");
    const tap: TapConfig = {
      name: "t",
      kind: "path",
      registered: true,
      url: "",
      subpath: "",
      path: root,
    };
    const cache = makeTapScanCache();
    let firstError: unknown;
    chmodSync(manifest, 0);
    try {
      cache.children(tap, "/unused", root);
    } catch (err) {
      firstError = err;
    } finally {
      chmodSync(manifest, 0o600);
    }
    expect(firstError).toBeInstanceOf(CrewError);
    expect(firstError).toMatchObject({ code: "source_unreachable" });
    let cachedError: unknown;
    try {
      cache.children(tap, "/unused", root);
    } catch (err) {
      cachedError = err;
    }
    expect(cachedError).toBe(firstError);

    const otherTap = { ...tap, name: "other" };
    const children = cache.children(otherTap, "/unused", root);
    expect(children.children.map((child) => child.name)).toEqual(["demo"]);
    expect(cache.children(otherTap, "/unused", root)).toBe(children);
    const otherRoot = makeTempDir("crew-scan-other-root-");
    makeSkill(otherRoot, "second", skillFrontmatter({ name: "second" }));
    expect(cache.children(tap, "/unused", otherRoot).children.map((child) => child.name)).toEqual([
      "second",
    ]);
  });

  test("an inaccessible source directory is cached for the affected tap and root", () => {
    const root = makeTempDir("crew-scan-unreadable-root-");
    makeSkill(root, "demo", skillFrontmatter({ name: "demo" }));
    const tap: TapConfig = {
      name: "t",
      kind: "path",
      registered: true,
      url: "",
      subpath: "",
      path: root,
    };
    const cache = makeTapScanCache();
    chmodSync(root, 0);
    try {
      expect(() => cache.children(tap, "/unused", root)).toThrow(
        expect.objectContaining({ code: "source_unreachable" }),
      );
    } finally {
      chmodSync(root, 0o755);
    }
    expect(() => cache.children(tap, "/unused", root)).toThrow(
      expect.objectContaining({ code: "source_unreachable" }),
    );
    expect(
      cache
        .children({ ...tap, name: "repaired" }, "/unused", root)
        .children.map((child) => child.name),
    ).toEqual(["demo"]);
  });

  test("C-UPD-18c the cached catalog retains rejected locations beside healthy children", () => {
    const root = makeTempDir("crew-scan-rejected-");
    makeSkill(root, "bad", skillFrontmatter({ name: "BAD_NAME" }));
    makeSkill(root, "healthy", skillFrontmatter({ name: "healthy" }));
    const tap: TapConfig = {
      name: "t",
      kind: "path",
      path: root,
      registered: true,
      url: "",
      subpath: "",
    };
    const cache = makeTapScanCache();
    const catalog = cache.children(tap, "/unused", root);
    expect(catalog.children.map((child) => child.name)).toEqual(["healthy"]);
    expect(catalog.skipped).toMatchObject([{ tapRelativePath: "bad", code: "invalid_skill" }]);
    makeSkill(root, "bad", skillFrontmatter({ name: "repaired" }));
    expect(cache.children(tap, "/unused", root)).toBe(catalog);
    expect(cache.children(tap, "/unused", root).skipped).toBe(catalog.skipped);
  });
});

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
