/**
 * Unit tests for same-tap dependency lookup (§9 step 6).
 */

import { describe, expect, test } from "bun:test";
import { CrewError } from "../../src/core/errors.ts";
import type { Config, TapConfig } from "../../src/core/types.ts";
import { findSiblingDep } from "../../src/install/dep-resolution.ts";
import { siblingItems } from "../../src/install/resolve/dep/parent-tree.ts";
import type { PendingItem } from "../../src/install/resolve/enqueue.ts";
import { makeSiblingScan } from "../../src/install/siblings/index.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

function pathTap(path: string): TapConfig {
  return {
    name: "local",
    kind: "path",
    registered: true,
    url: "",
    subpath: "",
    path,
  };
}

function gitTap(): TapConfig {
  return {
    name: "remote",
    kind: "git",
    registered: true,
    url: "file:///tmp/repo",
    subpath: "",
    path: "",
  };
}

function configWith(tap: TapConfig): Config {
  return {
    taps: [tap],
    disabled_agents: [],
    forced_agents: [],
    autoupdate: { enabled: false, interval_seconds: 3600 },
  };
}

describe("findSiblingDep", () => {
  test("finds a sibling by declared name and returns its tap-relative path", () => {
    const root = makeTempDir("dep-resolution-");
    makeSkill(root, "parent-source", skillFrontmatter({ name: "parent" }));
    makeSkill(root, "dep-source", skillFrontmatter({ name: "dep" }));

    const hit = findSiblingDep(
      { tap: pathTap(root), tapRelativePath: "parent-source" },
      "dep",
      "/unused",
      configWith(pathTap(root)),
      makeSiblingScan(),
    );

    expect(hit?.loaded.frontmatter.name).toBe("dep");
    expect(hit?.tapRelativePath).toBe("dep-source");
  });

  test("returns null when no sibling matches the bare name", () => {
    const root = makeTempDir("dep-resolution-");
    makeSkill(root, "parent-source", skillFrontmatter({ name: "parent" }));
    makeSkill(root, "bad-source", skillFrontmatter({ name: "Bad" }));
    makeSkill(root, "other-source", skillFrontmatter({ name: "other" }));

    const hit = findSiblingDep(
      { tap: pathTap(root), tapRelativePath: "parent-source" },
      "missing",
      "/unused",
      configWith(pathTap(root)),
      makeSiblingScan(),
    );
    expect(hit).toBeNull();
  });

  test("duplicate declared sibling names throw conflicting_dependencies", () => {
    const root = makeTempDir("dep-resolution-");
    makeSkill(root, "parent-source", skillFrontmatter({ name: "parent" }));
    makeSkill(root, "one", skillFrontmatter({ name: "dep" }));
    makeSkill(root, "two", skillFrontmatter({ name: "dep" }));

    expect(() =>
      findSiblingDep(
        { tap: pathTap(root), tapRelativePath: "parent-source" },
        "dep",
        "/unused",
        configWith(pathTap(root)),
        makeSiblingScan(),
      ),
    ).toThrow(CrewError);
  });

  test("repo-root git skill does not look outside the clone for siblings", () => {
    const hit = findSiblingDep(
      { tap: gitTap(), tapRelativePath: "" },
      "dep",
      "/unused",
      configWith(gitTap()),
      makeSiblingScan(),
    );

    expect(hit).toBeNull();
  });

  test("one scan reads each sibling's name once for every lookup that shares it", () => {
    const root = makeTempDir("dep-resolution-");
    makeSkill(root, "parent-source", skillFrontmatter({ name: "parent" }));
    makeSkill(root, "dep-source", skillFrontmatter({ name: "dep" }));
    const parent = { tap: pathTap(root), tapRelativePath: "parent-source" };
    const config = configWith(pathTap(root));
    const siblings = makeSiblingScan();
    expect(findSiblingDep(parent, "dep", "/unused", config, siblings)?.tapRelativePath).toBe(
      "dep-source",
    );

    // Renamed on disk: the shared scan still answers from its first read,
    // while a fresh one reads it again.
    makeSkill(root, "dep-source", skillFrontmatter({ name: "renamed" }));
    expect(findSiblingDep(parent, "renamed", "/unused", config, siblings)).toBeNull();
    const fresh = findSiblingDep(parent, "renamed", "/unused", config, makeSiblingScan());
    expect(fresh?.tapRelativePath).toBe("dep-source");
  });

  test("one scan loads, and stages, a sibling once for every parent that depends on it", () => {
    const root = makeTempDir("dep-resolution-");
    makeSkill(root, "parent-source", skillFrontmatter({ name: "parent" }));
    makeSkill(root, "dep-source", skillFrontmatter({ name: "dep", description: "First." }));
    const parent = { tap: pathTap(root), tapRelativePath: "parent-source" };
    const config = configWith(pathTap(root));
    const siblings = makeSiblingScan();
    const first = findSiblingDep(parent, "dep", "/unused", config, siblings)!;

    // Edited on disk: the shared scan still has the skill it loaded.
    makeSkill(root, "dep-source", skillFrontmatter({ name: "dep", description: "Second." }));
    const again = findSiblingDep(parent, "dep", "/unused", config, siblings)!;
    expect(again.loaded).toBe(first.loaded);
    const fresh = findSiblingDep(parent, "dep", "/unused", config, makeSiblingScan())!;
    expect(fresh.loaded.frontmatter.description).toBe("Second.");

    const home = makeTempDir("dep-resolution-home-");
    const item = { resolvedSha: null, requestedRef: null, pinned: false } as PendingItem;
    const staged = siblingItems(first, item, home, siblings).items[0]!.staged;
    expect(siblingItems(again, item, home, siblings).items[0]!.staged).toBe(staged);
  });
});
